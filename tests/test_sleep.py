"""Sleep timers: after N minutes, or after what's playing ends; cancel."""

from datetime import timedelta
from unittest.mock import patch

from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.plex_center import sleep

TV = {"id": "th", "name": "Theater", "pipup": "media_player.pip"}


async def test_minutes_turns_off(hass):
    offs = []

    async def off(h, tv):
        offs.append(tv["id"])
    with patch("custom_components.plex_center.play.power_off", off):
        st = sleep.start(hass, TV, minutes=30)
        assert st["mode"] == "minutes" and st["at"] > 0 and sleep.status(hass)["th"]["mode"] == "minutes"
        async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=31))
        await hass.async_block_till_done()
    assert offs == ["th"] and sleep.status(hass) == {}


async def test_after_this_waits_for_the_end(hass):
    offs = []

    async def off(h, tv):
        offs.append(tv["id"])
    hass.states.async_set("media_player.pip", "playing", {"media_duration": 3600})
    with patch("custom_components.plex_center.play.power_off", off):
        sleep.start(hass, TV, after=True)
        async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=5))
        await hass.async_block_till_done()
        assert offs == [], "still playing"
        hass.states.async_set("media_player.pip", "on", {})
        await hass.async_block_till_done()
        async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=sleep.ENDED_S + 5))
        await hass.async_block_till_done()
    assert offs == ["th"]


async def test_cancel(hass):
    sleep.start(hass, TV, minutes=10)
    assert sleep.start(hass, TV) is None and sleep.status(hass) == {}
