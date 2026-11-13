import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from ytmusicapi.exceptions import YTMusicError

from cache import TTLCache
from main import app
from schemas import AlbumRef, ArtistRef
from service import (
    SoundClearService,
    normalize_media_item,
    parse_duration_seconds,
    pick_largest_thumbnail,
)


def test_pick_largest_thumbnail():
    thumbs = [
        {"url": "https://example.com/60.jpg", "width": 60, "height": 60},
        {"url": "https://example.com/544.jpg", "width": 544, "height": 544},
        {"url": "https://example.com/120.jpg", "width": 120, "height": 120},
    ]
    assert pick_largest_thumbnail(thumbs) == "https://example.com/544.jpg"
    assert pick_largest_thumbnail([], fallback="https://fallback.jpg") == "https://fallback.jpg"


def test_parse_duration_seconds():
    assert parse_duration_seconds("4:02") == 242
    assert parse_duration_seconds("1:02:03") == 3723
    assert parse_duration_seconds(None, 180) == 180
    assert parse_duration_seconds("invalid") is None


def test_normalize_media_item_watch_shape():
    raw = {
        "videoId": "E7kHvjvU6JY",
        "title": "Hati-Hati di Jalan",
        "length": "4:02",
        "artists": [{"name": "Tulus", "id": "UC123"}],
        "album": "Manusia",
        "thumbnail": [
            {"url": "https://i.ytimg.com/small.jpg", "width": 60, "height": 60},
            {"url": "https://i.ytimg.com/large.jpg", "width": 544, "height": 544},
        ],
    }
    item = normalize_media_item(
        raw,
        default_type="song",
        fallback_album=AlbumRef(id="MPREb_1", name="Manusia"),
    )
    assert item is not None
    assert item.id == "E7kHvjvU6JY"
    assert item.duration == "4:02"
    assert item.durationSeconds == 242
    assert item.thumbnail == "https://i.ytimg.com/large.jpg"
    assert item.artists == [ArtistRef(id="UC123", name="Tulus")]
    assert item.album == AlbumRef(id="MPREb_1", name="Manusia")


def test_ttl_cache_expiration():
    cache = TTLCache(default_ttl_seconds=1)
    calls = 0

    def loader():
        nonlocal calls
        calls += 1
        return {"ok": calls}

    assert cache.get_or_set("k", loader) == {"ok": 1}
    assert cache.get_or_set("k", loader) == {"ok": 1}
    time.sleep(1.05)
    assert cache.get_or_set("k", loader) == {"ok": 2}


def test_ytmusic_error_mapped_cleanly(monkeypatch):
    client = TestClient(app)

    def boom(*args, **kwargs):
        raise YTMusicError("Rate limited by upstream")

    from main import service

    monkeypatch.setattr(service._yt, "search", boom)
    service._cache.clear()
    resp = client.get("/search", params={"q": "tulus_error_test"})
    assert resp.status_code == 502
    assert "Rate limited by upstream" in resp.json()["detail"]


def test_get_moods_returns_groups(monkeypatch):
    client = TestClient(app)
    from main import service

    monkeypatch.setattr(
        service._yt,
        "get_mood_categories",
        lambda: {"Moods & moments": [{"title": "Chill", "params": "abc123"}]},
    )
    service._cache.clear()
    resp = client.get("/moods")
    assert resp.status_code == 200
    data = resp.json()
    assert data["groups"][0]["title"] == "Moods & moments"
    assert data["groups"][0]["items"][0]["params"] == "abc123"


def test_get_home_excludes_indian_and_mandarin(monkeypatch):
    client = TestClient(app)
    from main import service

    fake_home = [
        {
            "title": "Indian Music",
            "contents": [
                {"title": "Bollywood Hitlist", "playlistId": "PL_IND_1", "thumbnails": []}
            ],
        },
        {
            "title": "Tamil Hits",
            "contents": [
                {"title": "Kollywood Romance", "playlistId": "PL_TAM_1", "thumbnails": []}
            ],
        },
        {
            "title": "New releases",
            "contents": [
                {
                    "title": "找一個字代替",
                    "artists": [{"name": "林夏", "id": "UC_ZH1"}],
                    "browseId": "MPREb_zh1",
                    "thumbnails": [],
                },
                {
                    "title": "Mandarin Collection 6",
                    "artists": [{"name": "FM Station", "id": "UC_ZH2"}],
                    "browseId": "MPREb_zh2",
                    "thumbnails": [],
                },
                {
                    "title": "old hit love songs",
                    "artists": [{"name": "Udit Narayan", "id": "UC_IN1"}],
                    "browseId": "MPREb_in1",
                    "thumbnails": [],
                },
                {
                    "title": "Jangan Lama-lama",
                    "artists": [{"name": "Duo Antonia", "id": "UC_ID1"}],
                    "browseId": "MPREb_id1",
                    "thumbnails": [],
                },
                {
                    "title": "夜に駆ける",
                    "artists": [{"name": "YOASOBI", "id": "UC_JP1"}],
                    "browseId": "MPREb_jp1",
                    "thumbnails": [],
                },
                {
                    "title": "Boogie Woogie",
                    "artists": [{"name": "NCT DREAM", "id": "UC_KR1"}],
                    "browseId": "MPREb_kr1",
                    "thumbnails": [],
                },
            ],
        },
    ]

    monkeypatch.setattr(service._yt, "get_home", lambda limit=10: fake_home)
    service._cache.clear()
    resp = client.get("/home")
    assert resp.status_code == 200
    sections = resp.json()["sections"]
    assert [s["title"] for s in sections] == ["New releases"]
    titles = [item["title"] for item in sections[0]["items"]]
    assert titles == ["Jangan Lama-lama", "夜に駆ける", "Boogie Woogie"]
