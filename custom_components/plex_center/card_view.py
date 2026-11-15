"""Serves the bundled card so every device checks for a newer copy on each load.

HA's static paths send either no cache headers (browsers and the Companion App's WebView then keep a copy for
as long as they like) or a long max-age. Here: ``Cache-Control: no-cache`` with an ETag, so a device always
asks, and gets a quick 304 when nothing changed.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
import re

from aiohttp import web

from homeassistant.components.http import HomeAssistantView

from .const import CARD_URL

_VERSION_RE = re.compile(rb"^// Version: (v[0-9.]+)", re.M)
_CACHE: dict[str, tuple[float, bytes, str, str]] = {}


def card_file(path: Path) -> tuple[bytes, str, str]:
    """The card's bytes, ETag and version (from its ``// Version:`` line), re-read when the file changes."""
    mtime = path.stat().st_mtime
    hit = _CACHE.get(str(path))
    if hit and hit[0] == mtime:
        return hit[1], hit[2], hit[3]
    body = path.read_bytes()
    m = _VERSION_RE.search(body[:400])
    etag = '"' + hashlib.sha1(body).hexdigest()[:16] + '"'  # noqa: S324 - a cache tag, not security
    version = m.group(1).decode() if m else ""
    _CACHE[str(path)] = (mtime, body, etag, version)
    return body, etag, version


class PlexCardView(HomeAssistantView):
    """GET the card's JavaScript (no login needed, like any Dashboard resource)."""

    url = CARD_URL
    name = "plex_center:card"
    requires_auth = False

    def __init__(self, path: Path) -> None:
        self._path = path

    async def get(self, request: web.Request) -> web.Response:
        hass = request.app["hass"]
        body, etag, _ = await hass.async_add_executor_job(card_file, self._path)
        headers = {"Cache-Control": "no-cache", "ETag": etag}
        if request.headers.get("If-None-Match") == etag:
            return web.Response(status=304, headers=headers)
        return web.Response(body=body, content_type="application/javascript", charset="utf-8", headers=headers)
