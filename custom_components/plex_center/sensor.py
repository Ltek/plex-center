"""Demos: a sensor per TV with Demos on, listing its demo collections (for any Dashboard card)."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant

from .demo_entities import DemoEntity, fmt_len, setup_platform


class DemoCollectionsSensor(DemoEntity, SensorEntity):
    """State: how many collections the TV's demo library has. Attributes: each one (and the whole library), and what
    the demo on the TV is doing."""

    kind = "demo_collections"
    _attr_icon = "mdi:filmstrip-box-multiple"

    def __init__(self, entry, tv: dict[str, Any]) -> None:
        super().__init__(entry, tv)
        self._attr_name = f"{self.tv_name} Demo collections"

    @property
    def native_value(self) -> int | None:
        seqs = self.info.get("sequences")
        return None if seqs is None else max(0, len(seqs) - 1)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        seqs = [{**x, "length": fmt_len(x.get("seconds") or 0)} for x in self.info.get("sequences") or []]
        st = self.demos.status(self.tv_id)
        names = {x["id"]: x["title"] for x in seqs}
        return {
            "library": self.info.get("library"),
            "all": seqs[0] if seqs else None,
            "collections": seqs[1:],
            "titles": [x["title"] for x in seqs],
            "selected": self.demos.picked(self.tv_id),
            "demo_state": st.get("state"),
            "demo_collection": names.get(st.get("sequence"), st.get("sequence")) if st.get("state") != "idle" else None,
            "demo_clip": st.get("index") if st.get("state") != "idle" else None,
            "demo_clips": st.get("total") if st.get("state") != "idle" else None,
            "demo_label": st.get("label") if st.get("state") != "idle" else None,
            "error": self.info.get("error"),
        }


async def async_setup_entry(hass: HomeAssistant, entry, async_add_entities) -> None:
    setup_platform(hass, entry, async_add_entities, DemoCollectionsSensor)
