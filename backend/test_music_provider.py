import io
import json
import os
import struct
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

import backend.main as main_app
from backend.music_provider import (
    MusicProvider,
    MusicProviderError,
    SpotAPIClientGateway,
    TTLCache,
    classify_stream_tier,
    parse_cookie_input,
    probe_audio_stream_metadata,
)


class FakeGateway:
    def __init__(self) -> None:
        self.search_calls = 0
        self.album_calls = 0
        self.artist_calls = 0
        self.playlist_calls = 0
        self.fail_times = 0
        self.authenticated = False

    def query_songs(self, query: str, limit: int = 10, offset: int = 0):
        self.search_calls += 1
        if self.fail_times > 0:
            self.fail_times -= 1
            raise RuntimeError("Transient 429 rate limit")
        return {
            "data": {
                "searchV2": {
                    "tracksV2": {
                        "items": [
                            {
                                "item": {
                                    "data": {
                                        "__typename": "Track",
                                        "id": "trk123",
                                        "uri": "spotify:track:trk123",
                                        "name": f"{query} Song",
                                        "duration": {"totalMilliseconds": 212000},
                                        "contentRating": {"label": "NONE"},
                                        "artists": {
                                            "items": [
                                                {
                                                    "uri": "spotify:artist:art123",
                                                    "profile": {"name": "Tulus"},
                                                }
                                            ]
                                        },
                                        "albumOfTrack": {
                                            "id": "alb123",
                                            "uri": "spotify:album:alb123",
                                            "name": "Manusia",
                                            "coverArt": {
                                                "sources": [
                                                    {"url": "https://i.scdn.co/image/300", "width": 300, "height": 300},
                                                    {"url": "https://i.scdn.co/image/640", "width": 640, "height": 640},
                                                ]
                                            },
                                        },
                                    }
                                }
                            }
                        ]
                    },
                    "albumsV2": {
                        "items": [
                            {
                                "data": {
                                    "uri": "spotify:album:alb123",
                                    "name": "Manusia",
                                    "date": {"year": 2022},
                                    "artists": {"items": [{"uri": "spotify:artist:art123", "profile": {"name": "Tulus"}}]},
                                    "coverArt": {"sources": [{"url": "https://i.scdn.co/image/640", "width": 640, "height": 640}]},
                                }
                            }
                        ]
                    },
                    "artists": {
                        "items": [
                            {
                                "data": {
                                    "uri": "spotify:artist:art123",
                                    "profile": {"name": "Tulus"},
                                    "visuals": {"avatarImage": {"sources": [{"url": "https://i.scdn.co/image/art640", "width": 640, "height": 640}]}},
                                }
                            }
                        ]
                    },
                    "playlists": {
                        "items": [
                            {
                                "data": {
                                    "uri": "spotify:playlist:pl123",
                                    "name": "Top 50 Indonesia",
                                    "ownerV2": {"data": {"name": "Spotify"}},
                                    "images": {"items": [{"sources": [{"url": "https://i.scdn.co/image/pl640", "width": 640, "height": 640}]}]},
                                }
                            }
                        ]
                    },
                    "podcasts": {"items": []},
                    "episodes": {"items": []},
                }
            }
        }

    def query_artists(self, query: str, limit: int = 10, offset: int = 0):
        return self.query_songs(query, limit=limit, offset=offset)

    def get_track_info(self, track_id: str):
        return {
            "data": {
                "trackUnion": {
                    "id": track_id,
                    "name": "Hati-Hati di Jalan",
                    "playcount": "1234567",
                    "firstArtist": {
                        "items": [{"id": "art123", "uri": "spotify:artist:art123", "profile": {"name": "Tulus"}}]
                    },
                    "otherArtists": {"items": []},
                }
            }
        }

    def get_artist(self, artist_id: str):
        self.artist_calls += 1
        return {
            "data": {
                "artistUnion": {
                    "id": artist_id,
                    "profile": {"name": "Tulus", "biography": {"text": "Penyanyi Indonesia"}},
                    "stats": {"followers": 1000000, "monthlyListeners": 5000000},
                    "visuals": {"avatarImage": {"sources": [{"url": "https://i.scdn.co/image/art640", "width": 640, "height": 640}]}},
                    "discography": {
                        "topTracks": {
                            "items": [
                                {
                                    "track": {
                                        "id": "trk123",
                                        "name": "Hati-Hati di Jalan",
                                        "duration": {"totalMilliseconds": 242000},
                                        "artists": {"items": [{"uri": "spotify:artist:art123", "profile": {"name": "Tulus"}}]},
                                        "albumOfTrack": {
                                            "uri": "spotify:album:alb123",
                                            "coverArt": {"sources": [{"url": "https://i.scdn.co/image/640", "width": 640, "height": 640}]},
                                        },
                                    }
                                }
                            ]
                        },
                        "albums": {"items": []},
                        "singles": {"items": []},
                        "compilations": {"items": []},
                    },
                    "relatedContent": {"appearsOn": {"items": []}, "relatedArtists": {"items": []}},
                }
            }
        }

    def get_album_info(self, album_id: str, limit: int = 50, offset: int = 0):
        self.album_calls += 1
        return {
            "data": {
                "albumUnion": {
                    "uri": f"spotify:album:{album_id}",
                    "name": "Manusia",
                    "date": {"isoString": "2022-03-03T00:00:00Z"},
                    "label": "TulusCompany",
                    "copyright": {"items": [{"text": "2022 TulusCompany", "type": "C"}]},
                    "artists": {"items": [{"id": "art123", "uri": "spotify:artist:art123", "profile": {"name": "Tulus"}}]},
                    "coverArt": {"sources": [{"url": "https://i.scdn.co/image/640", "width": 640, "height": 640}]},
                    "tracksV2": {
                        "totalCount": 1,
                        "items": [
                            {
                                "track": {
                                    "uri": "spotify:track:trk123",
                                    "name": "Tujuh Belas",
                                    "duration": {"totalMilliseconds": 185000},
                                    "contentRating": {"label": "EXPLICIT"},
                                    "artists": {"items": [{"uri": "spotify:artist:art123", "profile": {"name": "Tulus"}}]},
                                }
                            }
                        ],
                    },
                    "moreAlbumsByArtist": {"items": []},
                }
            }
        }

    def get_playlist_info(self, playlist_id: str, limit: int = 100, offset: int = 0):
        self.playlist_calls += 1
        return {
            "data": {
                "playlistV2": {
                    "uri": f"spotify:playlist:{playlist_id}",
                    "name": "Top 50 Indonesia",
                    "description": "Lagu teratas",
                    "ownerV2": {"data": {"name": "Spotify"}},
                    "images": {"items": [{"sources": [{"url": "https://i.scdn.co/image/pl640", "width": 640, "height": 640}]}]},
                    "content": {
                        "totalCount": 1,
                        "items": [
                            {
                                "itemV2": {
                                    "data": {
                                        "__typename": "Track",
                                        "uri": "spotify:track:trk123",
                                        "name": "Interaksi",
                                        "trackDuration": {"totalMilliseconds": 195000},
                                        "artists": {"items": [{"uri": "spotify:artist:art123", "profile": {"name": "Tulus"}}]},
                                        "albumOfTrack": {
                                            "uri": "spotify:album:alb123",
                                            "name": "Manusia",
                                            "coverArt": {"sources": [{"url": "https://i.scdn.co/image/640", "width": 640, "height": 640}]},
                                        },
                                    }
                                }
                            }
                        ],
                    },
                }
            }
        }

    def get_account_status(self):
        return {
            "authenticated": self.authenticated,
            "mode": "ytmusic" if self.authenticated else "local",
            "message": "Mode lokal aktif",
        }

    def get_account_library_raw(self):
        return None


