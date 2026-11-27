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


class _Coord:
    """A fake Easy AV Control coordinator: start_activity runs it to `end` after a moment."""

    def __init__(self, rooms, end="active", error=None):
        self.rooms, self.entry, self.started = rooms, SimpleNamespace(entry_id="e1"), []
        self.rt = {r: SimpleNamespace(state="idle", activity=None, error=None) for r in rooms}
        self.end, self.err = end, error

    def device_name(self, d):
        return d["entity_id"]

    def runtime(self, room):
        return self.rt[room]

    def default_activity(self, room):
        return "music"

    async def async_start_activity(self, room, act):
        import asyncio
        self.started.append(act)
        self.rt[room].state, self.rt[room].activity = "starting", act
        await asyncio.sleep(0)
        self.rt[room].state, self.rt[room].error = self.end, self.err


async def test_play_when_ready(hass: HomeAssistant) -> None:
    import asyncio
    from unittest.mock import patch

    import pytest
    from homeassistant.exceptions import HomeAssistantError

    from custom_components.plex_center import play
    tv = {"id": "th", "name": "Theater", "adb": "media_player.shield_adb"}
    c = _Coord({"theater": THEATER})
    hass.data[avcontrol.AV_DOMAIN] = {"e1": c}
    info = avcontrol.applies(hass, tv)
    assert info and info["room"] == "theater"
    real_sleep = asyncio.sleep

    async def fast(_s):
        await real_sleep(0)
    with patch("asyncio.sleep", fast):
        assert await avcontrol.ensure_on(hass, tv, info, "Dune") is True
        assert c.started == ["movie"], "the activity that uses the TV (not the room's default, Music)"
        assert await avcontrol.ensure_on(hass, tv, info, "Dune") is False and c.started == ["movie"], "already on: nothing"
        c.rt["theater"].state, c.rt["theater"].activity = "active", "music"
        assert await avcontrol.ensure_on(hass, tv, info, "Dune") is True and c.started[-1] == "movie", "on with Music: switch to Movie"
        bad = _Coord({"theater": THEATER}, end="error", error="JVC did not turn on")
        hass.data[avcontrol.AV_DOMAIN] = {"e1": bad}
        with pytest.raises(HomeAssistantError, match="JVC did not turn on"):
            await avcontrol.ensure_on(hass, tv, avcontrol.applies(hass, tv), "Dune")
        assert avcontrol.pending("th") is None
        slow = _Coord({"theater": THEATER}, end="starting")
        hass.data[avcontrol.AV_DOMAIN] = {"e1": slow}
        task = hass.async_create_task(avcontrol.ensure_on(hass, tv, avcontrol.applies(hass, tv), "Dune"))
        for _ in range(5):
            await real_sleep(0)
        assert avcontrol.pending("th")["title"] == "Dune" and avcontrol.cancel("th")
        with pytest.raises(HomeAssistantError, match="Cancelled"):
            await task
    assert avcontrol.applies(hass, {**tv, "status_entity": "sensor.room"}) is None, "the room hook wins"
    assert avcontrol.applies(hass, {**tv, "av_play": False}) is None, "switched off"
    # play.start: with the room failing, nothing is played
    calls = []
    hass.services.async_register("androidtv", "adb_command", lambda call: calls.append(call))
    hass.states.async_set("media_player.shield_adb", "idle")
    hass.data[avcontrol.AV_DOMAIN] = {"e1": _Coord({"theater": THEATER}, end="error", error="no")}
    with patch("asyncio.sleep", fast), pytest.raises(HomeAssistantError):
        await play.start(hass, tv, {"key": "1", "type": "movie", "link": "plex://libraries/6d60735f617529a9a566eff288ef0f94d063ff80/movie/x/1"})
    assert calls == []
