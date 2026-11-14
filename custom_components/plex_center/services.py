"""Actions: plex_center.play and plex_center.control (usable from the card, scripts, automations and voice)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
import homeassistant.helpers.config_validation as cv

from .const import DOMAIN, TV_ID, TV_NAME, TV_USER
from .media import item_dict
from .play import control, start

PLAY_SCHEMA = vol.Schema({vol.Required("tv"): cv.string, vol.Optional("key"): vol.All(cv.string, vol.Match(r"^\d+$")),
                          vol.Optional("title"): cv.string, vol.Optional("mode", default="play"): vol.In(["play", "restart", "next"])})
CONTROL_SCHEMA = vol.Schema({vol.Required("tv"): cv.string,
                             vol.Required("action"): vol.In(["play", "pause", "play_pause", "stop", "home", "seek", "skip"]),
                             vol.Optional("value"): vol.Coerce(float)})


def find_tv(hass: HomeAssistant, wanted: str):
    """(entry, tv) by TV id or name (case-insensitive)."""
    from . import loaded_entries  # noqa: PLC0415

    w = wanted.strip().lower()
    for entry in loaded_entries(hass):
        for tv in entry.runtime_data.tvs:
            if w in (tv[TV_ID].lower(), tv[TV_NAME].lower()):
                return entry, tv
    raise HomeAssistantError(f"No Plex Center TV called {wanted}")


async def _resolve(hass: HomeAssistant, entry, tv: dict[str, Any], key: str | None, title: str | None, mode: str) -> dict[str, Any]:
    """The item to play for the TV's user: by key, or the first search hit for a title; 'next' = a show's next episode."""
    def fetch(server):
        if key:
            item = server.fetchItem(int(key))
        else:
            hits = [h for h in server.search(title or "", limit=10) if getattr(h, "type", None) in ("movie", "show", "episode")]
            if not hits:
                raise HomeAssistantError(f"Nothing in Plex matches {title}")
            item = hits[0]
        if item.type == "show":   # a show plays its next episode (Plex's On Deck for the TV's user), else the first
            nxt = None
            try:
                nxt = item.onDeck()
            except Exception:  # noqa: BLE001
                nxt = None
            if nxt is None:
                eps = item.episodes()
                if not eps:
                    raise HomeAssistantError(f"{item.title} has no episodes")
                nxt = eps[0]
            return item_dict(nxt)
        return item_dict(item)

    return await entry.runtime_data.conn.async_call(tv.get(TV_USER), fetch)


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register the actions once."""
    if hass.services.has_service(DOMAIN, "play"):
        return

    async def play(call: ServiceCall) -> None:
        entry, tv = find_tv(hass, call.data["tv"])
        if not call.data.get("key") and not call.data.get("title"):
            raise HomeAssistantError("Give a key or a title")
        item = await _resolve(hass, entry, tv, call.data.get("key"), call.data.get("title"), call.data["mode"])
        await start(hass, tv, item, "restart" if call.data["mode"] == "restart" else "play")

    async def ctl(call: ServiceCall) -> None:
        _entry, tv = find_tv(hass, call.data["tv"])
        await control(hass, tv, call.data["action"], call.data.get("value"))

    hass.services.async_register(DOMAIN, "play", play, schema=PLAY_SCHEMA)
    hass.services.async_register(DOMAIN, "control", ctl, schema=CONTROL_SCHEMA)
