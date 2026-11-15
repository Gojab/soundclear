from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
import time
from typing import Any, Callable, Dict, List, Optional


def _now_ms() -> int:
    return int(time.time() * 1000)


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        num = float(val)
        return num if num == num and abs(num) != float("inf") else default
    except Exception:
        return default


def _track_uid(track: Optional[Dict[str, Any]]) -> str:
    if not isinstance(track, dict):
        return ""
    return str(
        track.get("videoId")
        or track.get("id")
        or track.get("audioUrl")
        or ""
    ).strip()


def _track_duration(track: Optional[Dict[str, Any]], explicit_duration: float = 0.0) -> float:
    if explicit_duration and explicit_duration > 1.0:
        return float(explicit_duration)
    if isinstance(track, dict):
        d = _safe_float(track.get("durationSeconds"), 0.0)
        if d > 1.0:
            return d
    return 0.0


def _sanitize_track(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    uid = _track_uid(raw)
    title = str(raw.get("title") or "").strip()
    if not uid and not title:
        return None
    cleaned: Dict[str, Any] = {
        "id": str(raw.get("id") or uid),
        "videoId": raw.get("videoId"),
        "playlistId": raw.get("playlistId"),
        "browseId": raw.get("browseId"),
        "type": str(raw.get("type") or "song"),
        "title": title or "Tanpa Judul",
        "subtitle": raw.get("subtitle"),
        "artists": raw.get("artists") if isinstance(raw.get("artists"), list) else [],
        "album": raw.get("album") if isinstance(raw.get("album"), dict) else None,
        "duration": raw.get("duration"),
        "durationSeconds": raw.get("durationSeconds"),
        "thumbnail": raw.get("thumbnail"),
        "isExplicit": bool(raw.get("isExplicit", False)),
        "isLocal": bool(raw.get("isLocal", False)),
    }
    return cleaned


def _sanitize_track_list(raw_list: Any, max_len: int = 80) -> List[Dict[str, Any]]:
    if not isinstance(raw_list, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in raw_list[:max_len]:
        cleaned = _sanitize_track(item)
        if cleaned is not None:
            out.append(cleaned)
    return out


def sanitize_session_payload(raw: Dict[str, Any], now_ms: Optional[int] = None) -> Dict[str, Any]:
    ts = int(now_ms if now_ms is not None else _now_ms())
    session_id = str(raw.get("sessionId") or "default").strip()[:120] or "default"
    current_track = _sanitize_track(raw.get("currentTrack"))
    manual_queue = _sanitize_track_list(raw.get("manualQueue"))
    source_queue = _sanitize_track_list(raw.get("sourceQueue"))
    history_stack = _sanitize_track_list(raw.get("historyStack"), max_len=40)

    repeat_raw = str(raw.get("repeat") or "off").strip().lower()
    repeat = repeat_raw if repeat_raw in ("off", "one", "all") else "off"

    rate = max(0.5, min(2.0, _safe_float(raw.get("playbackRate"), 1.0) or 1.0))
    duration = max(0.0, _safe_float(raw.get("duration"), 0.0))
    if duration <= 0.0 and current_track:
        duration = _track_duration(current_track, 0.0)
    current_time = max(0.0, _safe_float(raw.get("currentTime"), 0.0))
    if duration > 0.0:
        current_time = min(current_time, duration)

    updated_at_ms = raw.get("updatedAtMs")
    if isinstance(updated_at_ms, (int, float)) and updated_at_ms > 0:
        safe_updated = int(updated_at_ms)
    else:
        safe_updated = ts

    quality_raw = str(raw.get("quality") or "high").strip().lower()
    quality = (
        quality_raw
        if quality_raw in ("low", "normal", "high", "lossless", "hi_res")
        else "high"
    )

    return {
        "sessionId": session_id,
        "updatedAtMs": safe_updated,
        "isPlaying": bool(raw.get("isPlaying", False)) and current_track is not None,
        "currentTime": round(current_time, 3),
        "duration": round(duration, 3),
        "playbackRate": rate,
        "repeat": repeat,
        "shuffle": bool(raw.get("shuffle", False)),
        "sourceLabel": str(raw.get("sourceLabel") or "") or None,
        "quality": quality,
        "currentTrack": current_track,
        "manualQueue": manual_queue,
        "sourceQueue": source_queue,
        "historyStack": history_stack,
    }


def advance_session_to_now(
    session: Dict[str, Any],
    now_ms: Optional[int] = None,
) -> tuple[Dict[str, Any], bool]:
    """Advance playback position and queue transitions cleanly based on wall-clock delta.

    Returns (updated_session, track_changed_or_stopped).
    """
    ts = int(now_ms if now_ms is not None else _now_ms())
    st = copy.deepcopy(session)
    if not st.get("isPlaying") or not st.get("currentTrack"):
        return st, False

    last_ms = int(st.get("updatedAtMs") or ts)
    if ts <= last_ms:
        return st, False

    elapsed_sec = ((ts - last_ms) / 1000.0) * max(0.5, min(2.0, _safe_float(st.get("playbackRate"), 1.0)))
    # Cap runaway delta across sleeps at 6 hours so malformed timestamps don't spin endlessly
    elapsed_sec = min(elapsed_sec, 6 * 3600.0)

    position = max(0.0, _safe_float(st.get("currentTime"), 0.0)) + elapsed_sec
    repeat = st.get("repeat", "off")
    manual_q: List[Dict[str, Any]] = list(st.get("manualQueue") or [])
    source_q: List[Dict[str, Any]] = list(st.get("sourceQueue") or [])
    history: List[Dict[str, Any]] = list(st.get("historyStack") or [])
    current = st.get("currentTrack")
    duration = _track_duration(current, _safe_float(st.get("duration"), 0.0))
    changed = False

    max_hops = 120
    hops = 0
    while current is not None and duration > 0.0 and position >= duration and hops < max_hops:
        hops += 1
        if repeat == "one":
            position = position % duration
            break

        leftover = position - duration
        if manual_q:
            next_track = manual_q.pop(0)
            history = ([current] + history)[:40]
            current = next_track
            duration = _track_duration(current, 0.0)
            position = leftover
            changed = True
        elif source_q:
            next_track = source_q.pop(0)
            if repeat == "all":
                source_q.append(current)
            history = ([current] + history)[:40]
            current = next_track
            duration = _track_duration(current, 0.0)
            position = leftover
            changed = True
        elif repeat == "all":
            position = leftover % duration
            break
        else:
            position = duration
            st["isPlaying"] = False
            changed = True
            break

    if current is not None and duration > 0.0 and position > duration:
        position = duration

    st["currentTrack"] = current
    st["manualQueue"] = manual_q
    st["sourceQueue"] = source_q
    st["historyStack"] = history
    st["currentTime"] = round(max(0.0, position), 3)
    st["duration"] = round(max(0.0, duration), 3)
    st["updatedAtMs"] = ts
    return st, changed


class SoundClearBackgroundManager:
    """24/7 backend background engine that maintains sessions, pre-warms streams, and keeps caches hot
    even when every Chrome/browser tab or window has been closed."""

    def __init__(
        self,
        provider: Any,
        *,
        storage_path: Optional[str] = None,
        tick_interval_seconds: float = 2.0,
        catalog_refresh_seconds: float = 600.0,
    ) -> None:
        self._provider = provider
        self._tick_interval = max(0.2, float(tick_interval_seconds))
        self._catalog_refresh_seconds = max(30.0, float(catalog_refresh_seconds))
        self._storage_path = storage_path or self._default_storage_path()

        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._prewarmed_keys: Dict[str, float] = {}
        self._hydrated_watch_keys: Dict[str, float] = {}

        self._started_at_ms: Optional[int] = None
        self._last_tick_at_ms: Optional[int] = None
        self._last_catalog_refresh_at: float = 0.0
        self._tick_count = 0
        self._sessions_advanced_count = 0
        self._tracks_prewarmed_count = 0
        self._catalog_refreshes_count = 0
        self._last_disk_flush_at = 0.0

        self._load_sessions_from_disk()

    @staticmethod
    def _default_storage_path() -> str:
        env_path = (os.environ.get("SOUNDCLEAR_BG_SESSION_FILE") or "").strip()
        if env_path:
            return env_path
        if os.environ.get("VERCEL"):
            return os.path.join(tempfile.gettempdir(), "soundclear_bg_sessions.json")
        return os.path.join(os.path.dirname(__file__), ".background_sessions.json")

    def _load_sessions_from_disk(self) -> None:
        try:
            if not os.path.isfile(self._storage_path):
                return
            with open(self._storage_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            raw_sessions = data.get("sessions") if isinstance(data, dict) else None
            if not isinstance(raw_sessions, dict):
                return
            now = _now_ms()
            loaded: Dict[str, Dict[str, Any]] = {}
            for sid, sdata in raw_sessions.items():
                if isinstance(sdata, dict):
                    sanitized = sanitize_session_payload({**sdata, "sessionId": sid}, now_ms=now)
                    # Keep recent sessions (within 7 days)
                    if now - int(sanitized.get("updatedAtMs") or now) <= 7 * 86400 * 1000:
                        loaded[sanitized["sessionId"]] = sanitized
            self._sessions = loaded
        except Exception:
            self._sessions = {}

    def _flush_sessions_to_disk(self) -> None:
        try:
            with self._lock:
                snapshot = {"version": 1, "savedAtMs": _now_ms(), "sessions": self._sessions}
            parent = os.path.dirname(self._storage_path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            fd, tmp_path = tempfile.mkstemp(
                prefix=".bg_sess_",
                suffix=".tmp",
                dir=parent or tempfile.gettempdir(),
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as fh:
                    json.dump(snapshot, fh, ensure_ascii=False)
                os.replace(tmp_path, self._storage_path)
                self._last_disk_flush_at = time.monotonic()
            except Exception:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                raise
        except Exception:
            pass

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._started_at_ms = _now_ms()
            self._thread = threading.Thread(
                target=self._run_loop,
                name="SoundClearBackgroundWorker",
                daemon=True,
            )
            self._thread.start()

    def stop(self, timeout: float = 2.0) -> None:
        self._stop_event.set()
        self._wake_event.set()
        th = self._thread
        if th and th.is_alive():
            th.join(timeout=timeout)
        self._flush_sessions_to_disk()

    def upsert_session(self, payload: Dict[str, Any], now_ms: Optional[int] = None) -> Dict[str, Any]:
        ts = int(now_ms if now_ms is not None else _now_ms())
        sanitized = sanitize_session_payload({**payload, "updatedAtMs": ts}, now_ms=ts)
        sid = sanitized["sessionId"]
        with self._lock:
            self._sessions[sid] = sanitized
            # Prune oldest sessions if too many
            if len(self._sessions) > 40:
                ordered = sorted(
                    self._sessions.items(),
                    key=lambda kv: int(kv[1].get("updatedAtMs") or 0),
                    reverse=True,
                )
                self._sessions = dict(ordered[:40])
        self._flush_sessions_to_disk()
        self._wake_event.set()
        return copy.deepcopy(sanitized)

    def get_session(self, session_id: str, now_ms: Optional[int] = None) -> Optional[Dict[str, Any]]:
        clean_id = (session_id or "").strip()[:120]
        if not clean_id:
            return None
        with self._lock:
            raw = self._sessions.get(clean_id)
            if raw is None:
                return None
            advanced, changed = advance_session_to_now(raw, now_ms=now_ms)
            self._sessions[clean_id] = advanced
        if changed:
            self._flush_sessions_to_disk()
        return advanced

    def delete_session(self, session_id: str) -> bool:
        clean_id = (session_id or "").strip()[:120]
        with self._lock:
            existed = clean_id in self._sessions
            if existed:
                del self._sessions[clean_id]
        if existed:
            self._flush_sessions_to_disk()
        return existed

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                self.run_once()
            except Exception:
                pass
            self._wake_event.wait(timeout=self._tick_interval)
            self._wake_event.clear()

    def run_once(self, now_ms: Optional[int] = None) -> None:
        ts = int(now_ms if now_ms is not None else _now_ms())
        dirty = False
        prewarm_targets: List[tuple[Dict[str, Any], str]] = []
        watch_targets: List[tuple[str, Dict[str, Any]]] = []

        with self._lock:
            self._tick_count += 1
            self._last_tick_at_ms = ts

            for sid, sess in list(self._sessions.items()):
                if not sess.get("isPlaying") or not sess.get("currentTrack"):
                    continue
                advanced, changed = advance_session_to_now(sess, now_ms=ts)
                self._sessions[sid] = advanced
                if changed:
                    dirty = True
                    self._sessions_advanced_count += 1

                quality = str(advanced.get("quality") or "high")
                cur_track = advanced.get("currentTrack")
                if isinstance(cur_track, dict) and not cur_track.get("isLocal"):
                    prewarm_targets.append((cur_track, quality))
                    if not advanced.get("sourceQueue") and _track_uid(cur_track):
                        watch_targets.append((sid, cur_track))

                upcoming = list(advanced.get("manualQueue") or []) + list(advanced.get("sourceQueue") or [])
                for q_track in upcoming[:2]:
                    if isinstance(q_track, dict) and not q_track.get("isLocal"):
                        prewarm_targets.append((q_track, quality))

        # Auto-refill radio queue on backend if session is playing with an empty queue
        for sid, cur_track in watch_targets:
            vid = _track_uid(cur_track)
            if not vid:
                continue
            now_mono = time.monotonic()
            last_hydrated = self._hydrated_watch_keys.get(vid)
            if last_hydrated is not None and now_mono - last_hydrated < 120.0:
                continue
            self._hydrated_watch_keys[vid] = now_mono
            try:
                watch = self._provider.get_watch_playlist(
                    vid,
                    cur_track.get("playlistId"),
                    True,
                    15,
                )
                tracks = watch.get("tracks") if isinstance(watch, dict) else None
                if isinstance(tracks, list) and tracks:
                    upcoming_clean = [
                        t
                        for t in _sanitize_track_list(tracks, max_len=20)
                        if _track_uid(t) != vid
                    ]
                    if upcoming_clean:
                        target_quality = "high"
                        with self._lock:
                            sess_now = self._sessions.get(sid)
                            if sess_now and not sess_now.get("sourceQueue"):
                                sess_now["sourceQueue"] = upcoming_clean
                                target_quality = str(sess_now.get("quality") or "high")
                                dirty = True
                        for q_track in upcoming_clean[:2]:
                            prewarm_targets.append((q_track, target_quality))
            except Exception:
                pass

        # Pre-warm upcoming track streams in background so playback resumes / continues seamlessly
        for track, quality in prewarm_targets[:4]:
            if self._stop_event.is_set():
                break
            if time.monotonic() < float(getattr(self._provider, "_yt_bot_blocked_until", 0.0) or 0.0):
                break
            vid = _track_uid(track)
            if not vid:
                continue
            cache_key = f"{vid}:{quality}"
            now_mono = time.monotonic()
            last_warm = self._prewarmed_keys.get(cache_key)
            if last_warm is not None and now_mono - last_warm < 900.0:
                continue
            self._prewarmed_keys[cache_key] = now_mono
            try:
                artists = track.get("artists") or []
                artist_name = ", ".join(
                    str(a.get("name") or "") for a in artists if isinstance(a, dict) and a.get("name")
                )
                dur = track.get("durationSeconds")
                dur_int = int(dur) if isinstance(dur, (int, float)) and dur > 0 else None
                self._provider.resolve_or_build_audio_stream(
                    vid,
                    title=str(track.get("title") or ""),
                    artist=artist_name,
                    duration_seconds=dur_int,
                    quality=quality,
                )
                with self._lock:
                    self._tracks_prewarmed_count += 1
            except Exception:
                pass

        # Keep Trending Indonesia Home + Charts warm in background even when no browsers are open
        now_mono = time.monotonic()
        if (
            not os.environ.get("VERCEL")
            and os.environ.get("SOUNDCLEAR_DISABLE_WARMUP") != "1"
            and (
                self._last_catalog_refresh_at == 0.0
                or now_mono - self._last_catalog_refresh_at >= self._catalog_refresh_seconds
            )
        ):
            self._last_catalog_refresh_at = now_mono
            for fn in (
                lambda: self._provider.get_home(limit=8),
                lambda: self._provider.get_charts("ID"),
            ):
                try:
                    fn()
                except Exception:
                    pass
            with self._lock:
                self._catalog_refreshes_count += 1

        if dirty or (time.monotonic() - self._last_disk_flush_at >= 15.0 and len(self._sessions) > 0):
            self._flush_sessions_to_disk()

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            now = _now_ms()
            playing_count = sum(1 for s in self._sessions.values() if s.get("isPlaying"))
            uptime_sec = (
                round(max(0.0, (now - self._started_at_ms) / 1000.0), 1)
                if self._started_at_ms is not None
                else 0.0
            )
            session_summaries = [
                {
                    "sessionId": sid,
                    "isPlaying": bool(s.get("isPlaying")),
                    "currentTime": s.get("currentTime", 0),
                    "duration": s.get("duration", 0),
                    "queueLength": len(s.get("manualQueue") or []) + len(s.get("sourceQueue") or []),
                    "trackTitle": (s.get("currentTrack") or {}).get("title"),
                    "updatedAtMs": s.get("updatedAtMs"),
                }
                for sid, s in self._sessions.items()
            ]
            return {
                "running": bool(self._thread and self._thread.is_alive()),
                "pid": os.getpid(),
                "uptimeSeconds": uptime_sec,
                "tickCount": self._tick_count,
                "lastTickAtMs": self._last_tick_at_ms,
                "activeSessions": len(self._sessions),
                "playingSessions": playing_count,
                "sessionsAdvancedCount": self._sessions_advanced_count,
                "tracksPrewarmedCount": self._tracks_prewarmed_count,
                "catalogRefreshesCount": self._catalog_refreshes_count,
                "storagePath": self._storage_path,
                "sessions": session_summaries,
            }
