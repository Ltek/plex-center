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
