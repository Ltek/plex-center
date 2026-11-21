"""What another app (HBO Max, Prime Video, ...) is playing on a TV, with a poster for it.

The title comes from the first player that reports one, in this order: PiPup, ADB (its attributes, else the
app's media session read with `dumpsys media_session`), Cast. The poster and fanart come from the first source
that knows the title: the Plex library (the TV's user), Plex Discover, Radarr, Sonarr. A source that fails or
isn't set up is skipped, so the others still answer.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from homeassistant.core import HomeAssistant

from .arr import _fetch, _image, arr_entries
from .const import TV_ADB, TV_CAST, TV_PIPUP

_LOGGER = logging.getLogger(__name__)

HIT_S = 24 * 3600          # a found poster is kept a day
MISS_S = 3600              # a title nobody knows is asked again after an hour
DUMPSYS_S = 30             # at most one media-session read per TV per 30 s
DISCOVER = "https://discover.provider.plex.tv/library/search"
_CACHE: dict[tuple, tuple[float, dict[str, Any] | None]] = {}
_DUMPED: dict[str, float] = {}
ACTIVE = ("playing", "paused", "buffering")


def norm_title(text: str | None) -> str:
    """'The Office (US)' -> 'office us': lower case, letters and digits, no leading article."""
    t = re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()
    return re.sub(r"^(the|a|an) ", "", t)


def parse_media_session(text: str | None, package: str | None = None) -> str | None:
    """The title in `dumpsys media_session` output (for `package` when given): 'description=Title, Sub, null'."""
    current = None
    for line in str(text or "").splitlines():
        line = line.strip()
        if line.startswith("package="):
            current = line.split("=", 1)[1].strip()
            continue
        if "description=" not in line or (package and current != package):
            continue
        title = line.split("description=", 1)[1].split(",")[0].strip()
        if title and title != "null":
            return title
    return None


def _attrs(hass: HomeAssistant, entity_id: str | None) -> dict[str, Any] | None:
    st = entity_id and hass.states.get(entity_id)
    return dict(st.attributes) if st and st.state in ACTIVE else None


def _pick(at: dict[str, Any], source: str) -> dict[str, Any] | None:
    title = at.get("media_series_title") or at.get("media_title")
    if not title:
        return None
    return {"title": title, "series": bool(at.get("media_series_title")), "episode": at.get("media_title") if at.get("media_series_title") else None,
            "app": at.get("app_name") if "." not in str(at.get("app_name") or "") else None, "package": at.get("app_id"), "source": source}


async def async_now_title(hass: HomeAssistant, tv: dict[str, Any], *, read_session: bool = True) -> dict[str, Any] | None:
    """The title another app plays on the TV: PiPup, then ADB (attributes, then its media session), then Cast."""
    pip, adb, cast = _attrs(hass, tv.get(TV_PIPUP)), _attrs(hass, tv.get(TV_ADB)), _attrs(hass, tv.get(TV_CAST))
    app = next((a.get("app_name") for a in (pip, cast, adb) if a and a.get("app_name") and "." not in a["app_name"]), None)
    package = (adb or pip or {}).get("app_id")
    names = {app, (pip or {}).get("app_name"), (cast or {}).get("app_name"), (adb or {}).get("app_name"), package,
             str(package or "").rsplit(".", 1)[-1]}

    def real(t: str | None) -> str | None:   # Prime Video's session says "PrimeVideo": its own name, not a title
        flat = lambda x: re.sub(r"[^a-z0-9]", "", str(x or "").lower())  # noqa: E731
        return None if not t or flat(t) in {flat(n) for n in names if n} else t
    session = lambda at: at and (t := real(parse_media_session(at.get("adb_response"), package))) and \
        {"title": t, "series": False, "episode": None, "app": None, "package": package, "source": "adb"}  # noqa: E731
    hit = (pip and _pick(pip, "pipup")) or (adb and _pick(adb, "adb")) or session(adb) or (cast and _pick(cast, "cast"))
    now = time.monotonic()
    if not hit and adb is not None and read_session and now - _DUMPED.get(tv[TV_ADB], 0) > DUMPSYS_S:
        _DUMPED[tv[TV_ADB]] = now   # nobody reports a title: ask the app's media session once (at most every 30 s)
        try:
            await hass.services.async_call("androidtv", "adb_command", {"entity_id": tv[TV_ADB],
                                           "command": "dumpsys media_session | grep -E 'package=|description='"}, blocking=True)
        except Exception as err:  # noqa: BLE001 - another source may still work
            _LOGGER.debug("plex_center: media session read failed on %s: %s", tv[TV_ADB], err)
        st = hass.states.get(tv[TV_ADB])
        hit = session(dict(st.attributes) if st else None)
    return {**hit, "app": hit["app"] or app} if hit else None


# ------------------------------------------------------------------------------------------- artwork

def plex_lookup(server, title: str, series: bool, sign) -> dict[str, Any] | None:
    """The title in the user's Plex libraries (exact title), else Plex Discover. Runs in the executor."""
    from .media import item_dict  # noqa: PLC0415

    want, kinds = norm_title(title), ("show",) if series else ("movie", "show")
    try:
        for hit in server.search(title, limit=10):
            if getattr(hit, "type", None) in kinds and norm_title(hit.title) == want:
                d = item_dict(hit, sign)
                return {k: d.get(k) for k in ("key", "type", "title", "year", "summary", "poster", "art", "genres", "rating", "content_rating") if d.get(k)} | {"found": "plex"}
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("plex_center: Plex search for %r failed: %s", title, err)
    try:
        resp = server._session.get(DISCOVER, timeout=10, headers={"Accept": "application/json", "X-Plex-Token": server._token},
                                   params={"query": title, "limit": 10, "searchTypes": "tv" if series else "movies,tv",
                                           "searchProviders": "discover", "includeMetadata": 1})
        resp.raise_for_status()
        for group in resp.json().get("MediaContainer", {}).get("SearchResults", []) or []:
            for res in group.get("SearchResult", []) or []:
                m = res.get("Metadata") or {}
                if m.get("type") not in kinds or norm_title(m.get("title")) != want:
                    continue
                poster, art = m.get("thumb"), m.get("art")
                if not str(poster or "").startswith("https://"):
                    continue
                return {"type": m["type"], "title": m.get("title"), "year": m.get("year"), "summary": m.get("summary"), "poster": poster,
                        "art": art if str(art or "").startswith("https://") else None, "found": "discover"}
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("plex_center: Plex Discover search for %r failed: %s", title, err)
    return None


