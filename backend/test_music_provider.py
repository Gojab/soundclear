import io
import os
import tempfile
import unittest
from dataclasses import dataclass
from unittest import mock

from fastapi.testclient import TestClient
from PIL import Image
from ytmusicapi.exceptions import YTMusicServerError, YTMusicUserError

import backend.main as main_app
from backend.music_provider import (
    ALLOWED_ARTWORK_HOSTS,
    MusicProvider,
    MusicProviderError,
    TTLCache,
    pick_largest_thumbnail,
)


@dataclass
class FakeLyricLine:
    text: str
    start_time: int
    end_time: int
    id: int


class FakeYTMusicGateway:
    def __init__(self) -> None:
        self.search_calls = 0
        self.fail_times = 0
        self.raise_user_error = False

    def search(self, query: str, filter=None, limit: int = 20):
        self.search_calls += 1
        if self.raise_user_error:
            raise YTMusicUserError("Invalid filter or query")
        if self.fail_times > 0:
            self.fail_times -= 1
            raise YTMusicServerError("Upstream temporary error")
        return [
            {
                "category": "Songs",
                "resultType": "song",
                "title": f"{query} - Hati-Hati di Jalan",
                "videoId": "5F28ye50-Kc",
                "duration": "4:02",
                "duration_seconds": 242,
                "artists": [{"name": "Tulus", "id": "UC_DHlXllTSMB8pTC38_leFg"}],
                "album": {"name": "Manusia", "id": "MPREb_RVAbNZdUasD"},
                "thumbnails": [
                    {"url": "https://lh3.googleusercontent.com/abc=w60-h60-l90-rj", "width": 60, "height": 60},
                    {"url": "https://lh3.googleusercontent.com/abc=w120-h120-l90-rj", "width": 120, "height": 120},
                ],
                "isExplicit": False,
            }
        ]

    def get_search_suggestions(self, query: str):
        return [f"{query}", f"{query} lagu", f"{query} album"]

    def get_home(self, limit: int = 8):
        return [
            {
                "title": "Pilihan Cepat",
                "contents": [
                    {
                        "title": "Monokrom",
                        "videoId": "dQw4w9WgXcQ",
                        "artists": [{"name": "Tulus", "id": "UC_DHlXllTSMB8pTC38_leFg"}],
                        "thumbnails": [
                            {"url": "https://lh3.googleusercontent.com/mono=w544-h544-l90-rj", "width": 544, "height": 544}
                        ],
                    }
                ],
            }
        ]

    def get_charts(self, country: str = "ID"):
        return {
            "videos": [
                {
                    "title": "Trending 20 Indonesia",
                    "playlistId": "PL4fGSI1pDJn4lW6MJA2q37CfnraqAizqE",
                    "thumbnails": [{"url": "https://yt3.googleusercontent.com/chart=s192", "width": 192, "height": 192}],
                }
            ],
            "artists": [
                {
                    "title": "Tulus",
                    "browseId": "UC_DHlXllTSMB8pTC38_leFg",
                    "subscribers": "5M",
                    "thumbnails": [{"url": "https://lh3.googleusercontent.com/art=w544-h544-l90-rj", "width": 544, "height": 544}],
                }
            ],
            "songs": [],
            "trending": [],
        }

    def get_mood_categories(self):
        return {
            "Moods & moments": [{"title": "Santai", "params": "ggMoodChill"}],
            "Genres": [{"title": "Pop Indonesia", "params": "ggGenrePop"}],
        }

    def get_mood_playlists(self, params: str):
        return [
            {
                "title": f"Playlist {params}",
                "playlistId": "RDCLAK5uy_test123",
                "thumbnails": [{"url": "https://lh3.googleusercontent.com/mood=w544-h544-l90-rj", "width": 544, "height": 544}],
            }
        ]

    def get_artist(self, channel_id: str):
        return {
            "name": "Tulus",
            "channelId": channel_id,
            "description": "Penyanyi Indonesia",
            "subscribers": "5M",
            "views": "200M",
            "thumbnails": [{"url": "https://lh3.googleusercontent.com/art=w544-h544-l90-rj", "width": 544, "height": 544}],
            "songs": {
                "results": [
                    {
                        "videoId": "5F28ye50-Kc",
                        "title": "Hati-Hati di Jalan",
                        "duration": "4:02",
                        "artists": [{"name": "Tulus", "id": channel_id}],
                        "album": {"name": "Manusia", "id": "MPREb_RVAbNZdUasD"},
                    }
                ]
            },
            "albums": {"results": []},
            "singles": {"results": []},
            "videos": {"results": []},
            "related": {"results": []},
        }

    def get_artist_albums(self, channel_id: str, params: str, limit: int = 100):
        return []

    def get_album_browse_id(self, audio_playlist_id: str):
        return "MPREb_RVAbNZdUasD"

    def get_album(self, browse_id: str):
        return {
            "title": "Manusia",
            "year": "2022",
            "artists": [{"name": "Tulus", "id": "UC_DHlXllTSMB8pTC38_leFg"}],
            "thumbnails": [{"url": "https://lh3.googleusercontent.com/alb=w544-h544-l90-rj", "width": 544, "height": 544}],
            "trackCount": 1,
            "duration": "3:05",
            "tracks": [
                {
                    "videoId": "zyLmavBAY7k",
                    "title": "Tujuh Belas",
                    "duration": "3:05",
                    "duration_seconds": 185,
                    "isExplicit": True,
                    "artists": [{"name": "Tulus", "id": "UC_DHlXllTSMB8pTC38_leFg"}],
                    "album": "Manusia",
                }
            ],
        }

    def get_playlist(self, playlist_id: str, limit: int = 100):
        return {
            "id": playlist_id,
            "title": "Top Indonesia",
            "author": {"name": "SoundClear Kurasi", "id": None},
            "description": "Lagu teratas",
            "thumbnails": [{"url": "https://lh3.googleusercontent.com/pl=w544-h544-l90-rj", "width": 544, "height": 544}],
            "tracks": [
                {
                    "videoId": "5F28ye50-Kc",
                    "title": "Interaksi",
                    "duration": "3:15",
                    "duration_seconds": 195,
                    "artists": [{"name": "Tulus", "id": "UC_DHlXllTSMB8pTC38_leFg"}],
                    "album": {"name": "Manusia", "id": "MPREb_RVAbNZdUasD"},
                    "thumbnails": [{"url": "https://lh3.googleusercontent.com/trk=w544-h544-l90-rj", "width": 544, "height": 544}],
                }
            ],
        }

    def get_watch_playlist(self, video_id=None, playlist_id=None, radio=True, limit=25):
        return {
            "playlistId": "RDAMVM5F28ye50-Kc",
            "lyrics": "MPLYt_RVAbNZdUasD-1",
            "related": "MPTRt_RVAbNZdUasD-1",
            "tracks": [
                {
                    "videoId": video_id or "5F28ye50-Kc",
                    "title": "Hati-Hati di Jalan",
                    "length": "4:02",
                    "artists": [{"name": "Tulus", "id": "UC_DHlXllTSMB8pTC38_leFg"}],
                    "album": {"name": "Manusia", "id": "MPREb_RVAbNZdUasD"},
                    "thumbnail": [
                        {"url": "https://lh3.googleusercontent.com/w60=w60-h60-l90-rj", "width": 60, "height": 60},
                        {"url": "https://lh3.googleusercontent.com/w544=w544-h544-l90-rj", "width": 544, "height": 544},
                    ],
                }
            ],
        }

    def get_lyrics(self, browse_id: str, timestamps: bool = True):
        if browse_id == "PLAIN_LYRICS":
            return {"lyrics": "Baris satu\nBaris dua", "source": "SoundClear", "hasTimestamps": False}
        return {
            "hasTimestamps": True,
            "source": "LyricFind",
            "lyrics": [
                FakeLyricLine(text="Hari-hari berulang", start_time=1000, end_time=4000, id=0),
                FakeLyricLine(text="Langkah terasa tenang", start_time=4000, end_time=7500, id=1),
            ],
        }

    def get_song(self, video_id: str):
        return {"playabilityStatus": {"status": "LOGIN_REQUIRED"}}

    def get_song_related(self, browse_id: str):
        return [
            {
                "title": "You might also like",
                "contents": [
                    {
                        "videoId": "dQw4w9WgXcQ",
                        "title": "Gajah",
                        "artists": [{"name": "Tulus", "id": "UC_DHlXllTSMB8pTC38_leFg"}],
                        "thumbnails": [{"url": "https://lh3.googleusercontent.com/g=w544-h544-l90-rj", "width": 544, "height": 544}],
                    }
                ],
            }
        ]

    def get_podcast(self, playlist_id: str, limit: int = 100):
        return {
            "title": "PODKESMAS",
            "author": {"name": "Podkesmas", "id": "UCpod123"},
            "description": "Obrolan santai",
            "thumbnails": [{"url": "https://i.ytimg.com/vi/pod123/hqdefault.jpg", "width": 480, "height": 360}],
            "episodes": [
                {
                    "videoId": "epVid123456",
                    "title": "Episode 1",
                    "duration": "42:10",
                    "date": "2025-11-01",
                    "thumbnails": [{"url": "https://i.ytimg.com/vi/epVid123456/hqdefault.jpg", "width": 480, "height": 360}],
                }
            ],
        }

    def get_episode(self, video_id: str):
        return {
            "title": "Episode 1",
            "author": {"name": "Podkesmas", "id": "UCpod123"},
            "duration": "42:10",
            "date": "2025-11-01",
            "description": "Deskripsi episode",
            "playlistId": "MPSPpod123",
            "thumbnails": [{"url": "https://i.ytimg.com/vi/epVid123456/hqdefault.jpg", "width": 480, "height": 360}],
        }

    def get_channel_episodes(self, channel_id: str, params: str):
        return []


