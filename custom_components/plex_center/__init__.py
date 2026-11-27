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

from .const import CARD_URL, LOCAL_CARD_URL, CONF_SERVER_ID, CONF_TVS, DOMAIN, VERSION
from .plex import PlexConnections

_LOGGER = logging.getLogger(__name__)


@dataclass
class PlexCenterData:
    """Runtime data of one Plex Center entry."""

    conn: PlexConnections
    tvs: list[dict[str, Any]] = field(default_factory=list)
    resumes: Any = None          # resume.Resumes: what was playing when each TV was turned off
    markers: Any = None          # markers.Markers: intros / credits of what plays, the credits event
    demos: Any = None            # demos.Demos: demo clips (settings per TV, the demo running on each)


type PlexCenterConfigEntry = ConfigEntry[PlexCenterData]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register what is shared by every entry: the websocket API and the card's file."""
    from . import eventlog, services, websocket  # noqa: PLC0415

    await eventlog.async_load(hass)
    websocket.async_register(hass)
    services.async_register(hass)
    await _register_card(hass)
    return True


async def _register_card(hass: HomeAssistant) -> None:
    """Serve the bundled card and load it on every dashboard.

    The card is a Dashboard resource (Settings → Dashboards → Resources), the way cards normally load, so HA has
    it before a dashboard renders (an extra frontend module can arrive after the dashboard, most often in the
    Companion App on a cold start: "Custom element doesn't exist"). Its URL changes with the build. Only when
    resources can't be edited (dashboards in YAML mode, Lovelace not set up, an error) is it loaded as an extra
    frontend module instead; never both, so it never loads twice.
    """
    js = Path(__file__).parent / "frontend" / "plex-center-card.js"
    if not js.is_file():
        return
    try:
        bust = int(js.stat().st_mtime)
    except OSError:
        bust = 0
    # A copy in www (/local) is there as soon as HA serves files, before integrations load: a dashboard opened while HA
    # starts (or the Companion App reconnecting) gets the card instead of a 404 / "Custom element doesn't exist".
    try:
        local = await hass.async_add_executor_job(copy_to_www, hass.config.path("www"), js)
    except Exception as err:  # noqa: BLE001 - the integration's own path still works
        _LOGGER.debug("Plex Center card not copied to www: %s", err)
        local = False
    url = f"{LOCAL_CARD_URL if local else CARD_URL}?v={VERSION}&m={bust}"
    data = hass.data.setdefault(f"{DOMAIN}_card", {})
    data["bust"] = bust
    try:
        from homeassistant.components import frontend  # noqa: PLC0415

        from .card_view import PlexCardView  # noqa: PLC0415

        if not data.get("view"):
            hass.http.register_view(PlexCardView(js))
            data["view"] = True
    except Exception as err:  # noqa: BLE001 - the integration still works without the bundled card
        _LOGGER.warning("Plex Center card not served: %s", err)
        return
    try:
        as_resource = await _register_resource(hass, url)
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Could not add the Plex Center card as a dashboard resource (%s); loading it as a frontend module", err)
        as_resource = False
    try:
        if as_resource:
            if data.get("url"):
                frontend.remove_extra_js_url(hass, data["url"])
                data["url"] = None
            return
        if data.get("url") != url:
            if data.get("url"):
                frontend.remove_extra_js_url(hass, data["url"])
            frontend.add_extra_js_url(hass, url)
            data["url"] = url
    except Exception as err:  # noqa: BLE001 - no frontend (tests, safe mode): the integration still works
        _LOGGER.warning("Plex Center card not registered: %s", err)


async def async_refresh_card(hass: HomeAssistant) -> None:
    """After an update without a restart (HACS writes the new card in place): refresh the www copy and the resource
    URL, so the next page load gets the new card instead of the old copy."""
    import asyncio  # noqa: PLC0415

    data = hass.data.get(f"{DOMAIN}_card")
    if data is None or "bust" not in data:
        return
    js = Path(__file__).parent / "frontend" / "plex-center-card.js"
    try:
        mtime = int((await hass.async_add_executor_job(js.stat)).st_mtime)
    except OSError:
        return
    if mtime == data["bust"]:
        return
    lock = data.setdefault("lock", asyncio.Lock())
    async with lock:
        if mtime != data.get("bust"):
            _LOGGER.info("Plex Center card file changed; updating its copy and resource")
            await _register_card(hass)


