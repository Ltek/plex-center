"""Changing a TV's settings from the card editor: checked like Configure, empty clears, defaults aren't stored."""

import pytest

from custom_components.plex_center.websocket import apply_tv_changes

TV = {"id": "th", "name": "Theater", "plex_user": "MediaRoom", "pipup": "media_player.shield_3", "skip_forward": 15}


def test_changes():
    out = apply_tv_changes(TV, {"volume_entity": "media_player.storm", "skip_forward": 30, "skip_back": 20, "room_off": False,
                                "power_entity": "input_select.theater", "power_on": "Movie", "route": "auto"})
    assert out["volume_entity"] == "media_player.storm" and "skip_forward" not in out and out["skip_back"] == 20
    assert out["power_entity"] == "input_select.theater" and out["power_on"] == "Movie" and "route" not in out
    assert "volume_entity" not in apply_tv_changes(out, {"volume_entity": ""}), "empty clears"
    assert apply_tv_changes(TV, {"plex_user": ""})["plex_user"] == "", "server owner"


@pytest.mark.parametrize("changes, why", [
    ({"volume_entity": "switch.storm"}, "media_player"),
    ({"power_entity": "sensor.x"}, "input_boolean"),
    ({"pipup": "not an id"}, "entity id"),
    ({"skip_back": 2}, "5–600"),
    ({"name": " "}, "name"),
    ({"pipup": ""}, "PiPup, ADB or Plex"),
    ({"id": "x"}, "can't be changed"),
    ({"route": "magic"}, "route"),
])
def test_refused(changes, why):
    with pytest.raises(ValueError, match=why):
        apply_tv_changes(TV, changes)
