"""Constants for Plex Center."""

from __future__ import annotations

DOMAIN = "plex_center"
VERSION = "2026.11.19.87"

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
TV_ROUTE = "route"          # auto | pipup | adb | plex

ROUTES = ["auto", "pipup", "adb", "plex"]

PLEX_PKG = "com.plexapp.android"
BTN_WATCH = "action-button-watch"
BTN_RESTART = "action-button-watchFromStart"
PREVIEW_MAX_S = 60          # Plex plays a 30 s preview on a title page

CARD_URL = "/plex_center/plex-center-card.js"
