"""Plex Center: browse Plex and play on your TVs (PiPup, ADB or Plex's own remote control).

All Plex connections live here, in Home Assistant; the Plex Center card only talks to this integration.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import logging
from pathlib import Path
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import CARD_URL, CONF_SERVER_ID, CONF_TVS, DOMAIN, VERSION
from .plex import PlexConnections

_LOGGER = logging.getLogger(__name__)


@dataclass
class PlexCenterData:
    """Runtime data of one Plex Center entry."""

    conn: PlexConnections
    tvs: list[dict[str, Any]] = field(default_factory=list)


type PlexCenterConfigEntry = ConfigEntry[PlexCenterData]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register what is shared by every entry: the websocket API and the card's file."""
    from . import services, websocket  # noqa: PLC0415

    websocket.async_register(hass)
    services.async_register(hass)
    await _register_card(hass)
    return True


async def _register_card(hass: HomeAssistant) -> None:
    js = Path(__file__).parent / "frontend" / "plex-center-card.js"
    if not js.is_file():
        return
    try:
        from homeassistant.components.frontend import add_extra_js_url  # noqa: PLC0415
        from homeassistant.components.http import StaticPathConfig  # noqa: PLC0415

        await hass.http.async_register_static_paths([StaticPathConfig(CARD_URL, str(js), False)])
        add_extra_js_url(hass, f"{CARD_URL}?v={VERSION}")
    except Exception as err:  # noqa: BLE001 - the integration still works without the bundled card
        _LOGGER.warning("Plex Center card not registered: %s", err)


async def async_setup_entry(hass: HomeAssistant, entry: PlexCenterConfigEntry) -> bool:
    """Set up one Plex server."""
    entry.runtime_data = PlexCenterData(conn=PlexConnections(hass, entry.data[CONF_SERVER_ID]),
                                        tvs=list(entry.options.get(CONF_TVS, [])))
    entry.async_on_unload(entry.add_update_listener(_options_updated))
    return True


async def _options_updated(hass: HomeAssistant, entry: PlexCenterConfigEntry) -> None:
    entry.runtime_data.tvs = list(entry.options.get(CONF_TVS, []))
    entry.runtime_data.conn.forget()


async def async_unload_entry(hass: HomeAssistant, entry: PlexCenterConfigEntry) -> bool:
    """Unload an entry."""
    return True


def loaded_entries(hass: HomeAssistant) -> list[PlexCenterConfigEntry]:
    """Loaded Plex Center entries."""
    return [e for e in hass.config_entries.async_entries(DOMAIN) if getattr(e, "runtime_data", None) is not None]