class MusicProviderTests(unittest.TestCase):
    def test_ttl_cache_expires_and_evicts(self) -> None:
        cache = TTLCache(default_ttl=10, max_items=20)
        cache.set("k1", {"v": 1}, ttl_seconds=60)
        self.assertEqual(cache.get("k1"), {"v": 1})

    def test_search_normalization_cache_and_retry_backoff(self) -> None:
        gw = FakeGateway()
        gw.fail_times = 2
        sleeps = []
        provider = MusicProvider(
            gateway=gw,  # type: ignore[arg-type]
            cache_ttl_seconds=300,
            max_retries=3,
            base_backoff_seconds=0.1,
            sleep_fn=lambda d: sleeps.append(d),
        )

        res1 = provider.search("Tulus", "songs", 10)
        self.assertEqual(len(sleeps), 2)
        self.assertEqual(gw.search_calls, 3)
        self.assertEqual(len(res1["items"]), 1)
        track = res1["items"][0]
        self.assertEqual(track["id"], "trk123")
        self.assertEqual(track["title"], "Tulus Song")
        self.assertEqual(track["artists"], [{"id": "art123", "name": "Tulus"}])
        self.assertEqual(track["album"], {"id": "alb123", "name": "Manusia"})
        self.assertEqual(track["thumbnail"], "https://i.scdn.co/image/640")
        self.assertEqual(track["duration"], "3:32")
        self.assertEqual(track["durationSeconds"], 212)

        # Second call hits TTL cache with zero extra SpotAPI invocations
        res2 = provider.search("Tulus", "songs", 10)
        self.assertEqual(res2, res1)
        self.assertEqual(gw.search_calls, 3)

    def test_album_artist_playlist_details(self) -> None:
        gw = FakeGateway()
        provider = MusicProvider(gateway=gw, sleep_fn=lambda _d: None)  # type: ignore[arg-type]

        alb = provider.get_album("alb123")
        self.assertEqual(alb["title"], "Manusia")
        self.assertEqual(alb["year"], "2022")
        self.assertEqual(alb["tracks"][0]["duration"], "3:05")
        self.assertTrue(alb["tracks"][0]["isExplicit"])

        art = provider.get_artist("art123")
        self.assertEqual(art["name"], "Tulus")
        self.assertEqual(art["songs"][0]["id"], "trk123")

        pl = provider.get_playlist("pl123")
        self.assertEqual(pl["title"], "Top 50 Indonesia")
        self.assertEqual(pl["tracks"][0]["title"], "Interaksi")
        self.assertEqual(pl["tracks"][0]["duration"], "3:15")

        credits = provider.get_song_credits("trk999")
        self.assertEqual(credits["credits"][0]["names"], ["Tulus"])

        watch = provider.get_watch_playlist("trk999")
        self.assertEqual(watch["tracks"][0]["id"], "trk123")

    def test_cookie_saver_and_login_from_saver_no_leak(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            session_path = os.path.join(tmpdir, "sessions.json")
            gw = SpotAPIClientGateway(session_file=session_path)
            status = gw.get_account_status()
            self.assertFalse(status["authenticated"])
            self.assertEqual(status["mode"], "local")

            cookies = parse_cookie_input("sp_dc=secret_cookie==; sp_key=secret_key_val")
            self.assertEqual(cookies["sp_dc"], "secret_cookie==")
            self.assertEqual(cookies["sp_key"], "secret_key_val")

            with patch("backend.music_provider.User.verify_login", return_value=True):
                ok = gw.import_cookies("user@example.com", cookies, verify=True)
                self.assertTrue(ok)
                self.assertTrue(os.path.exists(session_path))

                with open(session_path, "r", encoding="utf-8") as fh:
                    saved = json.load(fh)
                self.assertEqual(saved[0]["identifier"], "user@example.com")
                self.assertEqual(saved[0]["cookies"]["sp_dc"], "secret_cookie==")

                acc_status = gw.get_account_status()
                self.assertTrue(acc_status["authenticated"])
                # Ensure cookies never leak in API status response
                serialized = json.dumps(acc_status)
                self.assertNotIn("secret_cookie", serialized)
                self.assertNotIn("secret_key_val", serialized)
                self.assertNotIn("sp_dc", serialized)

    def test_artwork_color_rejects_disallowed_host_and_decodes_spotify_cdn(self) -> None:
        provider = MusicProvider(gateway=FakeGateway())  # type: ignore[arg-type]
        with self.assertRaises(MusicProviderError) as ctx:
            provider.extract_artwork_color("https://evil.example.com/cover.jpg")
        self.assertEqual(ctx.exception.status_code, 400)

        buf = io.BytesIO()
        Image.new("RGB", (32, 32), (46, 200, 150)).save(buf, format="JPEG")
        fake_resp = type("Resp", (), {"status_code": 200, "content": buf.getvalue()})()
        provider_img = MusicProvider(gateway=FakeGateway(), http_get_fn=lambda *_a, **_kw: fake_resp)  # type: ignore[arg-type]
        color = provider_img.extract_artwork_color("https://i.scdn.co/image/sample")
        self.assertTrue(color["hex"].startswith("#"))
        self.assertGreater(color["g"], color["r"])

    def test_fastapi_routes_delegate_to_provider(self) -> None:
        orig_provider = main_app.provider
        try:
            main_app.provider = MusicProvider(gateway=FakeGateway())  # type: ignore[arg-type]
            client = TestClient(main_app.app)
            self.assertEqual(client.get("/api/health").json()["provider"], "spotapi")
            s_resp = client.get("/api/search?q=Tulus&filter=songs")
            self.assertEqual(s_resp.status_code, 200)
            self.assertEqual(s_resp.json()["items"][0]["id"], "trk123")
            self.assertEqual(client.get("/api/album/alb123").json()["title"], "Manusia")
            self.assertEqual(client.get("/api/artist/art123").json()["name"], "Tulus")
            self.assertEqual(client.get("/api/playlist/pl123").json()["title"], "Top 50 Indonesia")
            self.assertEqual(client.get("/api/account/status").json()["mode"], "local")

            yt_html = (
                '<script>var ytInitialData = {"contents":{"twoColumnSearchResultsRenderer":'
                '{"primaryContents":{"sectionListRenderer":{"contents":[{"itemSectionRenderer":'
                '{"contents":[{"videoRenderer":{"videoId":"badLong1234","title":{"runs":[{"text":"Tulus Full Album 1 Jam"}]},'
                '"ownerText":{"runs":[{"text":"SpamChannel"}]},"lengthText":{"simpleText":"1:02:10"}}},'
                '{"videoRenderer":{"videoId":"goodVid1234","title":{"runs":[{"text":"Tulus - Hati-Hati di Jalan (Official Audio)"}]},'
                '"ownerText":{"runs":[{"text":"Tulus"}]},"lengthText":{"simpleText":"4:02"}}}]}}]}}}}};</script>'
            )
            fake_yt_resp = type("Resp", (), {"status_code": 200, "text": yt_html})()
            main_app.provider = MusicProvider(gateway=FakeGateway(), http_get_fn=lambda *_a, **_kw: fake_yt_resp)  # type: ignore[arg-type]
            client2 = TestClient(main_app.app)
            res_play = client2.get("/api/play/resolve?id=4R9G7azXaZe93KTX65P9fU&title=Hati-Hati%20di%20Jalan&artist=Tulus&durationSeconds=242")
            self.assertEqual(res_play.status_code, 200)
            self.assertEqual(res_play.json()["youtubeVideoId"], "goodVid1234")
            self.assertEqual(res_play.json()["candidates"], ["goodVid1234"])
            # Direct 11-char YouTube ID passes through unchanged
            res_direct = client2.get("/api/play/resolve?id=dQw4w9WgXcQ")
            self.assertEqual(res_direct.status_code, 200)
            self.assertEqual(res_direct.json()["youtubeVideoId"], "dQw4w9WgXcQ")
        finally:
            main_app.provider = orig_provider

    def test_resolve_playable_youtube_fetches_spotify_metadata_when_title_missing(self) -> None:
        yt_html = (
            '<script>var ytInitialData = {"contents":{"twoColumnSearchResultsRenderer":'
            '{"primaryContents":{"sectionListRenderer":{"contents":[{"itemSectionRenderer":'
            '{"contents":[{"videoRenderer":{"videoId":"ytTrack9876","title":{"runs":[{"text":"Tulus - Hati-Hati di Jalan (Official Lyric Video)"}]},'
            '"ownerText":{"runs":[{"text":"Tulus"}]},"lengthText":{"simpleText":"4:03"}}}]}}]}}}}};</script>'
        )
        calls = []

        def fake_get(*args, **kwargs):
            calls.append((args, kwargs))
            return type("Resp", (), {"status_code": 200, "text": yt_html})()

        provider = MusicProvider(gateway=FakeGateway(), http_get_fn=fake_get)  # type: ignore[arg-type]
        res1 = provider.resolve_playable_youtube("trk123")
        self.assertEqual(res1["youtubeVideoId"], "ytTrack9876")
        calls_after_first = len(calls)
        self.assertGreaterEqual(calls_after_first, 1)
        # Second call hits TTLCache without hitting YouTube again
        res2 = provider.resolve_playable_youtube("trk123")
        self.assertEqual(res2, res1)
        self.assertEqual(len(calls), calls_after_first)

    def test_track_preview_url_extraction_caching_and_route(self) -> None:
        embed_html = (
            '<html><body><script>{"audioPreview":{"url":'
            '"https://p.scdn.co/mp3-preview/abc123def456_789"}}</script></body></html>'
        )
        calls = 0

        def fake_get(*_args, **_kwargs):
            nonlocal calls
            calls += 1
            return type("Resp", (), {"status_code": 200, "text": embed_html})()

        orig_provider = main_app.provider
        try:
            provider = MusicProvider(gateway=FakeGateway(), http_get_fn=fake_get)  # type: ignore[arg-type]
            main_app.provider = provider
            client = TestClient(main_app.app)

            r1 = client.get("/api/play/preview/4xoY4lZNoTjEuHsSmhgF1G")
            self.assertEqual(r1.status_code, 200)
            self.assertEqual(
                r1.json(),
                {
                    "id": "4xoY4lZNoTjEuHsSmhgF1G",
                    "previewUrl": "https://p.scdn.co/mp3-preview/abc123def456_789",
                },
            )
            self.assertEqual(calls, 1)

            # Second call hits TTLCache
            r2 = client.get("/api/play/preview/4xoY4lZNoTjEuHsSmhgF1G")
            self.assertEqual(r2.status_code, 200)
            self.assertEqual(calls, 1)

            # 404 when preview is absent from Spotify embed page
            provider_missing = MusicProvider(
                gateway=FakeGateway(),  # type: ignore[arg-type]
                http_get_fn=lambda *_a, **_kw: type("Resp", (), {"status_code": 200, "text": "<html></html>"})(),
            )
            with self.assertRaises(MusicProviderError) as ctx:
                provider_missing.get_track_preview_url("4xoY4lZNoTjEuHsSmhgF1G")
            self.assertEqual(ctx.exception.status_code, 404)
        finally:
            main_app.provider = orig_provider

    def test_probe_audio_stream_metadata_wav_flac_mp3_and_honest_tiers(self) -> None:
        # 24-bit / 48 kHz WAV header
        wav_header = (
            b"RIFF"
            + struct.pack("<I", 44)
            + b"WAVEfmt "
            + struct.pack("<IHHIIHH", 16, 1, 2, 48000, 48000 * 6, 6, 24)
            + b"data"
            + struct.pack("<I", 8)
            + b"\x00" * 8
        )
        wav_meta = probe_audio_stream_metadata(wav_header, url="sample.wav")
        self.assertEqual(wav_meta["codec"], "WAV (PCM)")
        self.assertEqual(wav_meta["sampleRateHz"], 48000)
        self.assertEqual(wav_meta["bitDepth"], 24)
        self.assertTrue(wav_meta["lossless"])
        self.assertTrue(wav_meta["hiRes"])
        self.assertEqual(classify_stream_tier(wav_meta), "hi_res")

        # 16-bit / 44.1 kHz FLAC STREAMINFO header
        packed = ((44100 & 0xFFFFF) << 12) | ((1 & 0x7) << 9) | ((15 & 0x1F) << 4)
        flac_header = b"fLaC" + b"\x80\x00\x00\x22" + (b"\x00" * 10) + packed.to_bytes(4, "big") + (b"\x00" * 16)
        flac_meta = probe_audio_stream_metadata(flac_header, url="track.flac")
        self.assertEqual(flac_meta["codec"], "FLAC")
        self.assertEqual(flac_meta["sampleRateHz"], 44100)
        self.assertEqual(flac_meta["bitDepth"], 16)
        self.assertTrue(flac_meta["lossless"])
        self.assertFalse(flac_meta["hiRes"])
        self.assertEqual(classify_stream_tier(flac_meta), "lossless")

        # MP3 128 kbps 44.1 kHz MPEG1 Layer III sync frame (0xFF 0xFB 0x90 0x00)
        mp3_bytes = b"\xFF\xFB\x90\x00" + b"\x00" * 64
        mp3_meta = probe_audio_stream_metadata(mp3_bytes, url="preview.mp3")
        self.assertEqual(mp3_meta["codec"], "MP3")
        self.assertEqual(mp3_meta["bitrateKbps"], 128)
        self.assertEqual(mp3_meta["sampleRateHz"], 44100)
        self.assertFalse(mp3_meta["lossless"])
        self.assertFalse(mp3_meta["hiRes"])
        self.assertEqual(classify_stream_tier(mp3_meta), "normal")

    def test_stream_options_range_cors_proxy_and_audio_settings_persistence(self) -> None:
        embed_html = (
            '<html><body><script>{"audioPreview":{"url":'
            '"https://p.scdn.co/mp3-preview/abc123def456_789"}}</script></body></html>'
        )
        mp3_payload = b"\xFF\xFB\x90\x00" + bytes(range(256))

        def fake_get(url: str, headers=None, **_kwargs):
            if "open.spotify.com/embed" in url:
                return type("Resp", (), {"status_code": 200, "text": embed_html})()
            req_range = (headers or {}).get("Range", "")
            if req_range == "bytes=0-15":
                return type(
                    "Resp",
                    (),
                    {
                        "status_code": 206,
                        "headers": {
                            "Content-Type": "audio/mpeg",
                            "Content-Range": f"bytes 0-15/{len(mp3_payload)}",
                            "Content-Length": "16",
                            "Accept-Ranges": "bytes",
                        },
                        "content": mp3_payload[:16],
                    },
                )()
            return type(
                "Resp",
                (),
                {
                    "status_code": 200,
                    "headers": {
                        "Content-Type": "audio/mpeg",
                        "Content-Length": str(len(mp3_payload)),
                        "Accept-Ranges": "bytes",
                    },
                    "content": mp3_payload,
                },
            )()

        with tempfile.TemporaryDirectory() as tmpdir:
            settings_path = os.path.join(tmpdir, "audio_settings.json")
            orig_provider = main_app.provider
            try:
                provider = MusicProvider(
                    gateway=FakeGateway(),  # type: ignore[arg-type]
                    http_get_fn=fake_get,
                    audio_settings_file=settings_path,
                )
                main_app.provider = provider
                client = TestClient(main_app.app)

                opts_resp = client.get("/api/stream/options/4xoY4lZNoTjEuHsSmhgF1G")
                self.assertEqual(opts_resp.status_code, 200)
                opts = opts_resp.json()
                self.assertFalse(opts["audiodownload_allowed"])
                by_tier = {o["tier"]: o for o in opts["options"]}
                self.assertTrue(by_tier["normal"]["available"])
                self.assertEqual(by_tier["normal"]["codec"], "MP3")
                self.assertFalse(by_tier["lossless"]["available"])
                self.assertFalse(by_tier["hi_res"]["available"])
                self.assertEqual(by_tier["lossless"]["unavailableReason"], "Tidak tersedia untuk lagu ini")

                # Proxy honors Range header (206 Partial Content) and adds CORS headers
                stream_resp = client.get(
                    "/api/stream/4xoY4lZNoTjEuHsSmhgF1G?tier=normal",
                    headers={"Range": "bytes=0-15"},
                )
                self.assertEqual(stream_resp.status_code, 206)
                self.assertEqual(stream_resp.headers.get("access-control-allow-origin"), "*")
                self.assertEqual(stream_resp.headers.get("accept-ranges"), "bytes")
                self.assertEqual(len(stream_resp.content), 16)

                # Account audio settings CRUD persistence
                put_resp = client.put(
                    "/api/account/audio-settings",
                    json={"accountKey": "local", "settings": {"eqEnabled": False, "preampDb": -3}},
                )
                self.assertEqual(put_resp.status_code, 200)
                get_resp = client.get("/api/account/audio-settings?accountKey=local")
                self.assertEqual(get_resp.status_code, 200)
                self.assertEqual(get_resp.json()["settings"]["preampDb"], -3)

                reset_resp = client.post("/api/account/audio-settings/reset?accountKey=local")
                self.assertEqual(reset_resp.status_code, 200)
                self.assertIsNone(reset_resp.json()["settings"])
            finally:
                main_app.provider = orig_provider


if __name__ == "__main__":
    unittest.main()
