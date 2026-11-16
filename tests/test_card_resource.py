"""The card is a Dashboard resource: created once, updated in place, never duplicated; YAML mode falls back."""

from typing import Any
from unittest.mock import patch

from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.setup import async_setup_component

from custom_components.plex_center import _register_card, _register_resource
from custom_components.plex_center.const import CARD_URL, VERSION


async def test_resource_created_once_updated_in_place_duplicates_removed(hass: Any) -> None:
    assert await async_setup_component(hass, "lovelace", {})
    res = hass.data[LOVELACE_DATA].resources
    assert await _register_resource(hass, f"{CARD_URL}?v=1&m=1")
    assert await _register_resource(hass, f"{CARD_URL}?v=1&m=1")
    items = res.async_items()
    assert [i["url"] for i in items] == [f"{CARD_URL}?v=1&m=1"] and items[0]["type"] == "module"
    first_id = items[0]["id"]
    assert await _register_resource(hass, f"{CARD_URL}?v=2&m=2")
    items = res.async_items()
    assert [(i["id"], i["url"]) for i in items] == [(first_id, f"{CARD_URL}?v=2&m=2")], "same entry, new URL"
    await res.async_create_item({"res_type": "module", "url": f"{CARD_URL}?old"})
    await res.async_create_item({"res_type": "module", "url": "/local/other-card.js"})
    assert await _register_resource(hass, f"{CARD_URL}?v=2&m=2")
    assert sorted(i["url"] for i in res.async_items()) == sorted([f"{CARD_URL}?v=2&m=2", "/local/other-card.js"])


async def test_register_card_uses_the_resource_and_no_extra_js(hass: Any) -> None:
    assert await async_setup_component(hass, "http", {})
    assert await async_setup_component(hass, "lovelace", {})
    with patch("homeassistant.components.frontend.add_extra_js_url") as add:
        await _register_card(hass)
    urls = [i["url"] for i in hass.data[LOVELACE_DATA].resources.async_items()]
    assert len(urls) == 1 and urls[0].startswith(f"{CARD_URL}?v={VERSION}&m=")
    add.assert_not_called()


async def test_yaml_mode_falls_back_to_extra_js(hass: Any) -> None:
    assert await async_setup_component(hass, "http", {})
    assert await async_setup_component(hass, "lovelace", {"lovelace": {"mode": "yaml", "resources": []}})
    assert not await _register_resource(hass, f"{CARD_URL}?v=1")
    with patch("homeassistant.components.frontend.add_extra_js_url") as add:
        await _register_card(hass)
    add.assert_called_once()
    assert add.call_args.args[1].startswith(f"{CARD_URL}?v={VERSION}&m=")
