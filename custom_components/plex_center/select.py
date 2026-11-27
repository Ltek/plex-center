"""Demos: a select per TV with Demos on, to choose a demo collection. Choosing only sets it; nothing plays.
An automation reads its state and passes it to plex_center.demo_play as the sequence."""

from __future__ import annotations

from typing import Any

from homeassistant.components.select import SelectEntity
from homeassistant.core import HomeAssistant

from .demo_entities import DemoEntity, setup_platform


class DemoCollectionSelect(DemoEntity, SelectEntity):
    kind = "demo_collection"
    _attr_icon = "mdi:playlist-play"

    def __init__(self, entry, tv: dict[str, Any]) -> None:
        super().__init__(entry, tv)
        self._attr_name = f"{self.tv_name} Demo collection"

    @property
    def options(self) -> list[str]:
        return [x["title"] for x in self.info.get("sequences") or []]

    @property
    def current_option(self) -> str | None:
        return self.demos.picked(self.tv_id)

    @property
    def available(self) -> bool:
        return bool(self.options)

    async def async_select_option(self, option: str) -> None:
        self.demos.set_picked(self.tv_id, option)


async def async_setup_entry(hass: HomeAssistant, entry, async_add_entities) -> None:
    setup_platform(hass, entry, async_add_entities, DemoCollectionSelect)
