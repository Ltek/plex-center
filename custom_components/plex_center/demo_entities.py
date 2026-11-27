"""Shared by the Demos sensor and select: one entity of each per TV with Demos on, added and removed as Demos is
turned on and off for a TV."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import Entity

from .const import DOMAIN, TV_ID, TV_NAME
from .demos import INFO_SIGNAL, SIGNAL


def fmt_len(seconds: float) -> str:
    s = int(round(seconds or 0))
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


class DemoEntity(Entity):
    """One TV's Demos entity: updates when its collections or its demo change."""

    _attr_should_poll = False
    kind = ""

    def __init__(self, entry, tv: dict[str, Any]) -> None:
        self.entry, self.demos, self.tv_id = entry, entry.runtime_data.demos, tv[TV_ID]
        self.tv_name = tv.get(TV_NAME) or tv[TV_ID]
        self._attr_unique_id = f"{entry.entry_id}_{self.tv_id}_{self.kind}"

    @property
    def info(self) -> dict[str, Any]:
        return self.demos.info.get(self.tv_id) or {}

    async def async_added_to_hass(self) -> None:
        @callback
        def changed(tv_id: str | None = None) -> None:
            if tv_id in (None, self.tv_id):
                self.async_write_ha_state()
        self.async_on_remove(async_dispatcher_connect(self.hass, INFO_SIGNAL, changed))
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL, changed))
        if self.tv_id not in self.demos.info:
            self.hass.async_create_task(self.demos.async_refresh_info(self.tv_id))


def setup_platform(hass: HomeAssistant, entry, add: Callable, make: Callable[[Any, dict[str, Any]], DemoEntity]) -> None:
    """Keep one entity per TV with Demos on: add the new ones, remove the ones turned off."""
    have: dict[str, DemoEntity] = {}

    @callback
    def sync(_tv_id: str | None = None) -> None:
        demos = entry.runtime_data.demos
        if demos is None:
            return
        want = {t[TV_ID]: t for t in demos.enabled_tvs()}
        new = [make(entry, t) for i, t in want.items() if i not in have]
        for e in new:
            have[e.tv_id] = e
        if new:
            add(new)
        reg = er.async_get(hass)
        for i in [i for i in have if i not in want]:
            ent = have.pop(i)
            if ent.entity_id and reg.async_get(ent.entity_id):
                reg.async_remove(ent.entity_id)
        # entries left from a TV that's gone (or Demos turned off before a restart)
        for re_ in er.async_entries_for_config_entry(reg, entry.entry_id):
            if re_.domain == make.__module__.rsplit(".", 1)[-1] and re_.unique_id.endswith(f"_{make.kind}") \
                    and not any(re_.unique_id == f"{entry.entry_id}_{i}_{make.kind}" for i in want):
                reg.async_remove(re_.entity_id)

    sync()
    entry.async_on_unload(async_dispatcher_connect(hass, INFO_SIGNAL, sync))


__all__ = ["DOMAIN", "DemoEntity", "fmt_len", "setup_platform"]
