"""The card is a Dashboard resource: created once, updated in place, never duplicated; YAML mode falls back."""

from typing import Any
from unittest.mock import patch

from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.setup import async_setup_component

from custom_components.plex_center import _register_card, _register_resource, copy_to_www
from custom_components.plex_center.const import CARD_URL, LOCAL_CARD_URL, VERSION


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
    with patch("homeassistant.components.frontend.add_extra_js_url") as add, patch("custom_components.plex_center.copy_to_www", return_value=False):
        await _register_card(hass)
    urls = [i["url"] for i in hass.data[LOVELACE_DATA].resources.async_items()]
    assert len(urls) == 1 and urls[0].startswith(f"{CARD_URL}?v={VERSION}&m=")
    add.assert_not_called()


async def test_yaml_mode_falls_back_to_extra_js(hass: Any) -> None:
    assert await async_setup_component(hass, "http", {})
    assert await async_setup_component(hass, "lovelace", {"lovelace": {"mode": "yaml", "resources": []}})
    assert not await _register_resource(hass, f"{CARD_URL}?v=1")
    with patch("homeassistant.components.frontend.add_extra_js_url") as add, patch("custom_components.plex_center.copy_to_www", return_value=False):
        await _register_card(hass)
    add.assert_called_once()
    assert add.call_args.args[1].startswith(f"{CARD_URL}?v={VERSION}&m=")


async def test_card_from_www_when_it_is_served(hass: Any) -> None:
    """With a copy in www, the resource is /local/... (served while HA starts); the old resource is replaced, not doubled."""
    assert await async_setup_component(hass, "http", {})
    assert await async_setup_component(hass, "lovelace", {})
    await hass.data[LOVELACE_DATA].resources.async_create_item({"res_type": "module", "url": f"{CARD_URL}?v=old"})
    with patch("custom_components.plex_center.copy_to_www", return_value=True):
        await _register_card(hass)
    urls = [i["url"] for i in hass.data[LOVELACE_DATA].resources.async_items()]
    assert len(urls) == 1 and urls[0].startswith(f"{LOCAL_CARD_URL}?v={VERSION}&m=")


def test_copy_to_www(tmp_path) -> None:
    js = tmp_path / "plex-center-card.js"
    js.write_text("// Version: v1\n")
    www = tmp_path / "www"
    assert copy_to_www(str(www), js) is False, "www made now: served from the next start"
    assert (www / "plex_center" / "plex-center-card.js").read_text() == "// Version: v1\n"
    js.write_text("// Version: v2\n")
    assert copy_to_www(str(www), js) is True
    assert (www / "plex_center" / "plex-center-card.js").read_text() == "// Version: v2\n"


async def test_refresh_after_an_update_without_a_restart(hass: Any) -> None:
    """HACS writes the new card in place: the next config request copies it to www and points the resource at it."""
    from custom_components.plex_center import DOMAIN, async_refresh_card

    assert await async_setup_component(hass, "http", {})
    assert await async_setup_component(hass, "lovelace", {})
    with patch("custom_components.plex_center.copy_to_www", return_value=True):
        await _register_card(hass)
    data = hass.data[f"{DOMAIN}_card"]
    real = data["bust"]
    res = hass.data[LOVELACE_DATA].resources
    await res.async_update_item(res.async_items()[0]["id"], {"res_type": "module", "url": f"{LOCAL_CARD_URL}?v=old&m=1"})
    data["bust"] = 1   # the card on disk is newer than the one registered at start
    with patch("custom_components.plex_center.copy_to_www", return_value=True) as cp:
        await async_refresh_card(hass)
        assert cp.call_count == 1, "copied again"
        assert [i["url"] for i in res.async_items()] == [f"{LOCAL_CARD_URL}?v={VERSION}&m={real}"]
        await async_refresh_card(hass)
        assert cp.call_count == 1, "nothing to do when it is current"
