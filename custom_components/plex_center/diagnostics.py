"""Download diagnostics (Settings → Devices & services → Plex Center → ⋮): each TV with its players and their states."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from .const import (CONF_TVS, TV_ADB, TV_CAST, TV_ID, TV_NAME, TV_PIPUP, TV_PLEX, TV_POWER, TV_REMOTE, TV_ROUTE, TV_STATUS, TV_USER,
                    VERSION)
from .tvs import route_for, tv_on

KEEP = ("app_id", "app_name", "media_title", "media_series_title", "media_duration", "media_position", "username", "click_service",
        "click_packages", "assumed_state")


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry) -> dict[str, Any]:
    tvs = []
    for tv in entry.options.get(CONF_TVS, []):
        ents = {}
        for k in (TV_PIPUP, TV_ADB, TV_REMOTE, TV_CAST, TV_PLEX, TV_POWER, TV_STATUS):
            if not (ent := tv.get(k)):
                continue
            st = hass.states.get(ent)
            ents[k] = {"entity_id": ent, "state": st.state if st else "missing",
                       **({"attributes": {a: st.attributes[a] for a in KEEP if a in st.attributes}} if st else {})}
        tvs.append({"id": tv.get(TV_ID), "name": tv.get(TV_NAME), "plex_user": tv.get(TV_USER) or "(server owner)",
                    "route_setting": tv.get(TV_ROUTE, "auto"), "route_now": route_for(hass, tv), "on": tv_on(hass, tv),
                    "players": ents, "settings": {k: v for k, v in tv.items() if k not in (TV_ID, TV_NAME, TV_USER, TV_ROUTE, *ents)}})
    return {"version": VERSION, "server_id": entry.data.get("server_id"), "tvs": tvs}
