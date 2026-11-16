"""Calendar: upcoming episodes (Sonarr) and movie releases (Radarr), read through Home Assistant's own Sonarr and
Radarr integrations (their address and API key; the key never leaves Home Assistant).

Each Sonarr episode is one entry; each Radarr movie gives one entry per release (cinema, digital, physical).
Entries are de-duplicated across instances by TVDB / TMDB id (title + year when there is none).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import time
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

_LOGGER = logging.getLogger(__name__)

APPS = ("sonarr", "radarr")
CACHE_S = 300
_CACHE: dict[tuple, tuple[float, dict[str, Any]]] = {}


def arr_entries(hass: HomeAssistant) -> dict[str, list]:
    """The loaded (or at least configured) Sonarr / Radarr config entries."""
    out: dict[str, list] = {}
    for app in APPS:
        entries = [e for e in hass.config_entries.async_entries(app) if e.data.get("url") and e.data.get("api_key")]
        if entries:
            out[app] = entries
    return out


def arr_available(hass: HomeAssistant) -> dict[str, bool]:
    found = arr_entries(hass)
    return {app: app in found for app in APPS}


def _image(images: list | None, kind: str) -> str | None:
    """A public image URL (the remote TMDB / TVDB one; local ones would need the API key)."""
    for img in images or []:
        if img.get("coverType") == kind and str(img.get("remoteUrl") or "").startswith("https://"):
            return img["remoteUrl"]
    return None


def episode_event(ep: dict[str, Any]) -> dict[str, Any] | None:
    series = ep.get("series") or {}
    when = ep.get("airDateUtc") or ep.get("airDate")
    if not when:
        return None
    season, number = ep.get("seasonNumber"), ep.get("episodeNumber")
    ev = {
        "kind": "episode", "release": "episode", "at": when, "all_day": not ep.get("airDateUtc"),
        "title": series.get("title") or ep.get("title") or "?", "episode_title": ep.get("title"),
        "season": season, "episode": number, "overview": ep.get("overview") or series.get("overview"),
        "runtime": ep.get("runtime") or series.get("runtime"), "network": series.get("network"), "year": series.get("year"),
        "genres": (series.get("genres") or [])[:4], "certification": series.get("certification"),
        "poster": _image(series.get("images"), "poster"), "fanart": _image(series.get("images"), "fanart"),
        "tvdb": series.get("tvdbId"), "imdb": series.get("imdbId"), "has_file": bool(ep.get("hasFile")),
        "monitored": bool(ep.get("monitored", True)),
        "premiere": "series" if season == 1 and number == 1 else "season" if number == 1 else None,
        "finale": ep.get("finaleType") or None,
    }
    ev["key"] = f"tv:{ev['tvdb'] or ev['title']}:{season}:{number}"
    return {k: v for k, v in ev.items() if v not in (None, "", [])}


def movie_events(m: dict[str, Any]) -> list[dict[str, Any]]:
    base = {
        "kind": "movie", "title": m.get("title") or "?", "year": m.get("year"), "overview": m.get("overview"),
        "runtime": m.get("runtime"), "studio": m.get("studio"), "genres": (m.get("genres") or [])[:4],
        "certification": m.get("certification"), "poster": _image(m.get("images"), "poster"),
        "fanart": _image(m.get("images"), "fanart"), "tmdb": m.get("tmdbId"), "imdb": m.get("imdbId"),
        "has_file": bool(m.get("hasFile")), "monitored": bool(m.get("monitored", True)),
        "trailer": m.get("youTubeTrailerId") or None,
    }
    out = []
    for release, field in (("cinema", "inCinemas"), ("digital", "digitalRelease"), ("physical", "physicalRelease")):
        when = m.get(field)
        if not when:
            continue
        ev = {**base, "release": release, "at": str(when)[:10], "all_day": True}   # a release is a day, not a time
        ev["key"] = f"mv:{base['tmdb'] or (base['title'], base['year'])}:{release}:{ev['at']}"
        out.append({k: v for k, v in ev.items() if v not in (None, "", [])})
    return out


async def _fetch(hass: HomeAssistant, entry, path: str, params: dict[str, str]) -> list:
    session = async_get_clientsession(hass, bool(entry.data.get("verify_ssl", True)))
    url = str(entry.data["url"]).rstrip("/") + path
    async with session.get(url, params=params, headers={"X-Api-Key": entry.data["api_key"]}, timeout=20) as resp:
        resp.raise_for_status()
        data = await resp.json()
    return data if isinstance(data, list) else []


async def async_calendar(hass: HomeAssistant, start: datetime, end: datetime) -> dict[str, Any]:
    """Entries between start and end (UTC), sorted by time, plus the state of each source."""
    key = (start.isoformat(), end.isoformat())
    hit = _CACHE.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_S:
        return hit[1]
    params = {"start": start.strftime("%Y-%m-%dT%H:%M:%SZ"), "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"), "unmonitored": "true"}
    events: dict[str, dict] = {}
    sources: dict[str, str] = {}
    entries = arr_entries(hass)
    for app in APPS:
        if app not in entries:
            sources[app] = "missing"
            continue
        ok = 0
        for entry in entries[app]:
            try:
                if app == "sonarr":
                    items = await _fetch(hass, entry, "/api/v3/calendar", {**params, "includeSeries": "true"})
                    found = [e for e in (episode_event(i) for i in items) if e]
                else:
                    items = await _fetch(hass, entry, "/api/v3/calendar", params)
                    found = [e for i in items for e in movie_events(i)]
            except Exception as err:  # noqa: BLE001 - one instance down must not hide the others
                _LOGGER.warning("Plex Center calendar: %s (%s) failed: %s", app, entry.title, err)
                continue
            ok += 1
            for ev in found:
                events.setdefault(ev["key"], ev)   # the first instance wins (1080p + 4K show once)
        sources[app] = "ok" if ok else "error"
    lo, hi = start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
    # movie releases are dates: keep those in the range; episodes are times (Sonarr already filtered them)
    out = sorted((e for e in events.values() if not e.get("all_day") or lo <= str(e["at"])[:10] <= hi), key=lambda e: str(e["at"]))
    result = {"events": out, "sources": sources}
    _CACHE[key] = (time.monotonic(), result)
    for k in [k for k, (t, _) in _CACHE.items() if time.monotonic() - t > CACHE_S]:
        _CACHE.pop(k, None)
    return result


def parse_range(start: str, end: str) -> tuple[datetime, datetime]:
    """ISO dates / datetimes from the card → aware UTC datetimes (at most 62 days apart)."""
    def p(s: str) -> datetime:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    a, b = p(start), p(end)
    if b < a:
        a, b = b, a
    if b - a > timedelta(days=62):
        b = a + timedelta(days=62)
    return a.astimezone(timezone.utc), b.astimezone(timezone.utc)