def copy_to_www(www: str, js: Path) -> bool:
    """Copy the card to <config>/www/plex_center/ (only when it changed). True when /local serves it now: HA serves
    www only if the folder was there when it started, so a www made here counts from the next start."""
    import os  # noqa: PLC0415
    import shutil  # noqa: PLC0415

    served = os.path.isdir(www)
    dst_dir = os.path.join(www, "plex_center")
    dst = os.path.join(dst_dir, js.name)
    os.makedirs(dst_dir, exist_ok=True)
    if not os.path.isfile(dst) or Path(dst).read_bytes() != js.read_bytes():
        tmp = dst + ".tmp"
        shutil.copyfile(js, tmp)
        os.replace(tmp, dst)
    return served


async def _register_resource(hass: HomeAssistant, url: str) -> bool:
    """Add or update the card's Dashboard resource. False when resources can't be edited (YAML mode, no Lovelace)."""
    try:
        from homeassistant.components.lovelace.const import LOVELACE_DATA  # noqa: PLC0415
        from homeassistant.components.lovelace.resources import ResourceStorageCollection  # noqa: PLC0415
    except ImportError:
        return False
    ll = hass.data.get(LOVELACE_DATA)
    res = getattr(ll, "resources", None)
    if not isinstance(res, ResourceStorageCollection):
        return False
    if not res.loaded:
        await res.async_load()
        res.loaded = True
    ours = [i for i in res.async_items() if str(i.get("url", "")).split("?", 1)[0] in (CARD_URL, LOCAL_CARD_URL)]
    if not ours:
        await res.async_create_item({"res_type": "module", "url": url})
        _LOGGER.info("Added the Plex Center card as a dashboard resource: %s", url)
    else:
        first, *extra = ours
        if first.get("url") != url or first.get("type") != "module":
            await res.async_update_item(first["id"], {"res_type": "module", "url": url})
            _LOGGER.info("Updated the Plex Center card resource: %s", url)
        for item in extra:
            await res.async_delete_item(item["id"])
    return True


async def async_setup_entry(hass: HomeAssistant, entry: PlexCenterConfigEntry) -> bool:
    """Set up one Plex server."""
    from .resume import Resumes  # noqa: PLC0415
    from .tvs import fill_remotes  # noqa: PLC0415

    if (filled := fill_remotes(hass, list(entry.options.get(CONF_TVS, [])))) is not None:
        hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_TVS: filled})

    entry.runtime_data = PlexCenterData(conn=PlexConnections(hass, entry.data[CONF_SERVER_ID]),
                                        tvs=list(entry.options.get(CONF_TVS, [])))
    resumes = Resumes(hass, entry.entry_id)
    await resumes.async_load()
    resumes.track(entry.runtime_data.tvs)
    entry.runtime_data.resumes = resumes
    entry.async_on_unload(resumes.stop)
    from .markers import Markers  # noqa: PLC0415

    markers = Markers(hass, entry.runtime_data.conn)
    markers.track(entry.runtime_data.tvs)
    entry.runtime_data.markers = markers
    entry.async_on_unload(markers.stop)
    from .demos import Demos  # noqa: PLC0415

    demos = Demos(hass, entry.entry_id, entry.runtime_data.conn)
    await demos.async_load(entry.runtime_data.tvs)
    entry.runtime_data.demos = demos

    async def _end_demos() -> None:
        await demos.async_stop_all()
    entry.async_on_unload(lambda: hass.async_create_task(_end_demos()))
    entry.async_on_unload(entry.add_update_listener(_options_updated))
    return True


async def _options_updated(hass: HomeAssistant, entry: PlexCenterConfigEntry) -> None:
    entry.runtime_data.tvs = list(entry.options.get(CONF_TVS, []))
    entry.runtime_data.conn.forget()
    if entry.runtime_data.resumes:
        entry.runtime_data.resumes.track(entry.runtime_data.tvs)
    if entry.runtime_data.demos:
        entry.runtime_data.demos.tvs = entry.runtime_data.tvs
    if entry.runtime_data.markers:
        entry.runtime_data.markers.track(entry.runtime_data.tvs)


async def async_unload_entry(hass: HomeAssistant, entry: PlexCenterConfigEntry) -> bool:
    """Unload an entry."""
    return True


def loaded_entries(hass: HomeAssistant) -> list[PlexCenterConfigEntry]:
    """Loaded Plex Center entries."""
    return [e for e in hass.config_entries.async_entries(DOMAIN) if getattr(e, "runtime_data", None) is not None]
