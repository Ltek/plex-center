"""Config flow and per-user Plex connections."""

from unittest.mock import MagicMock, patch

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResultType

from custom_components.plex_center.const import DOMAIN
from custom_components.plex_center.plex import PlexConnections

SID = "6d60735f617529a9a566eff288ef0f94d063ff80"


async def test_flow_creates_entry_with_detected_tvs(hass):
    tvs = [{"id": "living_room_tv", "name": "Living Room TV", "pipup": "media_player.living_room_tv", "plex_user": "LivingRoom"}]
    with patch("custom_components.plex_center.config_flow.plex_servers", return_value={SID: ("Plex Server", None, None)}), \
         patch("custom_components.plex_center.config_flow._users", return_value=[]), \
         patch("custom_components.plex_center.config_flow.detect_tvs", return_value=tvs), \
         patch("custom_components.plex_center.async_setup_entry", return_value=True):
        res = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert res["type"] is FlowResultType.CREATE_ENTRY
    assert res["data"] == {"server_id": SID}
    assert res["options"]["tvs"] == tvs


async def test_flow_aborts_without_plex(hass):
    with patch("custom_components.plex_center.config_flow.plex_servers", return_value={}):
        res = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert res["type"] is FlowResultType.ABORT and res["reason"] == "no_plex"


def test_user_connections_switch_once_and_retry_on_401():
    from plexapi.exceptions import Unauthorized

    admin = MagicMock()
    lr1, lr2 = MagicMock(name="lr1"), MagicMock(name="lr2")
    admin.switchUser.side_effect = [lr1, lr2]
    conn = PlexConnections(MagicMock(), SID)
    conn._admin = admin
    assert conn.user("LivingRoom") is lr1 and conn.user("LivingRoom") is lr1
    assert admin.switchUser.call_count == 1
    assert conn.user("") is admin
    calls = []
    def fn(server):
        calls.append(server)
        if server is lr1:
            raise Unauthorized("expired")
        return "ok"
    assert conn.call("LivingRoom", fn) == "ok"
    assert calls == [lr1, lr2]