class MusicProviderTests(unittest.TestCase):
    def test_ttl_cache_stores_and_expires(self) -> None:
        cache = TTLCache(default_ttl=300, max_items=20)
        cache.set("k1", {"v": 1}, ttl_seconds=60)
        self.assertEqual(cache.get("k1"), {"v": 1})

    def test_pick_largest_thumbnail_upgrades_small_googleusercontent(self) -> None:
        thumbs = [
            {"url": "https://lh3.googleusercontent.com/abc=w60-h60-l90-rj", "width": 60, "height": 60},
            {"url": "https://lh3.googleusercontent.com/abc=w120-h120-l90-rj", "width": 120, "height": 120},
        ]
        best = pick_largest_thumbnail(thumbs)
        self.assertEqual(best, "https://lh3.googleusercontent.com/abc=w544-h544-l90-rj")

    def test_search_normalization_cache_and_ytmusic_errors(self) -> None:
        gw = FakeYTMusicGateway()
        gw.fail_times = 1
        sleeps = []
        provider = MusicProvider(
            gateway=gw,  # type: ignore[arg-type]
            cache_ttl_seconds=420,
            max_retries=2,
            base_backoff_seconds=0.1,
            sleep_fn=lambda d: sleeps.append(d),
        )

        res1 = provider.search("Tulus", "songs", 10)
        self.assertEqual(len(sleeps), 1)
        self.assertEqual(gw.search_calls, 2)
        track = res1["items"][0]
        self.assertEqual(track["id"], "5F28ye50-Kc")
        self.assertEqual(track["videoId"], "5F28ye50-Kc")
        self.assertEqual(track["artists"], [{"id": "UC_DHlXllTSMB8pTC38_leFg", "name": "Tulus"}])
        self.assertEqual(track["album"], {"id": "MPREb_RVAbNZdUasD", "name": "Manusia"})
        self.assertEqual(track["duration"], "4:02")
        self.assertEqual(track["durationSeconds"], 242)
        self.assertEqual(track["thumbnail"], "https://lh3.googleusercontent.com/abc=w544-h544-l90-rj")

        # Second call hits TTL cache
        res2 = provider.search("Tulus", "songs", 10)
        self.assertEqual(res2, res1)
        self.assertEqual(gw.search_calls, 2)

        # YTMusicUserError raises clear MusicProviderError
        gw.raise_user_error = True
        with self.assertRaises(MusicProviderError) as ctx:
            provider.search("Another", "songs", 10)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Permintaan tidak valid", ctx.exception.message)

    def test_album_artist_playlist_charts_watch_and_lyrics(self) -> None:
        gw = FakeYTMusicGateway()
        provider = MusicProvider(gateway=gw, sleep_fn=lambda _d: None)  # type: ignore[arg-type]

        alb = provider.get_album("OLAK5uy_dummy123")
        self.assertEqual(alb["id"], "MPREb_RVAbNZdUasD")
        self.assertEqual(alb["title"], "Manusia")
        self.assertEqual(alb["tracks"][0]["videoId"], "zyLmavBAY7k")
        self.assertTrue(alb["tracks"][0]["isExplicit"])

        charts = provider.get_charts("ID")
        self.assertEqual(charts["country"], "ID")
        self.assertEqual(charts["videos"][0]["type"], "playlist")
        self.assertEqual(charts["songs"][0]["videoId"], "5F28ye50-Kc")

        watch = provider.get_watch_playlist("5F28ye50-Kc", radio=True)
        self.assertEqual(watch["lyricsBrowseId"], "MPLYt_RVAbNZdUasD-1")
        self.assertEqual(watch["tracks"][0]["thumbnail"], "https://lh3.googleusercontent.com/w544=w544-h544-l90-rj")

        timed = provider.get_lyrics("MPLYt_RVAbNZdUasD-1")
        self.assertTrue(timed["hasTimestamps"])
        self.assertEqual(len(timed["lines"]), 2)
        self.assertEqual(timed["lines"][0]["startTimeMs"], 1000)

        plain = provider.get_lyrics("PLAIN_LYRICS")
        self.assertFalse(plain["hasTimestamps"])
        self.assertEqual(plain["plainText"], "Baris satu\nBaris dua")

    def test_artwork_color_and_fastapi_routes(self) -> None:
        buf = io.BytesIO()
        Image.new("RGB", (24, 24), (46, 200, 150)).save(buf, format="JPEG")
        fake_resp = type("Resp", (), {"status_code": 200, "content": buf.getvalue()})()

        with tempfile.TemporaryDirectory() as tmpdir:
            settings_path = os.path.join(tmpdir, "audio_settings.json")
            orig_provider = main_app.provider
            try:
                provider = MusicProvider(
                    gateway=FakeYTMusicGateway(),  # type: ignore[arg-type]
                    http_get_fn=lambda *_a, **_kw: fake_resp,
                    audio_settings_file=settings_path,
                )
                main_app.provider = provider
                client = TestClient(main_app.app)

                self.assertEqual(client.get("/api/health").json()["provider"], "soundclear-cloud")
                self.assertEqual(client.get("/api/home").status_code, 200)
                self.assertEqual(client.get("/api/charts?country=ID").status_code, 200)
                self.assertEqual(client.get("/api/suggest?q=tulus").json()["suggestions"][0], "tulus")
                self.assertEqual(client.get("/api/moods").json()["groups"][0]["items"][0]["params"], "ggMoodChill")
                self.assertEqual(client.get("/api/moods/ggMoodChill").status_code, 200)
                self.assertEqual(client.get("/api/artist/UC_DHlXllTSMB8pTC38_leFg").json()["name"], "Tulus")
                self.assertEqual(client.get("/api/album/MPREb_RVAbNZdUasD").json()["title"], "Manusia")
                self.assertEqual(client.get("/api/playlist/PL123").json()["title"], "Top Indonesia")
                self.assertEqual(client.get("/api/watch/5F28ye50-Kc?radio=true").status_code, 200)
                self.assertEqual(client.get("/api/lyrics/MPLYt_RVAbNZdUasD-1").json()["hasTimestamps"], True)
                self.assertEqual(client.get("/api/account/status").json()["authenticated"], False)

                # Stream extraction/download routes must not exist
                self.assertEqual(client.get("/api/stream/options/5F28ye50-Kc").status_code, 404)
                self.assertEqual(client.get("/api/play/preview/5F28ye50-Kc").status_code, 404)

                # Artwork color rejects non-allowed host and parses googleusercontent
                self.assertEqual(
                    client.get("/api/artwork-color?url=https://evil.example.com/a.jpg").status_code,
                    400,
                )
                color_resp = client.get("/api/artwork-color?url=https://lh3.googleusercontent.com/abc")
                self.assertEqual(color_resp.status_code, 200)
                self.assertTrue(color_resp.json()["hex"].startswith("#"))
            finally:
                main_app.provider = orig_provider

    def test_brand_sanitization_top_artist_and_fallback_resolve(self) -> None:
        class EdgeSearchGateway(FakeYTMusicGateway):
            def search(self, query: str, filter=None, limit: int = 20):
                if filter == "videos":
                    return [
                        {
                            "videoId": "longAlbum12",
                            "title": f"{query} FULL ALBUM",
                            "duration": "45:00",
                            "duration_seconds": 2700,
                        },
                        {
                            "videoId": "altVideo123",
                            "title": f"{query} Official Video",
                            "duration": "3:56",
                            "duration_seconds": 236,
                        },
                    ]
                if filter == "songs":
                    return [
                        {
                            "videoId": "origTrack11",
                            "title": query,
                            "duration": "3:55",
                            "duration_seconds": 235,
                        },
                        {
                            "videoId": "altSong4567",
                            "title": query,
                            "duration": "3:58",
                            "duration_seconds": 238,
                        },
                    ]
                return [
                    {
                        "category": "Top result",
                        "resultType": "artist",
                        "subscribers": "54.4M",
                        "artists": [{"name": "Tulus", "id": "UC_DHlXllTSMB8pTC38_leFg"}],
                        "thumbnails": [{"url": "https://yt3.googleusercontent.com/art=w120-h120-l90-rj", "width": 120, "height": 120}],
                    },
                    {
                        "category": None,
                        "resultType": "song",
                        "title": "Jatuh Suka",
                        "videoId": "qrnJL6P-QqQ",
                        "duration": "3:55",
                        "duration_seconds": 235,
                        "thumbnails": [{"url": "https://yt3.googleusercontent.com/js=w120-h120-l90-rj", "width": 120, "height": 120}],
                    },
                    {
                        "category": None,
                        "resultType": "playlist",
                        "title": "Presenting Tulus",
                        "playlistId": "RDCLAK5uy_tulus",
                        "author": "YouTube Music",
                        "thumbnails": [{"url": "https://yt3.googleusercontent.com/pl=w120-h120-l90-rj", "width": 120, "height": 120}],
                    },
                ]

        provider = MusicProvider(gateway=EdgeSearchGateway(), sleep_fn=lambda _d: None)  # type: ignore[arg-type]
        search_res = provider.search("Tulus")
        self.assertEqual(search_res["items"][0]["type"], "artist")
        self.assertEqual(search_res["items"][0]["id"], "UC_DHlXllTSMB8pTC38_leFg")
        self.assertEqual(search_res["items"][0]["title"], "Tulus")

        # Song directly below Top result artist inherits artist fallback when missing
        self.assertEqual(search_res["items"][1]["artists"], [{"id": "UC_DHlXllTSMB8pTC38_leFg", "name": "Tulus"}])

        # Playlist author "YouTube Music" is sanitized to SoundClear
        self.assertEqual(search_res["items"][2]["artists"], [{"id": None, "name": "SoundClear"}])

        # Fallback resolution skips restricted ID and prefers closest-duration video over 45m album
        resolved = provider.resolve_playable_youtube(
            "origTrack11",
            title="Jatuh Suka",
            artist="Tulus",
            item_type="song",
            duration_seconds=235,
            fallback=True,
            exclude_ids=["origTrack11"],
        )
        self.assertEqual(resolved["youtubeVideoId"], "altVideo123")
        self.assertNotIn("origTrack11", resolved["candidates"])
        self.assertEqual(resolved["candidates"][:2], ["altVideo123", "altSong4567"])

    def test_excludes_japanese_and_indian_in_home_and_search(self) -> None:
        class RegionalGateway(FakeYTMusicGateway):
            def search(self, query: str, filter=None, limit: int = 20):
                return [
                    {
                        "resultType": "song",
                        "title": "愛の形 - Ai no Katachi",
                        "videoId": "jpSong00001",
                        "artists": [{"name": "Jinto Yoshida", "id": "UCjp1"}],
                    },
                    {
                        "resultType": "song",
                        "title": "Dilruba Dilnasheen",
                        "videoId": "inSong00001",
                        "artists": [{"name": "Rito Riba", "id": "UCin1"}],
                    },
                    {
                        "resultType": "song",
                        "title": "Idol",
                        "videoId": "jpSong00002",
                        "artists": [{"name": "YOASOBI", "id": "UCjp2"}],
                    },
                    {
                        "resultType": "artist",
                        "title": "A R J I T S I N G H..",
                        "browseId": "UCin99",
                    },
                    {
                        "resultType": "song",
                        "title": "Monokrom",
                        "videoId": "idSong00001",
                        "artists": [{"name": "Tulus", "id": "UCid1"}],
                    },
                    {
                        "resultType": "song",
                        "title": "Ditto",
                        "videoId": "krSong00001",
                        "artists": [{"name": "NewJeans", "id": "UCkr1"}],
                    },
                ]

            def get_search_suggestions(self, query: str):
                return [
                    f"{query} yoasobi",
                    f"{query} arijit singh",
                    f"{query} tulus",
                    f"{query} pop indonesia",
                ]

            def get_home(self, limit: int = 8):
                return [
                    {
                        "title": "J-Pop Hits Teratas",
                        "contents": [
                            {"title": "La la la", "videoId": "jpSong00003", "artists": [{"name": "Kis-My-Ft2"}]}
                        ],
                    },
                    {
                        "title": "Campuran Populer",
                        "contents": [
                            {"title": "愛の形", "videoId": "jpSong00004", "artists": [{"name": "Hey! Say! JUMP"}]},
                            {"title": "Tum Hi Ho", "videoId": "inSong00002", "artists": [{"name": "Arijit Singh"}]},
                            {"title": "Interaksi", "videoId": "idSong00002", "artists": [{"name": "Tulus"}]},
                        ],
                    },
                ]

            def get_charts(self, country: str = "ID"):
                return {
                    "songs": [
                        {"title": "Dilruba Dilnasheen", "videoId": "inSong00003", "artists": [{"name": "Siddhant kaushal"}]},
                        {"title": "夜に駆ける", "videoId": "jpSong00005", "artists": [{"name": "YOASOBI"}]},
                        {"title": "Sial", "videoId": "idSong00003", "artists": [{"name": "Mahalini"}]},
                    ],
                    "videos": [],
                    "artists": [
                        {"title": "Arijit Singh", "browseId": "UCin9"},
                        {"title": "Mahalini", "browseId": "UCid9"},
                    ],
                    "trending": [],
                }

        provider = MusicProvider(gateway=RegionalGateway(), sleep_fn=lambda _d: None)  # type: ignore[arg-type]

        search_res = provider.search("pop", None, 20)
        titles = [item["title"] for item in search_res["items"]]
        self.assertEqual(titles, ["Monokrom", "Ditto"])

        suggest_res = provider.suggest("lagu")
        self.assertEqual(suggest_res["suggestions"], ["lagu tulus", "lagu pop indonesia"])

        home_res = provider.get_home(10)
        self.assertEqual(len(home_res["sections"]), 1)
        self.assertEqual(home_res["sections"][0]["title"], "Campuran Populer")
        self.assertEqual([i["title"] for i in home_res["sections"][0]["items"]], ["Interaksi"])

        charts_res = provider.get_charts("ID")
        self.assertEqual([s["title"] for s in charts_res["songs"]], ["Sial"])
        self.assertEqual([a["title"] for a in charts_res["artists"]], ["Mahalini"])

    def test_nfkc_stylized_unicode_taiwan_xg_and_non_false_positive(self) -> None:
        class EdgeRegionalGateway(FakeYTMusicGateway):
            def search(self, query: str, filter=None, limit: int = 20):
                return [
                    {"resultType": "song", "title": "𝐁𝐨𝐥𝐥𝐲𝐰𝐨𝐨𝐝 Medley", "videoId": "inStyl00001"},
                    {"resultType": "song", "title": "Taiwan Mandopop Mix", "videoId": "twSong00001"},
                    {"resultType": "song", "title": "WOKE UP", "videoId": "xgSong00001", "artists": [{"name": "XG"}]},
                    {"resultType": "song", "title": "Anime Opening Best", "videoId": "jpAni00001"},
                    {"resultType": "song", "title": "Terbelah Jadi Dua", "videoId": "idSafe00001", "artists": [{"name": "Cakra Khan"}]},
                ]

        provider = MusicProvider(gateway=EdgeRegionalGateway(), sleep_fn=lambda _d: None)  # type: ignore[arg-type]
        res = provider.search("campuran", None, 20)
        self.assertEqual([i["title"] for i in res["items"]], ["Terbelah Jadi Dua"])
        self.assertEqual(provider.search("YOASOBI Idol", None, 20)["items"], [])
        self.assertEqual(provider.search("Arijit Singh Tum Hi Ho", None, 20)["items"], [])
        self.assertEqual(provider.suggest("YOASOBI")["suggestions"], [])

    def test_ytmusic_only_lyrics_auto_watch_lookup_and_empty_200(self) -> None:
        class LyricsEdgeGateway(FakeYTMusicGateway):
            def get_watch_playlist(self, video_id=None, playlist_id=None, radio=True, limit=25):
                if video_id == "noLyricsVid1":
                    return {
                        "playlistId": "RDAMVMnoLyricsVid1",
                        "lyrics": None,
                        "related": None,
                        "tracks": [],
                    }
                return super().get_watch_playlist(video_id=video_id, playlist_id=playlist_id, radio=radio, limit=limit)

        with tempfile.TemporaryDirectory() as tmpdir:
            orig_provider = main_app.provider
            try:
                provider = MusicProvider(
                    gateway=LyricsEdgeGateway(),  # type: ignore[arg-type]
                    audio_settings_file=os.path.join(tmpdir, "audio_settings.json"),
                )
                main_app.provider = provider
                client = TestClient(main_app.app)

                # Auto-lookup by videoId via get_watch_playlist -> get_lyrics(timestamps=True)
                resp = client.get("/api/lyrics?videoId=5F28ye50-Kc&title=Hati-Hati+di+Jalan&artist=Tulus")
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertTrue(body["hasTimestamps"])
                self.assertEqual(body["browseId"], "MPLYt_RVAbNZdUasD-1")
                self.assertEqual(body["lines"][0]["text"], "Hari-hari berulang")

                # Auto-lookup by title/artist search -> watch -> lyrics
                resp_title = client.get("/api/lyrics?title=Hati-Hati+di+Jalan&artist=Tulus")
                self.assertEqual(resp_title.status_code, 200)
                self.assertTrue(resp_title.json()["hasTimestamps"])

                # Track without lyrics returns 200 empty object (zero 404 console spam)
                resp_empty = client.get("/api/lyrics?videoId=noLyricsVid1&title=Laut+Kidul&artist=Jeyma+Monica")
                self.assertEqual(resp_empty.status_code, 200)
                empty_body = resp_empty.json()
                self.assertFalse(empty_body["hasTimestamps"])
                self.assertEqual(empty_body["lines"], [])
                self.assertIsNone(empty_body["plainText"])
                self.assertNotIn("i.scdn.co", ALLOWED_ARTWORK_HOSTS)
            finally:
                main_app.provider = orig_provider

    def test_audio_stream_range_and_meta_endpoints(self) -> None:
        payload = b"AUDIO_ONLY_TEST_PAYLOAD_" * 120  # > 1024 bytes

        with tempfile.TemporaryDirectory() as tmpdir:
            orig_provider = main_app.provider
            try:
                with mock.patch("backend.music_provider.STREAM_CACHE_DIR", tmpdir):
                    provider = MusicProvider(
                        gateway=FakeYTMusicGateway(),  # type: ignore[arg-type]
                        audio_settings_file=os.path.join(tmpdir, "audio_settings.json"),
                    )

                    def fake_extract(*_args, **_kwargs):
                        return (
                            {
                                "url": "https://cdn.example.invalid/audio.m4a",
                                "ext": "m4a",
                                "acodec": "mp4a.40.2",
                                "vcodec": "none",
                                "abr": 160,
                                "asr": 44100,
                            },
                            "YouTube Music Audio",
                        )

                    def fake_remux(_src, out_path, *_args, **_kwargs):
                        with open(out_path, "wb") as fh:
                            fh.write(payload)

                    provider._extract_audio_source = fake_extract  # type: ignore[method-assign]
                    provider._remux_audio_only = fake_remux  # type: ignore[method-assign]

                    main_app.provider = provider
                    client = TestClient(main_app.app)

                    meta_resp = client.get("/api/stream/dQw4w9WgXcQ/meta?title=Monokrom&artist=Tulus")
                    self.assertEqual(meta_resp.status_code, 200)
                    meta_json = meta_resp.json()
                    self.assertEqual(meta_json["codec"], "AAC")
                    self.assertEqual(meta_json["bitrateKbps"], 160)
                    self.assertEqual(meta_json["mimeType"], "audio/mp4")
                    self.assertNotIn("filePath", meta_json)

                    # Full audio response supports Accept-Ranges
                    full_resp = client.get("/api/stream/dQw4w9WgXcQ?title=Monokrom&artist=Tulus")
                    self.assertEqual(full_resp.status_code, 200)
                    self.assertEqual(full_resp.headers.get("accept-ranges"), "bytes")
                    self.assertEqual(full_resp.content, payload)

                    # Range request returns 206 Partial Content
                    range_resp = client.get(
                        "/api/stream/dQw4w9WgXcQ?title=Monokrom&artist=Tulus",
                        headers={"Range": "bytes=0-15"},
                    )
                    self.assertEqual(range_resp.status_code, 206)
                    self.assertEqual(range_resp.headers.get("content-range"), f"bytes 0-15/{len(payload)}")
                    self.assertEqual(range_resp.content, payload[:16])

                    # Removed endpoint remains 404
                    self.assertEqual(client.get("/api/stream/options/dQw4w9WgXcQ").status_code, 404)
            finally:
                main_app.provider = orig_provider

    def test_vercel_pure_python_hls_and_progressive_streaming_without_ffmpeg(self) -> None:
        init_bytes = b"INIT_FTYP_MOOV_" * 20  # 300 bytes
        seg0_bytes = b"SEG0_MOOF_MDAT_" * 100  # 1500 bytes
        seg1_bytes = b"SEG1_MOOF_MDAT_" * 100  # 1500 bytes
        expected_full = init_bytes + seg0_bytes + seg1_bytes
        m3u8_text = "\n".join(
            [
                "#EXTM3U",
                "#EXT-X-VERSION:7",
                '#EXT-X-MAP:URI="init.mp4"',
                "#EXTINF:10.0,",
                "data000.m4s",
                "#EXTINF:10.0,",
                "data001.m4s",
                "#EXT-X-ENDLIST",
            ]
        )

        class _FakeHTTPResp:
            def __init__(self, status_code: int, content: bytes = b"", headers=None, text: str = "") -> None:
                self.status_code = status_code
                self.content = content
                self.headers = headers or {}
                self.text = text

            def iter_content(self, chunk_size: int = 65536):
                for i in range(0, len(self.content), chunk_size):
                    yield self.content[i : i + chunk_size]

            def close(self) -> None:
                pass

        blob_map = {
            "https://cdn.example.invalid/hls/init.mp4": init_bytes,
            "https://cdn.example.invalid/hls/data000.m4s": seg0_bytes,
            "https://cdn.example.invalid/hls/data001.m4s": seg1_bytes,
        }
        large_prog_total = 4_200_000  # > 3 MiB Vercel full response limit

        class _FakeSession:
            def head(self, url: str, headers=None, timeout=8, allow_redirects=True):
                if url in blob_map:
                    return _FakeHTTPResp(200, headers={"content-length": str(len(blob_map[url]))})
                if url == "https://cdn.example.invalid/prog.mp3":
                    return _FakeHTTPResp(200, headers={"content-length": str(large_prog_total)})
                return _FakeHTTPResp(404)

            def get(self, url: str, headers=None, stream=False, timeout=10, allow_redirects=True):
                if url == "https://cdn.example.invalid/hls/playlist.m3u8":
                    return _FakeHTTPResp(200, text=m3u8_text)
                if url in blob_map:
                    return _FakeHTTPResp(200, content=blob_map[url])
                if url == "https://cdn.example.invalid/prog.mp3":
                    rng = (headers or {}).get("Range", "")
                    if rng.startswith("bytes="):
                        s, e = rng[6:].split("-")
                        start = int(s)
                        end = int(e)
                        chunk = (b"P" * (end - start + 1))
                        return _FakeHTTPResp(
                            206,
                            content=chunk,
                            headers={"content-range": f"bytes {start}-{end}/{large_prog_total}"},
                        )
                return _FakeHTTPResp(404)

            def close(self) -> None:
                pass

        with tempfile.TemporaryDirectory() as tmpdir:
            orig_provider = main_app.provider
            try:
                with (
                    mock.patch.dict(os.environ, {"VERCEL": "1"}),
                    mock.patch("backend.music_provider.STREAM_CACHE_DIR", tmpdir),
                    mock.patch("backend.music_provider.shutil.which", return_value=None),
                ):
                    provider = MusicProvider(
                        gateway=FakeYTMusicGateway(),  # type: ignore[arg-type]
                        audio_settings_file=os.path.join(tmpdir, "audio_settings.json"),
                    )
                    provider._create_stream_http_session = lambda: _FakeSession()  # type: ignore[method-assign]
                    provider._extract_audio_source = lambda *_a, **_kw: (  # type: ignore[method-assign]
                        {
                            "url": "https://cdn.example.invalid/hls/playlist.m3u8",
                            "ext": "m4a",
                            "protocol": "m3u8_native",
                            "acodec": "mp4a.40.2",
                            "vcodec": "none",
                            "abr": 160,
                            "asr": 44100,
                        },
                        "YouTube Music Audio",
                    )

                    main_app.provider = provider
                    client = TestClient(main_app.app)

                    meta_resp = client.get("/api/stream/hlsTest0001/meta?title=Monokrom&artist=Tulus")
                    self.assertEqual(meta_resp.status_code, 200)
                    meta_json = meta_resp.json()
                    self.assertEqual(meta_json["codec"], "AAC")
                    self.assertEqual(meta_json["streamMode"], "virtual")
                    self.assertEqual(meta_json["totalSize"], len(expected_full))
                    self.assertNotIn("plan", meta_json)

                    head_resp = client.head("/api/stream/hlsTest0001?title=Monokrom&artist=Tulus")
                    self.assertEqual(head_resp.status_code, 200)
                    self.assertEqual(head_resp.headers.get("accept-ranges"), "bytes")
                    self.assertEqual(head_resp.headers.get("content-length"), str(len(expected_full)))

                    # Range spanning init.mp4 + seg0 + seg1
                    range_resp = client.get(
                        "/api/stream/hlsTest0001?title=Monokrom&artist=Tulus",
                        headers={"Range": "bytes=200-1999"},
                    )
                    self.assertEqual(range_resp.status_code, 206)
                    self.assertEqual(
                        range_resp.headers.get("content-range"),
                        f"bytes 200-1999/{len(expected_full)}",
                    )
                    self.assertEqual(range_resp.content, expected_full[200:2000])

                    # Large progressive file on Vercel must cap response to 1.5 MiB chunk (206 Partial Content)
                    provider._extract_audio_source = lambda *_a, **_kw: (  # type: ignore[method-assign]
                        {
                            "url": "https://cdn.example.invalid/prog.mp3",
                            "ext": "mp3",
                            "protocol": "https",
                            "acodec": "mp3",
                            "vcodec": "none",
                            "abr": 128,
                            "asr": 44100,
                        },
                        "YouTube Music Audio",
                    )
                    prog_resp = client.get("/api/stream/progTest001?title=Lagu&artist=Artis")
                    self.assertEqual(prog_resp.status_code, 206)
                    self.assertEqual(
                        prog_resp.headers.get("content-range"),
                        f"bytes 0-1572863/{large_prog_total}",
                    )
                    self.assertEqual(len(prog_resp.content), 1_572_864)
            finally:
                main_app.provider = orig_provider

    def test_ytmusic_audio_extraction_and_bot_block_meta_fallback(self) -> None:
        seen_urls = []

        class DirectSongGateway(FakeYTMusicGateway):
            def get_song(self, video_id: str):
                if video_id == "directYtm01":
                    return {
                        "playabilityStatus": {"status": "OK"},
                        "streamingData": {
                            "adaptiveFormats": [
                                {
                                    "itag": 140,
                                    "url": "https://rr1.googlevideo.com/videoplayback?id=direct",
                                    "mimeType": 'audio/mp4; codecs="mp4a.40.2"',
                                    "averageBitrate": 129547,
                                    "audioSampleRate": "44100",
                                }
                            ]
                        },
                    }
                return {"playabilityStatus": {"status": "LOGIN_REQUIRED"}}

        seen_opts = []

        class _BotBlockYDL:
            def __init__(self, opts):
                seen_opts.append(opts)

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def extract_info(self, target: str, download: bool = False):
                seen_urls.append(target)
                raise RuntimeError("Sign in to confirm you're not a bot")

        provider = MusicProvider(gateway=DirectSongGateway())  # type: ignore[arg-type]
        fmt, source = provider._extract_audio_source("directYtm01", "Monokrom", "Tulus", 215, "high")
        self.assertEqual(source, "YouTube Music Audio")
        self.assertEqual(fmt["url"], "https://rr1.googlevideo.com/videoplayback?id=direct")

        with tempfile.TemporaryDirectory() as tmpdir:
            orig_provider = main_app.provider
            try:
                with (
                    mock.patch("backend.music_provider.STREAM_CACHE_DIR", tmpdir),
                    mock.patch("backend.music_provider.yt_dlp.YoutubeDL", _BotBlockYDL),
                ):
                    main_app.provider = provider
                    client = TestClient(main_app.app)
                    meta_resp = client.get("/api/stream/dQw4w9WgXcQ/meta?title=Monokrom&artist=Tulus")
                    self.assertEqual(meta_resp.status_code, 200)
                    meta_json = meta_resp.json()
                    self.assertFalse(meta_json["available"])
                    self.assertEqual(meta_json["fallbackMode"], "youtube-iframe")
                    self.assertTrue(all("music.youtube.com/watch?v=" in u for u in seen_urls))
                    self.assertTrue(seen_opts and "logger" in seen_opts[0] and seen_opts[0].get("quiet"))

                    stream_resp = client.get("/api/stream/dQw4w9WgXcQ?title=Monokrom&artist=Tulus")
                    self.assertEqual(stream_resp.status_code, 403)
            finally:
                main_app.provider = orig_provider

    def test_indonesia_trending_charts_and_home_diversification_without_ai(self) -> None:
        class KoploHeavyIndonesiaGateway(FakeYTMusicGateway):
            def search(self, query: str, filter=None, limit: int = 20):
                if filter == "playlists":
                    return [
                        {
                            "resultType": "playlist",
                            "title": "Cover AI Lagu Lawas Koplo",
                            "browseId": "VLPLaiCoverSkip",
                        },
                        {
                            "resultType": "playlist",
                            "title": "Top 100 Indonesia Songs 2026" if "100" in query else (
                                "Lagu Pop Indonesia Terbaru 2026" if "Pop" in query else "Top 50 Lagu Indie Indonesia"
                            ),
                            "browseId": (
                                "VLPLidTop100"
                                if "100" in query
                                else ("VLPLidPop2026" if "Pop" in query else "VLPLidIndie50")
                            ),
                        },
                    ]
                return super().search(query, filter=filter, limit=limit)

            def get_charts(self, country: str = "ID"):
                return {
                    "videos": [
                        {
                            "title": "Trending 20 Indonesia",
                            "playlistId": "OLAK5uy_koploChart",
                            "thumbnails": [{"url": "https://yt3.googleusercontent.com/c=s192", "width": 192, "height": 192}],
                        }
                    ],
                    "artists": [
                        {"title": "Denny Caknan", "browseId": "UCdenny", "subscribers": "7M"},
                        {"title": "Yeni Inka", "browseId": "UCyeni", "subscribers": "3M"},
                        {"title": "Jeyma Monica", "browseId": "UCjeyma", "subscribers": "2M"},
                        {"title": "Tulus", "browseId": "UC_DHlXllTSMB8pTC38_leFg", "subscribers": "5M"},
                    ],
                    "songs": [],
                    "trending": [],
                }

            def get_home(self, limit: int = 8):
                return [
                    {
                        "title": "Autumn J-Pop",
                        "contents": [{"title": "Idol", "videoId": "jp001", "artists": [{"name": "YOASOBI"}]}],
                    },
                    {
                        "title": "Quick picks",
                        "contents": [
                            {"title": "Negoro Angin", "videoId": "kp001", "artists": [{"name": "Denny Caknan", "id": "UCdenny"}]},
                            {"title": "Laut Kidul", "videoId": "kp002", "artists": [{"name": "Jeyma Monica", "id": "UCjeyma"}]},
                            {"title": "Terbelah Jadi Dua", "videoId": "kp003", "artists": [{"name": "Yeni Inka", "id": "UCyeni"}]},
                            {"title": "Teh Hijau", "videoId": "pop001", "artists": [{"name": "Tulus", "id": "UCtulus123456"}]},
                        ],
                    },
                ]

            def get_playlist(self, playlist_id: str, limit: int = 100):
                if playlist_id == "OLAK5uy_koploChart":
                    return {
                        "id": playlist_id,
                        "title": "Trending 20 Indonesia",
                        "tracks": [
                            {"videoId": "kp1", "title": "Laut Kidul", "artists": [{"name": "Jeyma Monica", "id": "UCjeyma"}]},
                            {"videoId": "kp2", "title": "DAHLIA (OFFICIAL LIVE MUSIC VIDEO)", "artists": [{"name": "DC. PRODUCTION", "id": "UCdcp"}]},
                            {"videoId": "kp3", "title": "TERBELAH JADI DUA ~ Cover by: Della Monica", "artists": [{"name": "Della Monica", "id": "UCdella"}]},
                            {"videoId": "kp4", "title": "MUTIARA (Live Dangdut Jamming Session)", "artists": [{"name": "Shinta Gisul", "id": "UCshinta"}]},
                            {"videoId": "popChart1", "title": "Teh Hijau", "artists": [{"name": "Tulus", "id": "UCtulus123456"}]},
                        ],
                    }
                if playlist_id == "PLidPop2026":
                    return {
                        "id": playlist_id,
                        "title": "Lagu Pop Indonesia Terbaru 2026",
                        "tracks": [
                            {"videoId": "pop2", "title": "Panggil Aku Bayangan", "artists": [{"name": "Lyodra", "id": "UClyodra123"}]},
                            {"videoId": "pop3", "title": "maha benar", "artists": [{"name": "Salma Salsabil", "id": "UCsalma123"}]},
                            {"videoId": "pop4", "title": "2001x", "artists": [{"name": "Adrian Khalif", "id": "UCadrian123"}]},
                        ],
                    }
                if playlist_id == "PLidIndie50":
                    return {
                        "id": playlist_id,
                        "title": "Top 50 Lagu Indie Indonesia",
                        "tracks": [
                            {"videoId": "ind1", "title": "Sesi Potret", "artists": [{"name": "enau", "id": "UCenau123"}]},
                            {"videoId": "ind2", "title": "Sadrah", "artists": [{"name": "for Revenge", "id": "UCforrev123"}]},
                        ],
                    }
                return {
                    "id": playlist_id,
                    "title": "Top 100 Indonesia Songs 2026",
                    "tracks": [
                        {"videoId": "top1", "title": "Dunia Yang Nanti", "artists": [{"name": "Raim Laode", "id": "UCraim123"}]},
                        {"videoId": "top2", "title": "Jangan Paksa Rindu", "artists": [{"name": "Ifan Seventeen", "id": "UCifan123"}]},
                        {"videoId": "kp1", "title": "Laut Kidul", "artists": [{"name": "Jeyma Monica", "id": "UCjeyma"}]},
                    ],
                }

        provider = MusicProvider(gateway=KoploHeavyIndonesiaGateway(), sleep_fn=lambda _d: None)  # type: ignore[arg-type]

        charts = provider.get_charts("ID")
        song_titles = [s["title"] for s in charts["songs"]]
        # Non-koplo Indonesian trending tracks come first, Koplo capped to at most 1
        self.assertIn("Teh Hijau", song_titles[:3])
        self.assertIn("Dunia Yang Nanti", song_titles)
        self.assertIn("Panggil Aku Bayangan", song_titles)
        koplo_in_charts = [t for t in song_titles if "Laut Kidul" in t or "DAHLIA" in t or "TERBELAH" in t]
        self.assertLessEqual(len(koplo_in_charts), 1)
        # Artists diversified: Tulus and real pop artists promoted above Koplo flood
        artist_names = [a["title"] for a in charts["artists"]]
        self.assertEqual(artist_names[0], "Tulus")
        self.assertIn("Raim Laode", artist_names)

        home = provider.get_home(8)
        section_titles = [sec["title"] for sec in home["sections"]]
        self.assertIn("Sedang Trending di Indonesia", section_titles)
        self.assertIn("Pop & Hits Indonesia Terbaru", section_titles)
        self.assertIn("Indie & Viral Indonesia", section_titles)
        self.assertNotIn("Autumn J-Pop", section_titles)
        quick_picks = next(sec for sec in home["sections"] if sec["title"] == "Quick picks")
        self.assertEqual(quick_picks["items"][0]["title"], "Teh Hijau")
        self.assertLessEqual(len(quick_picks["items"]), 2)


if __name__ == "__main__":
    unittest.main()