async def arr_lookup(hass: HomeAssistant, title: str, series: bool) -> dict[str, Any] | None:
    """The title in Radarr's / Sonarr's lookup (TMDB / TVDB), exact title only."""
    want = norm_title(title)
    order = (("sonarr", "/api/v3/series/lookup", "show"),) if series else (("radarr", "/api/v3/movie/lookup", "movie"), ("sonarr", "/api/v3/series/lookup", "show"))
    entries = arr_entries(hass)
    for app, path, kind in order:
        for entry in entries.get(app, []):
            try:
                rows = await _fetch(hass, entry, path, {"term": title})
            except Exception as err:  # noqa: BLE001
                _LOGGER.debug("plex_center: %s lookup for %r failed: %s", app, title, err)
                continue
            for r in rows[:10]:
                if norm_title(r.get("title")) != want or not (poster := _image(r.get("images"), "poster")):
                    continue
                return {"type": kind, "title": r.get("title"), "year": r.get("year"), "summary": r.get("overview"), "poster": poster,
                        "art": _image(r.get("images"), "fanart"), "genres": (r.get("genres") or [])[:4], "found": app}
    return None


async def async_artwork(hass: HomeAssistant, conn, user: str | None, title: str, series: bool, sign) -> dict[str, Any] | None:
    """Poster and fanart for a title, from the first source that knows it (cached)."""
    key = (user or "", norm_title(title), series)
    now = time.monotonic()
    if (c := _CACHE.get(key)) and now - c[0] < (HIT_S if c[1] else MISS_S):
        return c[1]
    found = None
    if conn is not None:
        try:
            found = await conn.async_call(user, lambda server: plex_lookup(server, title, series, sign))
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("plex_center: Plex lookup for %r failed: %s", title, err)
    if not found:
        found = await arr_lookup(hass, title, series)
    _CACHE[key] = (now, found)
    return found
