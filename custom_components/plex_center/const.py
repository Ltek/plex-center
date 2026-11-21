"""Constants for Plex Center."""

from __future__ import annotations

DOMAIN = "plex_center"
VERSION = "2026.11.21.107"

CONF_SERVER_ID = "server_id"
CONF_TVS = "tvs"

# One TV (stored in the entry's options, list under CONF_TVS)
TV_ID = "id"                # stable slug, used in entity ids and by the card
TV_NAME = "name"
TV_USER = "plex_user"       # Plex Home user the TV's Plex app uses; "" = the server owner (admin)
TV_PIPUP = "pipup"          # media_player of the PiPup integration
TV_ADB = "adb"              # media_player of the Android TV (ADB) integration
TV_PLEX = "plex_client"     # media_player of the Plex integration for this TV's Plex app
TV_REMOTE = "remote"        # media_player of the Android TV Remote integration (power on / off, power state)
TV_CAST = "cast"            # media_player of the Google Cast integration (what another app plays)
TV_POWER = "power_entity"   # optional: what turns the room on / off (input_boolean, input_select, select, switch, script, scene)
TV_POWER_ON = "power_on"    # its "on" value (selects: the option; default on)
TV_POWER_OFF = "power_off"  # its "off" value (selects: the option; default off)
TV_STATUS = "status_entity" # optional: says when the room is ready to play
TV_READY = "ready_value"    # its ready state (default on)
TV_READY_S = "ready_wait"   # seconds to wait for ready (default 120)
TV_BUSY = "busy_value"      # its "starting" state(s): already on the way, don't set the power entity again (default starting)
TV_FAIL = "fail_value"      # its failure state(s): stop waiting at once (default error)
TV_ROOM_OFF = "room_off"    # turning off: only set the power entity off (the room turns the TV off itself)
TV_ROUTE = "route"          # auto | pipup | adb | plex

ROUTES = ["auto", "pipup", "adb", "plex"]

PLEX_PKG = "com.plexapp.android"
BTN_WATCH = "action-button-watch"
BTN_RESTART = "action-button-watchFromStart"
PREVIEW_MAX_S = 60          # Plex plays a 30 s preview on a title page

CARD_URL = "/plex_center/plex-center-card.js"
LOCAL_CARD_URL = "/local/plex_center/plex-center-card.js"   # a copy in www: served from HA's start, before Plex Center loads
