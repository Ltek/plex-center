"""Plex objects → plain data for the card, and the Plex app's own links."""

from __future__ import annotations

from datetime import timedelta
import re
from typing import Any
from urllib.parse import quote, urlencode

from homeassistant.core import HomeAssistant

IMAGE_PATH = "/api/plex_center/image/{server_id}"
IMAGE_TTL = timedelta(hours=6)


def image_url(hass: HomeAssistant, server_id: str, plex_path: str | None, width: int = 300) -> str | None:
    """A signed HA URL for a Plex image path ('/library/metadata/1/thumb/2'): no Plex token in it."""
    if not plex_path or not str(plex_path).startswith("/library/"):
        return None
    from homeassistant.components.http.auth import async_sign_path  # noqa: PLC0415

    path = IMAGE_PATH.format(server_id=server_id) + "?" + urlencode({"p": plex_path, "w": int(width)})
    return async_sign_path(hass, path, IMAGE_TTL)


def _secs(ms) -> int | None:
    try:
        return int(ms) // 1000 if ms else None
    except (TypeError, ValueError):
        return None


def item_dict(item, sign=None) -> dict[str, Any]:
    """One movie / show / season / episode. sign(path, width) → signed image URL (None in tests)."""
    t = getattr(item, "type", None)
    d: dict[str, Any] = {"key": str(item.ratingKey), "type": t, "title": item.title}
    for attr, name in (("year", "year"), ("contentRating", "content_rating"), ("audienceRating", "rating"),
                       ("studio", "studio"), ("summary", "summary"), ("index", "index")):
        v = getattr(item, attr, None)
        if v not in (None, ""):
            d[name] = v
    if dur := _secs(getattr(item, "duration", None)):
        d["duration"] = dur
    off = _secs(getattr(item, "viewOffset", None))
    if off:
        d["offset"] = off
        if d.get("duration"):
            d["progress"] = round(100 * off / d["duration"])
    vc = getattr(item, "viewCount", None) or 0
    if t in ("movie", "episode"):
        d["watched"] = bool(vc)
    if t in ("show", "season"):
        leaves, seen = getattr(item, "leafCount", None) or 0, getattr(item, "viewedLeafCount", None) or 0
        d["episodes"], d["watched_episodes"] = leaves, seen
        d["watched"] = bool(leaves) and seen >= leaves
    if t == "episode":
        d.update({"show": getattr(item, "grandparentTitle", None), "show_key": _k(getattr(item, "grandparentRatingKey", None)),
                  "season": getattr(item, "parentIndex", None), "season_key": _k(getattr(item, "parentRatingKey", None)),
                  "episode": getattr(item, "index", None)})
    if t == "season":
        d.update({"show": getattr(item, "parentTitle", None), "show_key": _k(getattr(item, "parentRatingKey", None))})
    if added := getattr(item, "addedAt", None):
        d["added"] = added.isoformat() if hasattr(added, "isoformat") else str(added)
    genres = [g.tag for g in (getattr(item, "genres", None) or [])][:4]
    if genres:
        d["genres"] = genres
    if sign:
        thumb = getattr(item, "grandparentThumb", None) if t == "episode" and getattr(item, "grandparentThumb", None) else getattr(item, "thumb", None)
        if t == "episode":
            d["still"] = sign(getattr(item, "thumb", None), 400)
        d["poster"] = sign(thumb, 300)
        d["art"] = sign(getattr(item, "art", None) or getattr(item, "grandparentArt", None), 960)
    d["link"] = app_link(getattr(item, "_server", None) and item._server.machineIdentifier, d)
    return {k: v for k, v in d.items() if v not in (None, "", [])}


def _k(v) -> str | None:
    return str(v) if v not in (None, "") else None


_DIGITS = re.compile(r"^\d+$")


def app_link(server_id: str | None, d: dict[str, Any]) -> str | None:
    """The Plex app's in-app library link (opens the title's page inside the running app)."""
    sid = re.sub(r"[^A-Za-z0-9]", "", str(server_id or ""))
    key = str(d.get("key") or "")
    if not sid or not _DIGITS.match(key):
        return None
    if d.get("type") == "movie":
        return f"plex://libraries/{sid}/movie/x/{key}"
    if d.get("type") == "episode" and all(_DIGITS.match(str(d.get(k) or "")) for k in ("show_key", "season_key", "season", "episode")):
        return f"plex://libraries/{sid}/show/x/{d['show_key']}/s/{d['season']}/{d['season_key']}/e/{d['episode']}/{key}"
    return f"plex://libraries/{sid}/unmatched/{quote('/library/metadata/' + key, safe='')}"


