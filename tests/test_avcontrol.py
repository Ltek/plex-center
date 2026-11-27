"""Easy AV Control: which room is a TV's, and which of its activities use the TV."""

from types import SimpleNamespace

from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar, device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.plex_center import avcontrol
from custom_components.plex_center.websocket import apply_tv_changes

THEATER = {
    "name": "Theater", "area_id": None,
    "devices": {"shield": {"entity_id": "media_player.shield_adb"}, "avr": {"entity_id": "media_player.storm"},
                "pj": {"entity_id": "media_player.jvc"}},
    "activities": {"movie": {"name": "Movie", "devices": ["shield", "avr", "pj"]},
                   "music": {"name": "Music", "devices": ["avr"]},
                   "off": {"name": "Old", "devices": ["shield"], "enabled": False}},
}
LIVING = {"name": "Living Room", "area_id": None, "devices": {"sb": {"entity_id": "media_player.soundbar"}},
          "activities": {"tv": {"name": "TV", "devices": ["sb"]}}}


def _coord(entry_id, rooms):
    return SimpleNamespace(rooms=rooms, entry=SimpleNamespace(entry_id=entry_id), device_name=lambda d: d["entity_id"].split(".")[1])


def test_found_by_the_tvs_player_only_its_activities(hass: HomeAssistant) -> None:
    hass.data[avcontrol.AV_DOMAIN] = {"e1": _coord("e1", {"theater": THEATER, "living": LIVING})}
    got = avcontrol.room_for(hass, {"id": "th", "adb": "media_player.shield_adb"})
    assert got["room"] == "theater" and got["how"] == "devices" and got["entry_id"] == "e1"
    assert [a["name"] for a in got["activities"]] == ["Movie"], "Music doesn't use the TV; the disabled one is left out"
    assert [d["id"] for d in got["activities"][0]["devices"]] == ["shield", "avr", "pj"]
    assert avcontrol.room_for(hass, {"id": "x", "adb": "media_player.other"})["room"] is None
    assert avcontrol.room_for(hass, {"id": "th", "adb": "media_player.shield_adb", "av_room": "none"})["room"] is None
    picked = avcontrol.room_for(hass, {"id": "lr", "pipup": "media_player.lr", "av_room": "e1/living"})
    assert picked["room"] == "living" and picked["how"] == "picked" and [a["id"] for a in picked["activities"]] == ["tv"]
    assert {r["id"] for r in avcontrol.rooms(hass)} == {"e1/theater", "e1/living"}


def test_two_rooms_use_the_tv_ask(hass: HomeAssistant) -> None:
    other = {**LIVING, "devices": {"s": {"entity_id": "media_player.shield_adb"}}, "activities": {"tv": {"name": "TV", "devices": ["s"]}}}
    hass.data[avcontrol.AV_DOMAIN] = {"e1": _coord("e1", {"theater": THEATER, "other": other})}
    got = avcontrol.room_for(hass, {"id": "th", "adb": "media_player.shield_adb"})
    assert got["room"] is None and {c["room"] for c in got["candidates"]} == {"theater", "other"}


def test_area_fallback(hass: HomeAssistant) -> None:
    area = ar.async_get(hass).async_create("Media room")
    entry = MockConfigEntry(domain="test"); entry.add_to_hass(hass)
    dev = dr.async_get(hass).async_get_or_create(config_entry_id=entry.entry_id, identifiers={("test", "tv")})
    dr.async_get(hass).async_update_device(dev.id, area_id=area.id)
    er.async_get(hass).async_get_or_create("media_player", "test", "tv1", device_id=dev.id, suggested_object_id="mr_tv")
    hass.data[avcontrol.AV_DOMAIN] = {"e1": _coord("e1", {"media": {**LIVING, "name": "Media", "area_id": area.id}})}
    got = avcontrol.room_for(hass, {"id": "mr", "pipup": "media_player.mr_tv"})
    assert got["room"] == "media" and got["how"] == "area" and [a["id"] for a in got["activities"]] == ["tv"]


def test_not_installed_and_the_setting(hass: HomeAssistant) -> None:
    assert avcontrol.room_for(hass, {"id": "x"}) == {"available": False, "room": None, "activities": [], "candidates": []}
    assert apply_tv_changes({"name": "T", "pipup": "media_player.p"}, {"av_room": "e1/theater"})["av_room"] == "e1/theater"
    assert "av_room" not in apply_tv_changes({"name": "T", "pipup": "media_player.p", "av_room": "none"}, {"av_room": ""})
    import pytest
    with pytest.raises(ValueError):
        apply_tv_changes({"name": "T", "pipup": "media_player.p"}, {"av_room": "x; rm -rf"})
