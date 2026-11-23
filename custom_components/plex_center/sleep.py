"""Sleep timers: turn a TV (and its room) off after some minutes, or when what's playing ends.

Kept in Home Assistant, so a timer runs on while the remote's screen is black or the tablet is closed. Turning off
is play.power_off: the room's power entity off (your automation turns the devices off), then the TV in standby.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event

from .const import DOMAIN, TV_ADB, TV_ID, TV_NAME, TV_PIPUP, TV_PLEX

_LOGGER = logging.getLogger(__name__)
ENDED_S = 60   # "after this": nothing playing for this long counts as the end


def timers(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    return hass.data.setdefault(f"{DOMAIN}_sleep", {})


def status(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    """{tv id: {mode: minutes | after, at: when it fires (minutes)}} for the card."""
    return {k: {"mode": v["mode"], **({"at": v["at"]} if v.get("at") else {})} for k, v in timers(hass).items()}


def cancel(hass: HomeAssistant, tv_id: str) -> None:
    t = timers(hass).pop(tv_id, None)
    for unsub in (t or {}).get("unsubs", []):
        unsub()


async def _fire(hass: HomeAssistant, tv: dict[str, Any]) -> None:
    from .eventlog import record  # noqa: PLC0415
    from .play import power_off  # noqa: PLC0415

    cancel(hass, tv[TV_ID])
    try:
        await power_off(hass, tv)
        _LOGGER.info("Plex Center: sleep timer turned %s off", tv.get(TV_NAME))
    except Exception as err:  # noqa: BLE001 - say so in the log
        record(hass, tv, "sleep timer", err)


def start(hass: HomeAssistant, tv: dict[str, Any], minutes: int = 0, after: bool = False) -> dict[str, Any] | None:
    """Set (or with neither, cancel) the TV's sleep timer. Returns its status."""
    from .tvs import tv_playing  # noqa: PLC0415

    cancel(hass, tv[TV_ID])
    if not minutes and not after:
        return None
    rec: dict[str, Any] = {"mode": "after" if after else "minutes", "unsubs": []}
    if after:
        ents = [e for e in (tv.get(TV_PIPUP), tv.get(TV_PLEX), tv.get(TV_ADB)) if e]
        rec["idle_since"] = None if tv_playing(hass, tv) else time.monotonic()

        @callback
        def changed(_event=None) -> None:
            if tv_playing(hass, tv):
                rec["idle_since"] = None
                if rec.get("wait"):
                    rec["wait"](); rec["wait"] = None
                return
            if rec.get("wait"):
                return
            rec["idle_since"] = rec["idle_since"] or time.monotonic()
            async def ended(_now) -> None:
                await _fire(hass, tv)
            rec["wait"] = async_call_later(hass, ENDED_S, ended)
        rec["unsubs"].append(async_track_state_change_event(hass, ents, changed))
        rec["unsubs"].append(lambda: rec.get("wait") and rec["wait"]())
        if rec["idle_since"] is not None:
            changed()
    else:
        rec["at"] = time.time() + minutes * 60
        async def due(_now) -> None:
            await _fire(hass, tv)
        rec["unsubs"].append(async_call_later(hass, minutes * 60, due))
    timers(hass)[tv[TV_ID]] = rec
    return status(hass)[tv[TV_ID]]