SAFE_LINK = re.compile(r"^plex://libraries/[A-Za-z0-9]+/[A-Za-z0-9/%]+$")


def details(item, sign=None) -> dict[str, Any]:
    """item_dict + cast, directors, trailer, and the children (seasons / episodes) or the next episode."""
    d = item_dict(item, sign)
    d["cast"] = [r.tag for r in (getattr(item, "roles", None) or [])][:8]
    d["directors"] = [r.tag for r in (getattr(item, "directors", None) or [])][:3]
    try:
        trailer = next((x for x in item.extras() if getattr(x, "subtype", None) == "trailer"), None) if hasattr(item, "extras") else None
    except Exception:  # noqa: BLE001 - extras need Plex Pass or local files; not having them is normal
        trailer = None
    if trailer is not None:
        d["trailer_key"] = str(trailer.ratingKey)
    if badges := _badges(item):
        d["badges"] = badges
    if ratings := _ratings(item):
        d["ratings"] = ratings
    if d["type"] == "episode":
        try:
            nxt = _next_episode(item)
        except Exception:  # noqa: BLE001 - best effort
            nxt = None
        if nxt is not None:
            d["next"] = item_dict(nxt, sign)
    if d["type"] == "show":
        d["seasons"] = [item_dict(s, sign) for s in item.seasons()]
        try:
            nxt = item.onDeck()
        except Exception:  # noqa: BLE001
            nxt = None
        if nxt is not None:
            d["next"] = item_dict(nxt, sign)
    elif d["type"] == "season":
        d["episodes"] = [item_dict(e, sign) for e in item.episodes()]
    return {k: v for k, v in d.items() if v not in (None, "", [])}


def _badges(item) -> list[str]:
    """4K / HD, HDR / Dolby Vision, Atmos / 5.1 / 7.1 from the first media version (best effort)."""
    out: list[str] = []
    try:
        m = (getattr(item, "media", None) or [None])[0]
        if m is None:
            return out
        res = str(getattr(m, "videoResolution", "") or "").lower()
        if res in ("4k", "2160"):
            out.append("4K")
        elif res in ("1080", "720"):
            out.append("HD")
        part = (getattr(m, "parts", None) or [None])[0]
        vids = part.videoStreams() if part is not None and hasattr(part, "videoStreams") else []
        auds = part.audioStreams() if part is not None and hasattr(part, "audioStreams") else []
        v = vids[0] if vids else None
        if v is not None and getattr(v, "DOVIPresent", False):
            out.append("Dolby Vision")
        elif v is not None and str(getattr(v, "colorTrc", "") or "").lower() in ("smpte2084", "arib-std-b67"):
            out.append("HDR")
        a = auds[0] if auds else None
        title = str(getattr(a, "displayTitle", "") or getattr(a, "extendedDisplayTitle", "") or "") if a is not None else ""
        ch = getattr(m, "audioChannels", None)
        if "atmos" in title.lower():
            out.append("Atmos")
        elif ch and int(ch) >= 8:
            out.append("7.1")
        elif ch and int(ch) >= 6:
            out.append("5.1")
    except Exception:  # noqa: BLE001 - media info is optional
        return out
    return out


def _ratings(item) -> list[dict[str, Any]]:
    """Critic and audience ratings with their source (IMDb, Rotten Tomatoes, TMDB), as Plex shows them."""
    src = {"imdb": "IMDb", "rottentomatoes": "Rotten Tomatoes", "themoviedb": "TMDB"}
    out = []
    for attr, img_attr, kind in (("rating", "ratingImage", "critic"), ("audienceRating", "audienceRatingImage", "audience")):
        val, img = getattr(item, attr, None), str(getattr(item, img_attr, "") or "")
        if val in (None, "") or not img:
            continue
        name = src.get(img.split("://", 1)[0], "")
        if not name:
            continue
        r = {"source": name, "kind": kind, "value": float(val)}
        if name == "Rotten Tomatoes":
            r["fresh"] = "ripe" in img or "upright" in img
        out.append(r)
    return out


def _next_episode(ep):
    """The episode after this one: the next in its season, else the first of the next season."""
    season = ep.season()
    eps = sorted(season.episodes(), key=lambda e: e.index or 0)
    later = [e for e in eps if (e.index or 0) > (ep.index or 0)]
    if later:
        return later[0]
    show = ep.show()
    seasons = sorted(show.seasons(), key=lambda s: s.index or 0)
    for s in seasons:
        if (s.index or 0) > (season.index or 0):
            nxt = sorted(s.episodes(), key=lambda e: e.index or 0)
            if nxt:
                return nxt[0]
    return None
