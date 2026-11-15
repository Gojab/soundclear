from __future__ import annotations

import json
import os
import tempfile
import time
import unittest

from fastapi.testclient import TestClient

os.environ.setdefault("SOUNDCLEAR_DISABLE_WARMUP", "1")
os.environ.setdefault("SOUNDCLEAR_DISABLE_BG_WORKER", "1")

from backend.background_worker import (
    SoundClearBackgroundManager,
    advance_session_to_now,
    sanitize_session_payload,
)
from backend.main import app


class _DummyProvider:
    def __init__(self) -> None:
        self.home_calls = 0
        self.charts_calls = 0
        self.stream_calls: list[str] = []
        self.watch_calls: list[str] = []

    def get_home(self, limit: int = 8):
        self.home_calls += 1
        return {"sections": []}

    def get_charts(self, country: str = "ID"):
        self.charts_calls += 1
        return {"country": country, "songs": []}

    def get_watch_playlist(self, video_id: str, playlist_id=None, radio: bool = True, limit: int = 15):
        self.watch_calls.append(video_id)
        return {
            "tracks": [
                {
                    "id": "watch-next-1",
                    "videoId": "watch-next-1",
                    "type": "song",
                    "title": "Lagu Rekomendasi Radio",
                    "artists": [{"name": "Tulus"}],
                    "durationSeconds": 200,
                }
            ]
        }

    def resolve_or_build_audio_stream(self, video_id: str, **kwargs):
        self.stream_calls.append(f"{video_id}:{kwargs.get('quality')}")
        return {"trackId": video_id, "available": True}


