"""Diagnostics and the Configure summary list each TV's players, with missing ones flagged."""

from types import SimpleNamespace as NS

from custom_components.plex_center.diagnostics import async_get_config_entry_diagnostics

TV = {"id": "th", "name": "Theater", "plex_user": "MediaRoom", "pipup": "media_player.shield_3", "adb": "media_player.theater_shield",
      "remote": "media_player.gone", "skip_forward": 15}


async def test_diagnostics_lists_players(hass):
    hass.states.async_set("media_player.shield_3", "on", {"app_id": "com.plexapp.android", "volume_level": 0.3})
    hass.states.async_set("media_player.theater_shield", "idle", {"app_name": "Plex"})
    d = await async_get_config_entry_diagnostics(hass, NS(options={"tvs": [TV]}, data={"server_id": "abc"}))
    t = d["tvs"][0]
    assert t["name"] == "Theater" and t["plex_user"] == "MediaRoom"
    assert t["players"]["pipup"] == {"entity_id": "media_player.shield_3", "state": "on", "attributes": {"app_id": "com.plexapp.android"}}
    assert t["players"]["remote"]["state"] == "missing"
    assert t["settings"] == {"skip_forward": 15}


async def test_configure_summary_shows_entities(hass):
    from custom_components.plex_center.config_flow import PlexCenterOptionsFlow
    hass.states.async_set("media_player.shield_3", "on")
    flow = PlexCenterOptionsFlow.__new__(PlexCenterOptionsFlow)
    flow.hass, flow._tvs = hass, [TV]
    text = flow._summary()
    assert "**Theater**" in text and "- PiPup: `media_player.shield_3` (on)" in text
    assert "- Android TV Remote: `media_player.gone` (**missing**)" in text and "- Cast: —" in text
