"""Plex connections for Plex Center.

Every Plex call runs here, inside Home Assistant: the card never sees a token.

* The admin connection is the one HA's own Plex integration already has (no login of our own).
  If its internals move, the Plex config entry's ``server_config`` (url + token) is used instead.
* Each TV's Plex Home user gets its own connection through ``PlexServer.switchUser`` (an admin can
  open the server as a managed user; no PIN is asked or stored). Connections are cached and rebuilt
  once when Plex answers 401 (a user's token was reset).
"""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

_LOGGER = logging.getLogger(__name__)


class PlexCenterError(HomeAssistantError):
    """A Plex call failed in a way the user should see."""


def plex_servers(hass: HomeAssistant) -> dict[str, Any]:
    """Loaded Plex servers of HA's Plex integration: {machine_id: (friendly_name, plexapi PlexServer or None, entry)}."""
    out: dict[str, Any] = {}
    try:
        from homeassistant.components.plex.helpers import get_plex_servers  # noqa: PLC0415

        for mid, wrapper in get_plex_servers(hass).items():
            out[mid] = (getattr(wrapper, "friendly_name", mid), getattr(wrapper, "plex_server", None), None)
    except Exception as err:  # noqa: BLE001 - internals of another integration; fall back below
        _LOGGER.debug("Plex helpers not usable (%s); using config entries", err)
    for entry in hass.config_entries.async_entries("plex"):
        mid = entry.unique_id or entry.data.get("server_id")
        if mid and mid not in out:
            out[mid] = (entry.title or mid, None, entry)
    return out


class PlexConnections:
    """Admin + per-user plexapi servers for one Plex server."""

    def __init__(self, hass: HomeAssistant, server_id: str) -> None:
        self.hass = hass
        self.server_id = server_id
        self._admin = None
        self._users: dict[str, Any] = {}

    # ---------------------------------------------------------------- connections (executor)

    def _admin_sync(self):
        if self._admin is not None:
            return self._admin
        found = plex_servers(self.hass).get(self.server_id)
        if not found:
            raise PlexCenterError(f"Plex server {self.server_id} is not set up in Home Assistant's Plex integration")
        _name, server, entry = found
        if server is None:
            from plexapi.server import PlexServer  # noqa: PLC0415
            import requests  # noqa: PLC0415

            if entry is None:
                entry = next((e for e in self.hass.config_entries.async_entries("plex")
                              if (e.unique_id or e.data.get("server_id")) == self.server_id), None)
            cfg = (entry.data or {}).get("server_config", {}) if entry else {}
            if not cfg.get("url") or not cfg.get("token"):
                raise PlexCenterError("The Plex integration has no server address or token for this server")
            session = requests.Session()
            session.verify = cfg.get("verify_ssl", True)
            server = PlexServer(cfg["url"], cfg["token"], session=session)
        self._admin = server
        return server

    def admin(self):
        """The admin (server owner) plexapi server. Blocking: call from the executor."""
        return self._admin_sync()

    def user(self, username: str | None):
        """A plexapi server opened as a Plex Home user ('' or None = the admin). Blocking."""
        if not username:
            return self._admin_sync()
        if username not in self._users:
            try:
                self._users[username] = self._admin_sync().switchUser(username)
            except Exception as err:  # noqa: BLE001
                raise PlexCenterError(f"Could not open Plex as {username}: {err}") from err
        return self._users[username]

    def forget(self, username: str | None = None) -> None:
        """Drop cached connections (after a 401, or when the options change)."""
        if username:
            self._users.pop(username, None)
        else:
            self._users.clear()
            self._admin = None

    def call(self, username: str | None, fn):
        """Run fn(server) for a user; on 401 rebuild that user's connection once. Blocking."""
        from plexapi.exceptions import Unauthorized  # noqa: PLC0415

        try:
            return fn(self.user(username))
        except Unauthorized:
            self.forget(username)
            return fn(self.user(username))

    async def async_call(self, username: str | None, fn):
        """Executor wrapper for call()."""
        return await self.hass.async_add_executor_job(self.call, username, fn)

    # ---------------------------------------------------------------- users

    def home_users_sync(self) -> list[dict[str, Any]]:
        """Plex Home users of the admin account: [{username, title, admin, pin, managed}]."""
        admin = self._admin_sync()
        out = [{"username": "", "title": "Server owner", "admin": True, "pin": True, "managed": False}]
        try:
            account = admin.myPlexAccount()
            out[0]["title"] = f"{account.title or account.username} (server owner)"
            for u in account.users():
                if not getattr(u, "home", False):
                    continue
                out.append({"username": u.title or u.username, "title": u.title or u.username, "admin": False,
                            "pin": bool(getattr(u, "protected", False)), "managed": bool(getattr(u, "restricted", False))})
        except Exception as err:  # noqa: BLE001 - plex.tv unreachable: only the owner is offered
            _LOGGER.warning("Could not read the Plex Home users from plex.tv: %s", err)
        return out