class BackgroundWorkerTests(unittest.TestCase):
    def test_advance_session_progresses_and_transitions_queue(self) -> None:
        base_ms = 1_700_000_000_000
        sess = sanitize_session_payload(
            {
                "sessionId": "browser-1",
                "updatedAtMs": base_ms,
                "isPlaying": True,
                "currentTime": 90,
                "duration": 100,
                "playbackRate": 1.0,
                "repeat": "off",
                "currentTrack": {
                    "id": "track-a",
                    "videoId": "track-a",
                    "title": "Track A",
                    "durationSeconds": 100,
                },
                "manualQueue": [
                    {
                        "id": "track-b",
                        "videoId": "track-b",
                        "title": "Track B",
                        "durationSeconds": 120,
                    }
                ],
                "sourceQueue": [
                    {
                        "id": "track-c",
                        "videoId": "track-c",
                        "title": "Track C",
                        "durationSeconds": 150,
                    }
                ],
            },
            now_ms=base_ms,
        )

        # Simulate Chrome closed for 25 seconds: finishes Track A (10s left) and is 15s into Track B
        advanced, changed = advance_session_to_now(sess, now_ms=base_ms + 25_000)
        self.assertTrue(changed)
        self.assertTrue(advanced["isPlaying"])
        self.assertEqual(advanced["currentTrack"]["id"], "track-b")
        self.assertAlmostEqual(advanced["currentTime"], 15.0, places=2)
        self.assertEqual(len(advanced["manualQueue"]), 0)
        self.assertEqual(len(advanced["sourceQueue"]), 1)
        self.assertEqual(advanced["historyStack"][0]["id"], "track-a")

    def test_advance_session_handles_repeat_one_and_stop_on_end(self) -> None:
        base_ms = 1_700_000_000_000
        repeat_one = sanitize_session_payload(
            {
                "sessionId": "rep-one",
                "updatedAtMs": base_ms,
                "isPlaying": True,
                "currentTime": 45,
                "duration": 50,
                "repeat": "one",
                "currentTrack": {"id": "solo", "videoId": "solo", "title": "Solo", "durationSeconds": 50},
            },
            now_ms=base_ms,
        )
        adv_rep, changed_rep = advance_session_to_now(repeat_one, now_ms=base_ms + 20_000)
        self.assertFalse(changed_rep)
        self.assertTrue(adv_rep["isPlaying"])
        self.assertEqual(adv_rep["currentTrack"]["id"], "solo")
        self.assertAlmostEqual(adv_rep["currentTime"], 15.0, places=2)

        no_repeat = sanitize_session_payload(
            {
                "sessionId": "stop-end",
                "updatedAtMs": base_ms,
                "isPlaying": True,
                "currentTime": 40,
                "duration": 50,
                "repeat": "off",
                "currentTrack": {"id": "last", "videoId": "last", "title": "Last", "durationSeconds": 50},
            },
            now_ms=base_ms,
        )
        adv_stop, changed_stop = advance_session_to_now(no_repeat, now_ms=base_ms + 30_000)
        self.assertTrue(changed_stop)
        self.assertFalse(adv_stop["isPlaying"])
        self.assertAlmostEqual(adv_stop["currentTime"], 50.0, places=2)

    def test_manager_persists_to_disk_and_prewarms_in_background(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            storage_file = os.path.join(tmpdir, "sessions.json")
            provider = _DummyProvider()
            mgr = SoundClearBackgroundManager(provider, storage_path=storage_file, tick_interval_seconds=0.2)

            base_ms = int(time.time() * 1000) - 20_000
            mgr.upsert_session(
                {
                    "sessionId": "persist-1",
                    "isPlaying": True,
                    "currentTime": 10,
                    "duration": 180,
                    "quality": "high",
                    "currentTrack": {
                        "id": "v1",
                        "videoId": "v1",
                        "title": "Hati-Hati di Jalan",
                        "artists": [{"name": "Tulus"}],
                        "durationSeconds": 180,
                    },
                },
                now_ms=base_ms,
            )
            mgr.run_once(now_ms=base_ms + 10_000)

            self.assertIn("v1:high", provider.stream_calls)
            self.assertIn("v1", provider.watch_calls)
            self.assertIn("watch-next-1:high", provider.stream_calls)
            self.assertTrue(os.path.isfile(storage_file))

            # Recreate manager from disk (simulating restart / browser closed)
            mgr2 = SoundClearBackgroundManager(provider, storage_path=storage_file)
            reloaded = mgr2.get_session("persist-1", now_ms=base_ms + 20_000)
            self.assertIsNotNone(reloaded)
            self.assertEqual(reloaded["currentTrack"]["id"], "v1")
            self.assertAlmostEqual(reloaded["currentTime"], 30.0, places=1)
            self.assertEqual(len(reloaded["sourceQueue"]), 1)

    def test_fastapi_background_session_accepts_sendbeacon_plain_text_and_advances(self) -> None:
        client = TestClient(app)
        payload = {
            "sessionId": "beacon-test-sess",
            "isPlaying": True,
            "currentTime": 12.0,
            "duration": 200.0,
            "playbackRate": 1.0,
            "repeat": "off",
            "currentTrack": {
                "id": "id123",
                "videoId": "id123",
                "title": "Sial",
                "artists": [{"name": "Mahalini"}],
                "durationSeconds": 200,
            },
            "manualQueue": [],
            "sourceQueue": [],
        }
        # navigator.sendBeacon commonly sends text/plain payload
        res_post = client.post(
            "/api/background/session",
            content=json.dumps(payload),
            headers={"Content-Type": "text/plain;charset=UTF-8"},
        )
        self.assertEqual(res_post.status_code, 200)
        body = res_post.json()
        self.assertTrue(body["synced"])

        time.sleep(0.25)
        res_get = client.get("/api/background/session?sessionId=beacon-test-sess")
        self.assertEqual(res_get.status_code, 200)
        got = res_get.json()
        self.assertTrue(got["found"])
        self.assertGreaterEqual(got["session"]["currentTime"], 12.15)

        res_status = client.get("/api/background/status")
        self.assertEqual(res_status.status_code, 200)
        self.assertGreaterEqual(res_status.json()["activeSessions"], 1)

        res_del = client.delete("/api/background/session?sessionId=beacon-test-sess")
        self.assertEqual(res_del.status_code, 200)
        self.assertTrue(res_del.json()["deleted"])


if __name__ == "__main__":
    unittest.main()
