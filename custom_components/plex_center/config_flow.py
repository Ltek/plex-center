"""Config and options flow for Plex Center.

Setup asks only for the Plex server (from HA's Plex integration). TVs are detected and matched to
Plex Home users automatically; the options flow edits, adds and removes them.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector
from homeassistant.util import slugify

from .const import CONF_SERVER_ID, CONF_TVS, DOMAIN, ROUTES, TV_ADB, TV_ID, TV_NAME, TV_PIPUP, TV_PLEX, TV_REMOTE, TV_ROUTE, TV_USER, TV_CAST
from .const import TV_SKIP_BACK, TV_SKIP_FWD
from .const import TV_BUSY, TV_FAIL, TV_POWER, TV_POWER_OFF, TV_POWER_ON, TV_READY, TV_READY_S, TV_ROOM_OFF, TV_STATUS
from .plex import PlexConnections, plex_servers
from .tvs import detect_tvs, route_for

PLAYER_NAMES = ((TV_PIPUP, "PiPup"), (TV_ADB, "ADB"), (TV_REMOTE, "Android TV Remote"), (TV_CAST, "Cast"), (TV_PLEX, "Plex player"))
ROUTE_NAMES = {"pipup": "PiPup", "adb": "ADB", "plex": "Plex remote control", "open": "PiPup (opens the title only)"}


async def _users(hass, server_id: str) -> list[dict[str, Any]]:
    conn = PlexConnections(hass, server_id)
    try:
        return await hass.async_add_executor_job(conn.home_users_sync)
    except Exception:  # noqa: BLE001 - offer the owner only
        return [{"username": "", "title": "Server owner", "admin": True, "pin": True, "managed": False}]


class PlexCenterConfigFlow(ConfigFlow, domain=DOMAIN):
    """Pick a Plex server; detect the TVs."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        servers = plex_servers(self.hass)
        if not servers:
            return self.async_abort(reason="no_plex")
        if user_input is None and len(servers) == 1:
            user_input = {CONF_SERVER_ID: next(iter(servers))}
        if user_input is not None:
            sid = user_input[CONF_SERVER_ID]
            await self.async_set_unique_id(sid)
            self._abort_if_unique_id_configured()
            tvs = detect_tvs(self.hass, await _users(self.hass, sid))
            return self.async_create_entry(title=f"Plex Center ({servers[sid][0]})", data={CONF_SERVER_ID: sid},
                                           options={CONF_TVS: tvs})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({vol.Required(CONF_SERVER_ID): selector.SelectSelector(
            selector.SelectSelectorConfig(options=[{"value": k, "label": v[0]} for k, v in servers.items()]))}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return PlexCenterOptionsFlow()


def _tv_schema(tv: dict[str, Any], users: list[dict[str, Any]]) -> vol.Schema:
    ent = lambda integ: selector.EntitySelector(selector.EntitySelectorConfig(domain="media_player", integration=integ))  # noqa: E731
    user_opts = [{"value": u["username"] or "__owner__", "label": u["title"] + (" (has a PIN: uses the owner's view)" if u["pin"] and u["username"] else "")} for u in users]
    if tv.get(TV_USER) and not any(u["username"] == tv[TV_USER] for u in users):
        user_opts.append({"value": tv[TV_USER], "label": tv[TV_USER]})
    sug = lambda k: {"suggested_value": tv.get(k)} if tv.get(k) else {}  # noqa: E731
    return vol.Schema({
        vol.Required(TV_NAME, default=tv.get(TV_NAME, "")): str,
        vol.Required(TV_USER, default=tv.get(TV_USER) or "__owner__"): selector.SelectSelector(selector.SelectSelectorConfig(options=user_opts)),
        vol.Optional(TV_PIPUP, description=sug(TV_PIPUP)): ent("pipup"),
        vol.Optional(TV_ADB, description=sug(TV_ADB)): ent("androidtv"),
        vol.Optional(TV_PLEX, description=sug(TV_PLEX)): ent("plex"),
        vol.Optional(TV_REMOTE, description=sug(TV_REMOTE)): ent("androidtv_remote"),
        vol.Optional(TV_CAST, description=sug(TV_CAST)): ent("cast"),
        vol.Required(TV_ROUTE, default=tv.get(TV_ROUTE, "auto")): selector.SelectSelector(selector.SelectSelectorConfig(options=ROUTES, translation_key="route")),
        vol.Optional(TV_POWER, description=sug(TV_POWER)): selector.EntitySelector(selector.EntitySelectorConfig(
            domain=["input_boolean", "input_select", "select", "switch", "script", "scene"])),
        vol.Optional(TV_POWER_ON, description=sug(TV_POWER_ON)): str,
        vol.Optional(TV_POWER_OFF, description=sug(TV_POWER_OFF)): str,
        vol.Optional(TV_STATUS, description=sug(TV_STATUS)): selector.EntitySelector(),
        vol.Optional(TV_READY, description=sug(TV_READY)): str,
        vol.Optional(TV_BUSY, description=sug(TV_BUSY)): str,
        vol.Optional(TV_FAIL, description=sug(TV_FAIL)): str,
        vol.Optional(TV_READY_S, default=int(tv.get(TV_READY_S) or 120)): selector.NumberSelector(selector.NumberSelectorConfig(
            min=10, max=900, step=5, unit_of_measurement="s", mode="box")),
        vol.Optional(TV_ROOM_OFF, default=bool(tv.get(TV_ROOM_OFF))): bool,
        vol.Optional(TV_SKIP_FWD, default=int(tv.get(TV_SKIP_FWD) or 30)): selector.NumberSelector(selector.NumberSelectorConfig(
            min=5, max=600, step=5, unit_of_measurement="s", mode="box")),
        vol.Optional(TV_SKIP_BACK, default=int(tv.get(TV_SKIP_BACK) or 10)): selector.NumberSelector(selector.NumberSelectorConfig(
            min=5, max=600, step=5, unit_of_measurement="s", mode="box")),
    })


def _clean(data: dict[str, Any], tv_id: str) -> dict[str, Any]:
    tv = {TV_ID: tv_id, TV_NAME: data[TV_NAME].strip() or tv_id, TV_USER: "" if data.get(TV_USER) in (None, "__owner__") else data[TV_USER]}
    for k in (TV_PIPUP, TV_ADB, TV_PLEX, TV_REMOTE, TV_CAST, TV_POWER, TV_STATUS):
        if data.get(k):
            tv[k] = data[k]
    for k in (TV_POWER_ON, TV_POWER_OFF, TV_READY, TV_BUSY, TV_FAIL):
        if str(data.get(k) or "").strip():
            tv[k] = str(data[k]).strip()
    for k, d in ((TV_SKIP_FWD, 30), (TV_SKIP_BACK, 10)):
        if data.get(k) and int(data[k]) != d:
            tv[k] = int(data[k])
    if tv.get(TV_POWER) and data.get(TV_ROOM_OFF):
        tv[TV_ROOM_OFF] = True
    if (tv.get(TV_POWER) or tv.get(TV_STATUS)) and data.get(TV_READY_S) and int(data[TV_READY_S]) != 120:
        tv[TV_READY_S] = int(data[TV_READY_S])
    if data.get(TV_ROUTE) and data[TV_ROUTE] != "auto":
        tv[TV_ROUTE] = data[TV_ROUTE]
    return tv


class PlexCenterOptionsFlow(OptionsFlow):
    """Edit, add, remove and re-detect TVs."""

    def __init__(self) -> None:
        self._tvs: list[dict[str, Any]] | None = None
        self._edit: int | None = None
        self._users: list[dict[str, Any]] | None = None
        self._found: list[dict[str, Any]] = []

    async def _load(self) -> None:
        if self._tvs is None:
            self._tvs = [dict(t) for t in self.config_entry.options.get(CONF_TVS, [])]
        if self._users is None:
            self._users = await _users(self.hass, self.config_entry.data[CONF_SERVER_ID])

    def _save(self) -> ConfigFlowResult:
        return self.async_create_entry(data={**self.config_entry.options, CONF_TVS: self._tvs})

    def _summary(self) -> str:
        if not self._tvs:
            return "No TVs yet."
        rows = []
        for t in self._tvs:
            route = route_for(self.hass, t)
            rows.append(f"**{t[TV_NAME]}**: Plex user {t.get(TV_USER) or 'server owner'}; "
                        + (f"plays with {ROUTE_NAMES.get(route, route)}" if route else "**no reachable player**"))
            for k, n in PLAYER_NAMES:
                ent = t.get(k)
                st = ent and self.hass.states.get(ent)
                note = "" if not ent else " (**missing**)" if not st else f" ({st.state})"
                rows.append(f"- {n}: {f'`{ent}`' if ent else '—'}{note}")
            for k, n in ((TV_POWER, "Room power"), (TV_STATUS, "Room status")):
                if t.get(k):
                    st = self.hass.states.get(t[k])
                    rows.append(f"- {n}: `{t[k]}` ({st.state if st else '**missing**'})")
            rows.append("")
        return "\n".join(rows).rstrip()

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self._load()
        options = {f"edit_{i}": f"Edit {t[TV_NAME]}" for i, t in enumerate(self._tvs)}
        options["detect"] = "Find new TVs"
        options["add"] = "Add a TV by hand"
        if self._tvs:
            options["remove"] = "Remove TVs"
        return self.async_show_menu(step_id="init", menu_options=options, description_placeholders={"tvs": self._summary()})

    def __getattr__(self, name: str):
        if name.startswith("async_step_edit_"):
            idx = int(name.rsplit("_", 1)[1])

            async def step(user_input=None):
                self._edit = idx
                return await self.async_step_tv(user_input)
            return step
        raise AttributeError(name)

    async def async_step_add(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        self._edit = None
        return await self.async_step_tv(user_input)

    async def async_step_tv(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self._load()
        current = self._tvs[self._edit] if self._edit is not None else {}
        errors: dict[str, str] = {}
        if user_input is not None:
            if not (user_input.get(TV_PIPUP) or user_input.get(TV_ADB) or user_input.get(TV_PLEX)):
                errors["base"] = "no_player"
            else:
                tv_id = current.get(TV_ID) or slugify(user_input[TV_NAME]) or "tv"
                taken = {t[TV_ID] for i, t in enumerate(self._tvs) if i != self._edit}
                base, n = tv_id, 2
                while tv_id in taken:
                    tv_id, n = f"{base}_{n}", n + 1
                tv = _clean(user_input, tv_id)
                if self._edit is None:
                    self._tvs.append(tv)
                else:
                    self._tvs[self._edit] = tv
                return self._save()
        return self.async_show_form(step_id="tv", data_schema=_tv_schema(current, self._users), errors=errors,
                                    description_placeholders={"name": current.get(TV_NAME, "a new TV")})

    async def async_step_remove(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self._load()
        if user_input is not None:
            drop = set(user_input.get("tvs", []))
            self._tvs = [t for t in self._tvs if t[TV_ID] not in drop]
            return self._save()
        return self.async_show_form(step_id="remove", data_schema=vol.Schema({vol.Optional("tvs", default=[]): selector.SelectSelector(
            selector.SelectSelectorConfig(options=[{"value": t[TV_ID], "label": t[TV_NAME]} for t in self._tvs], multiple=True))}))

    async def async_step_detect(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Show the PiPup / ADB players not used by any TV yet; add the ones picked (existing TVs are kept as they are)."""
        await self._load()
        if user_input is None:
            have = {e for t in self._tvs for e in (t.get(TV_PIPUP), t.get(TV_ADB), t.get(TV_PLEX))}
            self._found = [t for t in detect_tvs(self.hass, self._users) if not ({t.get(TV_PIPUP), t.get(TV_ADB)} - {None}) & have]
            if not self._found:
                return self.async_abort(reason="no_new_tvs")
            opts = [{"value": str(i), "label": f"{t[TV_NAME]} ({', '.join(n for k, n in ((TV_PIPUP, 'PiPup'), (TV_ADB, 'ADB'), (TV_PLEX, 'Plex')) if t.get(k))}"
                     f"; Plex user {t.get(TV_USER) or 'server owner'})"} for i, t in enumerate(self._found)]
            return self.async_show_form(step_id="detect", data_schema=vol.Schema({vol.Optional("add", default=[o["value"] for o in opts]):
                selector.SelectSelector(selector.SelectSelectorConfig(options=opts, multiple=True))}),
                description_placeholders={"count": str(len(self._found))})
        taken = {t[TV_ID] for t in self._tvs}
        for i in user_input.get("add", []):
            t = dict(self._found[int(i)])
            base, n = t[TV_ID], 2
            while t[TV_ID] in taken:
                t[TV_ID], n = f"{base}_{n}", n + 1
            taken.add(t[TV_ID])
            self._tvs.append(t)
        return self._save()
