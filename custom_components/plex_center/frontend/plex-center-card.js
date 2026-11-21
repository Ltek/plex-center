// Plex Center Card (Ltek) — Home Assistant Dashboard card, the front end of the Plex Center integration
// Version: v2026.11.21.104
//
// Browse Plex and play on your TVs. All Plex data and playback come from the Plex Center integration
// (websocket plex_center/* and the plex_center.play / plex_center.control actions): the card holds no
// Plex token. Each TV shows the libraries, Continue Watching and watched marks of the Plex Home user that
// TV's Plex app uses.
//
// The Home-row look (poster / fanart items, title + four lines with $keywords, date formats) is adapted
// from upcoming-media-card by the custom-cards team (MIT); see LICENSE.
//
// Vanilla JS, single file, light DOM. The stylesheet is a constant (no config value is ever written into
// it); per-card values are custom properties on the card root. Renders once, then patches.

const BUILD_NUMBER = 'v2026.11.21.104';
const CARD_TAG = 'plex-center-card';
const EDITOR_TAG = 'plex-center-card-editor';
const PREVIEW_MAX_S = 60;          // Plex plays a 30 s preview on a title page; longer = real playback
const PHONE_MAX_W = 600;           // auto layout: narrower than this is the phone layout
const PAGE = 60;                   // items per page
const REFRESH_MS = 60 * 1000;      // config / hubs refresh
const SESSIONS_MS = 15 * 1000;     // Watching now refresh

const THEME_COLORS = [
  ['var(--primary-color)', 'Primary'],
  ['var(--accent-color)', 'Accent'],
  ['var(--primary-text-color)', 'Primary text'],
  ['var(--secondary-text-color)', 'Secondary text'],
  ['var(--disabled-text-color)', 'Disabled text'],
  ['var(--state-active-color)', 'State active'],
  ['var(--error-color)', 'Error'],
  ['var(--warning-color)', 'Warning'],
  ['var(--success-color)', 'Success'],
  ['var(--info-color)', 'Info'],
];

// key → [label, "unset" label, seed hex, css custom property]
const COLOR_DEFS = {
  accent_color: ['Accent', 'Theme accent', '#e5a00d', '--plc-accent'],
  card_bg: ['Background', 'Theme card background', '#1c1c1c', null],
  card_border_color: ['Border color', 'Theme border', '#444444', null],
  title_color: ['Row titles', 'Theme text', '#ffffff', '--plc-title-c'],
  line_color: ['Row lines', 'Theme secondary text', '#bbbbbb', '--plc-line-c'],
  flag_color: ['"New" flag', 'Accent', '#e5a00d', '--plc-flag-c'],
  page_text_color: ['Not active', 'The preset', '#bbbbbb', '--pmu-c'],
  page_active_text_color: ['Active', 'The preset', '#ffffff', '--pmu-ac'],
  page_icon_color: ['Not active', 'The preset', '#bbbbbb', '--pmu-ic'],
  page_active_icon_color: ['Active', 'The preset', '#e5a00d', '--pmu-aic'],
  page_bg: ['Not active', 'The preset', '#2a2a2a', '--pmu-bg'],
  page_active_bg: ['Active', 'The preset', '#3a3a3a', '--pmu-abg'],
  page_border_color: ['Not active', 'The preset', '#555555', '--pmu-bc'],
  page_active_border_color: ['Active', 'The preset', '#e5a00d', '--pmu-abc'],
  page_grad_color: ['Not active', 'Accent', '#e5a00d', '--pmu-gc'],
  page_active_grad_color: ['Active', 'Same as not active', '#e5a00d', '--pmu-agc'],
  page_glow_color: ['Color', 'Accent', '#e5a00d', '--pmu-glc'],
  page_shadow_color: ['Color', 'Black', '#000000', '--pmu-shc'],
};
/** Page button style: groups like the Style Builder. A checked group (page_groups) uses its own values; unchecked = the preset. */
const PAGE_GROUPS = [
  ['content', 'Content', ['page_show_icon', 'page_show_label', 'page_icon_pos']],
  ['background', 'Background', ['page_bg', 'page_active_bg']],
  ['border', 'Line border', ['page_border_width', 'page_border_color', 'page_active_border_color', 'page_underline']],
  ['gradient', 'Gradient border', ['page_grad', 'page_grad_sides', 'page_grad_width', 'page_grad_color', 'page_active_grad_color']],
  ['glow', 'Glow', ['page_glow', 'page_glow_color', 'page_glow_blur', 'page_glow_spread', 'page_glow_opacity']],
  ['shadow', 'Drop shadow', ['page_shadow', 'page_shadow_x', 'page_shadow_y', 'page_shadow_blur', 'page_shadow_spread', 'page_shadow_color', 'page_shadow_opacity']],
  ['text', 'Text', ['page_text_px', 'page_weight', 'page_text_color', 'page_active_text_color']],
  ['icon', 'Icon', ['page_icon_px', 'page_icon_color', 'page_active_icon_color']],
  ['shape', 'Button shape', ['page_radius', 'page_height', 'page_gap']],
];
const PAGE_ALL = PAGE_GROUPS.flatMap(([, , k]) => k);
const PAGE_BASE = { page_show_icon: true, page_show_label: true, page_icon_pos: 'beside', page_text_px: 14, page_weight: '600', page_icon_px: 18, page_radius: 8, page_height: 36,
  page_gap: 6, page_border_width: 0, page_underline: false, page_grad: false, page_grad_sides: 'top_bottom', page_grad_width: 1, page_glow: 'off', page_glow_blur: 14,
  page_glow_spread: 2, page_glow_opacity: 55, page_shadow: false, page_shadow_x: 0, page_shadow_y: 4, page_shadow_blur: 12, page_shadow_spread: 0, page_shadow_opacity: 35 };
const PAGE_PRESETS = {
  standard: { name: 'Standard (icon above the name)', ...PAGE_BASE, page_icon_pos: 'above', page_text_px: 11, page_icon_px: 22, page_radius: 10, page_height: 52, page_gap: 2 },
  underline: { name: 'Underline', ...PAGE_BASE, page_show_icon: false, page_weight: '700', page_gap: 4, page_underline: true },
  pill: { name: 'Pill', ...PAGE_BASE, page_radius: 999 },
  outline: { name: 'Outline', ...PAGE_BASE, page_radius: 999, page_border_width: 1 },
  glass: { name: 'Glass', ...PAGE_BASE, page_radius: 12, page_height: 38, page_border_width: 1, page_glow: 'active', page_shadow: true, page_shadow_blur: 14, page_shadow_opacity: 25 },
  neon: { name: 'Neon', ...PAGE_BASE, page_grad: true, page_glow: 'active', page_shadow: true, page_shadow_opacity: 50 },
};
/** The page buttons' settings: the preset, with the checked groups' own values on top. */
/** A saved preset of this card: { name, base (a built-in), groups, values }. page_style 'custom:<id>' picks one. */
const savedPreset = (c, style = c.page_style) => (String(style || '').startsWith('custom:') ? (c.page_presets || {})[String(style).slice(7)] || null : null);
/** The look of the chosen preset alone (built-in, or saved = its built-in base with its own groups on top). */
function presetLook(c) {
  const sp = savedPreset(c);
  const base = sp ? (PAGE_PRESETS[sp.base] ? sp.base : 'standard') : PAGE_PRESETS[c.page_style] ? c.page_style : 'standard';
  const out = { style: base, ...PAGE_PRESETS[base] };
  if (sp) { const on = new Set(sp.groups || []); for (const [g, , keys] of PAGE_GROUPS) if (on.has(g)) for (const k of keys) if (sp.values?.[k] !== undefined) out[k] = sp.values[k]; }
  return out;
}
/** The page buttons' settings: the preset, with the card's checked groups on top. */
function pageLook(c) {
  const out = presetLook(c);
  const on = new Set(Array.isArray(c.page_groups) ? c.page_groups : []);
  for (const [g, , keys] of PAGE_GROUPS) if (on.has(g)) for (const k of keys) if (c[k] !== undefined) out[k] = c[k];
  if (!out.page_show_icon && !out.page_show_label) out.page_show_label = true;
  return out;
}
/** Everything that makes the current look, flattened onto a built-in base: for export and for saving a preset. */
function flatPageStyle(c) {
  const sp = savedPreset(c), base = presetLook(c).style;
  const groups = new Set([...(sp?.groups || []), ...(Array.isArray(c.page_groups) ? c.page_groups : [])]);
  const values = {};
  for (const [g, , keys] of PAGE_GROUPS) {
    if (!groups.has(g)) continue;
    for (const k of keys) { const v = (Array.isArray(c.page_groups) && c.page_groups.includes(g) && c[k] !== undefined) ? c[k] : sp?.values?.[k]; if (v !== undefined) values[k] = v; }
  }
  return { base, groups: PAGE_GROUPS.map(([g]) => g).filter((g) => groups.has(g)), values };
}
/** Export: the page button style as text (page icons stay with the card: they name its own pages). */
function exportPageStyle(c) {
  const f = flatPageStyle(c), sp = savedPreset(c);
  const style = { page_style: f.base, ...(f.groups.length ? { page_groups: f.groups } : {}), ...f.values };
  return { kind: 'plex-center/page-style', v: 1, ...(sp?.name ? { name: sp.name } : {}), style };
}
const HEX = (v) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : '');
/** A Color Light Manager Button Style (flat, a { layers } stack, or the library envelope) → page style settings. */
function fromClmButtonStyle(o) {
  if (o && typeof o === 'object' && o.color_light_manager_button_styles !== undefined) {
    const presets = Object.values(o.presets || {});
    if (!presets.length) throw new Error('The Button Styles export has no styles in it.');
    o = presets[0];
  }
  if (o && Array.isArray(o.layers)) o = Object.assign({}, ...o.layers.map((l) => l?.groups || {}));
  else if (o && o.groups && typeof o.groups === 'object') o = o.groups;
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const out = { page_style: 'neon', page_show_icon: true, page_show_label: true, page_icon_pos: 'beside' };
  const bg = o.button_style;
  if (bg === 'transparent') { out.page_bg = 'transparent'; out.page_active_bg = 'transparent'; }
  const bw = o.button_border_enabled ? Math.max(1, num(o.button_border_width, 1)) : 0;
  out.page_border_width = bw;
  if (bw && o.button_border_color_mode !== 'match' && HEX(o.button_border_color)) out.page_border_color = out.page_active_border_color = HEX(o.button_border_color);
  const g = o.button_border_gradient || {};
  out.page_grad = !!g.enabled;
  if (g.enabled) {
    const sd = g.sides || {}, on = ['top', 'bottom', 'left', 'right'].filter((x) => sd[x]);
    out.page_grad_sides = on.length === 4 ? 'all' : on.join(',') === 'top,bottom' ? 'top_bottom' : on.includes('bottom') ? 'bottom' : on.includes('top') ? 'top' : 'top_bottom';
    out.page_grad_width = Math.max(1, num(g.width, 1));
    const mid = (g.stops || []).map((x) => x?.color).find((x) => x && x !== 'transparent');
    if (HEX(mid)) out.page_grad_color = HEX(mid);   // "match" (the light's color) becomes the Accent
  }
  out.page_glow = !o.button_glow_enabled ? 'off' : o.button_glow_condition === 'always' ? 'always' : 'active';
  if (o.button_glow_enabled) {
    if (HEX(o.button_glow_color) && o.button_glow_color_mode !== 'match') out.page_glow_color = HEX(o.button_glow_color);
    out.page_glow_blur = num(o.button_glow_blur, 14); out.page_glow_spread = num(o.button_glow_spread, 2);
    out.page_glow_opacity = Math.round(Math.min(1, num(o.button_glow_opacity, 0.55) * num(o.button_glow_intensity, 1)) * 100);
  }
  out.page_shadow = !!o.button_shadow_enabled;
  if (o.button_shadow_enabled) {
    if (HEX(o.button_shadow_color)) out.page_shadow_color = HEX(o.button_shadow_color);
    for (const k of ['x', 'y', 'blur', 'spread']) out[`page_shadow_${k}`] = num(o[`button_shadow_${k}`], PAGE_BASE[`page_shadow_${k}`]);
    out.page_shadow_opacity = Math.round(Math.min(1, num(o.button_shadow_opacity, 0.35)) * 100);
  }
  if (num(o.button_font_size, 0) > 0) out.page_text_px = num(o.button_font_size, 14);
  if (['400', '500', '600', '700', '800'].includes(String(o.button_name_weight))) out.page_weight = String(o.button_name_weight);
  if (o.button_name_color_mode !== 'inherit' && HEX(o.button_name_color)) out.page_text_color = out.page_active_text_color = HEX(o.button_name_color);
  if (num(o.button_icon_size, 0) > 0) out.page_icon_px = num(o.button_icon_size, 18);
  if (o.button_icon_color_mode !== 'match' && HEX(o.button_icon_color)) out.page_icon_color = out.page_active_icon_color = HEX(o.button_icon_color);
  if (o.button_border_radius !== undefined) out.page_radius = num(o.button_border_radius, 8);
  if (num(o.button_height, 0) > 0) out.page_height = num(o.button_height, 36);
  if (o.gap !== undefined) out.page_gap = num(o.gap, 6);
  out.page_groups = PAGE_GROUPS.map(([gr]) => gr);
  return out;
}
/** Import: our export, or a Color Light Manager Button Style. Returns the settings to apply (throws with a readable reason). */
function importPageStyle(text) {
  let o;
  try { o = JSON.parse(String(text || '').trim()); } catch { throw new Error('That isn\'t valid JSON.'); }
  if (!o || typeof o !== 'object') throw new Error('That isn\'t a style.');
  let st;
  if (o.kind === 'plex-center/page-style') st = { ...(o.style || {}) };
  else if (Object.keys(o).some((k) => k.startsWith('button_')) || o.layers || o.groups || o.color_light_manager_button_styles !== undefined) st = fromClmButtonStyle(o);
  else throw new Error('Not a Plex Center page style or a Color Light Manager Button Style.');
  const out = {};
  if (PAGE_PRESETS[st.page_style]) out.page_style = st.page_style;
  if (Array.isArray(st.page_groups)) out.page_groups = st.page_groups.filter((g) => PAGE_GROUPS.some(([x]) => x === g));
  for (const k of PAGE_ALL) if (st[k] !== undefined && st[k] !== '') out[k] = COLOR_DEFS[k] ? String(st[k]).replace(/[;{}<>]/g, '') : st[k];
  return out;
}

/** Page buttons markup (the card and the editor's sample): items = [{ id, title, icon, on, attr }]. */
function pageButtonsHtml(c, items) {
  const pl = pageLook(c), n = (k) => Number(pl[k]) || 0, pct = (k) => Math.max(0, Math.min(100, n(k)));
  const shadow = pl.page_shadow ? `${n('page_shadow_x')}px ${n('page_shadow_y')}px ${n('page_shadow_blur')}px ${n('page_shadow_spread')}px color-mix(in srgb, var(--pmu-shc, #000) ${pct('page_shadow_opacity')}%, transparent)` : '';
  const glow = `0 0 ${n('page_glow_blur')}px ${n('page_glow_spread')}px color-mix(in srgb, var(--pmu-glc, var(--plc-a)) ${pct('page_glow_opacity')}%, transparent)`;
  const list = (xs) => xs.filter(Boolean).join(', ') || 'none';
  const bs = list([shadow, pl.page_glow === 'always' && glow]);
  const bsa = list([shadow, pl.page_glow !== 'off' && glow, pl.page_underline && 'inset 0 -2px 0 var(--pmu-abc, var(--plc-a))']);
  let grad = '';
  if (pl.page_grad) {
    const w = Math.max(1, n('page_grad_width')), sides = { top_bottom: ['top', 'bottom'], top: ['top'], bottom: ['bottom'], all: ['top', 'bottom', 'left', 'right'] }[pl.page_grad_sides] || ['top', 'bottom'];
    const img = (col) => sides.map((sd) => `linear-gradient(${sd === 'left' || sd === 'right' ? 180 : 90}deg, transparent, ${col}, transparent)`).join(', ');
    grad = `--pm-gi:${img('var(--pmu-gc, var(--plc-a))')};--pm-gia:${img('var(--pmu-agc, var(--pmu-gc, var(--plc-a)))')};--pm-gp:${sides.join(', ')};`
      + `--pm-gs:${sides.map((sd) => (sd === 'left' || sd === 'right' ? `${w}px 100%` : `100% ${w}px`)).join(', ')};`;
  }
  // The bar scrolls sideways, and a scrolling box clips what's drawn outside it: give the glow / shadow room inside.
  const reach = Math.max(pl.page_glow !== 'off' ? n('page_glow_blur') + n('page_glow_spread') : 0,
    pl.page_shadow ? n('page_shadow_blur') + Math.max(0, n('page_shadow_spread')) + Math.max(Math.abs(n('page_shadow_x')), Math.abs(n('page_shadow_y'))) : 0);
  const pad = Math.min(24, Math.ceil(reach));
  const vars = `--pm-pad:${pad}px;--pm-fs:${n('page_text_px')}px;--pm-is:${n('page_icon_px')}px;--pm-r:${n('page_radius')}px;--pm-h:${n('page_height')}px;--pm-gap:${n('page_gap')}px;`
    + `--pm-bw:${n('page_border_width')}px;--pm-fw:${esc(String(pl.page_weight))};--pm-bs:${bs};--pm-bsa:${bsa};${grad}`;
  const cls = `plc-tabs pm pm-${pl.style}${pl.page_icon_pos === 'above' ? ' pm-above' : ''}`;
  return `<div class="${cls}" role="tablist" style="${vars}">${items.map((t) => `<button class="plc-tab${t.on ? ' on' : ''}" ${t.attr || ''} title="${esc(t.title)}">${
    pl.page_show_icon ? `<ha-icon icon="${esc(t.icon)}"></ha-icon>` : ''}${pl.page_show_label ? `<span class="plc-tab-n">${esc(t.title)}</span>` : ''}</button>`).join('')}</div>`;
}
const SIZE_PX = { title_size: { large: 17, medium: 14, small: 12 }, line_size: { large: 14, medium: 12, small: 11 } };
const SHADOWS = { none: 'none', soft: '0 2px 8px rgba(0,0,0,.25)', strong: '0 8px 28px rgba(0,0,0,.55)' };
const HEADER_ITEMS = [['title', 'Title'], ['tabs', 'Page menu (Home and libraries)'], ['search', 'Search'], ['surprise', 'Surprise me'],
  ['watched', 'All / Unwatched'], ['genre', 'Genre'], ['decade', 'Decade'], ['rating', 'Content rating'], ['length', 'Under 2 h (movies)'],
  ['sort', 'Sort'], ['view', 'Grid / list switch'], ['filterbtn', 'Filters button (opens the Filters popup)'], ['achips', 'Active filters (a chip per filter that is on)'], ['watchchip', 'Watching now (a chip that opens the cards)'], ['tvs', 'TV picker']];
const SORT_OPTS = [['title', 'A → Z'], ['added', 'Recently added'], ['released', 'Release date'], ['year', 'Year'], ['rating', 'Rating'], ['viewed', 'Last watched']];
const FLABEL = { watched: 'Show', genre: 'Genre', decade: 'Decade', rating: 'Rating', sort: 'Sort', length: 'Length', view: 'View' };
/** An icon for each controls-layout item (editor list). */
const ITEM_ICONS = { title: 'mdi:format-title', tabs: 'mdi:tab', search: 'mdi:magnify', surprise: 'mdi:auto-fix', watched: 'mdi:eye-check-outline',
  genre: 'mdi:drama-masks', decade: 'mdi:calendar-range', rating: 'mdi:shield-account-outline', length: 'mdi:timer-outline', sort: 'mdi:sort',
  view: 'mdi:view-grid-outline', filterbtn: 'mdi:filter-variant', achips: 'mdi:filter-check-outline', watchchip: 'mdi:account-eye', tvs: 'mdi:television' };
/** Library filter items: each can sit in the header / footer or in the Filters popup. */
const FILTER_IDS = new Set(['watched', 'genre', 'decade', 'rating', 'length', 'sort', 'view']);
/** Styles an item can be shown in (first = default). */
const ITEM_STYLES = { watched: [['buttons', 'All | Unwatched buttons'], ['chip', 'A chip with a menu']],
  genre: [['chip', 'A chip with a menu'], ['dropdown', 'A dropdown']], decade: [['chip', 'A chip with a menu'], ['dropdown', 'A dropdown']],
  rating: [['chip', 'A chip with a menu'], ['dropdown', 'A dropdown']], sort: [['chip', 'A chip with a menu'], ['dropdown', 'A dropdown']] };
const DEFAULT_HEADER = [
  { id: 'title', section: 'library', row: 1, align: 'left' }, { id: 'tabs', section: 'library', row: 1, align: 'left' },
  { id: 'search', section: 'library', row: 1, align: 'right' }, { id: 'surprise', section: 'library', row: 1, align: 'right' },
  ...['watched', 'genre', 'decade', 'rating', 'length', 'sort', 'view', 'filterbtn'].map((id) => ({ id, section: 'library', row: 1, align: 'right' })),
  { id: 'tvs', section: 'library', row: 2, align: 'left' }, { id: 'achips', section: 'library', row: 3, align: 'left', hidden: true },
  { id: 'watchchip', section: 'library', row: 1, align: 'right', hidden: true }];
const DEFAULT_HEADER_PHONE = [
  { id: 'title', section: 'library', row: 1, align: 'left', hidden: true }, { id: 'tabs', section: 'library', row: 1, align: 'left' },
  { id: 'search', section: 'library', row: 1, align: 'right' }, { id: 'surprise', section: 'library', row: 1, align: 'right' },
  ...['watched', 'genre', 'decade', 'rating', 'length', 'sort', 'view'].map((id) => ({ id, section: 'popover', row: 1, align: 'right' })),
  { id: 'filterbtn', section: 'library', row: 1, align: 'right' }, { id: 'tvs', section: 'library', row: 1, align: 'right' },
  { id: 'achips', section: 'library', row: 2, align: 'left', hidden: true }, { id: 'watchchip', section: 'library', row: 1, align: 'right', hidden: true }];
const ALIGNS = ['left', 'center', 'right'];
const PLACES = ['library', 'player', 'footer', 'popover'];
const HOME_BUILTIN = [['watching', 'Watching now'], ['continue', 'Continue watching'], ['next', 'Next Episode'], ['recent', 'Recently Added'], ['soon', 'Coming Soon']];
const SEC_TYPE_TITLE = { recent: 'Recently Added', upcoming: 'Coming Soon', plexhub: 'Plex row' };
const SEC_TYPE_ICON = { recent: 'mdi:plex', upcoming: 'mdi:calendar-clock', plexhub: 'mdi:star-shooting-outline', sensor: 'mdi:view-carousel' };
const SEC_KIND = { recent: 'recent', upcoming: 'soon', plexhub: 'hub' };
/** Section type of an id: 'recent' | 'upcoming' | 'sensor' | null. */
function secType(c, id) {
  if (id === 'recent') return 'recent';
  if (id === 'soon') return 'upcoming';
  const x = (c.home_extra || []).find((e) => e.id === id);
  return x ? x.type : null;
}
/** Upcoming-media sensors that list coming releases (not Plex's own recently added), with what they hold. */
function upcomingSensors(hass, conf) {
  return (conf?.upcoming_sensors || []).filter((id) => !/recently_added/i.test(id)).map((id) => ({
    id, kind: /radarr|movie/i.test(id) ? 'movie' : /sonarr|tv|show|episode/i.test(id) ? 'show' : 'both' }));
}
/** The four screens, each with its own full set of display settings (no sharing between them). */
const SCREENS = [['tablet_landscape', 'Tablet / computer: landscape'], ['tablet_portrait', 'Tablet / computer: portrait'],
  ['phone_portrait', 'Phone: portrait'], ['phone_landscape', 'Phone: landscape']];
const SCREEN_SETTINGS = {
  tablet: { scale: 100, view: 'grid', search: 'field', tvs: 'chips', tabs: 'tabs', filters: 'layout', header: 'main', hide: false, swipe: false, now_playing: 'panel', footer_sticky: false },
  phone: { scale: 100, view: 'grid', search: 'icon', tvs: 'button', tabs: 'tabs', filters: 'popover', header: 'one_row', hide: true, swipe: false, now_playing: 'off', footer_sticky: true },
};
const SCREEN_ACROSS = { tablet_landscape: 6, tablet_portrait: 4, phone_portrait: 3, phone_landscape: 5 };
const SCREEN_DEFAULTS = Object.fromEntries(SCREENS.flatMap(([sc]) => Object.entries({ ...SCREEN_SETTINGS[sc.split('_')[0]], across: SCREEN_ACROSS[sc],
  ...(sc === 'phone_portrait' ? { tabs: 'chip' } : {}) }).map(([k, v]) => [`${sc}_${k}`, v])));

// ---------------------------------------------------------------------------------------------------- item look
/** Kinds of item, each with its own look per screen type (Appearance → Rows; the Calendar's in its panel for now). */
const ITEM_KINDS = [['watching', 'Watching now'], ['continue', 'Continue watching'], ['next', 'Next Episode'], ['recent', 'Recently Added'], ['soon', 'Coming Soon'],
  ['hub', 'Plex rows'], ['library', 'Library grid'], ['calendar', 'Calendar']];
/** The text lines of an item: [id, label, default size px, default weight]. */
const LOOK_LINES = [['title', 'Title', 15, '700'], ['info', 'Episode / release info', 12, '600'], ['when', 'Air date and time', 12, '400'], ['meta', 'Network / studio · runtime', 11, '400'],
  ['extra', 'Line 4', 12, '400']];
const LOOK_BASE = { image: 'poster', border: true, type_icon: false, time_corner: false, status: true, text_bg: 'gradient', text_bg_opacity: 90, text_bg_dir: 'bottom', text_bg_reach: 65, text_bg_start: 0, text_bg_blur: 0, box_dir: 'none', box_start: 50, fade_width: 62, fade_dist: 45, fade_start: 0,
  ...Object.fromEntries(LOOK_LINES.flatMap(([id, , px, w]) => [[`${id}_show`, true], [`${id}_px`, px], [`${id}_weight`, w], [`${id}_color`, '']])) };
const LOOK_KEYS = Object.keys(LOOK_BASE);
/** Defaults per kind: rows have no border unless asked for; the Calendar has its type-colour border. */
const ROW_TEXT = { title_px: 14, title_weight: '700', ...Object.fromEntries(['info', 'when', 'meta', 'extra'].flatMap((id) => [[`${id}_px`, 12], [`${id}_weight`, '400']])) };
const lookBase = (kind) => (kind === 'calendar' ? LOOK_BASE : { ...LOOK_BASE, border: false, ...ROW_TEXT });
/** The look of a kind on a screen: built-in defaults with the card's values on top. */
function lookFor(c, kind, screen) {
  const own = (c.looks || {})[`${kind}:${screen}`] || {};
  const out = { ...lookBase(kind), ...(kind === 'calendar' ? {} : { image: cfg(c, 'image_style') === 'fanart' ? 'fanart' : 'poster' }) };
  for (const k of LOOK_KEYS) if (own[k] !== undefined && own[k] !== '') out[k] = own[k];
  return out;
}
function cleanLooks(c) {
  // 2026.11.16.52: the card-wide image style and a row's line sizes / colours (Info Lines) are per screen Visuals now
  if (c.image_style === 'fanart') {
    const looks = { ...(c.looks || {}) };
    for (const kind of ['watching', 'continue', 'library', ...homeSections(c).map(([id]) => id).filter((id) => /^(recent|soon|hub)/.test(id))]) for (const [sc] of SCREENS) {
      const k = `${kind}:${sc}`; if (!(looks[k] && looks[k].image)) looks[k] = { ...(looks[k] || {}), image: 'fanart' };
    }
    c.looks = looks;
  }
  delete c.image_style;
  for (const [id, st] of Object.entries(c.home_style || {})) {
    if (!st) continue;
    const moved = {};
    [['l1', 'info'], ['l2', 'when'], ['l3', 'meta'], ['l4', 'extra']].forEach(([o, n]) => {
      if (st[`${o}_px`] !== undefined) { moved[`${n}_px`] = Number(st[`${o}_px`]); delete st[`${o}_px`]; }
      if (st[`${o}_color`]) { moved[`${n}_color`] = st[`${o}_color`]; delete st[`${o}_color`]; }
    });
    if (!Object.keys(moved).length) continue;
    const looks = { ...(c.looks || {}) };
    for (const [sc] of SCREENS) { const k = `${id}:${sc}`; looks[k] = { ...moved, ...(looks[k] || {}) }; }
    c.looks = looks;
  }
  // 2026.11.16.51: a Home row's image (its old pencil setting) is per screen now: copied to every screen type
  for (const [id, st] of Object.entries(c.home_style || {})) {
    if (!st || !['poster', 'fanart'].includes(st.image)) continue;
    const looks = { ...(c.looks || {}) };
    for (const [sc] of SCREENS) { const k = `${id}:${sc}`; if (!(looks[k] && looks[k].image)) looks[k] = { ...(looks[k] || {}), image: st.image }; }
    c.looks = looks; delete st.image;
  }
  if (!c.looks || typeof c.looks !== 'object') { delete c.looks; return; }
  for (const [sc] of SCREENS) {
    const kl = c.looks[`hub:${sc}`];
    if (!kl) continue;
    for (const id of homeSections(c).map(([x]) => x).filter((x) => /^hub-\d+$/.test(x))) c.looks[`${id}:${sc}`] = { ...kl, ...(c.looks[`${id}:${sc}`] || {}) };
    delete c.looks[`hub:${sc}`];
  }
  const out = {};
  for (const [lk, o] of Object.entries(c.looks)) {
    const [kind, screen] = String(lk).split(':');
    if (!(ITEM_KINDS.some(([k]) => k === kind) || /^(recent|soon|hub)-\d+$/.test(kind)) || !SCREENS.some(([sc]) => sc === screen) || !o || typeof o !== 'object') continue;
    const keep = {}, base = lookBase(kind);
    for (const k of LOOK_KEYS) {
      let v = o[k];
      if (v === undefined || v === null || v === '' || (v === base[k] && (k !== 'image' || kind === 'calendar'))) continue;
      if (k.endsWith('_px')) { v = Number(v); if (!Number.isFinite(v) || v === base[k]) continue; }
      if (k.endsWith('_color')) v = String(v).replace(/[;{}<>]/g, '');
      if (k === 'image' && !['poster', 'fanart', 'fade'].includes(v)) continue;
      if (k === 'text_bg' && !['gradient', 'box', 'none'].includes(v)) continue;
      if (['text_bg_opacity', 'text_bg_reach', 'text_bg_start', 'text_bg_blur', 'box_start', 'fade_width', 'fade_dist', 'fade_start'].includes(k)) { v = Math.max(0, Math.min(100, Number(v))); if (!Number.isFinite(v) || v === base[k]) continue; }
      if (k === 'text_bg_dir' && !GRAD_DIRS.some(([d]) => d === v)) continue;
      if (k === 'box_dir' && v !== 'none' && !GRAD_DIRS.some(([d]) => d === v)) continue;
      keep[k] = v;
    }
    const fl = cleanFields(kind, o.fields);
    if (fl) keep.fields = fl;
    if (Object.keys(keep).length) out[lk] = keep;
  }
  if (Object.keys(out).length) c.looks = out; else delete c.looks;
}
/** Text fields: what each kind of item can show, and where it goes by default: [id, label, line (0 = hidden), order]. */
const FIELD_SETS = {
  cal: [['title', 'Title', 1, 1], ['badge', 'New season / Premiere / Finale', 2, 1], ['episode', 'Episode (S01E02)', 2, 2], ['eptitle', 'Episode title', 2, 3],
    ['release', 'Release type (movies)', 2, 4], ['date', 'Air date', 3, 1], ['time', 'Time', 3, 2], ['network', 'Network / studio', 4, 1], ['runtime', 'Runtime', 4, 2]],
  row: [['title', 'Title', 1, 1], ['eptitle', 'Episode title', 2, 1], ['release', 'Release / added (day, date and time)', 3, 1], ['number', 'Episode (S01E02)', 4, 1],
    ['rating', 'Rating', 4, 2], ['runtime', 'Runtime', 4, 3], ['genres', 'Genres', 5, 1], ['year', 'Year', 2, 2, true], ['day', 'Day', 3, 2, true], ['date', 'Date', 3, 3, true],
    ['time', 'Time', 3, 4, true], ['studio', 'Studio / network', 4, 4, true]],
  watch: [['title', 'Title', 1, 1], ['number', 'Episode (S1 · E2)', 2, 1], ['eptitle', 'Episode title', 2, 2], ['year', 'Year (movies)', 2, 3],
    ['viewer', 'Who and where (user · player)', 3, 1], ['state', 'Paused', 3, 2]],
};
const fieldFamily = (kind) => (kind === 'calendar' ? 'cal' : kind === 'watching' ? 'watch' : 'row');
/** Old per-line "show" switches (title / info / when / meta / extra = lines 1–5) still hide the fields of that line. */
const LINE_IDS = ['title', 'info', 'when', 'meta', 'extra'];
/** The fields of a kind on a screen: id → { line, pos, px?, weight?, color? } (the defaults with what the card sets on top). */
function fieldLayout(kind, own = {}) {
  const set = own.fields && typeof own.fields === 'object' ? own.fields : null, out = {};
  for (const [id, , line, pos, hid] of FIELD_SETS[fieldFamily(kind)]) {
    const o = set?.[id] || {};
    const oldHide = !set && own[`${LINE_IDS[line - 1]}_show`] === false;
    // line 0 was "hidden" before the checkbox: keep the default line, hide it
    const ln = o.line !== undefined && Number(o.line) > 0 ? Number(o.line) : line;
    const hidden = o.hidden !== undefined ? !!o.hidden : (o.line !== undefined && Number(o.line) === 0) ? true : (set ? false : (!!hid || oldHide));
    out[id] = { line: ln, pos: o.pos !== undefined ? o.pos : pos, hidden };
    for (const k of ['px', 'weight', 'color']) if (o[k] !== undefined && o[k] !== '') out[id][k] = o[k];
  }
  return out;
}
function cleanFields(kind, f) {
  if (!f || typeof f !== 'object') return null;
  const out = {};
  for (const [id] of FIELD_SETS[fieldFamily(kind)]) {
    const o = f[id];
    if (!o || typeof o !== 'object') continue;
    const r = { line: Math.max(1, Math.min(5, Math.round(Number(o.line) || 1))), pos: Math.max(1, Math.min(9, Math.round(Number(o.pos) || 1))), hidden: !!o.hidden || Number(o.line) === 0 };
    if (Number.isFinite(Number(o.px)) && o.px !== '' && o.px != null) r.px = Math.max(8, Math.min(40, Number(o.px)));
    if (['400', '500', '600', '700', '800'].includes(String(o.weight))) r.weight = String(o.weight);
    if (o.color) r.color = String(o.color).replace(/[;{}<>"]/g, '');
    out[id] = r;
  }
  return Object.keys(out).length ? out : null;
}
/** The lines of an item: [[line no, html]] in order, each field a span (its own size / weight / colour), " · " between. */
function fieldLines(kind, own, vals) {
  const lay = fieldLayout(kind, own), lines = {};
  for (const [id] of FIELD_SETS[fieldFamily(kind)]) {
    const f = lay[id], v = vals[id];
    if (f.hidden || v == null || v === '') continue;
    const st = [f.px ? `font-size:${Number(f.px)}px` : '', f.weight ? `font-weight:${f.weight}` : '', f.color ? `color:${f.color}` : ''].filter(Boolean).join(';');
    (lines[f.line] ||= []).push([f.pos, `<span class="plc-fv" data-f="${id}"${st ? ` style="${st}"` : ''}>${esc(v)}</span>`]);
  }
  return Object.keys(lines).map(Number).sort((a, b) => a - b).map((n) => [n, lines[n].sort((a, b) => a[0] - b[0]).map(([, h]) => h).join('<span class="plc-fsep"> · </span>')]);
}
/** A row item's text from its fields: line 1 as the title, the others as the info lines. */
function rowFieldsHtml(own, vals) {
  return fieldLines('row', own, vals).map(([n, h], i) => (i === 0 ? `<div class="plc-t">${h}</div>` : `<div class="plc-s l${Math.min(4, n - 1)}">${h}</div>`)).join('');
}
/** A row item's field values (Plex items and upcoming-media / Sonarr-Radarr items alike). */
function rowVals(it, c) {
  const u = it.umc && it.umc.title ? it.umc : plexAsUmc(it), k = umcKeys(u, c);
  return { title: k.$title, eptitle: k.$episode, release: String(u.release || '').includes('$') ? umcLines(u, { line1_default: u.release }, c)[1] : k.$release,
    number: k.$number, rating: k.$rating, runtime: k.$runtime, genres: k.$genres, year: it.year || u.year || '', day: k.$day, date: k.$date, time: k.$time, studio: k.$studio };
}

/** What a flag can say about an item: [id, label, icon]. */
/** A movie's release types (Radarr), as the Coming Soon section can pick them. */
const REL_TYPES = [['cinema', 'In cinemas'], ['digital', 'Digital'], ['physical', 'Disc (Blu-ray / DVD)']];
const FACTS = [['premiere', 'Premiere', 'mdi:star-shooting-outline'], ['season', 'New season', 'mdi:numeric-1-box-multiple-outline'],
  ['finale', 'Finale', 'mdi:flag-checkered'], ['trailer', 'Trailer', 'mdi:movie-play-outline'], ['new', 'New', 'mdi:new-box']];
/** The facts that hold for an item ([id, label, icon]), in FACTS order, limited to the section's choice. */
function itemFacts(it, want) {
  const ev = it.ev || {}, fin = String(ev.finale || '');
  const has = { premiere: ev.premiere === 'series', season: ev.premiere === 'season', finale: !!fin, trailer: !!(it.trailer || it.trailer_key), new: !it.ev && !!it.flag };
  return FACTS.filter(([id]) => has[id] && want.includes(id))
    .map(([id, label, icon]) => [id, id === 'finale' && fin && fin !== 'true' ? `${fin[0].toUpperCase()}${fin.slice(1)} finale` : label, icon]);
}
/** A section's flags for an item: the corner / info icon (a flag set) or icons / labels for what it is; the trailer one plays it. */
function flagsHtml(it, st, ref, where = 'li') {
  if (!st.flag) return '';
  if (st.flag_style === 'icons' || st.flag_style === 'labels') {
    const f = itemFacts(it, st.flag_items);
    if (!f.length) return '';
    const one = ([id, label, icon]) => {
      const inner = st.flag_style === 'labels' ? `${id === 'trailer' ? '<ha-icon icon="mdi:play"></ha-icon>' : ''}${esc(label)}` : `<ha-icon icon="${icon}"></ha-icon>`;
      return id === 'trailer' ? `<span class="plc-flagi ${st.flag_style} go" role="button" tabindex="0" data-trailerli="${esc(ref)}" title="Play the trailer">${inner}</span>`
        : `<span class="plc-flagi ${st.flag_style}" title="${esc(label)}">${inner}</span>`;
    };
    return `<span class="plc-facts ${where}" style="--plc-fact-px:${st.flag_px}px">${f.map(one).join('')}</span>`;
  }
  if (!it.flag) return '';
  const why = esc(it.flag_text || 'New');
  if (where === 'tile') return `<span class="plc-badge" title="${why}">${esc(it.flag_text || 'New')}</span>`;
  return st.flag_style === 'info' ? `<ha-icon class="plc-li-info" icon="mdi:information-outline" title="${why}"></ha-icon>` : `<span class="plc-li-flag" title="${why}"></span>`;
}

/** Fanart text backdrop gradients: where the dark side is. */
const GRAD_DIRS = [['bottom', 'Bottom to top'], ['top', 'Top to bottom'], ['left', 'Left to right'], ['right', 'Right to left'], ['center', 'Center out'], ['edges', 'Out to center']];
/** The backdrop as a CSS background: dark at the chosen side, fading out over "reach" % of the image. */
function fanShade(l) {
  const a = Math.max(0, Math.min(100, Number(l.text_bg_opacity))) / 100, st = Math.max(0, Math.min(95, Number(l.text_bg_start) || 0));
  const r = Math.max(st + 5, Math.min(100, Number(l.text_bg_reach)));
  const c = (x) => `rgb(0 0 0 / ${Math.round(x * 1000) / 1000})`;
  const mid = Math.round(st + (r - st) * 0.45);
  const lin = (to) => `linear-gradient(to ${to}, ${c(a)} 0%, ${c(a)} ${st}%, ${c(a * 0.7)} ${mid}%, ${c(0)} ${r}%)`;
  switch (l.text_bg_dir) {
    case 'top': return lin('bottom');
    case 'left': return lin('right');
    case 'right': return lin('left');
    case 'center': return `radial-gradient(ellipse at center, ${c(a)} 0%, ${c(a)} ${st}%, ${c(a * 0.6)} ${mid}%, ${c(0)} ${r}%)`;
    case 'edges': return `radial-gradient(ellipse at center, ${c(0)} ${100 - r}%, ${c(a * 0.6)} ${100 - mid}%, ${c(a)} ${100 - st}%, ${c(a)} 100%)`;
    default: return lin('top');
  }
}
/** The box backdrop's fade (a mask): opaque from its dark side up to "start" %, then fading out. */
function boxMask(l) {
  const st = Math.max(0, Math.min(95, Number(l.box_start)));
  const lin = (to) => `linear-gradient(to ${to}, #000 ${st}%, transparent 100%)`;
  switch (l.box_dir) {
    case 'bottom': return lin('top');
    case 'top': return lin('bottom');
    case 'left': return lin('right');
    case 'right': return lin('left');
    case 'center': return `radial-gradient(closest-side, #000 ${st}%, transparent 100%)`;
    case 'edges': return `radial-gradient(closest-side, transparent ${100 - st}%, #000 100%)`;
    default: return 'none';
  }
}
/** The values a card has set for a kind on the screen it shows (no defaults): rows only change what was set. */
const lookOwn = (c, kind) => (c.looks || {})[`${kind}:${c._screen || 'tablet_landscape'}`] || {};
/** Row / grid look: CSS variables for what the look sets and the section doesn't (title → title, info → line 1, when → 2, meta → 3). */
function lookRowVars(own, s = {}) {
  const v = [], clean = (x) => String(x).replace(/[;{}<>"]/g, '');
  const map = [['title', 'title', 'title_px', 'title_color'], ['info', 'l1', 'l1_px', 'l1_color'], ['when', 'l2', 'l2_px', 'l2_color'], ['meta', 'l3', 'l3_px', 'l3_color'], ['extra', 'l4', 'l4_px', 'l4_color']];
  for (const [id, css, spx, scol] of map) {
    if (own[`${id}_px`] !== undefined && s[spx] === undefined) v.push(`--plc-${css}-px:${Number(own[`${id}_px`])}px`);
    if (own[`${id}_weight`] !== undefined) v.push(`--plc-${css}-w:${clean(own[`${id}_weight`])}`);
    if (own[`${id}_color`] && !s[scol]) v.push(`--plc-${css}-c:${clean(own[`${id}_color`])}`);
  }
  if (own.text_bg_opacity !== undefined) v.push(`--plc-fanbg-a:${Math.max(0, Math.min(100, Number(own.text_bg_opacity))) / 100}`);
  if (['text_bg_opacity', 'text_bg_dir', 'text_bg_reach', 'text_bg_start'].some((k) => own[k] !== undefined)) v.push(`--plc-fanbg:${fanShade({ ...LOOK_BASE, ...own })}`);
  if (own.text_bg_blur !== undefined) v.push(`--plc-fanbg-blur:${Number(own.text_bg_blur)}px`);
  if (own.box_dir !== undefined || own.box_start !== undefined) v.push(`--plc-boxmask:${boxMask({ ...LOOK_BASE, ...own })}`);
  if (own.fade_start !== undefined) v.push(`--plc-fade-s:${Number(own.fade_start)}%`);
  if (own.fade_width !== undefined) v.push(`--plc-fade-w:${Number(own.fade_width)}%`);
  if (own.fade_dist !== undefined) v.push(`--plc-fade-d:${Number(own.fade_dist)}%`);
  return v.join(';');
}
function lookRowClasses(own) {
  const l = { ...lookBase('rows'), ...own };
  return [l.border ? 'lk-bordered' : '', l.text_bg !== 'gradient' ? `lk-tbg-${l.text_bg}` : '', l.type_icon ? 'lk-type' : '', l.status ? '' : 'lk-nostatus',
    ...LOOK_LINES.filter(([id]) => !l[`${id}_show`]).map(([id]) => `lk-hide-${id}`)].filter(Boolean);
}
function applyLook(el, own, s = {}) {
  if (!el) return;
  [...el.classList].filter((x) => x.startsWith('lk-')).forEach((x) => el.classList.remove(x));
  lookRowClasses(own).forEach((x) => el.classList.add(x));
  const prev = new Set((el.dataset.lkv || '').split(';').filter(Boolean));
  const base = (el.getAttribute('style') || '').split(';').map((x) => x.trim()).filter((x) => x && !prev.has(x));
  const add = lookRowVars(own, s);
  el.dataset.lkv = add;
  el.setAttribute('style', [...base, ...add.split(';').filter(Boolean)].join(';'));
}

/** CSS variables for a look (sizes, weights, colours of each line). */
function lookVars(l) {
  return LOOK_LINES.map(([id]) => `--li-${id}-px:${Number(l[`${id}_px`])}px;--li-${id}-w:${esc(String(l[`${id}_weight`]))};${l[`${id}_color`] ? `--li-${id}-c:${String(l[`${id}_color`]).replace(/[;{}<>"]/g, '')};` : ''}`).join('');
}

const DEFAULTS = {
  ...SCREEN_DEFAULTS,
  page_style: 'standard',
  title: 'Plex',
  layout: 'auto',
  tv_picker: 'chips',
  tv_label: 'name',
  filters_mode: 'auto',
  phone_header: false,
  phone_compact: true,
  phone_tabs: 'tabs',
  swipe_tabs: false,
  hide_on_scroll: false,
  scale: 100,
  after_play: 'nowplaying',
  phone_across: 3,
  library_view: 'grid',
  jump_bar: true,
  remember_view: true,
  recent_searches: true,
  up_next: true,
  up_next_secs: 120,
  up_next_autoplay: false,
  across: 6,
  search_width: 280,
  client_choice: 'card',
  tap_action: 'details',
  start_tab: 'home',
  surprise: true,
  popup_target: true,
  local_app: 'auto',
  popup_timeout: 30,
  surprise_style: 'icon',
  surprise_icon: 'mdi:auto-fix',
  surprise_label: 'Surprise me',
  surprise_countdown: true,
  lock: false,
  now_playing: 'auto',
  watching_tvs: 'all',
  stagger_rotate: false,
  hold_play: true,
  hold_ms: 2000,
  hold_mark_ms: 2000,       // Mark watched / unwatched (0: a tap, then confirm)
  hold_markall_ms: 3000,    // a show's Mark all watched / unwatched (0: a tap, then confirm)
  np_power: false,
  watching_apps: true,
  watched_pct: 95,
  watching_resume: 'keep',
  watching_forget_h: 12,
  watching_resume_apps: false,
  watching_icon: true,
  watching_chevron: true,
  watching_chevron_pos: 'right',
  watching_chevron_px: 0,
  watching_chevron_weight: '',
  np_auto_open: false,
  watching_home: true,
  watching_cal: true,
  watching_lib: true,
  watching_coll_home: false,
  watching_coll_cal: false,
  watching_coll_lib: false,
  watching_collapsed_home: false,
  watching_collapsed_cal: false,
  watching_collapsed_lib: false,
  stagger_gap: 3,
  calendar: true,
  calendar_view: 'month',
  week_start: 'mon',
  calendar_max: 4,
  show_title: true,
  panel_when: 'always',
  fit_screen: true,
  screen_offset: 80,
  image_style: 'poster',
  max: 12,
  date: 'mm/dd',
  clock: '12',
  title_size: 14,
  line_size: 12,
  header_size: 20,
  section_size: 12,
  card_padding: 14,
  card_radius: 12,
  card_border_width: 1,
  card_shadow: 'theme',
  poster_width: 130,
  corner_radius: 10,
  box_shadows: true,
  text_shadows: false,
  flag: true,
};
// ------------------------------------------------------------------------------------------- helpers

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function colorMode(cur) {
  cur = cur == null ? '' : String(cur);
  if (cur === '') return 'default';
  if (/^#[0-9a-fA-F]{3,8}$/.test(cur)) return 'custom';
  if (/^var\(/.test(cur) && THEME_COLORS.some(([v]) => v === cur)) return 'theme';
  return 'css';
}


/** Merge defaults; keep only known shapes. Idempotent: normalize(normalize(c)) equals normalize(c). */
/** 2026.11.15.23: the phone preset and the scattered phone options become the Phone panel (phone_* keys). */
function migratePhone(c) {
  const put = (k, v) => { if (c[k] === undefined && v !== undefined) c[k] = v; };
  if ('phone_preset' in c) {
    if (c.phone_preset) {   // with the preset on, the card's own settings won (2026.11.15.22): keep that
      if (c.slim_position !== undefined) put('phone_slim_position', c.slim_position);
      if (c.now_playing === 'off') put('phone_now_playing', 'off');
      if (c.filters_mode === 'inline') put('phone_filters', 'inline');
      if ((Array.isArray(c.header) || c.tv_picker === 'dropdown') && c.phone_header === undefined && c.phone_compact === undefined) put('phone_header_mode', 'tablet');
    }
    delete c.phone_preset;
  }
  for (const o of ['portrait', 'landscape']) {
    if (c[`preset_${o}_scale`] !== undefined) put(`phone_${o}_scale`, Number(c[`preset_${o}_scale`]));
    if (c[`preset_${o}_across`] !== undefined) put(`phone_${o}_across`, Number(c[`preset_${o}_across`]));
    if (c.phone_across !== undefined) put(`phone_${o}_across`, Number(c.phone_across));
    if (c.phone_tabs !== undefined) put(`phone_${o}_tabs`, c.phone_tabs);
    delete c[`preset_${o}_scale`]; delete c[`preset_${o}_across`];
  }
  if (c.phone_header === true) put('phone_header_mode', 'own');
  else if (c.phone_compact === false) put('phone_header_mode', 'tablet');
  if (c.hide_on_scroll !== undefined) put('phone_hide_on_scroll', !!c.hide_on_scroll);
  for (const k of ['phone_across', 'phone_tabs', 'phone_header', 'phone_compact', 'hide_on_scroll']) delete c[k];
}

/** 2026.11.15.25: every display setting is per screen. Card-wide and phone-wide keys fill the screens they applied to. */
function migrateScreens(c) {
  const put = (sc, k, v) => { if (v !== undefined && c[`${sc}_${k}`] === undefined) c[`${sc}_${k}`] = v; };
  const tablets = ['tablet_landscape', 'tablet_portrait'], phones = ['phone_portrait', 'phone_landscape'], all = [...tablets, ...phones];
  for (const sc of tablets) {
    if (c.scale !== undefined) put(sc, 'scale', Number(c.scale));
    if (c.library_view !== undefined) put(sc, 'view', c.library_view);
    if (c.max !== undefined) put(sc, 'across', Number(c.max));
    if (c.tv_picker !== undefined) put(sc, 'tvs', c.tv_picker);
    if (c.filters_mode === 'popover' || c.filters_mode === 'inline') put(sc, 'filters', c.filters_mode);
    if (['panel', 'slim', 'off'].includes(c.now_playing)) put(sc, 'now_playing', c.now_playing);
    if (c.slim_position !== undefined) put(sc, 'slim_position', c.slim_position);
  }
  if (c.tv_picker === 'hidden') for (const sc of phones) put(sc, 'tvs', 'hidden');
  if (c.now_playing === 'off') for (const sc of phones) put(sc, 'now_playing', 'off');
  for (const sc of phones) {
    const mode = c.phone_header_mode;
    if (mode === 'tablet') { put(sc, 'header', 'main'); put(sc, 'search', 'field'); put(sc, 'tvs', c.tv_picker === 'dropdown' ? 'dropdown' : 'chips'); }
    else if (mode === 'own') { put(sc, 'header', 'own'); if (Array.isArray(c.header_phone) && !Array.isArray(c[`header_${sc}`])) c[`header_${sc}`] = c.header_phone; }
    if (c.phone_filters !== undefined) put(sc, 'filters', c.phone_filters);
    if (c.phone_view !== undefined) put(sc, 'view', c.phone_view);
    if (c.phone_now_playing !== undefined) put(sc, 'now_playing', c.phone_now_playing);
    if (c.phone_slim_position !== undefined) put(sc, 'slim_position', c.phone_slim_position);
    if (c.phone_hide_on_scroll !== undefined) put(sc, 'hide', !!c.phone_hide_on_scroll);
    if (c.swipe_tabs !== undefined) put(sc, 'swipe', !!c.swipe_tabs);
  }
  void all;
  for (const [sc] of SCREENS) for (const x of ['tabs', 'tvs']) if (c[`${sc}_${x}`] === 'dropdown') c[`${sc}_${x}`] = 'chip';
  for (const [sc] of SCREENS) if (c[`${sc}_filters`] === 'inline') c[`${sc}_filters`] = 'layout';   // 2026.11.16.38
  for (const [sc] of SCREENS) {   // 2026.11.16.42: the slim bar is gone (Watching now opens the controls)
    if (c[`${sc}_now_playing`] === 'slim') c[`${sc}_now_playing`] = 'off';
    delete c[`${sc}_slim_position`];
  }
  for (const [sc] of SCREENS) {   // 2026.11.15.28: the bottom tab bar is the page menu in the footer
    if (c[`${sc}_tabs`] !== 'bottom') continue;
    const list = legacyScreenList(c, sc).map((h) => (h.id === 'tabs' ? { ...h, section: 'footer', row: 1, align: 'center', hidden: undefined } : h));
    c[`header_${sc}`] = list.map((h) => Object.fromEntries(Object.entries(h).filter(([, v]) => v !== undefined)));
    c[`${sc}_header`] = 'own';
    c[`${sc}_tabs`] = 'tabs';
  }   // 2026.11.15.26: dropdowns → chip + menu
  delete c.slim_controls;
  if ('filter_chips' in c) {   // 2026.11.16.44: "Show the active filters as chips" is the Active filters item (its eye)
    if (c.filter_chips) {
      const show = (list) => list.map((h) => (h.id === 'achips' ? (({ hidden, ...rest }) => (void hidden, rest))(h) : h));
      c.header = show(headerLayout(c));
      for (const [sc] of SCREENS) {
        const mode = c[`${sc}_header`] ?? SCREEN_DEFAULTS[`${sc}_header`];
        if (mode === 'one_row' && !Array.isArray(c[`header_${sc}`])) { c[`${sc}_header`] = 'own'; c[`header_${sc}`] = show(DEFAULT_HEADER_PHONE.map((h) => ({ ...h }))); }
        else if (Array.isArray(c[`header_${sc}`])) c[`header_${sc}`] = show(legacyScreenList(c, sc));
      }
    }
    delete c.filter_chips;
  }
  for (const [sc, name] of SCREENS) {   // 2026.11.16.45: "Custom for this screen" lists become named, saved layouts
    if (c[`${sc}_header`] !== 'own' && !Array.isArray(c[`header_${sc}`])) continue;
    const compact = sc.startsWith('phone');
    const items = Array.isArray(c[`header_${sc}`]) ? c[`header_${sc}`] : (compact ? DEFAULT_HEADER_PHONE : DEFAULT_HEADER).map((h) => ({ ...h }));
    if (c[`${sc}_header`] === 'own') {
      const layouts = { ...(c.layouts || {}) };
      let id = sc;
      for (let i = 2; layouts[id]; i++) id = `${sc}_${i}`;
      layouts[id] = { name, base: compact ? 'compact' : 'standard', items };
      c.layouts = layouts;
      c[`${sc}_header`] = `lay:${id}`;
    }
    delete c[`header_${sc}`];
  }
  for (const k of ['scale', 'library_view', 'max', 'tv_picker', 'filters_mode', 'now_playing', 'slim_position', 'phone_header_mode', 'header_phone', 'phone_filters',
    'phone_view', 'phone_now_playing', 'phone_slim_position', 'phone_hide_on_scroll', 'swipe_tabs', 'poster_width', 'panel_when']) delete c[k];
}

/** 2026.11.17.71: Watching now gets Show / Collapsible / Start collapsed per page (Home, Calendar, Library). */
function migrateWatching(c) {
  if (c.watching_libraries === false) { c.watching_cal ??= false; c.watching_lib ??= false; }
  delete c.watching_libraries;
  if (c.watching_collapsible) for (const pg of WATCH_PAGES) c[`watching_coll_${pg}`] ??= true;
  delete c.watching_collapsible;
  if (c.watching_collapsed_lib && c.watching_collapsed_cal === undefined) c.watching_collapsed_cal = true;
}
const WATCH_PAGES = ['home', 'cal', 'lib'];
/** The page Watching now is on: home / cal / lib. */
const watchPage = (tab) => (tab === 'home' ? 'home' : tab === 'calendar' ? 'cal' : 'lib');
/** Whether Watching now shows on a page (Home also follows the Home order's visibility). */
const watchOn = (c, pg) => !!cfg(c, `watching_${pg}`) && (pg !== 'home' || homeVisible(c, 'watching'));

function normalizeConfig(raw) {
  const c = { ...(raw || {}) };
  delete c.type;
  for (const k of ['title_size', 'line_size']) if (typeof c[k] === 'string') c[k] = SIZE_PX[k][c[k]] ?? DEFAULTS[k];
  const hidden = new Set(Array.isArray(c.home_hidden) ? c.home_hidden : []);
  for (const [id] of HOME_BUILTIN) { if (c[`show_${id}`] === false) hidden.add(id); delete c[`show_${id}`]; }
  c.home_hidden = [...hidden];
  migratePhone(c);
  migrateWatching(c);
  cleanLooks(c);
  migrateScreens(c);
  for (const [k, v] of Object.entries(DEFAULTS)) if (c[k] === v) delete c[k];
  for (const k of Object.keys(c)) if (c[k] === '' || c[k] == null) delete c[k];
  if (Array.isArray(c.home_rows)) {
    c.home_rows = c.home_rows.filter((r) => r && r.sensor).map((r) => (r.title ? { sensor: r.sensor, title: r.title } : { sensor: r.sensor }));
    if (!c.home_rows.length) delete c.home_rows;
  } else delete c.home_rows;
  if (Array.isArray(c.home_rows) && c.home_rows.length) {   // 2026.11.14.11: sensor rows become Coming Soon / Recently Added sections
    const extra = Array.isArray(c.home_extra) ? [...c.home_extra] : [];
    const style = { ...(c.home_style || {}) };
    const swap = (list, from, to) => (Array.isArray(list) ? list.map((x) => (x === from ? to : x)) : list);
    for (const r of c.home_rows) {
      if (!r?.sensor) continue;
      const recent = /recently_added/i.test(r.sensor), pre = recent ? 'recent' : 'soon';
      let n = 2; while (extra.some((x) => x.id === `${pre}-${n}`)) n += 1;
      const id = `${pre}-${n}`, old = `row:${r.sensor}`;
      extra.push({ id, type: recent ? 'recent' : 'upcoming' });
      style[id] = { ...(style[old] || {}), ...(recent ? { source: r.sensor } : { sensors: [r.sensor] }), ...(r.title ? { title: r.title } : {}) };
      delete style[old];
      c.home_order = swap(c.home_order, old, id);
      c.home_hidden = swap(c.home_hidden, old, id);
    }
    c.home_extra = extra; c.home_style = style;
  }
  delete c.home_rows;
  if (Array.isArray(c.home_extra)) {
    const ids = new Set();
    c.home_extra = c.home_extra.filter((e) => e && /^(recent|soon|hub)-\d+$/.test(e.id) && ['recent', 'upcoming', 'plexhub'].includes(e.type) && !ids.has(e.id) && ids.add(e.id))
      .map((e) => ({ id: e.id, type: e.type }));
    if (!c.home_extra.length) delete c.home_extra;
  } else delete c.home_extra;
  if (c.home_style && typeof c.home_style === 'object') {
    const o = Object.fromEntries(Object.entries(c.home_style).map(([k, v]) => [k, cleanSecStyle(v)]).filter(([, v]) => Object.keys(v).length));
    if (Object.keys(o).length) c.home_style = o; else delete c.home_style;
  } else delete c.home_style;
  splitSecStyles(c);
  for (const k of ['libraries', 'tvs', 'home_cards', 'home_hidden', 'tab_order']) if (!Array.isArray(c[k]) || !c[k].length) delete c[k];
  if (Array.isArray(c.header)) {
    const h = headerLayout(c);
    if (JSON.stringify(h) === JSON.stringify(DEFAULT_HEADER)) delete c.header; else c.header = h;
  } else delete c.header;
  if (c.layouts && typeof c.layouts === 'object') {
    const out = {};
    for (const [id, l] of Object.entries(c.layouts)) {
      if (!/^[a-z0-9_-]{1,40}$/.test(id) || !l || typeof l !== 'object') continue;
      const base = l.base === 'compact' ? 'compact' : 'standard';
      out[id] = { name: String(l.name || id).slice(0, 60), base, items: layoutItems({ layouts: { [id]: { base, items: Array.isArray(l.items) ? l.items : [] } } }, `lay:${id}`) };
    }
    if (Object.keys(out).length) c.layouts = out; else delete c.layouts;
  } else delete c.layouts;
  for (const [sc] of SCREENS) {
    const v = c[`${sc}_header`];
    if (typeof v === 'string' && v.startsWith('lay:') && !c.layouts?.[v.slice(4)]) delete c[`${sc}_header`];
    else if (v !== undefined && !['main', 'one_row'].includes(v) && !(typeof v === 'string' && v.startsWith('lay:'))) delete c[`${sc}_header`];
  }
  { if (c.page_presets && typeof c.page_presets === 'object') {
      const out = {};
      for (const [id, sp] of Object.entries(c.page_presets)) {
        if (!/^[a-z0-9_-]{1,40}$/.test(id) || !sp || typeof sp !== 'object') continue;
        const groups = (Array.isArray(sp.groups) ? sp.groups : []).filter((g) => PAGE_GROUPS.some(([x]) => x === g));
        const allowed = new Set(PAGE_GROUPS.filter(([g]) => groups.includes(g)).flatMap(([, , k]) => k));
        const values = Object.fromEntries(Object.entries(sp.values || {}).filter(([k, v]) => allowed.has(k) && v !== '' && v != null)
          .map(([k, v]) => [k, COLOR_DEFS[k] ? String(v).replace(/[;{}<>]/g, '') : v]));
        out[id] = { name: String(sp.name || id).slice(0, 60), base: PAGE_PRESETS[sp.base] ? sp.base : 'standard', groups, values };
      }
      if (Object.keys(out).length) c.page_presets = out; else delete c.page_presets;
    } else delete c.page_presets;
    if (c.page_style && !PAGE_PRESETS[c.page_style] && !savedPreset(c)) delete c.page_style;
    const pre = presetLook(c);
    if ('page_active' in c) {   // 2026.11.15.33: "current page marked by" → underline / glow groups
      if (c.page_active === 'underline') c.page_underline = true;
      if (c.page_active === 'glow') c.page_glow = 'active';
      delete c.page_active;
    }
    if (!Array.isArray(c.page_groups)) c.page_groups = PAGE_GROUPS.filter(([, , keys]) => keys.some((k) => c[k] !== undefined && c[k] !== '')).map(([g]) => g);
    const on = new Set(c.page_groups.filter((g) => PAGE_GROUPS.some(([x]) => x === g)));
    c.page_groups = PAGE_GROUPS.map(([g]) => g).filter((g) => on.has(g));
    for (const [g, , keys] of PAGE_GROUPS) for (const k of keys) if (!on.has(g) || c[k] === '' || c[k] == null || c[k] === pre[k]) delete c[k];
    if (!c.page_groups.length) delete c.page_groups;
    if (c.page_icons && typeof c.page_icons === 'object') {
      const o = Object.fromEntries(Object.entries(c.page_icons).filter(([k, v]) => k && typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim()]));
      if (Object.keys(o).length) c.page_icons = o; else delete c.page_icons;
    } else delete c.page_icons; }
  if (c.tv_icons && typeof c.tv_icons === 'object') {
    const o = Object.fromEntries(Object.entries(c.tv_icons).filter(([k, v]) => k && typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim()]));
    if (Object.keys(o).length) c.tv_icons = o; else delete c.tv_icons;
  } else delete c.tv_icons;
  if (Array.isArray(c.home_order) || Array.isArray(c.home_hidden)) {   // 2026.11.16.50: Home order / visibility are per screen type
    for (const [sc] of SCREENS) {
      if (Array.isArray(c.home_order) && c.home_order.length && !Array.isArray(c[`home_order_${sc}`])) c[`home_order_${sc}`] = [...c.home_order];
      if (Array.isArray(c.home_hidden) && c.home_hidden.length && !Array.isArray(c[`home_hidden_${sc}`])) c[`home_hidden_${sc}`] = [...c.home_hidden];
    }
    delete c.home_order; delete c.home_hidden;
  }
  for (const [sc] of SCREENS) {
    const all = homeSections(c).map(([id]) => id), ok = new Set(all);
    const o = `home_order_${sc}`, h = `home_hidden_${sc}`;
    if (Array.isArray(c[o])) {
      const order = homeOrder({ ...c, home_order: c[o] });
      if (JSON.stringify(order) === JSON.stringify(all)) delete c[o]; else c[o] = order;
    } else delete c[o];
    if (Array.isArray(c[h])) { const v = [...new Set(c[h].filter((id) => ok.has(id)))]; if (v.length) c[h] = v; else delete c[h]; } else delete c[h];
  }
  if (Array.isArray(c.home_order)) {
    const order = homeOrder(c);
    if (JSON.stringify(order) === JSON.stringify(homeSections(c).map(([id]) => id))) delete c.home_order; else c.home_order = order;
  } else delete c.home_order;
  return c;
}
const cfg = (c, k) => (c[k] !== undefined ? c[k] : DEFAULTS[k]);

/** The header items in order, each { id, section, row, align, hidden? }; unknown ids dropped, missing ones added. */
/** Old configs: the list a screen showed before saved layouts (its own header_<screen>, Compact, or the shared one). */
function legacyScreenList(c, sc) {
  const compact = sc.startsWith('phone');
  if (Array.isArray(c[`header_${sc}`])) return layoutItems({ layouts: { t: { base: compact ? 'compact' : 'standard', items: c[`header_${sc}`] } } }, 'lay:t');
  const mode = c[`${sc}_header`] ?? SCREEN_DEFAULTS[`${sc}_header`];
  if (mode === 'own') return (compact ? DEFAULT_HEADER_PHONE : DEFAULT_HEADER).map((h) => ({ ...h }));
  return layoutItems(c, mode === 'one_row' ? 'one_row' : 'main');
}
/** The controls layout a screen uses: 'main' (Standard), 'one_row' (Compact, built in) or 'lay:<id>' (a saved layout). */
function layoutKeyFor(c, screen) {
  const k = screen ? String(cfg(c, `${screen}_header`) || 'main') : 'main';
  if (k.startsWith('lay:')) return c.layouts?.[k.slice(4)] ? k : 'main';
  return k === 'one_row' ? 'one_row' : 'main';
}
function headerLayout(c, screen = null) { return layoutItems(c, layoutKeyFor(c, screen)); }
/** The items of a controls layout, complete and in order (missing items added from its defaults). */
function layoutItems(c, key = 'main') {
  const saved = String(key).startsWith('lay:') ? c.layouts?.[String(key).slice(4)] : null;
  const list = saved ? saved.items : key === 'one_row' ? null : c.header;
  const defs = key === 'one_row' || saved?.base === 'compact' ? DEFAULT_HEADER_PHONE : DEFAULT_HEADER;
  const known = new Set(HEADER_ITEMS.map(([id]) => id));
  const seen = new Set();
  const out = [];
  // 2026.11.16.38: "filters" (All / Unwatched) and "more" (genre / decade / rating / length) are separate items now
  const items = (Array.isArray(list) ? list : []).flatMap((h) => (h?.id === 'filters' ? [{ ...h, id: 'watched' }, { ...h, id: 'filterbtn' }]
    : h?.id === 'more' ? ['genre', 'decade', 'rating', 'length'].map((id) => ({ ...h, id })) : [h]));
  for (const h of items) {
    if (!h || !known.has(h.id) || seen.has(h.id)) continue;
    seen.add(h.id);
    const d = defs.find((x) => x.id === h.id);
    const sec = PLACES.includes(h.section) && (h.section !== 'popover' || FILTER_IDS.has(h.id)) ? h.section : 'library';
    const styles = ITEM_STYLES[h.id], style = styles && styles.some(([v]) => v === h.style) && h.style !== styles[0][0] ? h.style : null;
    out.push({ id: h.id, section: sec, row: [1, 2, 3].includes(Number(h.row)) ? Number(h.row) : d.row,
      align: ALIGNS.includes(h.align) ? h.align : d.align, ...(style ? { style } : {}), ...(h.hidden ? { hidden: true } : {}) });
  }
  for (const d of defs) if (!seen.has(d.id)) out.push({ ...d });
  return out;
}

// Per-section look (Recently added and each sensor row): stored sparse in home_style[<section id>].
const SEC_KEYS = { library: 'str', hub: 'str', fade_ms: 'num', show: 'num', phone_show: 'num', scroll: 'bool', total: 'num', auto: ['off', 'scroll', 'fade'], speed: 'num', sensors: 'list', source: 'str', kind: ['movie', 'show', 'both'], chips: 'bool', cycle_mode: ['scroll', 'fade'], cycle_chip: 'bool', chips_pos: ['center', 'right'], title_pos: ['left', 'center', 'right'], view_all: 'bool', title: 'str', show_title: 'bool', head_style: ['caps', 'plain'],
  show_count: 'bool', show_icon: 'bool', divider: 'bool', divider_color: 'str', item_h: 'num', l1_px: 'num', l2_px: 'num', l3_px: 'num', l4_px: 'num',
  l1_color: 'str', l2_color: 'str', l3_color: 'str', l4_color: 'str', layout: ['row', 'list', 'banner'], scroll_dir: ['left', 'right', 'up', 'down'], image: ['poster', 'fanart'], collapsible: 'bool', collapsed: 'bool', icon: 'str', max: 'num',
  radius: 'num', title_px: 'num', line_px: 'num', list_w: 'num', title_color: 'str', line_color: 'str', flag_color: 'str', item_bg: 'str',
  border_color: 'str', flag: 'bool', flag_style: ['corner', 'info', 'icons', 'labels'], flag_items: 'words', flag_px: 'num', releases: 'words' };
/** A Home row's settings shared by every screen type: what the row is (its source). Everything else is per screen. */
const SEC_SHARED = new Set(['source', 'sensors', 'library', 'hub', 'releases']);
/** 2026.11.16.53: rows' settings become screen profiles (sec_styles['<id>:<screen>']); only the source stays in home_style. */
function splitSecStyles(c) {
  const ids = new Set(homeSections(c).map(([id]) => id));
  const out = {};
  for (const [k, v] of Object.entries(c.sec_styles && typeof c.sec_styles === 'object' ? c.sec_styles : {})) {
    const [id, sc] = String(k).split(':');
    if (!ids.has(id) || !SCREENS.some(([x]) => x === sc)) continue;
    const o = cleanSecStyle(v); for (const x of SEC_SHARED) delete o[x];
    if (Object.keys(o).length) out[k] = o;
  }
  for (const [id, st] of Object.entries(c.home_style || {})) {
    const rest = Object.fromEntries(Object.entries(st).filter(([k]) => !SEC_SHARED.has(k)));
    if (!Object.keys(rest).length) continue;
    for (const [sc] of SCREENS) {
      const phone = sc.startsWith('phone'), r = { ...rest };
      if (phone) { if (r.phone_show !== undefined) r.show = r.phone_show; else delete r.show; delete r.max; }
      delete r.phone_show;
      const k = `${id}:${sc}`, o = { ...r, ...(out[k] || {}) };
      if (Object.keys(o).length) out[k] = o;
    }
    c.home_style[id] = Object.fromEntries(Object.entries(st).filter(([k]) => SEC_SHARED.has(k)));
    if (!Object.keys(c.home_style[id]).length) delete c.home_style[id];
  }
  if (c.home_style && !Object.keys(c.home_style).length) delete c.home_style;
  // 2026.11.16.54: Text Attributes (title / line size and colour) merged into Text Lines
  let moved = false;
  for (const [k, o] of Object.entries(out)) {
    const m = {};
    if (o.title_px !== undefined) m.title_px = o.title_px;
    if (o.title_color) m.title_color = o.title_color;
    for (const id of ['info', 'when', 'meta', 'extra']) { if (o.line_px !== undefined) m[`${id}_px`] = o.line_px; if (o.line_color) m[`${id}_color`] = o.line_color; }
    for (const x of ['title_px', 'title_color', 'line_px', 'line_color']) delete o[x];
    if (!Object.keys(o).length) delete out[k];
    if (!Object.keys(m).length) continue;
    const looks = { ...(c.looks || {}) }; looks[k] = { ...m, ...(looks[k] || {}) }; c.looks = looks; moved = true;
  }
  if (moved) cleanLooks(c);
  if (Object.keys(out).length) c.sec_styles = out; else delete c.sec_styles;
}
function cleanSecStyle(o) {
  const out = {};
  for (const [k, kind] of Object.entries(SEC_KEYS)) {
    const v = o?.[k];
    if (v === undefined || v === null || v === '') continue;
    if (kind === 'list') { const l = (Array.isArray(v) ? v : []).map(String).filter((x) => /^sensor\.[a-z0-9_]+$/.test(x)); if (l.length) out[k] = [...new Set(l)]; continue; }
    if (kind === 'words') { if (Array.isArray(v)) out[k] = [...new Set(v.map(String).filter((x) => /^[a-z_]{1,20}$/.test(x)))]; continue; }   // [] = none
    if (Array.isArray(kind)) { if (kind.includes(v)) out[k] = v; } else if (kind === 'bool') out[k] = !!v;
    else if (kind === 'num') { if (Number.isFinite(Number(v)) && !(['phone_show', 'show'].includes(k) && !Number(v))) out[k] = Number(v); } else if (String(v).trim()) out[k] = String(v).trim();
  }
  return out;
}
/** One resolver for a section: its own setting, else the card's. */
function secStyle(c, id) {
  const s = { ...((c.home_style || {})[id] || {}), ...((c.sec_styles || {})[`${id}:${c._screen || 'tablet_landscape'}`] || {}) };
  const type = secType(c, id) || 'sensor';
  const collapsible = !!s.collapsible;
  const own = lookOwn(c, id), lkImg = own.image;
  const image = (lkImg === 'fade' ? 'fanart' : lkImg) || s.image || cfg(c, 'image_style');
  const wide = (s.layout || 'row') === 'row' && image === 'fanart';
  // Cycle: the header chip turns the section's auto-rotate on / off; Cycle content says how (scroll or fade)
  const cycleMode = s.cycle_mode || (s.auto && s.auto !== 'off' ? s.auto : id === 'continue' ? 'fade' : 'scroll');
  const want = c._cycle?.[id], auto = want === undefined ? (s.auto || 'off') : want ? cycleMode : 'off';
  return { layout: s.layout || 'row', cycle_mode: cycleMode, cycle_chip: s.cycle_chip ?? true, image, fade: lkImg === 'fade', wide, lkind: SEC_KIND[type] || type, look: own, collapsible, collapsed: !!s.collapsed,
    icon: s.icon || SEC_TYPE_ICON[type] || '', show_icon: s.show_icon ?? (collapsible || !!s.icon), show_title: s.show_title ?? true,
    show_count: s.show_count ?? true, divider: s.divider ?? collapsible, head_style: s.head_style || (collapsible ? 'plain' : 'caps'), kind: s.kind || 'both', chips: !!s.chips,
    chips_pos: s.chips_pos || 'right', title_pos: s.title_pos || 'left', view_all: s.view_all ?? true,
    show: (() => { const n = Math.max(1, Number((s.show ?? s.max) || c.across || cfg(c, 'across')) || 6);
      return wide && !(s.show ?? s.max) ? Math.max(1, Math.round(n / 2)) : n; })(),
    scroll: !!s.scroll, auto, scroll_dir: s.scroll_dir || ((s.layout || 'row') === 'list' ? 'up' : 'left'),
    speed: Number(s.speed ?? (auto === 'scroll' && s.layout !== 'banner' ? 30 : 5)), fade_ms: Math.max(0, Number(s.fade_ms ?? 1200)),
    flag: s.flag ?? cfg(c, 'flag'), flag_style: s.flag_style || 'corner', flag_items: Array.isArray(s.flag_items) ? s.flag_items : FACTS.map(([f]) => f),
    flag_px: Math.max(12, Math.min(40, Number(s.flag_px) || 20)), list_w: Number(s.list_w ?? 340), type, s,
    get total() { return this.scroll || this.auto !== 'off' ? Math.max(this.show, Number(s.total ?? 30)) : this.show; },
    get max() { return this.total; } };
}
/** The section's own CSS custom properties (inline on the section; inherit the card's when unset). */
function secVars(st) {
  const s = st.s, clean = (v) => String(v).replace(/[;{}<>]/g, ''), v = [`--plc-li-w:${st.list_w}px`, `--plc-show:${st.show}`, `--plc-fade-ms:${st.fade_ms}ms`];
  if (s.item_h !== undefined) v.push(`--plc-li-h:${Number(s.item_h)}px`);
  for (const n of [1, 2, 3, 4]) {
    if (s[`l${n}_px`] !== undefined) v.push(`--plc-l${n}-px:${Number(s[`l${n}_px`])}px`);
    if (s[`l${n}_color`]) v.push(`--plc-l${n}-c:${clean(s[`l${n}_color`])}`);
  }
  if (s.radius !== undefined) v.push(`--plc-radius:${Number(s.radius)}px`);
  if (s.title_px !== undefined) v.push(`--plc-title-px:${Number(s.title_px)}px`);
  if (s.line_px !== undefined) v.push(`--plc-line-px:${Number(s.line_px)}px`);
  for (const [k, prop] of [['divider_color', '--plc-div-c'], ['title_color', '--plc-title-c'], ['line_color', '--plc-line-c'], ['flag_color', '--plc-flag-c'], ['item_bg', '--plc-li-bg'], ['border_color', '--plc-li-bd']]) {
    if (s[k]) v.push(`${prop}:${clean(s[k])}`);
  }
  return v.join(';');
}
/** A Plex Center item as an upcoming-media item, so both get the same $keyword lines. */
function plexAsUmc(it) {
  const mins = it.duration ? Math.round(it.duration / 60) : '';
  return { title: it.show || it.title, episode: it.type === 'episode' ? it.title : '', airdate: it.added || '', release: '$day, $date $time',
    number: it.type === 'episode' && it.season != null ? `S${String(it.season).padStart(2, '0')}E${String(it.episode).padStart(2, '0')}` : '',
    rating: it.rating ? `★ ${Number(it.rating).toFixed(1)}` : '', runtime: mins, genres: (it.genres || []).join(', '), studio: it.studio || '' };
}
const PLEX_LINE_DEFAULTS = { title_default: '$title', line1_default: '$episode', line2_default: '$release', line3_default: '$number - $rating - $runtime', line4_default: '$genres' };

/** Tabs in the user's order: [{id: 'home'} | library]. tab_order holds 'home' and library titles; new ones are appended. */
function tabOrder(c, libs, calendar = false) {
  const all = [{ id: 'home', title: 'Home' }, ...(calendar ? [{ id: 'calendar', key: 'calendar', title: 'Calendar', type: 'calendar' }] : []), ...libs.map((l) => ({ ...l, id: l.title }))];
  const want = (Array.isArray(c.tab_order) ? c.tab_order : []).filter((id) => all.some((t) => t.id === id));
  return [...want.map((id) => all.find((t) => t.id === id)), ...all.filter((t) => !want.includes(t.id))];
}

/** Home sections in their default order: [id, label]. Rows are keyed by their sensor. */
function homeSections(c) {
  const t = (id) => c.sec_styles?.[`${id}:${c._screen || 'tablet_landscape'}`]?.title || c.home_style?.[id]?.title;
  return [...HOME_BUILTIN.map(([id, n]) => [id, t(id) || n]),
    ...(c.home_extra || []).map((e) => [e.id, t(e.id) || SEC_TYPE_TITLE[e.type]]),
    ...(c.home_cards?.length ? [['cards', 'Extra cards']] : [])];
}
/** The user's order (unknown ids dropped, new sections appended). */
function homeOrder(c) {
  const all = homeSections(c).map(([id]) => id);
  const want = (c.home_order || []).filter((id) => all.includes(id));
  if (!want.includes('next') && want.includes('continue') && all.includes('next')) want.splice(want.indexOf('continue') + 1, 0, 'next');   // 2026.11.19: Next Episode after Continue watching
  return [...want, ...all.filter((id) => !want.includes(id))];
}
const homeVisible = (c, id) => !(c.home_hidden || []).includes(id);

/** Inline style for this card's ha-card (background, border, radius, shadow); sanitized, never a stylesheet. */
function haCardStyle(c) {
  const clean = (v) => String(v).replace(/[;{}<>]/g, '');
  const o = [];
  if (c.card_bg) o.push(`--ha-card-background:${clean(c.card_bg)}`, `background:${clean(c.card_bg)}`);
  if (c.card_border_width !== undefined) o.push(`--ha-card-border-width:${Number(c.card_border_width)}px`, `border-width:${Number(c.card_border_width)}px`);
  if (c.card_border_color) o.push(`--ha-card-border-color:${clean(c.card_border_color)}`, `border-color:${clean(c.card_border_color)}`);
  if (c.card_radius !== undefined) o.push(`--ha-card-border-radius:${Number(c.card_radius)}px`, `border-radius:${Number(c.card_radius)}px`, 'overflow:clip');
  if (SHADOWS[c.card_shadow]) o.push(`--ha-card-box-shadow:${SHADOWS[c.card_shadow]}`, `box-shadow:${SHADOWS[c.card_shadow]}`);
  return o.join(';');
}

/** The screen the card on this page is showing now (for the editor's "in the preview" marker). */
const SHOWN = { screen: null };
const SAVED_KEYS = ['tab', 'sort', 'unwatched', 'genre', 'decade', 'rating', 'short', 'view'];
const pickSaved = (v) => Object.fromEntries(SAVED_KEYS.filter((k) => v[k] !== undefined && v[k] !== null).map((k) => [k, v[k]]));
const RECENT_KEY = 'plc-recent-searches';
function recentSearches() { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 8) : []; } catch { return []; } }
function addRecent(q) {
  q = String(q || '').trim();
  if (q.length < 2) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...recentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8))); } catch { /* */ }
}

const tabIcon = (t, c = {}) => (c.page_icons?.[t.id]) || (t.id === 'calendar' ? 'mdi:calendar-month' : t.id === 'home' ? 'mdi:home' : t.type === 'movie' ? 'mdi:movie-open' : t.type === 'show' ? 'mdi:television-classic' : 'mdi:folder-play');
const isPortrait = () => (typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)').matches : true);
/** The config the card renders with: the current screen's settings, under the names the renderer reads. */
function screenOf(phone, portrait) { return `${phone ? 'phone' : 'tablet'}_${portrait ? 'portrait' : 'landscape'}`; }
function effectiveConfig(c, phone, portrait = isPortrait()) {
  const sc = screenOf(phone, portrait), g = (k) => cfg(c, `${sc}_${k}`);
  return { ...c, _screen: sc, _phone_layout: !!phone, home_order: c[`home_order_${sc}`], home_hidden: c[`home_hidden_${sc}`], scale: Number(g('scale')) || 100, across: Math.max(1, Math.min(12, Number(g('across')) || 3)),
    library_view: g('view'), search_mode: g('search'), tv_picker: g('tvs'), tabs_mode: g('tabs'), filters_mode: g('filters'), header_mode: g('header'),
    hide_on_scroll: !!g('hide'), swipe_tabs: !!g('swipe'), footer_sticky: !!g('footer_sticky'), now_playing: !phone && g('now_playing') === 'panel' ? 'panel' : 'off', slim_position: g('slim_position') };
}

/** Per-card custom properties (never written into the stylesheet). */
function cardVars(c) {
  const across = Math.max(1, Math.min(12, Number(c.across ?? cfg(c, 'across')) || 6));
  const v = [`--plc-across:${across}`, `--plc-across-fan:${Math.max(1, Math.round(across / 2))}`, `--plc-scale:${Math.max(0.5, Math.min(2, (Number(cfg(c, 'scale')) || 100) / 100))}`, `--plc-poster-w:${Number(cfg(c, 'poster_width')) || 130}px`, `--plc-radius:${Number(cfg(c, 'corner_radius'))}px`,
    `--plc-title-px:${Number(cfg(c, 'title_size'))}px`, `--plc-line-px:${Number(cfg(c, 'line_size'))}px`,
    `--plc-head-px:${Number(cfg(c, 'header_size'))}px`, `--plc-sec-px:${Number(cfg(c, 'section_size'))}px`, `--plc-pad:${Number(cfg(c, 'card_padding'))}px`,
    `--plc-offset:${Number(cfg(c, 'screen_offset'))}px`, `--plc-search-w:${Number(cfg(c, 'search_width'))}px`];
  const pl = pageLook(c);
  for (const [k, d] of Object.entries(COLOR_DEFS)) { const val = k.startsWith('page_') ? pl[k] : c[k]; if (val && d[3]) v.push(`${d[3]}:${String(val).replace(/[;{}<>]/g, '')}`); }
  return v.join(';');
}



/** Real playback (not the 30 s title-page preview). */
function isRealPlayback(st) {
  if (!st || !['playing', 'paused', 'buffering'].includes(st.state)) return false;
  const d = Number(st.attributes?.media_duration);
  return !(d > 0 && d <= PREVIEW_MAX_S);
}

/** Live position in seconds from position + position_updated_at. */
function livePosition(st, now = Date.now()) {
  const a = st?.attributes || {};
  let p = Number(a.media_position);
  if (!Number.isFinite(p)) return null;
  if (st.state === 'playing' && a.media_position_updated_at) p += Math.max(0, (now - Date.parse(a.media_position_updated_at)) / 1000);
  const d = Number(a.media_duration);
  return d > 0 ? Math.min(p, d) : p;
}

const fmtTime = (s) => {
  s = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};
/** 1h 13m / 45m */
const fmtRun = (s) => { const m = Math.round((Number(s) || 0) / 60), h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
const endsAt = (remainingS, clock = '12', now = Date.now()) =>
  new Date(now + Math.max(0, remainingS) * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: clock !== '24' });


/** upcoming-media deep_link ('…/server/<id>/details?key=%2Flibrary%2Fmetadata%2F<key>') → { server, key }. */
function deepLinkKey(url) {
  const m = /\/server\/([A-Za-z0-9]+)\/details\?key=%2Flibrary%2Fmetadata%2F(\d+)/.exec(String(url || ''));
  return m ? { server: m[1], key: m[2] } : null;
}


// --------------------------------------------- upcoming-media rows (adapted from upcoming-media-card, MIT)

/** Items of an upcoming-media sensor: entry 0 is the template (line defaults), the rest are items. */
function umcItems(st) {
  const data = st?.attributes?.data;
  let list = data;
  if (typeof data === 'string') { try { list = JSON.parse(data); } catch { list = []; } }
  if (!Array.isArray(list) || !list.length) return { defaults: {}, items: [] };
  return { defaults: list[0] || {}, items: list.slice(1).filter((x) => x && x.title) };
}

function formatDate(input, format = 'mm/dd/yy') {
  const s = String(input || '');
  let d, m, y2, y4;
  if ((format === 'yyyy' || format === '(yyyy)') && /^\d{4}$/.test(s)) return format === '(yyyy)' ? `(${s})` : s;
  if (/T\d+:\d+:\d+/.test(s)) {
    const dt = new Date(s);
    if (isNaN(dt)) return '';
    d = String(dt.getDate()).padStart(2, '0'); m = String(dt.getMonth() + 1).padStart(2, '0');
    y4 = String(dt.getFullYear()); y2 = y4.slice(-2);
  } else if (/^\d+-\d+-\d+/.test(s)) {
    [y4, m, d] = s.slice(0, 10).split('-'); y2 = y4.slice(-2);
  } else return '';
  const map = { dd: d, d: String(Number(d)), mm: m, m: String(Number(m)), yyyy: y4, yy: y2 };
  const mark = '\u0000';
  return String(format).replace(/yyyy|yy|mm|m|dd|d/g, (t) => (map[t] ?? t) + mark)
    .replace(new RegExp(mark + '(?=\\d)', 'g'), '/').replace(new RegExp(mark, 'g'), '');
}

const KEYWORDS = /\$title|\$episode|\$genres|\$number|\$se\b|\$type\b|\$rating|\$release|\$runtime|\$studio|\$day|\$date|\$time|\$aired|\$tmdb_id|\$empty/g;

/** Title + line 1–4 of an item: $keywords replaced; a '-'-separated part whose keyword is empty is dropped. */
function umcLines(item, defaults, c, now = Date.now()) {
  const keys = umcKeys(item, c, now);
  const tpl = [c.title_text || defaults.title_default || '$title', c.line1_text || defaults.line1_default || '$episode',
    c.line2_text || defaults.line2_default || '$release', c.line3_text || defaults.line3_default || '$rating - $runtime',
    c.line4_text || defaults.line4_default || '$number - $studio', c.line5_text || defaults.line5_default || '$empty'];
  return tpl.map((t) => {
    const parts = String(t).replace(/ - /g, '-').split('-')
      .map((p) => p.replace(KEYWORDS, (k) => (keys[k] == null ? '\u0001' : keys[k])))
      .filter((p) => !p.includes('\u0001'));
    return parts.join(' - ').replace(KEYWORDS, (k) => keys[k] ?? '').trim();
  });
}
/** The $keyword values of an upcoming-media style item. */
function umcKeys(item, c, now = Date.now()) {
  const fmt = cfg(c, 'date');
  const air = item.airdate ? new Date(item.airdate) : null;
  const days = air && !isNaN(air) ? Math.round(Math.abs(now - air.getTime()) / 86400000) : 99;
  let runtime = '';
  if (/^\d+$/.test(String(item.runtime || ''))) {
    const t = Number(item.runtime), h = Math.floor(t / 60);
    runtime = (h ? `${h}hr ` : '') + (t % 60 ? `${t % 60}min` : '');
  }
  const keys = {
    $title: item.title || null, $episode: item.episode || null,
    $genres: (Array.isArray(item.genres) ? item.genres.join(', ') : item.genres) || null,
    $number: item.number || null, $rating: item.rating || null, $type: item.type_label || null,
    $se: (() => { const m = /S0*(\d+)\s*[E·]\s*0*(\d+)/i.exec(String(item.number || '').replace(/ · E/, 'E')); return m ? `S${m[1]} E${m[2]}` : (item.number || null); })(),
    $release: String(item.release || '').replace('$date', formatDate(item.airdate, fmt)).replace('$year', formatDate(item.airdate, 'yy')) || null,
    $runtime: runtime || null, $studio: item.studio || null,
    $day: air && !isNaN(air) ? air.toLocaleDateString([], { weekday: days <= 7 ? 'long' : 'short' }) : null,
    $date: formatDate(item.airdate, fmt) || null,
    $time: air && !isNaN(air) ? air.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: cfg(c, 'clock') !== '24' }) : null,
    $aired: formatDate(item.aired, fmt) || null, $tmdb_id: item.tmdb_id || null, $empty: '',
  };
  return keys;
}

// ------------------------------------------------------------------------------------------- card CSS
// Constant for every instance. Per-card values arrive as custom properties on .plc (cardVars()).

const CARD_CSS = `
.plc { --plc-a: var(--plc-accent, var(--accent-color, var(--primary-color)));
  --plc-bg2: var(--secondary-background-color, rgba(127,127,127,.12));
  --plc-r: var(--plc-radius, 10px);
  display: block; position: relative; overflow: clip; color: var(--primary-text-color); padding: var(--plc-pad, 14px); box-sizing: border-box;
  zoom: var(--plc-scale, 1); }
.plc *, .plc *::before, .plc *::after { box-sizing: border-box; }
.plc button { font: inherit; color: inherit; cursor: pointer; }
.plc ha-icon { --mdc-icon-size: 20px; }
.plc-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.plc .plc-top:empty { display: none; }
.plc-title { margin: 0; font-size: var(--plc-head-px, 20px); font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.plc-sp { flex: 1; }
.plc-tvs { display: flex; gap: 6px; flex-wrap: wrap; }
.plc-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--divider-color, #444);
  background: transparent; font-size: .85em; font-weight: 600; white-space: nowrap; }
.plc-chip.on { border-color: var(--plc-a); background: color-mix(in srgb, var(--plc-a) 18%, transparent); }
.plc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--disabled-text-color, #777); }
.plc-dot.on { background: var(--success-color, #4caf50); } .plc-dot.play { background: var(--plc-a); }
.plc-dot.resume { background: var(--warning-color, #ff9800); box-shadow: 0 0 0 2px color-mix(in srgb, var(--warning-color, #ff9800) 35%, transparent); }
.plc-tv-resume { --mdc-icon-size: 15px; color: var(--warning-color, #ff9800); margin-left: 2px; }
.plc-sess.resume { opacity: .9; border: 1px dashed color-mix(in srgb, var(--warning-color, #ff9800) 60%, transparent); cursor: pointer; }
.plc-sess.resume .plc-sess-art.app ha-icon { color: var(--warning-color, #ff9800); }
.plc-resume-st { color: var(--warning-color, #ff9800); }
.plc-chip.plc-openshow { margin: 6px 0 2px; }
.plc-cycle { font-size: .8em; padding: 2px 10px; letter-spacing: normal; text-transform: none; font-weight: 600; }
.plc-cycle ha-icon { --mdc-icon-size: 14px; }
.plc-vasheet .plc-grid { --plc-across: 5; }
.plc.phone .plc-vasheet .plc-grid { --plc-across: 2; }
.plc-viewall[role="button"] { cursor: pointer; white-space: nowrap; }
.plc-side-info .plc-chip.plc-openshow { align-self: center; }
.plc-resume-btns { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
.plc-resume-btns .plc-btn { padding: 4px 12px; min-height: 30px; }
.plc-select, .plc-search { padding: 7px 10px; border-radius: 8px; border: 1px solid var(--divider-color, #444); background: var(--plc-bg2);
  color: var(--primary-text-color); font: inherit; font-size: .9em; min-width: 0; }
.plc-search { flex: 1 1 180px; max-width: 320px; }
.plc-tabs { display: flex; gap: 4px; margin: 10px 0 8px; overflow-x: auto; scrollbar-width: none; }
.plc-tabs::-webkit-scrollbar { display: none; }
.plc-tab { padding: 7px 14px; border: none; border-radius: 8px; background: transparent; font-weight: 700; font-size: .92em; white-space: nowrap;
  color: var(--secondary-text-color); }
.plc-tab.on { color: var(--primary-text-color); background: var(--plc-bg2); box-shadow: inset 0 -2px 0 var(--plc-a); }
.plc-chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 10px; }
/* items in a look (calendar) */
.plc-ci { --li-title-px: 15px; position: relative; display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; padding: 8px; border: none; border-radius: 10px;
  text-align: left; background: color-mix(in srgb, var(--c) 8%, var(--plc-bg2)); color: inherit; font: inherit; cursor: pointer; overflow: hidden; }
.plc-ci.bordered { border-left: 4px solid var(--c); }
.plc-ci:hover { filter: brightness(1.1); }
.plc-ci.phone { padding: 10px 12px; border-radius: 14px; }
.plc-ci-poster { position: relative; flex: none; width: calc(var(--li-title-px) * 2.9); aspect-ratio: 2 / 3; border-radius: 6px; background: #222 center / cover no-repeat;
  display: flex; align-items: center; justify-content: center; }
.plc-ci.big .plc-ci-poster { width: calc(var(--li-title-px) * 4.4); }
.plc-ci.phone .plc-ci-poster { width: calc(var(--li-title-px) * 3.6); }
.plc-ci-txt { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-right: 22px; line-height: 1.25; }
.plc-ci-title { font-size: var(--li-title-px); font-weight: var(--li-title-w); color: var(--li-title-c, var(--primary-text-color)); overflow: hidden; text-overflow: ellipsis; }
.plc-ci-info { font-size: var(--li-info-px); font-weight: var(--li-info-w); color: var(--li-info-c, var(--secondary-text-color)); }
.plc-ci-info b, .plc-ci .plc-fv[data-f="badge"] { color: var(--c); font-weight: 700; }
.plc-ci-extra { font-size: var(--li-extra-px, 12px); font-weight: var(--li-extra-w, 400); color: var(--li-extra-c, var(--secondary-text-color)); }
.plc-ci-when { font-size: var(--li-when-px); font-weight: var(--li-when-w); color: var(--li-when-c, var(--secondary-text-color)); }
.plc-ci-meta { font-size: var(--li-meta-px); font-weight: var(--li-meta-w); color: var(--li-meta-c, var(--secondary-text-color)); opacity: .85; }
.plc-ci-time, .plc-ci-type { position: absolute; right: 3px; bottom: 3px; }
.plc-ci-time { padding: 1px 5px; border-radius: 4px; background: rgba(0,0,0,.72); color: #fff; font-size: 10px; font-weight: 700; }
.plc-ci-time + .plc-ci-type { bottom: 22px; }
.plc-ci-type { --mdc-icon-size: 16px; color: #fff; filter: drop-shadow(0 1px 2px rgba(0,0,0,.9)); }
.plc-ci-corner { position: absolute; right: 8px; bottom: 8px; width: 60px; height: 40px; z-index: 1; }
.plc-ci-avail { position: absolute; top: 8px; right: 8px; width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 2px rgba(0,0,0,.35); z-index: 2; }
.plc-ci-watched { position: absolute; top: 6px; right: 6px; --mdc-icon-size: 18px; color: #22c55e; z-index: 2; }
.plc-ci .plc-calp-ring { margin-left: auto; z-index: 1; }
/* fanart: the backdrop behind the text, with a shade so the text stays readable */
.plc-ci.img-fanart, .plc-ci.img-fade { min-height: calc(var(--li-title-px) * 5.6); align-items: flex-end; }
.plc-ci.img-fanart .plc-ci-fan { position: absolute; inset: 0; background: #222 center / cover no-repeat; }
.plc-ci.img-fanart .plc-ci-fan::after { content: ''; position: absolute; inset: 0; background: var(--li-fanbg, linear-gradient(to top, rgb(0 0 0 / .9), rgb(0 0 0 / 0) 65%)); }
.plc-ci.img-fanart.tbg-box .plc-ci-fan::after, .plc-ci.img-fanart.tbg-none .plc-ci-fan::after { display: none; }
.plc-ci.img-fanart.tbg-box .plc-ci-txt { padding: 6px 8px; isolation: isolate; }
.plc-ci.img-fanart.tbg-box .plc-ci-txt::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: 8px; background: rgb(0 0 0 / var(--li-fanbg-a, .9));
  filter: blur(var(--li-fanbg-blur, 0px)); -webkit-mask-image: var(--li-boxmask, none); mask-image: var(--li-boxmask, none); }
.plc-ci.img-fanart .plc-ci-txt > span { color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
/* fanart – fade (the upcoming-media look): the backdrop on the right, fading in behind the text */
.plc-ci.img-fade { background: var(--plc-li-bg, #0d0d0d); align-items: center; }
.plc-ci.img-fade .plc-ci-fan { position: absolute; top: 0; right: 0; bottom: 0; width: var(--li-fade-w, 62%); background: center / cover no-repeat;
  -webkit-mask-image: linear-gradient(to right, transparent var(--li-fade-s, 0%), rgb(0 0 0 / .04) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .15), rgb(0 0 0 / .15) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .3), rgb(0 0 0 / .35) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .45), rgb(0 0 0 / .6) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .6), rgb(0 0 0 / .82) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .75), rgb(0 0 0 / .95) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .9), #000 calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%)));
  mask-image: linear-gradient(to right, transparent var(--li-fade-s, 0%), rgb(0 0 0 / .04) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .15), rgb(0 0 0 / .15) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .3), rgb(0 0 0 / .35) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .45), rgb(0 0 0 / .6) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .6), rgb(0 0 0 / .82) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .75), rgb(0 0 0 / .95) calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%) * .9), #000 calc(var(--li-fade-s, 0%) + var(--li-fade-d, 45%))); }
.plc-ci.img-fade .plc-ci-txt { max-width: 62%; }
/* calendar: phones */
.plc-calp-head { display: flex; align-items: center; gap: 10px; margin: 4px 0 10px; }
.plc-calp-head > ha-icon { --mdc-icon-size: 30px; color: var(--plc-a); }
.plc-calp-ttl { display: flex; flex-direction: column; line-height: 1.15; }
.plc-calp-ttl span { font-size: .8em; color: var(--plc-a); }
.plc-calp-ttl b { font-size: 1.35em; }
.plc-calp-legend { display: inline-flex; gap: 4px; }
.plc-calp-legend i { width: 9px; height: 9px; border-radius: 50%; }
.plc-calp-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.plc-calp-cell { position: relative; aspect-ratio: 1 / 1; min-width: 0; border: none; border-radius: 8px; background: var(--plc-bg2); color: inherit; font: inherit;
  display: flex; flex-direction: column; align-items: stretch; padding: 3px 4px; cursor: pointer; text-align: left; overflow: hidden; }
.plc-calp-cell.out { opacity: .45; }
.plc-calp-cell.today { box-shadow: inset 0 0 0 1.5px var(--plc-a); }
.plc-calp-cell.sel { background: color-mix(in srgb, var(--plc-a) 35%, var(--plc-bg2)); box-shadow: inset 0 0 0 2px var(--primary-text-color); }
.plc-calp-num { align-self: flex-end; font-size: .8em; font-weight: 600; color: var(--secondary-text-color); }
.plc-calp-cell.sel .plc-calp-num, .plc-calp-cell.today .plc-calp-num { color: var(--primary-text-color); font-weight: 800; }
.plc-calp-lbl { font-size: .58em; font-weight: 700; line-height: 1.05; }
.plc-calp-dots { margin-top: auto; display: flex; gap: 2px; justify-content: center; padding-bottom: 2px; }
.plc-calp-dots i { width: 6px; height: 6px; border-radius: 50%; }
.plc-calp-views { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; }
.plc-calp-strip .plc-calp-cell { aspect-ratio: auto; min-height: 64px; align-items: center; text-align: center; }
.plc-calp-strip .plc-calp-num { align-self: center; font-size: 1.05em; }
.plc-calp-wd { display: block; font-size: 11px; opacity: .7; text-transform: uppercase; }
.plc-calp-dayh { display: block; width: 100%; text-align: left; border: none; background: none; color: var(--secondary-text-color); font: inherit;
  font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 8px 2px 0; cursor: pointer; }
.plc-calp-dayh.today { color: var(--plc-a); }
.plc-calp-sep { height: 4px; border-radius: 2px; margin: 12px 4px; background: var(--plc-bg2); }
.plc-calp-list { display: flex; flex-direction: column; gap: 10px; }
.plc-calp-ring { flex: none; margin-left: auto; width: 34px; height: 34px; border-radius: 50%; border: 3px solid var(--c); display: flex; align-items: center; justify-content: center;
  font-weight: 800; color: var(--c); }
/* calendar */
.plc-cal-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: 4px 0 10px; }
.plc-cal-title { display: flex; align-items: center; gap: 10px; font-size: 1.35em; font-weight: 800; }
.plc-cal-title ha-icon { --mdc-icon-size: 26px; color: var(--plc-a); }
.plc-cal-nav { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.plc-cal-views { display: inline-flex; border: 1px solid var(--divider-color, #444); border-radius: 999px; overflow: hidden; }
.plc-cal-views button { border: none; background: none; color: var(--secondary-text-color); font: inherit; font-size: .85em; font-weight: 600; padding: 6px 12px; cursor: pointer; }
.plc-cal-views button.on { background: color-mix(in srgb, var(--plc-a) 20%, transparent); color: var(--primary-text-color); }
.plc-cal-filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.plc-cal-lbl { font-size: .7em; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--secondary-text-color); margin: 0 4px 0 8px; }
.plc-cal-lbl:first-child { margin-left: 0; }
.plc-cal-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--divider-color, #444); background: none;
  color: var(--primary-text-color); font: inherit; font-size: .8em; cursor: pointer; }
.plc-cal-pill.on { border-color: var(--plc-a); background: color-mix(in srgb, var(--plc-a) 14%, transparent); }
.plc-cal-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.plc-cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.plc-cal-dow { text-align: center; font-size: .7em; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--secondary-text-color); padding: 4px 0; }
.plc-cal-cell { min-height: 104px; padding: 4px; border-radius: 8px; background: var(--plc-bg2); display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.plc-cal-cell.out { opacity: .45; }
.plc-cal-cell.today { box-shadow: inset 0 0 0 2px var(--plc-a); }
.plc-cal-num { align-self: flex-end; border: none; background: none; color: var(--secondary-text-color); font: inherit; font-size: .8em; font-weight: 700; cursor: pointer; padding: 0 2px; }
.plc-cal-cell.today .plc-cal-num { color: var(--plc-a); }
.plc-cal-evs { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.plc-cal-block { display: block; width: 100%; text-align: left; border: none; border-left: 3px solid var(--c); border-radius: 4px; padding: 3px 5px; font: inherit; font-size: .72em;
  font-weight: 600; color: var(--primary-text-color); background: color-mix(in srgb, var(--c) 26%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.plc-cal-block span { opacity: .75; font-weight: 500; }
.plc-cal-block b, .plc-cal-card b { color: var(--c); }
.plc-cal-block.has { background: color-mix(in srgb, var(--c) 12%, transparent); }
.plc-cal-block:hover { filter: brightness(1.2); }
.plc-cal-more { border: none; background: none; color: var(--secondary-text-color); font: inherit; font-size: .7em; text-align: left; cursor: pointer; padding: 0 4px; }
.plc-cal-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.plc-cal-wcol { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 6px; border-radius: 10px; background: var(--plc-bg2); }
.plc-cal-wcol.today { box-shadow: inset 0 0 0 2px var(--plc-a); }
.plc-cal-whead { display: flex; align-items: baseline; gap: 6px; border: none; background: none; color: var(--secondary-text-color); font: inherit; cursor: pointer; padding: 0 2px 4px; }
.plc-cal-whead b { font-size: 1.3em; color: var(--primary-text-color); }
.plc-cal-wcol.today .plc-cal-whead b { color: var(--plc-a); }
.plc-cal-wcol .plc-ci { flex-direction: column; align-items: stretch; gap: 6px; }
.plc-cal-wcol .plc-ci.img-poster .plc-ci-poster { width: 100%; }
.plc-cal-wcol .plc-ci-txt { padding-right: 0; }
.plc-cal-empty { color: var(--secondary-text-color); text-align: center; opacity: .5; }
.plc-cal-poster { flex: none; width: 40px; aspect-ratio: 2 / 3; border-radius: 4px; background: #222 center / cover no-repeat; display: flex; align-items: center; justify-content: center; }
.plc-cal-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-right: 18px; }
.plc-cal-txt .plc-t { font-size: .88em; }
.plc-cal-txt .plc-s { font-size: .76em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plc-cal-daylist { display: flex; flex-direction: column; gap: 8px; }
.plc-cal-daylist .plc-cal-txt .plc-t { font-size: 1.05em; }
.plc-cq { position: relative; }
.plc-info-art { aspect-ratio: auto; min-height: 230px; }
.plc-info-art.noart { min-height: 170px; background: linear-gradient(135deg, var(--plc-bg2), #000); }
.plc-info-art::after { inset: 0; background: linear-gradient(rgba(0,0,0,.15), rgba(0,0,0,.35) 35%, rgba(0,0,0,.9)); }
.plc-info .plc-eyebrow { color: var(--plc-a); text-shadow: 0 1px 6px rgba(0,0,0,.9); }
.plc-info .plc-eyebrow ha-icon { --mdc-icon-size: 14px; }
.plc-info-sub { color: rgba(255,255,255,.88); font-size: 1.02em; text-shadow: 0 1px 6px rgba(0,0,0,.9); margin-top: 2px; }
.plc-info .plc-rates { gap: 8px; margin-top: 8px; }
.plc-rate.big, .plc-fact { font-size: .98em; padding: 4px 10px; border-radius: 7px; background: rgba(0,0,0,.6); font-weight: 600; }
.plc-rate.big b { font-weight: 800; }
.plc-fact { display: inline-flex; align-items: center; gap: 5px; color: #fff; }
.plc-fact ha-icon { --mdc-icon-size: 16px; }
.plc-info .plc-av { font-size: .85em; padding: 3px 8px; }
.plc-cq .plc-info-art { border-radius: 16px 16px 0 0; }
.plc-info .plc-detail-ttl { flex: 1; }
.plc-info .plc-rates { align-items: center; }
.plc-info-se { color: #fff; font-size: .98em; text-shadow: 0 1px 6px rgba(0,0,0,.9); margin-right: 4px; }
.plc-info-status { flex: none; align-self: flex-end; justify-content: flex-end; margin: 0; }
.plc-side-info .plc-info-sub { color: var(--secondary-text-color); text-shadow: none; }
.plc-np-facts { justify-content: center; gap: 8px; margin: 6px 0 2px; display: flex; flex-wrap: wrap; }
.plc-np-facts .plc-rate.big, .plc-np-facts .plc-fact { background: var(--plc-bg2); color: var(--primary-text-color); }
.plc-cal-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.plc-cal-chip { padding: 2px 8px; border-radius: 999px; font-size: .75em; font-weight: 600; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
.plc-note { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; padding: 8px 12px; border-radius: 10px; font-size: .88em;
  background: color-mix(in srgb, var(--plc-a) 14%, transparent); border-left: 3px solid var(--plc-a); }
.plc-note.err { background: color-mix(in srgb, var(--error-color, #db4437) 14%, transparent); border-left-color: var(--error-color, #db4437); }
.plc-note span { flex: 1 1 auto; min-width: 0; }
.plc-note ha-icon { flex: none; --mdc-icon-size: 20px; }
/* page menu styles: one layout; colors per preset (--pm-*), user colors on top (--pmu-*); shadow, glow and gradient lines computed per card */
.plc-tabs.pm { gap: var(--pm-gap, 4px); align-items: stretch; padding: var(--pm-pad, 0px);
  margin: calc(10px - var(--pm-pad, 0px)) calc(-1 * var(--pm-pad, 0px)) calc(8px - var(--pm-pad, 0px)); }
.plc-footer .plc-tabs.pm { margin: calc(-1 * var(--pm-pad, 0px)); }
.plc.onerow .plc-hl:has(.plc-tabs.pm) { overflow: visible; }
.plc-tabs.pm .plc-tab { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: var(--pm-h, 36px); padding: 0 12px;
  border-radius: var(--pm-r, 8px); font-size: var(--pm-fs, 14px); font-weight: var(--pm-fw, 600); line-height: 1.1; box-sizing: border-box;
  color: var(--pmu-c, var(--pm-c)); background-color: var(--pmu-bg, var(--pm-bg)); border: var(--pm-bw, 0) solid var(--pmu-bc, var(--pm-bc, transparent));
  background-image: var(--pm-gi, none); background-position: var(--pm-gp, 0 0); background-size: var(--pm-gs, auto); background-repeat: no-repeat;
  box-shadow: var(--pm-bs, none); -webkit-backdrop-filter: var(--pm-blur, none); backdrop-filter: var(--pm-blur, none); transition: background-color .15s, color .15s, box-shadow .15s; }
.plc-tabs.pm.pm-above .plc-tab { flex-direction: column; gap: 3px; padding: 4px 10px; }
.plc-tabs.pm .plc-tab ha-icon { --mdc-icon-size: var(--pm-is, 18px); color: var(--pmu-ic, var(--pm-ic, currentColor)); flex: none; }
.plc-tab-n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 12em; }
.plc-tabs.pm .plc-tab.on { color: var(--pmu-ac, var(--pm-ac)); background-color: var(--pmu-abg, var(--pm-abg)); border-color: var(--pmu-abc, var(--pm-abc, var(--pmu-bc, var(--pm-bc, transparent))));
  background-image: var(--pm-gia, var(--pm-gi, none)); box-shadow: var(--pm-bsa, none); }
.plc-tabs.pm .plc-tab.on ha-icon { color: var(--pmu-aic, var(--pm-aic, currentColor)); }
.pm-standard { --pm-c: var(--secondary-text-color); --pm-ac: var(--plc-a); --pm-ic: var(--secondary-text-color); --pm-aic: var(--plc-a); --pm-bg: transparent; --pm-abg: transparent; }
.pm-underline { --pm-c: var(--secondary-text-color); --pm-ac: var(--primary-text-color); --pm-bg: transparent; --pm-abg: var(--plc-bg2); }
.pm-pill { --pm-c: var(--primary-text-color); --pm-ac: var(--text-primary-color, #fff); --pm-ic: var(--secondary-text-color); --pm-aic: var(--text-primary-color, #fff); --pm-bg: var(--plc-bg2); --pm-abg: var(--plc-a); }
.pm-outline { --pm-c: var(--primary-text-color); --pm-ac: var(--primary-text-color); --pm-ic: var(--secondary-text-color); --pm-aic: var(--plc-a); --pm-bg: transparent;
  --pm-abg: color-mix(in srgb, var(--plc-a) 16%, transparent); --pm-bc: var(--divider-color, #555); --pm-abc: var(--plc-a); }
.pm-glass { --pm-c: var(--primary-text-color); --pm-ac: var(--primary-text-color); --pm-ic: var(--secondary-text-color); --pm-aic: var(--plc-a); --pm-bg: rgba(255,255,255,.07);
  --pm-abg: rgba(255,255,255,.16); --pm-bc: rgba(255,255,255,.16); --pm-abc: rgba(255,255,255,.3); --pm-blur: blur(10px) saturate(1.3); }
.pm-neon { --pm-c: var(--secondary-text-color); --pm-ac: var(--primary-text-color); --pm-ic: var(--plc-a); --pm-aic: var(--plc-a); --pm-bg: transparent;
  --pm-abg: color-mix(in srgb, var(--plc-a) 10%, transparent); }
@media (prefers-reduced-motion: reduce) { .plc-tabs.pm .plc-tab { transition: none; } }
.plc-msg { color: var(--secondary-text-color); font-size: .9em; padding: 12px 2px; }
.plc-msg.err { color: var(--error-color, #f44336); }
.plc-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.plc.tablet .plc-body.with-detail { grid-template-columns: minmax(0, 1fr) minmax(280px, 34%); }
.plc-grid { display: grid; grid-template-columns: repeat(var(--plc-across, 6), minmax(0, 1fr)); gap: 14px 12px; }
.plc.phone .plc-grid { gap: 10px 8px; }
.plc-tile { position: relative; border: none; background: none; padding: 0; text-align: left; min-width: 0; }
.plc-poster { position: relative; aspect-ratio: 2 / 3; width: 100%; border-radius: var(--plc-r); background: var(--plc-bg2) center / cover no-repeat;
  overflow: hidden; display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color); font-size: .75em; text-align: center; }
.plc.shadows .plc-poster { box-shadow: 0 4px 14px rgba(0,0,0,.45); }
.plc-tile.sel .plc-poster { outline: 2px solid var(--plc-a); outline-offset: 2px; }
.plc-play { position: absolute; right: 8px; bottom: 8px; width: 38px; height: 38px; border-radius: 50%; border: none; display: flex; align-items: center;
  justify-content: center; background: var(--plc-a); color: #fff; opacity: .92; box-shadow: 0 2px 8px rgba(0,0,0,.5); }
.plc-play ha-icon { --mdc-icon-size: 22px; }
.plc-badge { position: absolute; top: 6px; left: 6px; padding: 2px 6px; border-radius: 4px; font-size: .68em; font-weight: 700; letter-spacing: .04em;
  text-transform: uppercase; background: var(--plc-flag-c, var(--plc-a)); color: #fff; }
.plc-t { margin-top: 6px; font-size: var(--plc-title-px, 14px); font-weight: var(--plc-title-w, 700); line-height: 1.25; color: var(--plc-title-c, var(--primary-text-color));
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.plc-s { font-size: var(--plc-line-px, 12px); color: var(--plc-line-c, var(--secondary-text-color)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plc.tshadow .plc-t, .plc.tshadow .plc-s { text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.plc-sentinel { height: 30px; }
.plc-sec { margin: 4px 0 16px; }
.plc-sec-h { display: flex; align-items: baseline; gap: 8px; margin: 0 0 8px; font-size: var(--plc-sec-px, 12px); font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
  color: var(--plc-a); }
.plc-sec-h .n { color: var(--secondary-text-color); letter-spacing: .04em; }
.plc-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; scroll-snap-type: x proximity; }
.plc-row > .plc-tile { flex: 0 0 calc((100% - (var(--plc-across, 6) - 1) * 12px) / var(--plc-across, 6) - 4px); scroll-snap-align: start; }
.plc-row.fanart > .plc-tile { flex: 0 0 calc((100% - (var(--plc-across-fan, 3) - 1) * 12px) / var(--plc-across-fan, 3) - 4px); }
.plc-row.fanart .plc-poster, .plc-grid.fanart .plc-poster { aspect-ratio: 16 / 9; }
.plc-grid.fanart { grid-template-columns: repeat(var(--plc-across-fan, 3), minmax(0, 1fr)); }
.plc.phone .plc-tvs { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
/* looks on rows and grids */
.plc-ttype { display: none; position: absolute; right: 8px; bottom: 54px; --mdc-icon-size: 18px; color: #fff; filter: drop-shadow(0 1px 2px rgba(0,0,0,.9)); z-index: 2; }
.lk-type .plc-ttype { display: block; }
.lk-bordered .plc-poster, .lk-bordered .plc-sess, .lk-bordered .plc-lrow { border-left: 4px solid var(--plc-a); }
.lk-nostatus .plc-watched { display: none; }
.lk-hide-title .plc-t, .lk-hide-info .plc-s.l1, .lk-hide-when .plc-s.l2, .lk-hide-meta .plc-s.l3, .lk-hide-extra .plc-s.l4, .lk-hide-extra .plc-s.l5 { display: none; }
.plc-poster.fade { background-color: #0d0d0d; }
.plc-fadeimg { position: absolute; top: 0; right: 0; bottom: 0; width: var(--plc-fade-w, 62%); background: center / cover no-repeat; border-radius: inherit;
  -webkit-mask-image: linear-gradient(to right, transparent var(--plc-fade-s, 0%), rgb(0 0 0 / .04) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .15), rgb(0 0 0 / .15) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .3), rgb(0 0 0 / .35) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .45), rgb(0 0 0 / .6) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .6), rgb(0 0 0 / .82) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .75), rgb(0 0 0 / .95) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .9), #000 calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%)));
  mask-image: linear-gradient(to right, transparent var(--plc-fade-s, 0%), rgb(0 0 0 / .04) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .15), rgb(0 0 0 / .15) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .3), rgb(0 0 0 / .35) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .45), rgb(0 0 0 / .6) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .6), rgb(0 0 0 / .82) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .75), rgb(0 0 0 / .95) calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%) * .9), #000 calc(var(--plc-fade-s, 0%) + var(--plc-fade-d, 45%))); }
.plc-poster.fade .plc-fan-text { background: none; right: calc(var(--plc-fade-w, 62%) - 30%); top: 0; display: flex; flex-direction: column; justify-content: center; }
.plc-sess.fan { background-size: cover; background-position: center; }
.plc-sess.fan .plc-t, .plc-sess.fan .plc-s { color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.plc-fan-text .plc-t { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: normal; margin-top: 0; }
.plc-fan-text { max-height: 100%; overflow: hidden; box-sizing: border-box; display: flex; flex-direction: column; justify-content: flex-end; }
.plc-fan-text { position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 10px 8px; text-align: left;
  background: none; }
/* Fanart text backdrop: a gradient layer over the image (direction, reach, opacity), a box only behind the text, or none */
.plc-fanshade { position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: var(--plc-fanbg, linear-gradient(to top, rgb(0 0 0 / .9) 0%, rgb(0 0 0 / .63) 29%, rgb(0 0 0 / 0) 65%)); }
.lk-tbg-box .plc-fanshade, .lk-tbg-none .plc-fanshade { display: none; }
.lk-tbg-box .plc-fan-text { left: 8px; right: auto; bottom: 8px; max-width: calc(100% - 16px); padding: 8px 10px; background: none; isolation: isolate; overflow: visible; }
.lk-tbg-box .plc-fan-text::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: 8px; background: rgb(0 0 0 / var(--plc-fanbg-a, .9));
  filter: blur(var(--plc-fanbg-blur, 0px)); -webkit-mask-image: var(--plc-boxmask, none); mask-image: var(--plc-boxmask, none); }
.plc-fan-text .plc-t, .plc-fan-text .plc-s { color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.85); }
.plc-fan-text .plc-s { color: rgba(255,255,255,.75); }
.plc-hero { position: relative; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 0; border-radius: calc(var(--plc-r) + 4px);
  overflow: hidden; background: var(--plc-bg2); min-height: 200px; }
.plc-hero-img { background: center / cover no-repeat; min-height: 200px; }
.plc-hero-info { padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.plc-eyebrow { font-size: .7em; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: var(--plc-a); }
.plc-big { font-size: 1.5em; font-weight: 800; line-height: 1.15; margin: 0; overflow-wrap: anywhere; }
.plc-meta { color: var(--secondary-text-color); font-size: .9em; }
.plc-pager { display: flex; gap: 6px; align-items: center; margin-top: auto; font-size: .8em; color: var(--secondary-text-color); }
.plc-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.plc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 16px; border-radius: 999px; border: 1px solid var(--divider-color, #555);
  background: transparent; font-weight: 700; font-size: .92em; }
.plc-btn.main { background: var(--plc-a); border-color: var(--plc-a); color: #fff; flex: 1 1 auto; }
.plc-btn:disabled { opacity: .45; cursor: default; }
.plc-icon-btn { width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--divider-color, #555); background: transparent;
  display: inline-flex; align-items: center; justify-content: center; flex: none; }
.plc-detail { border-radius: calc(var(--plc-r) + 4px); background: var(--plc-bg2); overflow: hidden; align-self: start; position: sticky; top: 0; }
/* tablets: the details panel stays in view while the library scrolls (below the dashboard's header; its own scroll when tall) */
.plc.tablet .plc-body.with-detail .plc-detail { top: calc(var(--header-height, 56px) + 8px); max-height: calc(100vh - var(--header-height, 56px) - 16px); overflow-y: auto; scrollbar-width: thin; }
.plc.tablet .plc-detail-slot { align-self: stretch; }
.plc.side.fit .plc-body.with-detail .plc-detail { top: 0; max-height: calc(100dvh - var(--plc-offset, 80px) - 8px); }
.plc-detail-img { aspect-ratio: 16 / 10; background: center / cover no-repeat; position: relative; }
.plc-detail-img .plc-big { position: absolute; left: 14px; right: 14px; bottom: 12px; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.9); }
.plc-detail-img::after { content: ''; position: absolute; inset: 40% 0 0 0; background: linear-gradient(transparent, rgba(0,0,0,.75)); pointer-events: none; }
.plc-detail-head { z-index: 1; }
.plc-detail-close { z-index: 2; }
.plc-detail-body { padding: 12px 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.plc-detail-close { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,.55); border: none; color: #fff; }
.plc.phone .plc-detail { position: fixed; inset: 0; z-index: 8; border-radius: 0; overflow-y: auto; background: var(--card-background-color, var(--ha-card-background, #1c1c1c)); }
.plc.phone .plc-detail .plc-btns { position: sticky; bottom: 0; padding: 10px 0 4px; background: inherit; }
.plc-eps { display: flex; flex-direction: column; gap: 2px; }
.plc-eps [data-eplist] { display: flex; flex-direction: column; gap: 2px; max-height: 50vh; overflow-y: auto; }
.plc-target { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.plc-target .plc-sp { flex: 1; }
.plc-firstrow { gap: 8px; }
.plc-target .plc-act ha-icon { --mdc-icon-size: 16px; }
.plc.phone .plc-eps { max-height: none; }
.plc-ep { display: flex; align-items: center; gap: 8px; padding: 7px 4px; border-bottom: 1px solid var(--divider-color, #333); font-size: .9em; }
.plc-ep span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plc-ep .plc-icon-btn { width: 32px; height: 32px; }
.plc-np { position: relative; border-radius: calc(var(--plc-r) + 4px); overflow: hidden; margin-bottom: 12px; background: #000; color: #fff; }
.plc-np-bg { position: absolute; inset: 0; background: center / cover no-repeat; opacity: .35; filter: blur(2px); }
.plc-np-in { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 16px; padding: 14px 16px; align-items: center; }
.plc-np-art { width: 92px; aspect-ratio: 2 / 3; border-radius: 8px; background: rgba(255,255,255,.08) center / cover no-repeat; }
.plc-np .plc-meta { color: rgba(255,255,255,.75); }
.plc-np .plc-icon-btn, .plc-np .plc-btn { border-color: rgba(255,255,255,.35); color: #fff; }
.plc-np-ctl { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.plc-np-ctl .big { width: 52px; height: 52px; background: var(--plc-a); border-color: var(--plc-a); }
.plc-np-ctl .big ha-icon { --mdc-icon-size: 28px; }
.plc-bar { position: relative; height: 22px; display: flex; align-items: center; touch-action: none; }
.plc-bar.seek { cursor: pointer; }
.plc-bar-track { width: 100%; height: 5px; border-radius: 3px; background: rgba(255,255,255,.25); overflow: hidden; }
.plc-bar-fill { height: 100%; background: var(--plc-a); width: 0; }
.plc-times { display: flex; justify-content: space-between; font-size: .78em; color: rgba(255,255,255,.75); font-variant-numeric: tabular-nums; }
.plc.phone .plc-np.mini { position: sticky; bottom: 0; z-index: 6; margin: 10px calc(-1 * var(--plc-pad, 14px)) calc(-1 * var(--plc-pad, 14px)); border-radius: 0; }
.plc.phone .plc-np.mini .plc-np-in { grid-template-columns: auto minmax(0, 1fr) auto; padding: 8px 12px; gap: 10px; }
.plc.phone .plc-np.mini .plc-np-art { width: 40px; }
.plc.phone .plc-np.mini .plc-big { font-size: 1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plc-sheet { position: fixed; inset: 0; z-index: 9; background: rgba(0,0,0,.6); display: flex; align-items: flex-end; justify-content: center; }
.plc.tablet .plc-sheet { align-items: center; }
.plc-sheet-in { width: min(520px, 100%); max-height: 90vh; overflow-y: auto; background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
  border-radius: 16px 16px 0 0; padding: 0 0 14px; }
.plc.tablet .plc-sheet-in { border-radius: 16px; }
.plc-frame { width: 100%; aspect-ratio: 16 / 9; border: 0; display: block; background: #000; }
.plc-cards { display: grid; gap: 12px; margin-top: 8px; }

.plc-wrap { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.plc.side .plc-wrap { grid-template-columns: minmax(260px, 32%) minmax(0, 1fr); }
.plc-content { min-width: 0; display: flex; flex-direction: column; }
.plc-side { align-self: start; position: sticky; top: 0; display: flex; flex-direction: column; gap: 12px; }
.plc-side[hidden] { display: none; }
.plc-side-card { position: relative; border-radius: calc(var(--plc-r) + 6px); overflow: hidden; background: #0b0b0b; color: #fff; }
.plc.side.fit .plc-wrap { height: calc(100dvh - var(--plc-offset, 80px)); min-height: 360px; }
.plc.side.fit .plc-side { position: static; height: 100%; min-height: 0; overflow: hidden; }
.plc.side.fit .plc-side-card { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.plc.side.fit .plc-side-art { flex: 1 1 auto; min-height: 100px; aspect-ratio: auto; background-size: contain; background-color: #000; }
.plc.side.fit .plc-side-info { flex: none; }
.plc.side.fit .plc-playon { flex: 0 1 auto; min-height: 0; max-height: 38%; overflow-y: auto; }
.plc.side.fit .plc-content { height: 100%; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; }
.plc.side.fit .plc-top { position: sticky; top: 0; z-index: 5; background: var(--ha-card-background, var(--card-background-color, #1c1c1c)); padding-bottom: 4px; }
.plc-side-art { aspect-ratio: 2 / 3; background: rgba(255,255,255,.06) center / cover no-repeat; display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,.45); font-size: .9em; }
.plc-side-info { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; text-align: center; }
.plc-side-info .plc-big { font-size: 1.25em; }
.plc-side-info .plc-meta { color: rgba(255,255,255,.7); }
.plc-side-info .plc-np-ctl { justify-content: center; }
.plc-side-card .plc-icon-btn, .plc-side-card .plc-btn { border-color: rgba(255,255,255,.3); color: #fff; }
.plc-playon { border-radius: calc(var(--plc-r) + 6px); background: var(--plc-bg2); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.plc-playon-h { font-size: .78em; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--plc-a); }
.plc-tvrow { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--divider-color, #444);
  background: transparent; text-align: left; width: 100%; }
.plc-tvrow.on { border-color: var(--plc-a); background: color-mix(in srgb, var(--plc-a) 14%, transparent); }
.plc-tvrow b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plc-tvrow small { color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }
  border-radius: calc(var(--plc-r) + 4px); }
.plc-prog { height: 4px; border-radius: 2px; background: rgba(0,0,0,.45); position: absolute; left: 6px; right: 6px; bottom: 6px; overflow: hidden; }
.plc-prog > div { height: 100%; background: var(--plc-a); }
.plc-watched { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border-radius: 50%; background: rgba(0,0,0,.6); color: #fff;
  display: flex; align-items: center; justify-content: center; }
.plc-watched ha-icon { --mdc-icon-size: 16px; }
.plc-watch { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
.plc-sess { flex: 0 0 260px; display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 10px; padding: 8px; border-radius: 12px; background: var(--plc-bg2); }
.plc-sess.tap { position: relative; border: 1px solid transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; padding-right: 34px; }
.plc-sess.tap:hover, .plc-sess.tap:focus-visible { border-color: var(--plc-a); outline: none; }
.plc-sess-go { position: absolute; top: 8px; right: 8px; --mdc-icon-size: 18px; color: var(--secondary-text-color); }
.plc-movebtn { align-self: center; margin-top: 4px; }
.plc-libwatch { margin-bottom: 14px; }
.plc-watch.pop { flex-direction: column; overflow: visible; }
.plc-watch.pop .plc-sess { flex: none; width: min(420px, 80vw); }
.plc-sess-art { aspect-ratio: 2 / 3; border-radius: 6px; background: rgba(127,127,127,.2) center / cover no-repeat; }
.plc-sess-art.app { position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; color: var(--secondary-text-color); }
.plc-sess-art.app i { position: absolute; inset: 0; background: center / cover no-repeat; }
.plc-sess .plc-bar-track { height: 4px; background: color-mix(in srgb, var(--primary-text-color) 18%, transparent); margin-top: 6px; }
.plc-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--plc-li-w, 340px)), 1fr)); gap: 12px; }
.plc-li { position: relative; display: block; width: 100%; min-height: var(--plc-li-h, 150px); padding: 0; text-align: left; overflow: hidden; color: inherit;
  border-radius: var(--plc-radius, 10px); border: 2px solid var(--plc-li-bd, #000); background: var(--plc-li-bg, #0d0d0d); }
.plc.shadows .plc-li { box-shadow: 0 4px 12px rgba(0,0,0,.5); }
.plc-li-img { position: absolute; top: 0; right: 0; bottom: 0; width: 60%; background: center / cover no-repeat;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 40%); mask-image: linear-gradient(to right, transparent, #000 40%); }
.plc-li-text { position: relative; padding: 10px 14px; max-width: 64%; display: flex; flex-direction: column; gap: 0; line-height: 1.3; }
.plc-li .plc-t { margin: 0; -webkit-line-clamp: 1; color: var(--plc-title-c, #d3d3d3); }
.plc-li .plc-s { color: var(--plc-line-c, #9a9a9a); }
.plc-facts { position: absolute; z-index: 3; display: flex; gap: 4px; align-items: center; --mdc-icon-size: var(--plc-fact-px, 20px); }
.plc-facts.li { top: 8px; right: 8px; flex-direction: row-reverse; }
.plc-facts.tile { top: 6px; left: 6px; flex-wrap: wrap; }
.plc-flagi { display: inline-flex; align-items: center; gap: 3px; padding: 3px; border-radius: 6px; background: rgba(0,0,0,.55); color: var(--plc-flag-c, var(--plc-a)); }
.plc-flagi.labels { padding: 2px 8px; border-radius: 999px; background: rgba(0,0,0,.65); filter: none; font-size: calc(var(--plc-fact-px, 20px) * .6); font-weight: 700;
  --mdc-icon-size: calc(var(--plc-fact-px, 20px) * .7); border: 1px solid color-mix(in srgb, var(--plc-flag-c, var(--plc-a)) 60%, transparent); }
.plc-flagi.go { cursor: pointer; }
.plc-flagi.go:hover { filter: brightness(1.25); }
.plc-li-info { position: absolute; top: 8px; right: 8px; z-index: 2; --mdc-icon-size: 22px; color: var(--plc-flag-c, var(--plc-a)); filter: drop-shadow(0 1px 3px rgba(0,0,0,.8)); }
.plc-li-flag { position: absolute; top: 0; right: 0; width: 0; height: 0; border-style: solid; border-width: 0 46px 46px 0;
  border-color: transparent var(--plc-flag-c, var(--plc-a)) transparent transparent; }
.plc-li.poster { display: grid; grid-template-columns: calc(var(--plc-li-h, 144px) * 2 / 3) minmax(0, 1fr); min-height: var(--plc-li-h, 0); }
.plc-s.l1 { font-weight: var(--plc-l1-w, 400); font-size: var(--plc-l1-px, var(--plc-line-px, 12px)); color: var(--plc-l1-c, var(--plc-line-c, var(--secondary-text-color))); }
.plc-s.l2 { font-weight: var(--plc-l2-w, 400); font-size: var(--plc-l2-px, var(--plc-line-px, 12px)); color: var(--plc-l2-c, var(--plc-line-c, var(--secondary-text-color))); }
.plc-s.l3 { font-weight: var(--plc-l3-w, 400); font-size: var(--plc-l3-px, var(--plc-line-px, 12px)); color: var(--plc-l3-c, var(--plc-line-c, var(--secondary-text-color))); }
.plc-s.l4, .plc-s.l5 { font-weight: var(--plc-l4-w, 400); font-size: var(--plc-l4-px, var(--plc-line-px, 12px)); color: var(--plc-l4-c, var(--plc-line-c, var(--secondary-text-color))); }
.plc-li .plc-s.l1 { color: var(--plc-l1-c, var(--plc-line-c, #9a9a9a)); } .plc-li .plc-s.l2 { color: var(--plc-l2-c, var(--plc-line-c, #9a9a9a)); }
.plc-li .plc-s.l3 { color: var(--plc-l3-c, var(--plc-line-c, #9a9a9a)); } .plc-li .plc-s.l4, .plc-li .plc-s.l5 { color: var(--plc-l4-c, var(--plc-line-c, #9a9a9a)); }
.plc-sec-bar .name.caps, .plc-sec-h .name.caps { font-size: var(--plc-sec-px, 12px); font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--plc-a); }
.plc-sec-h .name.plain { font-size: 16px; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--primary-text-color); }
.plc-sec-h > ha-icon { color: var(--plc-a); }
.plc-sec-h .plc-kchips { margin-left: auto; display: flex; gap: 4px; }
.plc-sec-bar .plc-kchips { display: flex; gap: 4px; }
.plc-kchips .plc-chip { padding: 3px 10px; font-size: .78em; }
.plc-li.poster .plc-li-img { position: static; width: auto; aspect-ratio: 2 / 3; -webkit-mask-image: none; mask-image: none; }
.plc-li.poster .plc-li-text { max-width: none; }
.plc-li .plc-play { right: 10px; bottom: 10px; }
.plc-sec-bar { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 12px 8px 4px; margin: 0 0 10px; background: transparent;
  border: none; border-radius: 0; text-align: left; }
.plc-sec-h.div, .plc-sec-bar.div { border-bottom: 1px solid var(--plc-div-c, var(--plc-head-c, var(--plc-a))); padding-bottom: 6px; }
.plc-sec-h.caps-h, .plc-sec-bar.caps-h { --plc-head-c: var(--plc-a); }
.plc-sec-h.plain-h, .plc-sec-bar.plain-h { --plc-head-c: var(--primary-text-color); }
.plc-sec-bar > ha-icon:first-child { --mdc-icon-size: 30px; color: var(--disabled-text-color, #9e9e9e); }
.plc-sec-bar.has > ha-icon:first-child { color: var(--plc-a); }
.plc-sec-bar .name { flex: 1; font-size: 16px; }
.plc-sec-bar .n { color: var(--secondary-text-color); font-size: 14px; }
.plc-sec-bar .chev { transition: transform .2s; }
.plc-sec.closed .plc-sec-bar .chev { transform: rotate(-90deg); }
.plc-sec.closed .plc-sec-body { display: none; }
.plc-sec.closed .plc-watch, .plc-watch[hidden] { display: none; }
.plc-sec-h.tap { cursor: pointer; -webkit-user-select: none; user-select: none; }
.plc-sec-h > ha-icon { --mdc-icon-size: 18px; align-self: center; }
.plc-sec-h .chev { display: inline-block; font: inherit; font-size: 1.6em; color: inherit; line-height: .6; transform: rotate(90deg); transition: transform .2s; align-self: center; }
.plc-sec-h .chev.end { margin-left: auto; }
.plc-sec.closed .plc-sec-h .chev { transform: rotate(0deg); }
.plc-sec-body.limit .plc-row { overflow-x: hidden; }
.plc-sec-body.scroll .plc-row { overflow-x: auto; }
.plc-sec-body.limit .plc-row > .plc-tile, .plc-sec-body.scroll .plc-row > .plc-tile {
  flex: 0 0 calc((100% - (var(--plc-show, 5) - 1) * 12px) / var(--plc-show, 5) - 4px); }
.plc-sec-body.limit .plc-row { overflow-x: auto; }
.plc-sec-body.scroll .plc-list { grid-template-columns: minmax(0, 1fr); overflow-y: auto; scrollbar-width: thin;
  max-height: calc(var(--plc-show, 5) * (var(--plc-li-h, 150px) + 16px) - 12px); }
.plc-sec-body.limit .plc-list { grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--plc-li-w, 340px)), 1fr)); }
.plc-sec-body.auto .plc-row, .plc-sec-body.auto .plc-list { scrollbar-width: none; }
/* auto-scroll moves a pixel or two at a time: snapping would pull it straight back */
.plc-sec-body.auto .plc-row, .plc-sec-body.auto .plc-list { scroll-snap-type: none; scroll-behavior: auto; }
.plc-sec-body.auto .plc-row::-webkit-scrollbar, .plc-sec-body.auto .plc-list::-webkit-scrollbar { display: none; }
.plc-btn, .plc-act, [data-cwmark] { position: relative; }
.plc-act.plc-hold, [data-cwmark].plc-hold { overflow: hidden; }
.plc-hold { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.plc-hold::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: rgb(255 255 255 / .35);
  animation: plc-holdfill var(--hold-ms, 2000ms) linear forwards; }
@keyframes plc-holdfill { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
.plc-fade { transition: opacity var(--plc-fade-ms, 1200ms) ease-in-out; }
/* the banner sliding to the next title (out one way, the next one in from the other side) */
.plc-sliding { overflow: hidden; }
.plc-slide { transition: transform var(--plc-fade-ms, 1200ms) ease-in-out, opacity var(--plc-fade-ms, 1200ms) ease-in-out; }
.plc-slide.to-left { transform: translateX(-100%); opacity: 0; } .plc-slide.from-left { transform: translateX(100%); opacity: 0; transition: none; }
.plc-slide.to-right { transform: translateX(100%); opacity: 0; } .plc-slide.from-right { transform: translateX(-100%); opacity: 0; transition: none; }
.plc-slide.to-up { transform: translateY(-100%); opacity: 0; } .plc-slide.from-up { transform: translateY(100%); opacity: 0; transition: none; }
.plc-slide.to-down { transform: translateY(100%); opacity: 0; } .plc-slide.from-down { transform: translateY(-100%); opacity: 0; transition: none; }
@media (prefers-reduced-motion: reduce) { .plc-slide { transition: none; } }
.plc-fade.out { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .plc-fade { transition: none; } }
.plc-main.searching > .plc-sec:not([data-sec="search"]), .plc-main.searching > .plc-cards { display: none; }
.plc-sec-h.slots, .plc-sec-bar.slots { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; }
.slots > .sl { display: flex; align-items: center; gap: 8px; min-width: 0; }
.slots > .sl.l { justify-content: flex-start; } .slots > .sl.c { justify-content: center; } .slots > .sl.r { justify-content: flex-end; }
.plc-sec-tt { display: inline-flex; align-items: baseline; gap: 8px; min-width: 0; }
.plc-sec-h.slots.noc, .plc-sec-bar.slots.noc { grid-template-columns: minmax(0, 1fr) 0 auto; }
.plc-sec-tt .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.plc-sec-tt > ha-icon { align-self: center; }
.slots .plc-kchips, .slots .plc-viewall { margin-left: 0; }
.plc-viewall { margin-left: auto; border: none; background: none; color: var(--secondary-text-color); font-size: .9em; letter-spacing: .04em; }
.plc-top { display: block; margin-bottom: 8px; }
/* a header / footer row: left and right columns of equal width, the middle exactly in the center; items wrap inside their own column */
.plc-hrow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr); align-items: center; gap: 10px; }
.plc.phone .plc-hrow { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
.plc.phone .plc-hl, .plc.phone .plc-hc, .plc.phone .plc-hr { flex: 1 1 auto; width: 100%; flex-wrap: nowrap; }
.plc.phone .plc-hl:empty, .plc.phone .plc-hc:empty, .plc.phone .plc-hr:empty { display: none; }
.plc.phone .plc-hr { justify-content: flex-start; }
.plc.phone .plc-hrow .plc-search { flex: 1 1 auto; width: auto; max-width: none; }
.plc.phone .plc-hrow .plc-tabs { flex: 1 1 auto; overflow-x: auto; }
.plc-hrow .plc-tabs { flex-shrink: 0; max-width: 100%; }
.plc-tabs .plc-tab { flex: none; }
.plc-fbtn ha-icon { --mdc-icon-size: 18px; }
.plc-fbtns { display: inline-flex; gap: 6px; }
.plc-fchip-l { color: var(--secondary-text-color); font-weight: 500; }
.plc-fchip.on .plc-fchip-l { color: inherit; opacity: .8; }
.plc-fcell { min-width: 0; }
/* details header */
.plc-detail-head { position: absolute; left: 14px; right: 14px; bottom: 12px; display: flex; gap: 12px; align-items: flex-end; }
.plc-detail-poster { flex: none; width: 84px; aspect-ratio: 2 / 3; border-radius: 6px; background: #222 center / cover no-repeat; box-shadow: 0 4px 14px rgba(0,0,0,.6); }
.plc-detail-ttl { min-width: 0; }
.plc-detail-head .plc-big { position: static; margin: 0; }
.plc-rates { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.plc-rate, .plc-av { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 5px; font-size: .78em; background: rgba(0,0,0,.55); color: #fff; }
.plc-rate b { color: #f5c518; font-weight: 700; }
.plc-av { border: 1px solid rgba(255,255,255,.5); background: rgba(0,0,0,.35); font-weight: 600; letter-spacing: .03em; }
/* episode picker */
.plc-seasons { display: flex; flex: none; gap: 6px; padding-bottom: 6px; }
.plc-seasons .plc-chip { flex: none; }
.plc-seasons ha-icon { --mdc-icon-size: 15px; }
.plc-seasons small { opacity: .7; }
.plc-ep { display: flex; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--divider-color, #333); }
.plc-ep:last-child { border-bottom: none; }
.plc-ep.next .plc-ep-img { outline: 2px solid var(--plc-a); }
.plc-ep.seen .plc-ep-txt { opacity: .7; }
.plc-ep-img { position: relative; flex: none; width: 112px; aspect-ratio: 16 / 9; border: none; padding: 0; border-radius: 6px; background: #222 center / cover no-repeat; color: #fff; cursor: pointer; overflow: hidden; }
.plc-ep-img > ha-icon { position: absolute; inset: 0; margin: auto; width: 30px; height: 30px; --mdc-icon-size: 22px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(0,0,0,.5); }
.plc-ep-txt { flex: 1 1 auto; min-width: 0; }
.plc-ep .plc-watched { top: 3px; right: 3px; }
.plc-icon-gap { flex: none; width: 36px; }
.plc.phone .plc-ep-img { width: 96px; }
/* Up next */
.plc-upnext { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 12px; padding: 10px; border-radius: var(--plc-radius, 10px); background: rgba(127,127,127,.12); border-left: 3px solid var(--plc-a); }
.plc-upnext.compact { margin-top: 8px; padding: 6px 8px; width: 100%; box-sizing: border-box; }
.plc-upnext-img { flex: none; width: 96px; aspect-ratio: 16 / 9; border-radius: 6px; background: #222 center / cover no-repeat; }
.plc-upnext-txt { flex: 1 1 140px; min-width: 0; }
.plc-upnext-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.plc-btn.on { border-color: var(--plc-a); color: var(--plc-a); }
/* list view */
.plc-grid.list { grid-template-columns: minmax(0, 1fr) !important; gap: 8px; }
.plc-lrow { position: relative; display: flex; gap: 12px; align-items: stretch; width: 100%; padding: 6px; border: none; border-radius: var(--plc-radius, 10px);
  background: rgba(127,127,127,.08); color: inherit; text-align: left; font: inherit; cursor: pointer; }
.plc-lrow.sel { outline: 2px solid var(--plc-a); }
.plc-lrow-img { position: relative; flex: none; width: 64px; aspect-ratio: 2 / 3; border-radius: 6px; background: #222 center / cover no-repeat; overflow: hidden; }
.plc-lrow-txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 3px; padding-right: 48px; }
.plc-lrow-sum { color: var(--secondary-text-color); font-size: .82em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.plc-lrow .plc-play { top: 50%; bottom: auto; transform: translateY(-50%); }
.plc-lrow .plc-watched { top: 3px; right: 3px; }
/* A–Z jump bar */
.plc-gridwrap.jump { position: relative; padding-right: 26px; }
.plc-jump-slot { position: absolute; top: 0; right: 0; bottom: 0; width: 22px; }
.plc-jump { position: sticky; top: calc(var(--header-height, 0px) + 8px); display: flex; flex-direction: column; align-items: center; max-height: calc(100vh - var(--header-height, 56px) - 24px); overflow-y: auto; scrollbar-width: none; }
.plc-jump-l { border: none; background: none; color: var(--secondary-text-color); font: inherit; font-size: 11px; font-weight: 600; line-height: 1; padding: 3px 4px; cursor: pointer; min-height: 18px; }
.plc-jump-l.on, .plc-jump-l:hover { color: var(--plc-a); }
/* recent searches */
.plc-recent { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
.plc-recent-h { color: var(--secondary-text-color); font-size: .8em; text-transform: uppercase; letter-spacing: .06em; }
.plc-recent .plc-chip { padding: 4px 10px; font-size: .85em; }
.plc-recent ha-icon { --mdc-icon-size: 15px; }
.plc-recent-clear { opacity: .7; }
/* compact phone header: one row, tabs scroll, buttons on the right */
.plc.onerow .plc-hrow { display: flex; flex-direction: row; flex-wrap: nowrap; align-items: center; }
.plc.onerow .plc-hl { flex: 1 1 auto; min-width: 0; width: auto; overflow: hidden; }
.plc.onerow .plc-hc { flex: none; width: auto; }
.plc.onerow .plc-hr { flex: none; width: auto; justify-content: flex-end; gap: 6px; }
.plc.onerow .plc-hl .plc-tabs { overflow-x: auto; flex: 1 1 auto; min-width: 0; }
.plc.onerow .plc-title { font-size: min(var(--plc-head-px, 20px), 18px); flex: none; }
.plc-sbar { display: flex; gap: 8px; align-items: center; }
.plc-sbar .plc-search { flex: 1 1 auto; width: auto; max-width: none; }
.plc-tvbtn ha-icon { --mdc-icon-size: 18px; }
.plc-tvbtn-n { max-width: 7em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plc.phone .plc-tvbtn-n { display: none; }
.plc-menuchip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-width: 0; }
.plc-menuchip-n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.plc-menuchip ha-icon { --mdc-icon-size: 18px; flex: none; }
.plc-menuchip .chev { opacity: .7; }
.plc-menubtn { position: relative; }
.plc-menubtn .plc-dot { position: absolute; top: 6px; right: 6px; }
.plc-menu { position: absolute; z-index: 12; padding: 6px; border-radius: 14px; background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
  border: 1px solid var(--divider-color, rgba(255,255,255,.12)); box-shadow: 0 12px 32px rgba(0,0,0,.55); max-height: 70vh; overflow-y: auto; box-sizing: border-box;
  animation: plc-menu-in .14s ease-out; }
@keyframes plc-menu-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .plc-menu { animation: none; } }
.plc-menu-h { padding: 6px 10px 4px; color: var(--secondary-text-color); font-size: .72em; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.plc-menu-i { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 6px 10px; border: none; border-radius: 10px; background: none;
  color: inherit; font: inherit; text-align: left; cursor: pointer; }
.plc-menu-i:hover, .plc-menu-i:focus-visible { background: rgba(127,127,127,.14); outline: none; }
.plc-menu-i.on { background: color-mix(in srgb, var(--plc-a) 16%, transparent); }
.plc-menu-i > ha-icon:first-child { --mdc-icon-size: 22px; color: var(--secondary-text-color); flex: none; }
.plc-menu-i.on > ha-icon:first-child, .plc-menu-i .tick { color: var(--plc-a); }
.plc-menu-t { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.plc-menu-t b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plc-menu-t small { color: var(--secondary-text-color); font-size: .8em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plc-menu-i .plc-dot { flex: none; }
.plc.onerow .plc-hl .plc-menuchip { flex: 0 1 auto; min-width: 0; }
.plc.onerow .plc-hl { min-width: 7em; }
/* bigger touch targets on phones */
.plc.phone .plc-chip, .plc.phone .plc-tab, .plc.phone .plc-select, .plc.phone .plc-search, .plc.phone .plc-btn { min-height: max(34px, calc(44px / var(--plc-scale, 1))); }
.plc.phone .plc-icon-btn, .plc.phone .plc-np-ctl .plc-icon-btn {
  width: max(34px, calc(44px / var(--plc-scale, 1))); height: max(34px, calc(44px / var(--plc-scale, 1))); }
.plc.phone .plc-top .plc-chip, .plc.phone .plc-top .plc-select { padding-top: 0; padding-bottom: 0; }
/* active-filter chips */
.plc-achips { display: flex; gap: 6px; flex-wrap: wrap; }
.plc-achips .plc-chip { padding: 4px 10px; font-size: .8em; }
.plc-achips ha-icon { --mdc-icon-size: 14px; }
.plc-achips .plc-menuchip .chev { opacity: .7; }
/* bottom tab bar */
.plc-footer { margin: 12px calc(-1 * var(--plc-pad, 14px)) calc(-1 * var(--plc-pad, 14px)); padding: 6px var(--plc-pad, 14px) calc(6px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--divider-color, #333); background: var(--card-background-color, var(--ha-card-background, #1c1c1c)); }
.plc-footer.sticky { position: sticky; bottom: 0; z-index: 7; }
.plc-footer .plc-hrow { display: flex; flex-direction: row !important; flex-wrap: nowrap; align-items: center; }
.plc-footer .plc-hl, .plc-footer .plc-hc, .plc-footer .plc-hr { width: auto !important; }
.plc-footer .plc-hc { flex: 1 1 auto; justify-content: center; min-width: 0; }
.plc-footer .plc-tabs { margin: 0; flex: 1 1 auto; justify-content: space-around; }
.plc-footer .plc-tabs .plc-tab { flex: 1 0 auto; }
.plc.bnav .plc-np.mini { margin-bottom: 0; }
/* header that hides while scrolling down */
.plc.stickyhdr { overflow: visible; }
.plc.stickyhdr .plc-top { position: sticky; top: var(--header-height, 0px); z-index: 6; background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
  transition: transform .25s ease, opacity .25s ease; padding-top: 4px; }
.plc.stickyhdr.hdr-hidden .plc-top { transform: translateY(-110%); opacity: 0; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .plc.stickyhdr .plc-top { transition: none; } }
.plc-fcount { display: inline-flex; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: color-mix(in srgb, var(--primary-text-color) 16%, transparent);
  color: var(--primary-text-color); font-size: .75em; font-weight: 700; align-items: center; justify-content: center; }
.plc-fpanel-h { display: flex; align-items: center; gap: 8px; }
.plc-sheet.fit { align-items: center; }
.plc-sheet.fit .plc-sheet-in { width: auto; max-width: min(520px, calc(100% - 24px)); border-radius: 16px; }
.plc-sheet.fit .plc-fpanel-h { gap: 6px; }
.plc-sheet.fit .plc-fpanel-h .plc-big { margin: 0 12px 0 0; }
.plc-sheet.fit .plc-btn { flex: none; padding: 6px 14px; min-height: 0; }
.plc-fgrid { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px 12px; align-items: center; margin-top: 8px; }
.plc-fgrid > label { color: var(--secondary-text-color); font-size: .9em; }
.plc-fgrid .plc-select { width: 100%; }
.plc-fgrid .plc-chips { margin: 0; }
.plc-hrow + .plc-hrow { margin-top: 8px; }
.plc-hl, .plc-hc, .plc-hr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.plc-hl { justify-content: flex-start; }
.plc-hc { justify-content: center; }
.plc-hr { justify-content: flex-end; }
.plc-hrow .plc-tabs { margin: 0; min-width: 0; }
.plc-hrow .plc-search { flex: 0 1 var(--plc-search-w, 280px); width: var(--plc-search-w, 280px); max-width: 100%; min-width: 100px; }
.plc-phead { padding: 2px 2px 0; }
.plc-chip.icononly { padding: 6px 9px; }
.plc-bar1 { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.plc-bar1 .plc-tabs { margin: 0; flex: 0 1 auto; min-width: 0; }
.plc-bar2 { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.plc-tools { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; flex: 1 1 auto; min-width: 0; }
.plc-tools .plc-search { flex: 1 1 160px; max-width: 280px; }
.plc-chip ha-icon { --mdc-icon-size: 18px; }
.plc-ring { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); z-index: 2; width: 96px; height: 96px; padding: 0; border: 0; border-radius: 50%;
  background: rgba(0,0,0,.45); cursor: pointer; display: grid; place-items: center; -webkit-tap-highlight-color: transparent; }
.plc-ring svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.plc-ring circle { fill: none; stroke-width: 4; }
.plc-ring .bg { stroke: rgba(255,255,255,.25); }
.plc-ring .fg { stroke: var(--plc-a); stroke-linecap: round; transition: stroke-dashoffset .1s linear; }
.plc-ring-t { position: relative; display: flex; flex-direction: column; align-items: center; line-height: 1; color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,.8); }
.plc-ring-n { font-size: 2.2em; font-weight: 800; }
.plc-ring-c { font-size: .72em; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; margin-top: 3px; opacity: .9; }
.plc-cast { color: var(--secondary-text-color); font-size: .85em; }
.plc-npfull { position: fixed; inset: 0; z-index: 10; overflow-y: auto; padding: 12px 14px calc(14px + env(safe-area-inset-bottom, 0px));
  background: var(--card-background-color, var(--ha-card-background, #111)); display: flex; flex-direction: column; gap: 12px; }
.plc-npfull-h { display: flex; align-items: center; }
.plc-npfull .plc-side-card { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
.plc-npfull .plc-side-art { flex: 1 1 auto; min-height: 160px; aspect-ratio: auto; background-size: contain; background-color: #000; }
.plc-npfull .plc-side-info .plc-big { font-size: 1.4em; }
.plc-vol { display: inline-flex; align-items: center; gap: 6px; }
.plc-vol-n { font-size: .8em; min-width: 2.2em; text-align: center; font-variant-numeric: tabular-nums; opacity: .8; }
.plc-power.on { color: var(--success-color, #4caf50); }
.plc-side-art { position: relative; }
.plc-side-ph { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--secondary-text-color); }
.plc-side-ph ha-icon { --mdc-icon-size: 56px; opacity: .6; }
.plc-side-ph span { font-weight: 600; }
.plc-side-img { position: absolute; inset: 0; background: center / cover no-repeat; }
.plc-np-x, .plc-np-move, .plc-np-power { position: absolute; z-index: 2; }
.plc-np-x { top: 8px; right: 8px; }
.plc-np-move { top: 8px; left: 8px; max-width: calc(100% - 70px); font-size: .8em; }
.plc-np-move span, .plc-np-move { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plc-np-power { right: 8px; bottom: 8px; }
.plc-side-art .plc-icon-btn, .plc-side-art .plc-chip { background: rgba(0,0,0,.55); border-color: rgba(255,255,255,.35); color: #fff; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
`;

// ------------------------------------------------------------------------------------------- data
// Module-level, so a card element the Dashboard editor recreates renders the same view at once.

const CACHE = new Map();    // request key → { data, ts }
const VIEW = new Map();     // card key → view state
const ws = (hass, type, extra = {}) => hass.callWS({ type: `plex_center/${type}`, ...extra });

async function cached(hass, key, ttl, fetch, { force = false } = {}) {
  const hit = CACHE.get(key);
  if (hit && !force && Date.now() - hit.ts < ttl) return hit.data;
  if (hit?.pending) return hit.pending;
  const pending = fetch().then((data) => { CACHE.set(key, { data, ts: Date.now() }); return data; })
    .catch((e) => { if (hit) CACHE.set(key, hit); else CACHE.delete(key); throw e; });
  CACHE.set(key, { ...(hit || {}), pending, ts: hit?.ts || 0 });
  return pending;
}
const peek = (key) => CACHE.get(key)?.data;

/** Is the TV itself on? From PiPup / ADB / Android TV Remote, never the Plex player: Plex keeps a paused session
 *  long after the TV is turned off. null = no way to tell (only a Plex player). */
const stateVals = (text, def) => String(text || def).split(',').map((v) => v.trim()).filter(Boolean);
/** The TV's room status entity shows ready (null: the TV has none). */
function roomReady(hass, tv) {
  const st = tv?.status_entity && hass?.states[tv.status_entity];
  if (!tv?.status_entity) return null;
  return !!st && stateVals(tv.ready_value, 'on').includes(st.state);
}
/** What a starting room says: "starting · 3 / 7 · Projector" from its status entity (AV Scenes' sensor attributes). */
function roomProgress(hass, tv) {
  const st = tv?.status_entity && hass?.states[tv.status_entity];
  if (!st) return '';
  const a = st.attributes || {}, cur = a.current_step, tot = a.total_steps;
  const step = typeof cur === 'number' || /^\d+$/.test(String(cur ?? '')) ? `${cur}${tot ? ` / ${tot}` : ''}` : (cur ? String(cur) : '');
  const pct = !step && a.step_progress_pct != null ? `${Math.round(Number(a.step_progress_pct))} %` : '';
  return [st.state, step || pct, a.current_device || a.device || ''].filter(Boolean).join(' · ');
}
function tvPower(hass, tv) {
  if (roomReady(hass, tv)) return true;   // a room (theater) that says it's ready
  const sts = [tv?.pipup, tv?.adb, tv?.remote].map((id) => id && hass?.states[id]).filter((x) => x && !['unavailable', 'unknown'].includes(x.state));
  if (!sts.length) return null;
  return sts.some((x) => !['off', 'standby'].includes(x.state));
}
/** The Plex player's playback, while the TV itself is on (Plex keeps paused sessions of a TV that's off). */
function plexLive(hass, tv) {
  const x = tv?.plex_client && hass?.states[tv.plex_client];
  return isRealPlayback(x) && tvPower(hass, tv) !== false ? x : null;
}
const realOn = (hass, tv) => tvPower(hass, tv) !== false && (!!plexLive(hass, tv) || [tv.pipup, tv.adb].some((id) => id && isRealPlayback(hass.states[id])));
const tvLabel = (tv) => tv?.name || tv?.id || 'TV';

/** Cache key for what another app plays on a TV: changes with the app and the title its players report. null for
 *  Plex (the Plex player has the poster) and when nothing plays. */
function appMetaKey(hass, tv) {
  if (!tv || !hass) return null;
  const live = [tv.pipup, tv.adb, tv.cast].map((id) => id && hass.states[id]).filter((st) => isRealPlayback(st));
  if (!live.length || plexLive(hass, tv)) return null;
  const app = live.map((st) => st.attributes.app_id || st.attributes.app_name).find(Boolean) || '';
  if (/plex/i.test(app)) return null;
  return `appmeta:${tv.id}:${app}:${live.map((st) => st.attributes.media_series_title || st.attributes.media_title).find(Boolean) || ''}`;
}

/** Now playing on a TV, from its players' states (the Plex player supplies the poster and episode; for other apps
 *  the integration's lookup does: Plex library, Plex Discover, Radarr, Sonarr). */
function nowPlaying(hass, tv) {
  if (!tv) return null;
  const p = tv.pipup && hass.states[tv.pipup], x = plexLive(hass, tv), a = tv.adb && hass.states[tv.adb], power = tvPower(hass, tv);
  const c = tv.cast && hass.states[tv.cast];
  const src = power === false ? null : [p, x, a, c].find((s) => isRealPlayback(s));
  if (src) {
    const meta = x ? x.attributes : {};
    const at = src.attributes, series = meta.media_series_title;
    const k = !x && appMetaKey(hass, tv), am = k ? peek(k) : null, found = am?.meta;
    const app = am?.app || (at.app_name && !String(at.app_name).includes('.') ? at.app_name : '') || at.app_name || '';
    const known = series || found?.title || am?.title || at.media_title || meta.media_title;
    const state = src.state === 'paused' ? 'Paused' : 'Playing';
    return { tv, live: true, on: power, st: src, title: known || app || 'Playing',
      sub: series ? `S${meta.media_season} · E${meta.media_episode}${meta.media_title ? ` · ${meta.media_title}` : ''}`
        : known ? [am?.episode, found?.year, app].filter(Boolean).join(' · ') : state,
      art: meta.entity_picture || found?.poster || (src === a ? null : at.entity_picture) || null, fanart: found?.art || null, found: found || null };
  }
  const r = tv.remote && hass.states[tv.remote];
  const on = power === false ? null : [p, a, r].find((s) => s && !['off', 'unavailable', 'standby', 'unknown'].includes(s.state));
  return { tv, live: false, on: power, st: on || p || a || r || { state: 'off', attributes: {} },
    title: tvLabel(tv), sub: on ? (on.attributes.app_name || on.state) : 'Off', art: a?.attributes?.entity_picture || null };
}
const seekable = (tv) => ['pipup', 'open', 'plex'].includes(tv?.route);

// ------------------------------------------------------------------------------------------- the card

class PlexCenterCard extends HTMLElement {
  constructor() { super(); this._c = {}; this._built = false; this._lists = new Map(); this._extra = []; }

  static getConfigElement() { return document.createElement(EDITOR_TAG); }
  static getStubConfig() { return {}; }
  getCardSize() { return 12; }
  getGridOptions() { return { columns: 'full', min_columns: 6, rows: 'auto' }; }

  setConfig(config) {
    // Never throw: HA would replace the whole card with "Configuration error". Show the reason instead.
    try {
      this._setConfig(config);
      if (this._cfgErr) { this._cfgErr = null; if (this._built) this._renderTop(); }
    }
    catch (e) {
      console.error('Plex Center card: could not read the config', e);
      this._cfgErr = String(e?.message || e);
      if (!this._raw) { this._raw = normalizeConfig({}); this._c = effectiveConfig(this._raw, false); }
      if (this._built) { try { this._renderTop(); } catch { /* the notice below still shows */ } }
    }
  }

  _setConfig(config) {
    const prev = this._c;
    this._raw = normalizeConfig(config);
    this._c = effectiveConfig(this._raw, !!this._phone); this._c._cycle = this._v?.cycle;
    if (!this._built) return;
    this._applyLook();
    if (prev && prev.library_view !== this._c.library_view) { this._v.view = cfg(this._c, 'library_view'); this._v.detail = null; this._saveView(); }
    const strip = (c) => { const o = { ...c }; for (const k of STYLE_KEYS) delete o[k]; return JSON.stringify(o); };
    if (strip(prev) !== strip(this._c)) this._renderAll();
  }

  set hass(h) {
    this._hass = h;
    if (!this._built) { if (this.isConnected) this._build(); return; }
    for (const card of this._extra) card.hass = h;
    if (!this._tq) this._tq = setTimeout(() => { this._tq = null; this._updateStates(); }, 250);
  }
  get hass() { return this._hass; }

  connectedCallback() {
    if (!this._built && this._hass) this._build();
    if (!this._orient && typeof matchMedia === 'function') {
      this._orient = matchMedia('(orientation: portrait)');
      this._onOrient = () => { this._lsig = null; this._layout(); };
      this._orient.addEventListener?.('change', this._onOrient);
    }
    if (this._onAnyScroll) { document.removeEventListener('scroll', this._onAnyScroll, true); document.addEventListener('scroll', this._onAnyScroll, true); }
    clearInterval(this._tick); this._tick = setInterval(() => this._progress(), 1000);
    clearInterval(this._poll); this._poll = setInterval(() => this._refresh(), SESSIONS_MS);
    if (this._root && !this._ro) this._observeSize();
    // re-attached (dashboards move cards around while loading / resizing): the timers were stopped, so repaint the sections
    if (this._built && this._detached) {
      this._detached = false; this._cwTimer = null;
      this._root.querySelectorAll('[data-sig], [data-cwsig]').forEach((n) => { delete n.dataset.sig; delete n.dataset.cwsig; });
      if (this._v.tab === 'home') this._renderMain();
    }
  }
  disconnectedCallback() {
    this._detached = true;
    clearInterval(this._tick); clearInterval(this._poll); this._tick = this._poll = null;
    for (const t of Object.values(this._anim || {})) { clearInterval(t); clearTimeout(t); } this._anim = {}; clearTimeout(this._popTimer);
    if (this._onAnyScroll) document.removeEventListener('scroll', this._onAnyScroll, true);
    this._orient?.removeEventListener?.('change', this._onOrient); this._orient = null;
    this._ro?.disconnect(); this._ro = null; this._io?.disconnect();
  }

  // ---- state

  get _key() { return `${this._c.title || ''}|${this._c.default_tv || ''}`; }
  get _v() {
    if (!VIEW.has(this._key)) {
      const v = { tab: cfg(this._c, 'start_tab'), unwatched: false, sort: 'title', query: '', view: cfg(this._c, 'library_view'),
        detail: null, season: null, hero: 0 };
      if (cfg(this._c, 'remember_view')) {
        try { Object.assign(v, pickSaved(JSON.parse(localStorage.getItem(`plc-view:${this._key}`) || '{}'))); } catch { /* none saved */ }
      }
      VIEW.set(this._key, v);
    }
    return VIEW.get(this._key);
  }
  /** Keep this device's tab, filters, sort and view for next time. */
  _saveView() {
    if (!cfg(this._c, 'remember_view')) return;
    try { localStorage.setItem(`plc-view:${this._key}`, JSON.stringify(pickSaved(this._v))); } catch { /* private mode */ }
  }
  get _conf() { return peek('config'); }
  _tvs() {
    const all = this._conf?.tvs || [];
    const pick = this._c.tvs;
    return pick?.length ? all.filter((t) => pick.includes(t.id)) : all;
  }
  _tv() {
    const tvs = this._tvs();
    if (!tvs.length) return null;
    const fixed = cfg(this._c, 'lock') || cfg(this._c, 'tv_picker') === 'hidden';
    let want = fixed ? null : this._v.tv;
    if (want == null && !fixed) { try { want = localStorage.getItem(`plc-tv:${this._key}`); } catch { want = null; } }
    if (want == null) want = this._c.default_tv;
    return tvs.find((t) => t.id === want || t.name === want) || tvs[0];
  }
  _setTv(tv) {
    this._v.tv = tv.id;
    queueMicrotask?.(() => this._paintWatching?.());
    try { localStorage.setItem(`plc-tv:${this._key}`, tv.id); } catch { /* private mode */ }
    this._v.detail = null;
    this._renderAll();
  }
  _libraries() {
    const tv = this._tv();
    const libs = this._conf?.libraries?.[tv?.user || ''];
    if (!Array.isArray(libs)) return [];
    const pick = this._c.libraries;
    return pick?.length ? libs.filter((l) => pick.includes(l.title)) : libs;
  }
  _toast(message) { this.dispatchEvent(new CustomEvent('hass-notification', { detail: { message }, bubbles: true, composed: true })); }
  _npMode() {
    const m = cfg(this._c, 'now_playing');
    return m === 'panel' && !this._phone ? 'panel' : 'off';
  }

  // ---- build once

  _build() {
    this._built = true;
    this.innerHTML = `<ha-card><div class="plc"><style>${CARD_CSS}</style><div class="plc-wrap">
      <div class="plc-side" hidden></div>
      <div class="plc-content"><div class="plc-top"></div>
        <div class="plc-body"><div class="plc-main"></div><div class="plc-detail-slot"></div></div>
        <div class="plc-bnav-slot"></div></div></div>
      <div class="plc-sheet-slot"></div><div class="plc-npfull-slot"></div></div></ha-card>`;
    this._root = this.querySelector('.plc');
    this._applyLook();
    this._observeSize();
    this._root.addEventListener('click', (e) => this._onClick(e));
    this._root.addEventListener('input', (e) => this._onInput(e));
    this._root.addEventListener('change', (e) => this._onChange(e));
    this._root.addEventListener('pointerdown', (e) => this._onScrub(e));
    this._wireGestures();
    this._wireHold();
    this._root.addEventListener('keydown', (e) => {
      const h = (e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.plc-sec-h[data-wtoggle]');
      if (h) { e.preventDefault(); h.click(); }
    });
    this._root.addEventListener('focusin', (e) => { if (e.target.matches?.('[data-search]')) this._showRecent(); });
    this._root.addEventListener('focusout', (e) => { if (e.target.matches?.('[data-search]')) setTimeout(() => { if (!this._root.querySelector('[data-search]:focus')) this._root.querySelector('.plc-recent')?.remove(); }, 250); });
    this._root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this._root.querySelector('.plc-menu')) { this._closeMenu(); return; } });
    this._root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches?.('[data-search]')) { addRecent(e.target.value); this._root.querySelector('.plc-recent')?.remove(); } });
    for (const ev of ['pointerdown', 'keydown', 'input']) this._root.addEventListener(ev, (e) => { if (e.target.closest?.('.plc-sheet, .plc-detail')) this._armPopup(); }, true);
    this._renderAll();
    this._refresh(true);
  }

  /** Hold buttons: Play (hold_play / hold_ms), Mark watched (hold_mark_ms) and a show's Mark all watched
   *  (hold_markall_ms) act only after being held (an indicator fills while holding). Play: not in Now playing. */
  _holdTarget(e) {
    for (const [sel, key, label] of HOLDS) {
      const el = e.target.closest?.(sel);
      if (!el) continue;
      if (key === 'hold_ms' && (!cfg(this._c, 'hold_play') || el.closest('.plc-side, .plc-npfull'))) return null;
      const ms = Number(cfg(this._c, key));
      return ms > 0 ? { el, ms: Math.max(300, ms), label } : null;
    }
    return null;
  }
  _wireHold() {
    const cancel = () => { if (!this._hold) return; clearTimeout(this._hold.t); this._hold.el.classList.remove('plc-hold'); this._hold = null; };
    this._root.addEventListener('pointerdown', (e) => {
      const h = this._holdTarget(e);
      if (!h || e.button > 0) return;
      cancel();
      const { el, ms } = h;
      el.style.setProperty('--hold-ms', `${ms}ms`); el.classList.add('plc-hold');
      this._hold = { el, t: setTimeout(() => { el.classList.remove('plc-hold'); this._hold = null; this._holdPass = el; this._holdAt = Date.now(); el.click(); }, ms) };
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this._root.addEventListener(ev, () => cancel(), true);
    this._root.addEventListener('contextmenu', (e) => { if (this._holdTarget(e)) e.preventDefault(); });
    // taps (not keyboard) on a Play button do nothing unless the hold finished
    this._root.addEventListener('click', (e) => {
      const h = this._holdTarget(e);
      if (!h) return;
      if (this._holdPass === h.el) { this._holdPass = null; return; }
      if (!e.detail) return;   // keyboard (Enter / Space): no hold needed
      e.stopImmediatePropagation(); e.preventDefault();
      if (Date.now() - (this._holdAt || 0) > 800) this._toast(`Hold ${h.label} for ${Math.round(h.ms / 100) / 10} s`);
    }, true);
  }

  /** Optional phone gestures: swipe the content left / right to change tab; hide the header while scrolling down. */
  _wireGestures() {
    let x0 = null, y0 = null;
    this._root.addEventListener('touchstart', (e) => {
      if (!cfg(this._c, 'swipe_tabs') || e.touches.length !== 1) { x0 = null; return; }
      if (e.target.closest('.plc-row, .plc-list, .plc-tabs, .plc-bar, .plc-sheet, .plc-detail, input, select')) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    this._root.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const ids = tabOrder(this._c, this._libraries(), this._calOn()).map((t) => (t.id === 'home' ? 'home' : t.key));
      const i = Math.max(0, ids.findIndex((id) => id === this._v.tab || this._libraries().find((l) => l.key === id)?.title === this._v.tab));
      const next = ids[(i + (dx < 0 ? 1 : -1) + ids.length) % ids.length];
      Object.assign(this._v, { tab: next, detail: null, genre: '', decade: '', rating: '', short: false });
      this._renderTop(); this._renderMain(); this._renderDetail(); this._refresh();
    }, { passive: true });
    this._scrollY = new WeakMap();
    this._onAnyScroll = (e) => {
      if (!cfg(this._c, 'hide_on_scroll') || !this.isConnected) return;
      const el = e.target === document ? document.scrollingElement : e.target;
      if (!el || typeof el.scrollTop !== 'number' || !(el.contains?.(this) || this.contains?.(el))) return;
      if (el.closest?.('.plc-row, .plc-list, .plc-sheet, .plc-tabs')) return;
      const y = el.scrollTop, last = this._scrollY.get(el) ?? y;
      this._scrollY.set(el, y);
      if (Math.abs(y - last) < 6) return;
      this._root.classList.toggle('hdr-hidden', y > last && y > 80);
    };
    document.addEventListener('scroll', this._onAnyScroll, true);
  }

  async _refresh(first = false) {
    if (!this._hass) return;
    try {
      const had = !!this._conf;
      await cached(this._hass, 'config', first ? 0 : REFRESH_MS, () => ws(this._hass, 'config'), { force: first && !had });
      this._err = null;
      if (!had || first) this._renderAll();
      if (watchOn(this._c, watchPage(this._v.tab)) || headerLayout(this._c, this._c._screen).some((h) => h.id === 'watchchip' && !h.hidden)) {
        const before = JSON.stringify(peek('sessions') || []);
        await cached(this._hass, 'sessions', SESSIONS_MS - 1000, () => ws(this._hass, 'sessions'));
        if (JSON.stringify(peek('sessions') || []) !== before) { this._paintWatching(); this._renderNP(); }
      }
      this._fetchResumes();
    } catch (e) {
      this._err = /unknown command|not_set_up|Unknown command/i.test(e?.message || e?.code || '')
        ? 'Set up the Plex Center integration first (Settings → Devices & services → Add integration → Plex Center).'
        : `Plex Center: ${e?.message || e}`;
      this._renderMain();
    }
  }

  _applyLook() {
    const r = this._root;
    if (!r) return;
    r.setAttribute('style', cardVars(this._c));
    this.querySelector('ha-card')?.setAttribute('style', haCardStyle(this._c));
    r.classList.toggle('shadows', !!cfg(this._c, 'box_shadows'));
    r.classList.toggle('tshadow', !!cfg(this._c, 'text_shadows'));
    this._layout();
  }

  _observeSize() {
    if (typeof ResizeObserver === 'undefined' || this._ro) return;
    this._ro = new ResizeObserver(() => this._layout());
    this._ro.observe(this);
  }

  _layout() {
    const raw = this._raw || this._c;
    const want = cfg(raw, 'layout');
    const w = this.offsetWidth || this._root?.offsetWidth || 1000;
    const phone = want === 'phone' || (want === 'auto' && w > 0 && w < PHONE_MAX_W);
    if (!this._root) return;
    const sig = screenOf(phone, isPortrait());
    this._c = effectiveConfig(raw, phone); this._c._cycle = this._v?.cycle;
    this._root.setAttribute('style', cardVars(this._c));
    if (this._phone === phone && this._lsig === sig) return;
    const first = this._lsig === undefined, changed = this._lsig !== sig;
    this._lsig = sig;
    if (first || changed) { const v = this._v; v.view = cfg(this._c, 'library_view'); if (cfg(this._c, 'remember_view')) { try { const sv = JSON.parse(localStorage.getItem(`plc-view:${this._key}`) || '{}'); if (sv.view) v.view = sv.view; } catch { /* */ } } }
    this._phone = phone;
    this._root.classList.toggle('phone', phone);
    this._root.classList.toggle('tablet', !phone);
    this._root.dataset.screen = sig;
    if (SHOWN.screen !== sig) { SHOWN.screen = sig; window.dispatchEvent(new CustomEvent('plex-center-screen', { detail: sig })); }
    if (this._built) this._renderAll();
  }

  _renderAll() { this._renderTop(); this._renderMain(); this._renderDetail(); this._renderNP(true); }

  // ---- header

  /** Each header item's HTML ('' when it has nothing to show here). */
  _headerPieces() {
    const tvs = this._tvs(), cur = this._tv();
    const mode = cfg(this._c, 'lock') ? 'hidden' : cfg(this._c, 'tv_picker');
    const how = cfg(this._c, 'tv_label');
    const icons = this._c.tv_icons || {};
    const dot = (tv) => `<span class="plc-dot ${this._dotCls(tv)}" data-dot="${esc(tv.id)}"${this._resumeFor(tv) && (!realOn(this._hass, tv) || this._stuck(tv)) ? ' title="Ready to resume"' : ''}></span>`;
    const rmark = (t) => (this._resumeFor(t) && (!realOn(this._hass, t) || this._stuck(t)) ? '<ha-icon class="plc-tv-resume" icon="mdi:play-pause" title="Off · ready to resume"></ha-icon>' : '');
    const face = (t) => {
      const ic = `<ha-icon icon="${esc(icons[t.id] || 'mdi:television')}"></ha-icon>`;
      return how === 'icon' ? `${dot(t)}${ic}${rmark(t)}` : how === 'both' ? `${dot(t)}${ic}${esc(tvLabel(t))}${rmark(t)}` : `${dot(t)}${esc(tvLabel(t))}${rmark(t)}`;
    };
    const cls = how === 'icon' ? ' icononly' : '';
    let picker = '';
    if (tvs.length > 1 && mode !== 'hidden') {
      picker = mode === 'chip' || mode === 'dropdown'
        ? `<button class="plc-chip plc-menuchip" data-tvsheet>${dot(cur)}<ha-icon icon="${esc(icons[cur?.id] || 'mdi:television')}"></ha-icon><span class="plc-menuchip-n">${esc(tvLabel(cur))}</span><ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></button>`
        : `<div class="plc-tvs">${tvs.map((t) => `<button class="plc-chip${cls}${t === cur ? ' on' : ''}" data-tv="${esc(t.id)}" title="${esc(tvLabel(t))}">${face(t)}</button>`).join('')}</div>`;
    } else if (cur && mode !== 'hidden') picker = `<span class="plc-chip${cls} on" title="${esc(tvLabel(cur))}">${face(cur)}</span>`;
    const title = this._c.title === undefined ? DEFAULTS.title : this._c.title;
    const libs = this._libraries();
    if (this._v.tab !== 'home' && this._conf && !(this._v.tab === 'calendar' && this._calOn()) && !libs.some((l) => l.key === this._v.tab || l.title === this._v.tab)) this._v.tab = 'home';
    const on = (l) => this._v.tab === l.key || this._v.tab === l.title;
    const v = this._v, inLib = v.tab !== 'home' && v.tab !== 'calendar';
    const style = cfg(this._c, 'surprise_style'), icon = cfg(this._c, 'surprise_icon') || DEFAULTS.surprise_icon;
    const label = cfg(this._c, 'surprise_label') || DEFAULTS.surprise_label;
    const searchIcon = cfg(this._c, 'search_mode') === 'icon';
    const tabsMode = cfg(this._c, 'tabs_mode') || 'tabs';
    const popItems = inLib ? this._popItems() : [];
    const ordered = tabOrder(this._c, libs, this._calOn());
    const curTab = v.tab === 'home' ? { id: 'home', title: 'Home' } : ordered.find((t) => t.id !== 'home' && on(t)) || { id: 'home', title: 'Home' };
    const tabsHtml = tabsMode === 'bottom' ? ''
      : tabsMode === 'button' ? `<button class="plc-icon-btn plc-menubtn" data-tabmenu title="${esc(curTab.title)}"><ha-icon icon="${tabIcon(curTab, this._c)}"></ha-icon></button>`
      : tabsMode === 'chip' || tabsMode === 'dropdown' ? `<button class="plc-chip plc-menuchip" data-tabmenu><ha-icon icon="${tabIcon(curTab, this._c)}"></ha-icon><span class="plc-menuchip-n">${esc(curTab.title)}</span><ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></button>`
        : this._pageButtons(ordered, on);
    const searchHtml = searchIcon && !v.searchOpen && !v.query
      ? `<button class="plc-icon-btn" data-searchopen title="Search"><ha-icon icon="mdi:magnify"></ha-icon></button>`
      : `<input class="plc-search" type="search" placeholder="${inLib ? 'Search' : 'Search all libraries'}" value="${esc(v.query)}" data-search>${
        searchIcon ? '<button class="plc-icon-btn" data-searchclose title="Close search"><ha-icon icon="mdi:close"></ha-icon></button>' : ''}`;
    if (mode === 'button' && picker && tvs.length > 1) {
      const ic = (this._c.tv_icons || {})[cur?.id] || 'mdi:television';
      picker = `<button class="plc-icon-btn plc-menubtn plc-tvbtn" data-tvsheet title="${esc(tvLabel(cur))}">${dot(cur)}<ha-icon icon="${esc(ic)}"></ha-icon></button>`;
    }
    const activeOf = { watched: v.unwatched, genre: v.genre, decade: v.decade, rating: v.rating, length: v.short, sort: v.sort && v.sort !== 'title' };
    const active = popItems.filter((h) => activeOf[h.id]).length;
    const filterBtn = `<button class="plc-chip plc-menuchip plc-fbtn" data-fpop title="${active ? `${active} filter${active === 1 ? '' : 's'} on` : 'Filters'}"><ha-icon icon="mdi:filter-variant"></ha-icon><span class="plc-menuchip-n">Filters</span>${
      active ? `<span class="plc-fcount">${active}</span>` : ''}<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></button>`;
    const styleOf = Object.fromEntries(headerLayout(this._c, this._c._screen).map((h) => [h.id, h.style]));
    return {
      title: title && cfg(this._c, 'show_title') ? `<h1 class="plc-title">${esc(title)}</h1>` : '',
      tabs: tabsHtml,
      search: searchHtml,
      watched: inLib ? this._fpiece('watched', styleOf.watched) : '',
      genre: inLib ? this._fpiece('genre', styleOf.genre) : '',
      decade: inLib ? this._fpiece('decade', styleOf.decade) : '',
      rating: inLib ? this._fpiece('rating', styleOf.rating) : '',
      length: inLib ? this._fpiece('length') : '',
      filterbtn: popItems.length ? filterBtn : '',
      achips: inLib ? this._chipsHtml() : '',
      watchchip: (() => { const n = this._watchList().length; return n ? `<button class="plc-chip plc-menuchip" data-watchpop title="Watching now"><ha-icon icon="mdi:account-eye"></ha-icon><span class="plc-menuchip-n">Watching</span><span class="plc-fcount">${n}</span><ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></button>` : ''; })(),
      surprise: !cfg(this._c, 'surprise') || !libs.length ? ''
        : style === 'icon' ? `<button class="plc-icon-btn" data-surprise title="${esc(label)}"><ha-icon icon="${esc(icon)}"></ha-icon></button>`
          : `<button class="plc-chip" data-surprise>${style === 'both' ? `<ha-icon icon="${esc(icon)}"></ha-icon>` : ''}${esc(label)}</button>`,
      sort: inLib ? this._fpiece('sort', styleOf.sort) : '',
      view: inLib ? `<button class="plc-icon-btn" data-view="${v.view === 'list' ? 'grid' : 'list'}" title="${v.view === 'list' ? 'Show as a grid' : 'Show as a list'}"><ha-icon icon="mdi:${v.view === 'list' ? 'view-grid-outline' : 'view-list-outline'}"></ha-icon></button>` : '',
      tvs: picker,
    };
  }

  /** A popover menu under its button: a title and rows (icon, name, second line, tick on the current one). */
  _menu(anchor, title, rows) {
    this._closeMenu();
    const root = this._root, scale = (Number(cfg(this._c, 'scale')) || 100) / 100;
    root.insertAdjacentHTML('beforeend', `<div class="plc-menu" role="menu"><div class="plc-menu-h">${esc(title)}</div>${rows.map((r) => `<button class="plc-menu-i${r.on ? ' on' : ''}" role="menuitem" ${r.attr}>
      <ha-icon icon="${esc(r.icon)}"></ha-icon><span class="plc-menu-t"><b>${esc(r.label)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>${r.on ? '<ha-icon class="tick" icon="mdi:check"></ha-icon>' : ''}${r.dot || ''}</button>`).join('')}</div>`);
    const m = root.querySelector('.plc-menu'), a = anchor.getBoundingClientRect(), rr = root.getBoundingClientRect();
    const w = Math.min(320, rr.width / scale - 16);
    let left = (a.left - rr.left) / scale;
    left = Math.max(8, Math.min(left, rr.width / scale - w - 8));
    Object.assign(m.style, { top: `${(a.bottom - rr.top) / scale + 6}px`, left: `${left}px`, width: `${w}px` });
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 0;
    if (vh && a.bottom > vh * 0.6) m.style.top = `${Math.max(4, (a.top - rr.top) / scale - m.offsetHeight - 6)}px`;   // footer: open upward
    this._menuAnchor = anchor;
    m.querySelector('.plc-menu-i.on, .plc-menu-i')?.focus?.({ preventScroll: true });
  }
  _closeMenu() { this._root?.querySelector('.plc-menu')?.remove(); this._menuAnchor = null; }

  /** The page menu as buttons, in the Page menu style (Appearance → Page menu). */
  _pageButtons(ordered, on) {
    const v = this._v;
    return pageButtonsHtml(this._c, ordered.map((t) => {
      const id = t.id === 'home' ? 'home' : t.key;
      return { id, title: t.title, icon: tabIcon(t, this._c), on: t.id === 'home' ? v.tab === 'home' : on(t), attr: `data-tab="${esc(id)}"` };
    }));
  }

  /** Tabs menu: Home and each library. */
  _tabMenu(anchor) {
    const v = this._v, libs = this._libraries();
    this._menu(anchor, 'Go to', tabOrder(this._c, libs, this._calOn()).map((t) => {
      const id = t.id === 'home' ? 'home' : t.key, on = t.id === 'home' ? v.tab === 'home' : (v.tab === t.key || v.tab === t.title);
      return { icon: tabIcon(t, this._c), label: t.title, sub: t.id === 'home' ? 'Continue watching, new and coming soon' : t.id === 'calendar' ? 'Upcoming episodes and movie releases' : t.type === 'movie' ? 'Movies' : t.type === 'show' ? 'TV shows' : '', on, attr: `data-tab="${esc(id)}"` };
    }));
  }

  /** The Plex session playing on a TV (matched by the TV's Plex user). */
  /** Which of our TVs a Plex session is playing on: by the TV's Plex user, else the player's name, else what the TV is playing. */
  _tvForSession(x) {
    if (!x) return null;
    if (x._tv) return this._tvs().find((t) => t.id === x._tv) || null;
    const tvs = this._tvs(), low = (v) => String(v || '').trim().toLowerCase(), squash = (v) => low(v).replace(/[^a-z0-9]/g, '');
    const byUser = tvs.filter((t) => t.user && x.user && low(t.user) === low(x.user));
    if (byUser.length === 1) return byUser[0];
    const player = squash(x.player);
    const byPlayer = player && tvs.filter((t) => [t.name, t.id, t.pipup, t.adb, t.plex_client].some((n) => { const q = squash(n); return q.length >= 3 && (q.includes(player) || player.includes(q)); }));
    if (byPlayer && byPlayer.length === 1) return byPlayer[0];
    const title = low(x.show || x.title);
    const byTitle = tvs.filter((t) => { const np = nowPlaying(this._hass, t); return np?.live && title && low(np.title) === title; });
    return byTitle.length === 1 ? byTitle[0] : (byUser[0] || null);
  }
  _sessionFor(tv) { return tv ? (peek('sessions') || []).find((x) => this._tvForSession(x)?.id === tv.id) || null : null; }

  /** Move menu: the other TVs; picking one moves what's playing there. */
  _moveMenu(anchor) {
    const cur = this._tv(), icons = this._c.tv_icons || {};
    this._menu(anchor, 'Move to', this._tvs().filter((t) => t.id !== cur?.id).map((t) => {
      const busy = realOn(this._hass, t);
      return { icon: icons[t.id] || 'mdi:television', label: tvLabel(t), sub: busy ? 'Playing something else: it will stop' : this._tvSub(t),
        attr: `data-moveto="${esc(t.id)}"`, dot: `<span class="plc-dot ${this._dotCls(t)}"></span>` };
    }));
  }

  /** Stop the title here and start it on another TV, at the same place when that TV can seek. */
  async _moveTo(to) {
    const from = this._tv(), np = nowPlaying(this._hass, from), sess = this._sessionFor(from);
    if (!to || !sess?.key) return;
    const pos = Math.floor(livePosition(np?.st) ?? 0);
    const what = sess.type === 'episode' ? `${sess.show} S${sess.season}E${sess.episode}` : sess.title;
    this._toast(`Moving ${what} to ${tvLabel(to)}…`);
    try {
      await this._hass.callService('plex_center', 'control', { tv: from.id, action: 'stop' });
      this._setTv(to);
      this._v.npOpen = to.id;
      this._v.npFull = !this._panelVisible(); this._npFullAt = Date.now();
      await this._hass.callService('plex_center', 'play', { tv: to.id, key: String(sess.key), mode: 'play' });
      if (pos > 30 && seekable(to)) {
        for (let i = 0; i < 20 && !nowPlaying(this._hass, to)?.live; i++) await new Promise((r) => setTimeout(r, 1000));
        const now = livePosition(nowPlaying(this._hass, to)?.st) ?? 0;
        if (Math.abs(now - pos) > 20) await this._hass.callService('plex_center', 'control', { tv: to.id, action: 'seek', value: pos });
      }
      this._renderNP(true);
    } catch (e) { this._toast(`Could not move: ${e?.message || e}`); }
  }

  /** What was playing when the TV was turned off (the integration keeps it), if this card shows it. */
  _resumeFor(tv) {
    if (!tv || cfg(this._c, 'watching_resume') === 'drop') return null;
    const r = (peek('resumes') || {})[tv.id];
    if (!r || (r.kind === 'app' && !cfg(this._c, 'watching_resume_apps'))) return null;
    const h = Number(cfg(this._c, 'watching_forget_h')) || 0;
    if (h > 0 && Date.now() - Date.parse(r.at) > h * 3600000) return null;
    return r;
  }
  /** The TV was woken but Plex still reports the paused title it was turned off with (its app is gone). */
  _stuck(tv) {
    const r = this._resumeFor(tv), x = plexLive(this._hass, tv);
    return !!(r && r.kind === 'plex' && x && x.state === 'paused' && String(x.attributes.media_content_id) === String(r.key));
  }
  /** The TV's dot: playing, off with something to resume, on, or off. */
  _dotCls(t) {
    if (realOn(this._hass, t) && !this._stuck(t)) return 'play';
    const p = tvPower(this._hass, t);
    if (this._resumeFor(t) && (p !== true || this._stuck(t))) return 'resume';
    if (p === true) return 'on';
    return p === null && t.state && !['off', 'unavailable', 'standby'].includes(t.state) ? 'on' : '';
  }
  /** A TV's status in the TV menus. */
  _tvSub(t) {
    const r = this._resumeFor(t), p = tvPower(this._hass, t);
    if (r && p !== true) return `Off · Resume ${r.show || r.title || r.app || ''}`.trim();
    if (r) return `Ready to resume ${r.show || r.title || r.app || ''}`.trim();
    if (p === false) return 'Off';
    if (p === true) return 'On';
    return t.state ? t.state[0].toUpperCase() + t.state.slice(1) : '';
  }
  /** "Paused at 6:29 of 43:46" */
  _pausedAt(r) {
    const pos = Number(r.position) || 0, dur = Number(r.duration) || 0;
    return pos ? `Paused at ${fmtTime(pos)}${dur ? ` of ${fmtTime(dur)}` : ''}` : 'Paused';
  }
  /** A Plex record's poster (from Plex, fetched once). */
  _resumeArt(tv, r) {
    if (r.kind !== 'plex' || !r.key) return null;
    const key = `item:${tv.id}:${r.key}`, d = peek(key);
    if (d) return d.poster || d.art || null;
    if (!this._upLoading?.has(key)) {
      (this._upLoading ||= new Set()).add(key);
      cached(this._hass, key, REFRESH_MS, () => ws(this._hass, 'item', { tv: tv.id, key: r.key }))
        .then(() => { this._paintWatching(); this._renderNP(true); }).catch(() => {}).finally(() => this._upLoading.delete(key));
    }
    return null;
  }
  async _fetchResumes(force = false) {
    if (!this._hass) return;
    const before = JSON.stringify(peek('resumes') || {});
    try { await cached(this._hass, 'resumes', SESSIONS_MS - 1000, () => ws(this._hass, 'resumes'), { force }); } catch { return; }
    if (JSON.stringify(peek('resumes') || {}) !== before) { this._paintWatching(); this._renderNP(true); this._renderTop(); }
  }
  _resume(tvId) {
    const tv = this._tvs().find((x) => x.id === tvId);
    if (!tv) return;
    if (tv.id !== this._tv()?.id) this._setTv(tv);
    this._v.npOpen = tv.id;
    this._toast(`Turning on ${tvLabel(tv)} and resuming…`);
    const stop = this._roomWatch(tv);
    this._hass.callService('plex_center', 'resume', { tv: tv.id })
      .then(() => this._fetchResumes(true)).catch((e) => this._toast(`Could not resume: ${e?.message || e}`)).finally(stop);
  }

  /** The header's Watching now chip: its count follows the sessions. */
  _renderTopChip() {
    const chip = this._root?.querySelector('[data-watchpop]');
    const n = this._watchList().length;
    if (chip) { if (n) chip.querySelector('.plc-fcount').textContent = String(n); else this._renderTop(); }
    else if (n && headerLayout(this._c, this._c._screen).some((h) => h.id === 'watchchip' && !h.hidden)) this._renderTop();
  }
  /** The Watching now popover (from the header chip): the same cards; tapping one opens its TV's controls. */
  _watchPopover() {
    this._sheet(`<div class="plc-detail-body plc-watchpop"><div class="plc-fpanel-h"><h2 class="plc-big">Watching now</h2><span class="plc-sp"></span>
      <button class="plc-btn" data-close-sheet>Close</button></div><div class="plc-sec" data-wpop></div></div>`, null, false, 'fit');
    this._paintWatching(this._root.querySelector('.plc-watchpop [data-wpop]'));
  }

  /** TV picker menu: every TV, its state and who is watching. */
  _tvSheet(anchor) {
    const cur = this._tv(), sessions = peek('sessions') || [];
    const icons = this._c.tv_icons || {};
    this._menu(anchor, 'Play on', this._tvs().map((t) => {
      const s2 = this._sessionFor(t);
      const live = realOn(this._hass, t) && !this._stuck(t);
      const sub = live && s2 ? `${s2.user} · ${s2.show || s2.title}` : live ? 'Playing' : this._tvSub(t);
      const dotCls = this._dotCls(t);
      return { icon: icons[t.id] || 'mdi:television', label: tvLabel(t), sub, on: t === cur, attr: `data-tvpick="${esc(t.id)}"`, dot: `<span class="plc-dot ${dotCls}"></span>` };
    }));
  }

  /** The Filters popover: every library filter and the sort in one panel; changes apply at once. */
  _filtersPopover() {
    const v = this._v, items = this._popItems();
    const rows = items.map((h) => {
      if (h.id === 'view') return `<label>${FLABEL.view}</label><div class="plc-chips"><button class="plc-chip${v.view !== 'list' ? ' on' : ''}" data-view="grid">Grid</button><button class="plc-chip${v.view === 'list' ? ' on' : ''}" data-view="list">List</button></div>`;
      const piece = h.id === 'watched' && h.style !== 'chip'
        ? `<div class="plc-chips"><button class="plc-chip${!v.unwatched ? ' on' : ''}" data-unw="0">All</button><button class="plc-chip${v.unwatched ? ' on' : ''}" data-unw="1">Unwatched</button></div>`
        : this._fpiece(h.id, h.style, true);
      return piece ? `<label>${FLABEL[h.id]}</label><div class="plc-fcell">${piece}</div>` : '';
    }).join('');
    this._sheet(`<div class="plc-detail-body plc-fpanel"><div class="plc-fpanel-h"><h2 class="plc-big">Filters</h2><span class="plc-sp"></span>
        <button class="plc-btn" data-fclear>Clear</button><button class="plc-btn main" data-close-sheet>Done</button></div>
      <div class="plc-fgrid">${rows || '<div class="plc-msg">Nothing is placed in the Filters popup.</div>'}</div></div>`, null, false, 'fit');
  }


  /** Genre / decade / content rating selects and an "Under 2 h" chip for the current library. */
  /** Where an item shows: its place, or the Filters popup when this screen puts every filter there. */
  _placeOf(h) { return FILTER_IDS.has(h.id) && cfg(this._c, 'filters_mode') === 'popover' ? 'popover' : h.section; }
  /** The items in the Filters popup, in list order. */
  _popItems() { return headerLayout(this._c, this._c._screen).filter((h) => !h.hidden && this._placeOf(h) === 'popover'); }
  /** This library's filter values (genres, decades, ratings, type); fetched once, then the header redraws. */
  _filterData() {
    const tv = this._tv(), lib = this._libKey();
    if (!tv || !lib) return null;
    const key = `filters:${tv.id}:${lib}`, f = peek(key);
    if (!f) cached(this._hass, key, REFRESH_MS * 10, () => ws(this._hass, 'filters', { tv: tv.id, library: lib }))
      .then(() => { this._renderTop(); if (this._root.querySelector('.plc-fpanel')) this._filtersPopover(); }).catch(() => {});
    return f || null;
  }
  /** One filter, as placed: a chip that opens a menu (default), a dropdown, or buttons. inPopup: the popup's row has its own label. */
  _fpiece(id, style, inPopup = false) {
    const v = this._v, chip = (on, text) => `<button class="plc-chip plc-menuchip plc-fchip${on ? ' on' : ''}" data-fmenu="${id}">${text}<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></button>`;
    const named = (value) => (inPopup ? `<span class="plc-menuchip-n">${esc(value)}</span>` : `<span class="plc-fchip-l">${FLABEL[id]}</span><span class="plc-menuchip-n">${esc(value)}</span>`);
    if (id === 'watched') {
      if (style === 'chip') return chip(v.unwatched, named(v.unwatched ? 'Unwatched' : 'All'));
      return `<span class="plc-fbtns"><button class="plc-chip${!v.unwatched ? ' on' : ''}" data-unw="0">All</button><button class="plc-chip${v.unwatched ? ' on' : ''}" data-unw="1">Unwatched</button></span>`;
    }
    if (id === 'sort') {
      if (style === 'dropdown') return `<select class="plc-select" data-sort>${SORT_OPTS.map(([k, n]) => `<option value="${k}"${v.sort === k ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
      return chip(v.sort && v.sort !== 'title', named((SORT_OPTS.find(([k]) => k === v.sort) || SORT_OPTS[0])[1]));
    }
    const f = this._filterData();
    if (!f) return '';
    if (id === 'length') return f.type === 'movie' ? `<button class="plc-chip${v.short ? ' on' : ''}" data-short>Under 2 h</button>` : '';
    const list = { genre: f.genres, decade: f.decades, rating: f.content_ratings }[id];
    if (!list?.length) return '';
    if (style === 'dropdown') return `<select class="plc-select" data-filter="${id}"><option value="">${inPopup ? `Any ${FLABEL[id].toLowerCase()}` : FLABEL[id]}</option>${
      list.map((o) => `<option value="${esc(o.value)}"${String(v[id] ?? '') === String(o.value) ? ' selected' : ''}>${esc(o.title)}</option>`).join('')}</select>`;
    const cur = list.find((o) => String(o.value) === String(v[id] ?? ''));
    return chip(!!cur, cur ? named(cur.title) : (inPopup ? named(`Any ${FLABEL[id].toLowerCase()}`) : `<span class="plc-menuchip-n">${FLABEL[id]}</span>`));
  }
  /** The menu for a filter chip. */
  _fMenu(anchor, id) {
    const v = this._v, fromActive = anchor.hasAttribute('data-active');
    const remove = (attr) => (fromActive ? [{ icon: 'mdi:filter-remove-outline', label: 'Remove filter', attr }] : []);
    if (id === 'length') {
      this._menu(anchor, 'Length', [{ icon: 'mdi:timer-outline', label: 'Under 2 h', on: !!v.short, attr: 'data-fset="length:1"' }, { icon: 'mdi:filter-off-outline', label: 'Any length', on: !v.short, attr: 'data-fset="length:"' }]);
      return;
    }
    if (id === 'sort') { this._menu(anchor, 'Sort by', [...SORT_OPTS.map(([k, n]) => ({ icon: 'mdi:sort', label: n, on: v.sort === k, attr: `data-fset="sort:${k}"` })), ...remove('data-fset="sort:title"')]); return; }
    if (id === 'watched') {
      this._menu(anchor, 'Show', [{ icon: 'mdi:filter-off-outline', label: 'All', on: !v.unwatched, attr: 'data-fset="watched:0"' },
        { icon: 'mdi:eye-off-outline', label: 'Unwatched', on: !!v.unwatched, attr: 'data-fset="watched:1"' }]);
      return;
    }
    const f = this._filterData() || {}, list = { genre: f.genres, decade: f.decades, rating: f.content_ratings }[id] || [];
    const icon = { genre: 'mdi:drama-masks', decade: 'mdi:calendar-range', rating: 'mdi:shield-account-outline' }[id];
    this._menu(anchor, FLABEL[id], [...(fromActive ? remove(`data-fset="${id}:"`) : [{ icon: 'mdi:filter-off-outline', label: `Any ${FLABEL[id].toLowerCase()}`, on: !v[id], attr: `data-fset="${id}:"` }]),
      ...list.map((o) => ({ icon, label: o.title, on: String(v[id] ?? '') === String(o.value), attr: `data-fset="${id}:${esc(o.value)}"` }))]);
  }

  /** Recent searches under the search box while it is focused and empty. */
  _showRecent() {
    const top = this._root.querySelector('.plc-top');
    top?.querySelector('.plc-recent')?.remove();
    if (!cfg(this._c, 'recent_searches') || this._v.query || !top) return;
    const list = recentSearches();
    if (!list.length) return;
    top.insertAdjacentHTML('beforeend', `<div class="plc-recent"><span class="plc-recent-h">Recent</span>${list.map((q) => `<button class="plc-chip" data-recent="${esc(q)}"><ha-icon icon="mdi:history"></ha-icon>${esc(q)}</button>`).join('')}
      <button class="plc-chip plc-recent-clear" data-recentclear>Clear</button></div>`);
  }

  /** Active-filter chips (optional): one removable chip per filter in use. */
  _chipsHtml() {
    const v = this._v;
    if (v.tab === 'home' || v.tab === 'calendar') return '';
    const sortNames = { added: 'Recently added', released: 'Release date', year: 'Year', rating: 'Rating', viewed: 'Last watched' };
    const f = peek(`filters:${this._tv()?.id}:${this._libKey()}`) || {};
    const name = (list, val) => (list || []).find((o) => String(o.value) === String(val))?.title || val;
    const watchedShown = headerLayout(this._c, this._c._screen).some((h) => h.id === 'watched' && !h.hidden);
    const chips = [(v.unwatched || watchedShown) && ['watched', v.unwatched ? 'Unwatched' : 'All', !!v.unwatched], v.genre && ['genre', name(f.genres, v.genre), true],
      v.decade && ['decade', name(f.decades, v.decade), true], v.rating && ['rating', name(f.content_ratings, v.rating), true], v.short && ['length', 'Under 2 h', true],
      v.sort && v.sort !== 'title' && ['sort', sortNames[v.sort], true]].filter(Boolean);
    return chips.length ? `<div class="plc-achips">${chips.map(([k, n, on]) => `<button class="plc-chip plc-menuchip${on ? ' on' : ''}" data-fmenu="${k}" data-active>${esc(n)}<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></button>`).join('')}</div>` : '';
  }

  /** Up to three rows of left / middle / right groups; a row with nothing to show is left out. */
  _headerHtml(section, pieces, playerShown) {
    const rows = [1, 2, 3].map((row) => {
      const groups = { left: [], center: [], right: [] };
      for (const h of headerLayout(this._c, this._c._screen)) {
        const placed = this._placeOf(h), sec = placed === 'player' && !playerShown ? 'library' : placed;
        if (h.hidden || sec !== section || h.row !== row || !pieces[h.id]) continue;
        groups[h.align].push(pieces[h.id]);
      }
      if (!groups.left.length && !groups.center.length && !groups.right.length) return '';
      return `<div class="plc-hrow" data-hrow="${row}"><div class="plc-hl">${groups.left.join('')}</div><div class="plc-hc">${groups.center.join('')}</div><div class="plc-hr">${groups.right.join('')}</div></div>`;
    });
    return rows.join('');
  }

  _renderTop() {
    this._saveView();
    this._closeMenu();
    const pieces = this._headerPieces();
    const playerShown = this._panelVisible();
    const hm = cfg(this._c, 'header_mode'), searchIcon = cfg(this._c, 'search_mode') === 'icon';
    const foot = this._headerHtml('footer', pieces, playerShown);
    const lk = layoutKeyFor(this._raw || this._c, this._c._screen), lay = lk.startsWith('lay:') ? this._c.layouts?.[lk.slice(4)] : null;
    this._root.classList.toggle('onerow', lk === 'one_row' || (this._phone && !!lay));
    this._root.classList.toggle('bnav', !!foot && !!cfg(this._c, 'footer_sticky'));
    this._root.classList.toggle('stickyhdr', !!cfg(this._c, 'hide_on_scroll'));
    const top = this._root.querySelector('.plc-top');
    top.innerHTML = searchIcon && (this._v.searchOpen || this._v.query)
      ? `<div class="plc-hrow plc-sbar">${pieces.search}</div>`
      : this._headerHtml('library', pieces, playerShown);
    const cv = this._conf?.card_version;
    const notes = [
      this._cfgErr ? `<div class="plc-note err"><ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>Part of this card's settings couldn't be read: ${esc(this._cfgErr)}. Open the editor and save again.</span></div>` : '',
      cv && cv !== BUILD_NUMBER ? `<div class="plc-note"><ha-icon icon="mdi:update"></ha-icon><span>This device is running an older copy of the card (${esc(BUILD_NUMBER)}; Home Assistant has ${esc(cv)}).</span>
        <button class="plc-btn" data-reload>Reload</button></div>` : ''];
    if (notes.some(Boolean)) top.insertAdjacentHTML('afterbegin', notes.join(''));
    const bn = this._root.querySelector('.plc-bnav-slot');
    if (bn) bn.innerHTML = foot ? `<footer class="plc-footer${cfg(this._c, 'footer_sticky') ? ' sticky' : ''}">${foot}</footer>` : '';
    const ph = this._root.querySelector('.plc-phead');
    if (ph) ph.innerHTML = this._headerHtml('player', pieces, playerShown);
  }

  _panelVisible(np = nowPlaying(this._hass, this._tv())) {
    return this._npMode() === 'panel' && !this._phone && !!np && (np.live || !!this._resumeFor(np.tv)) && this._v.npHidden !== `${np.tv?.id}|${np.title}`
      && (!!cfg(this._c, 'np_auto_open') || this._v.npOpen === np.tv?.id);   // opened by hand (Watching now, Play) unless set to open by itself
  }


  // ---- tiles

  _tile(it, listId, i, { fanart = false, fade = false, lines = null, look = null, st = null } = {}) {
    const art = fanart ? (it.art || it.poster) : (it.poster || it.art);
    const ln = lines || [it.show || it.title, it.type === 'episode' ? `S${it.season} · E${it.episode} · ${it.title}` : (it.year || '')];
    const text = look?.fields ? rowFieldsHtml(look, rowVals(it, this._c))
      : `<div class="plc-t">${esc(ln[0])}</div>${ln.slice(1).map((l, n) => (l ? `<div class="plc-s l${n + 1}">${esc(l)}</div>` : '')).join('')}`;
    const sel = this._v.detail && this._v.detail.list === listId && this._v.detail.i === i ? ' sel' : '';
    const flag = st ? flagsHtml(it, st, `${listId}|${i}`, 'tile') : it.flag && cfg(this._c, 'flag') ? '<span class="plc-badge">New</span>' : '';
    const watched = it.watched ? '<span class="plc-watched" title="Watched"><ha-icon icon="mdi:check"></ha-icon></span>' : '';
    const prog = it.progress ? `<div class="plc-prog"><div style="width:${Math.min(100, Number(it.progress))}%"></div></div>` : '';
    const qp = it.key && ['movie', 'episode', 'show'].includes(it.type) ? `<span class="plc-play" data-qplay="${esc(listId)}|${i}" role="button" title="Play"><ha-icon icon="mdi:play"></ha-icon></span>` : '';
    const ttype = `<ha-icon class="plc-ttype" icon="mdi:${it.type === 'movie' ? 'movie-open' : 'television-classic'}"></ha-icon>`;
    const bg = art ? (fade && fanart ? '' : ` style="background-image:url('${cssUrl(art)}')"`) : '';
    const fadeImg = fade && fanart && art ? `<span class="plc-fadeimg" style="background-image:url('${cssUrl(art)}')"></span>` : '';
    const shade = fanart && !fade ? '<span class="plc-fanshade"></span>' : '';
    return `<button class="plc-tile${sel}" data-open="${esc(listId)}|${i}"><div class="plc-poster${fade && fanart ? ' fade' : ''}"${bg}>${fadeImg}${shade}${art ? '' : esc(it.title)}${flag}${watched}${ttype}${qp}${prog}${fanart ? `<div class="plc-fan-text">${text}</div>` : ''}</div>${fanart ? '' : text}</button>`;
  }

  /** One title in the list view: small poster, title, year · length · rating, two lines of summary, play button. */
  _lrow(it, listId, i) {
    const meta = [it.year, it.content_rating, it.duration ? fmtTime(it.duration) : '', it.rating ? `★ ${Number(it.rating).toFixed(1)}` : '',
      it.type === 'show' && it.episodes ? `${it.episodes} episodes` : ''].filter(Boolean).join(' · ');
    const sel = this._v.detail && this._v.detail.list === listId && this._v.detail.i === i ? ' sel' : '';
    const qp = it.key && ['movie', 'episode', 'show'].includes(it.type) ? `<span class="plc-play" data-qplay="${esc(listId)}|${i}" role="button" title="Play"><ha-icon icon="mdi:play"></ha-icon></span>` : '';
    return `<button class="plc-lrow${sel}" data-open="${esc(listId)}|${i}"><div class="plc-lrow-img"${it.poster ? ` style="background-image:url('${cssUrl(it.poster)}')"` : ''}>${
      it.watched ? '<span class="plc-watched" title="Watched"><ha-icon icon="mdi:check"></ha-icon></span>' : ''}${it.progress ? `<div class="plc-prog"><div style="width:${Math.min(100, Number(it.progress))}%"></div></div>` : ''}</div>
      <div class="plc-lrow-txt"><div class="plc-t">${esc(it.show || it.title)}</div>${meta ? `<div class="plc-s">${esc(meta)}</div>` : ''}${it.summary ? `<div class="plc-lrow-sum">${esc(it.summary)}</div>` : ''}</div>${qp}</button>`;
  }

  // ---- main

  _renderMain() {
    const main = this._root.querySelector('.plc-main');
    this._io?.disconnect();
    if (this._err) { main.innerHTML = `<div class="plc-msg err">${esc(this._err)}</div>`; return; }
    if (!this._conf) { main.innerHTML = '<div class="plc-msg">Loading…</div>'; return; }
    if (!this._tvs().length) { main.innerHTML = '<div class="plc-msg">No TVs yet: add them in Plex Center\'s options (Settings → Devices & services → Plex Center → Configure).</div>'; return; }
    if (this._v.tab === 'home') this._renderHome(main); else if (this._v.tab === 'calendar') this._renderCalendar(main); else this._renderLibrary(main);
    if (this._built) this._renderNP();
  }

  /** Items of a section narrowed to its Movies / TV choice (chips override the setting). */
  /** Which kinds a section shows now: its setting, toggled by its Movies / TV chips. */
  _kinds(id) {
    const k = secStyle(this._c, id).kind;
    return this._v.secKind?.[id] || { movie: k !== 'show', show: k !== 'movie' };
  }
  _byKind(id, items) {
    const k = this._kinds(id);
    return items.filter((it) => (it.type === 'movie' ? k.movie : ['episode', 'show', 'season'].includes(it.type) ? k.show : k.movie && k.show));
  }

  _renderHome(main) {
    const parts = [];
    for (const id of homeOrder(this._c)) {
      if (!homeVisible(this._c, id) || (id === 'watching' && !cfg(this._c, 'watching_home'))) continue;
      if (id === 'cards') parts.push('<div class="plc-cards"></div>');
      else parts.push(`<div class="plc-sec" data-sec="${esc(id)}"></div>`);
    }
    if (this._v.query) setTimeout(() => this._homeSearch(), 0);
    main.innerHTML = parts.join('') || '<div class="plc-msg">Nothing on the Home tab. Turn sections on in the card editor, or pick a library above.</div>';
    this._paintWatching();
    this._paintUpcoming();
    this._paintPlexHubs();
    this._renderExtraCards();
    const tv = this._tv();
    const pct = Math.min(100, Math.max(50, Number(cfg(this._c, 'watched_pct')) || 95));
    const key = `hubs:${tv.id}:${pct}`;
    const recentIds = homeOrder(this._c).filter((id) => secType(this._c, id) === 'recent' && homeVisible(this._c, id) && !secStyle(this._c, id).s.source);
    homeOrder(this._c).filter((id) => secType(this._c, id) === 'recent' && homeVisible(this._c, id) && secStyle(this._c, id).s.source).forEach((id) => this._paintRecent(id));
    const paint = (h) => {
      const c = main.querySelector('[data-sec="continue"]');
      this._lists.set('continue', h.continue || []); (this._full ||= {}).continue = h.continue || [];
      if (c) { if (h.continue?.length) this._paintContinue(c, h.continue); else c.remove(); }
      const nx = main.querySelector('[data-sec="next"]'), next = h.next || [];
      this._lists.set('next', next); (this._full ||= {}).next = next;
      if (nx) {
        const st = secStyle(this._c, 'next');
        if (!next.length) nx.remove();
        else sig(nx, JSON.stringify([JSON.stringify(st.s), st.auto, this._c._screen, JSON.stringify(lookOwn(this._c, 'next')), this._v.secOpen?.next, next.map((x) => [x.key, x.watched])]),
          () => this._fill('next', nx, 'Next Episode', next.length, next.slice(0, st.max), 'next'));
      }
      this._recent = h.recent || [];
      for (const id of recentIds) this._paintRecent(id);
      this._paintUpcoming();   // drop what just turned out to be in Plex
    };
    if (peek(key)) paint(peek(key));
    if (homeVisible(this._c, 'continue') || homeVisible(this._c, 'next') || recentIds.length) {
      const size = Math.min(100, Math.max(Number(cfg(this._c, 'max')) || 12, ...recentIds.map((id) => secStyle(this._c, id).max * (secStyle(this._c, id).kind === 'both' ? 1 : 3))));
      // an integration not restarted since the update doesn't know watched_pct yet: ask without it
      cached(this._hass, key, REFRESH_MS, () => ws(this._hass, 'hubs', { tv: tv.id, size, watched_pct: pct })
        .catch((e) => { if (/watched_pct/.test(e?.message || '')) return ws(this._hass, 'hubs', { tv: tv.id, size }); throw e; }))
        .then((h) => { if (main.isConnected && this._v.tab === 'home' && this._tv()?.id === tv.id) paint(h); })
        .catch((e) => { const c = main.querySelector('[data-sec="continue"]'); if (c) c.innerHTML = `<div class="plc-msg err">${esc(e?.message || e)}</div>`; });
    }
  }

  _paintRecent(id) {
    const r = this._root.querySelector(`[data-sec="${id}"]`);
    if (!r) return;
    const st = secStyle(this._c, id);
    if (st.s.source) {
      const mine = this._byKind(id, this._sensorItems(this._sensorKinds([st.s.source])));
      if (!this._hass.states[st.s.source]) { r.innerHTML = `<div class="plc-msg err">${esc(st.s.source)} not found.</div>`; return; }
      const items = mine.slice(0, st.max);
      this._lists.set(id, items); (this._full ||= {})[id] = mine;
      sig(r, JSON.stringify([JSON.stringify(st.s), cfg(this._c, 'image_style'), this._v.secOpen?.[id], JSON.stringify(this._kinds(id)), items.map((x) => [x.title, x.poster, x.lines])]),
        () => { this._fill(id, r, SEC_TYPE_TITLE.recent, mine.length, items, id); });
      return;
    }
    if (!this._recent) return;
    const all = this._recent.map((it) => ({ ...it, flag: !it.watched, lines: umcLines(plexAsUmc(it), PLEX_LINE_DEFAULTS, this._c) }));
    const mine = this._byKind(id, all);
    if (!this._recent.length) { r.remove(); return; }
    const items = mine.slice(0, st.max);
    this._lists.set(id, items);
    sig(r, JSON.stringify([JSON.stringify(st.s), cfg(this._c, 'image_style'), this._v.secOpen?.[id], JSON.stringify(this._kinds(id)), items.map((x) => [x.key, x.title, x.watched])]),
      () => this._fill(id, r, SEC_TYPE_TITLE.recent, mine.length, items, id,
        this._libraries()[0] && st.view_all ? '<button class="plc-viewall" data-viewall="added">View all →</button>' : ''));
  }

  /** Plex rows: Plex's own hubs ("Because you watched…", "Top rated", …) for the TV's user. */
  _paintPlexHubs() {
    const tv = this._tv();
    for (const id of homeOrder(this._c).filter((x) => secType(this._c, x) === 'plexhub' && homeVisible(this._c, x))) {
      const sec = this._root.querySelector(`[data-sec="${id}"]`);
      if (!sec) continue;
      const st = secStyle(this._c, id);
      if (!st.s.hub) { sec.innerHTML = '<div class="plc-msg">Pick a Plex row for this section in the card editor.</div>'; continue; }
      const key = `phub:${tv.id}:${st.s.library || ''}:${st.s.hub}:${st.total}`;
      const paint = (res) => {
        if (!sec.isConnected) return;
        if (!res?.items?.length) { sec.remove(); return; }
        const mine = this._byKind(id, res.items.map((it) => ({ ...it, flag: !it.watched, lines: umcLines(plexAsUmc(it), PLEX_LINE_DEFAULTS, this._c) })));
        this._lists.set(id, mine);
        sig(sec, JSON.stringify([JSON.stringify(st.s), cfg(this._c, 'image_style'), this._v.secOpen?.[id], JSON.stringify(this._kinds(id)), mine.map((x) => [x.key, x.watched])]),
          () => this._fill(id, sec, res.title || SEC_TYPE_TITLE.plexhub, mine.length, mine, id));
      };
      if (peek(key)) paint(peek(key));
      cached(this._hass, key, REFRESH_MS, () => ws(this._hass, 'plex_hubs', { tv: tv.id, hub: st.s.hub, size: st.total, ...(st.s.library ? { library: st.s.library } : {}) }))
        .then(paint).catch((e) => { if (sec.isConnected) sec.innerHTML = `<div class="plc-msg err">${esc(e?.message || e)}</div>`; });
    }
  }

  /** Coming Soon sections: the Radarr / Sonarr (upcoming-media) sensors, merged and sorted by date. */
  /** Items of upcoming-media sensors as card items (Plex ones carry their key, so they play). */
  _sensorItems(sensors) {
    const pool = [];
    for (const sns of sensors) {
      const { defaults, items } = umcItems(this._hass.states[sns.id]);
      for (const it of items) {
        const type = sns.kind === 'movie' ? 'movie' : sns.kind === 'show' ? 'episode' : (it.episode || it.number ? 'episode' : 'movie');
        const dl = deepLinkKey(it.deep_link);
        pool.push({ title: it.title, poster: it.poster || it.fanart || '', art: it.fanart || it.poster || '', flag: !!it.flag, key: dl?.key || null,
          type, trailer: it.trailer || null, umc: it, airdate: it.airdate || '', lines: umcLines(it, defaults, this._c) });
      }
    }
    return pool;
  }

  /** Keys of what is already in Plex (Recently Added, Continue watching, Next Episode): movies by title, episodes by show + SxE. */
  _plexKeys() {
    const low = (x) => String(x || '').trim().toLowerCase(), out = new Set();
    for (const it of [...(this._recent || []), ...(this._lists.get('continue') || []), ...(this._lists.get('next') || [])]) {
      if (it.type === 'movie') out.add(`mv:${low(it.title)}`);
      else if (it.type === 'episode' && it.season != null) out.add(`ep:${low(it.show)}:${Number(it.season)}:${Number(it.episode)}`);
    }
    return out;
  }
  /** A Coming Soon item that is already in Plex. */
  _alreadyIn(keys, { type, title, season, episode, number }) {
    const low = (x) => String(x || '').trim().toLowerCase();
    if (type === 'movie') return keys.has(`mv:${low(title)}`);
    const m = /S(\d+)\s*E(\d+)/i.exec(String(number || '')) || /(\d+)x(\d+)/.exec(String(number || ''));
    const sn = season ?? (m ? Number(m[1]) : null), en = episode ?? (m ? Number(m[2]) : null);
    return sn != null && en != null && keys.has(`ep:${low(title)}:${Number(sn)}:${Number(en)}`);
  }

  _sensorKinds(ids) {
    const auto = upcomingSensors(this._hass, { upcoming_sensors: ids });
    return ids.map((id) => auto.find((x) => x.id === id) || { id, kind: 'both' });
  }

  _paintUpcoming() {
    const ids = homeOrder(this._c).filter((id) => secType(this._c, id) === 'upcoming' && homeVisible(this._c, id));
    for (const id of ids) {
      const sec = this._root.querySelector(`[data-sec="${id}"]`);
      if (!sec) continue;
      const st = secStyle(this._c, id);
      const sensors = st.s.sensors?.length ? this._sensorKinds(st.s.sensors) : upcomingSensors(this._hass, this._conf);
      const arrOk = Object.values(this._conf?.arr || {}).some(Boolean);
      if (arrOk && (st.s.source === 'arr' || !sensors.length)) { this._paintUpcomingArr(id, sec, st); continue; }
      if (!sensors.length) { sec.remove(); continue; }
      const have = this._plexKeys();   // already in Plex (linked, or in Recently Added / Continue / Next): not coming soon
      const pool = this._sensorItems(sensors).filter((x) => !x.key && !this._alreadyIn(have, { type: x.type, title: x.title, number: x.umc?.number }))
        .sort((a, b) => String(a.airdate).localeCompare(String(b.airdate)));
      const mine = this._byKind(id, pool), items = mine.slice(0, st.max);
      this._lists.set(id, items); (this._full ||= {})[id] = mine;
      sig(sec, JSON.stringify([JSON.stringify(this._c.home_style?.[id] || {}), cfg(this._c, 'image_style'), this._v.secOpen?.[id], this._v.secKind?.[id],
        JSON.stringify(this._kinds(id)), items.map((x) => [x.title, x.poster, x.lines])]), () => { this._fill(id, sec, SEC_TYPE_TITLE.upcoming, mine.length, items, id); });
    }
  }

  /** Coming Soon from Sonarr / Radarr (through Plex Center): each show's next episode and each movie's next release. */
  async _paintUpcomingArr(id, sec, st) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    let res;
    const tvId = this._tv()?.id;
    try { res = await cached(this._hass, `cal:soon:${ymd(start)}:${tvId || ''}`, 300000, () => ws(this._hass, 'calendar', { start: start.toISOString(), end: addDays(start, 60).toISOString(), tv: tvId })); }
    catch { return; }
    if (!sec.isConnected) return;
    const now = Date.now(), seen = new Set(), pool = [], have = this._plexKeys();
    const own = ['title_text', 'line1_text', 'line2_text', 'line3_text', 'line4_text', 'line5_text'].some((k) => this._c[k]);
    const rels = Array.isArray(st.s.releases) ? st.s.releases : REL_TYPES.map(([r]) => r), many = rels.length > 1;
    for (const ev of res.events || []) {
      if (!ev.all_day && new Date(ev.at).getTime() < now - 3 * 3600 * 1000) continue;   // already aired
      if (ev.kind === 'movie' && !rels.includes(ev.release)) continue;                  // a release type the section leaves out
      // already in the system (downloaded, in Plex, or in Recently Added / Continue / Next): not coming soon
      if (ev.has_file || ev.plex_key || this._alreadyIn(have, { type: ev.kind === 'movie' ? 'movie' : 'episode', title: ev.title, season: ev.season, episode: ev.episode })) continue;
      const k = ev.kind === 'episode' ? `tv:${ev.tvdb || ev.title}` : `mv:${ev.tmdb || ev.title}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const day = (ev.all_day ? parseYmd(ev.at) : new Date(ev.at)).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      const time = this._calTime(ev), rel = (CAL_TYPES[ev.release] || CAL_TYPES.episode)[0];
      const badge = this._calBadge(ev);
      pool.push({ title: ev.title, poster: ev.poster || ev.fanart || '', art: ev.fanart || ev.poster || '', type: ev.kind === 'movie' ? 'movie' : 'episode',
        ...(ev.kind === 'episode' ? { show: ev.title, show_key: ev.plex_show || undefined, season: ev.season, episode: ev.episode } : {}),
        trailer: ev.trailer ? `https://www.youtube.com/watch?v=${ev.trailer}` : null, airdate: ev.at, summary: ev.overview || '', year: ev.year, ev,
        umc: { title: ev.title, episode: ev.episode_title || '', number: sxe(ev), airdate: ev.at, release: ev.kind === 'movie' ? `${rel} $date` : (ev.all_day ? '$day, $date' : '$day, $date $time'),
          runtime: ev.runtime || '', genres: (ev.genres || []).join(', '), studio: ev.network || ev.studio || '', rating: ev.rating ? `★ ${ev.rating}` : '', type_label: ev.kind === 'movie' && many ? rel : '', summary: ev.overview || '', year: ev.year },
        flag: !!badge, flag_text: badge,
        lines: own ? null : [ev.title, ev.kind === 'episode' ? [badge, sxe(ev), ev.episode_title].filter(Boolean).join(' · ') : rel, [day, time].filter(Boolean).join(' · '),
          [ev.network || ev.studio, ev.runtime ? `${ev.runtime} min` : ''].filter(Boolean).join(' · ')] });
    }
    if (own) for (const x of pool) x.lines = umcLines(x.umc, {}, this._c);   // the card's own line templates (Row text)
    const mine = this._byKind(id, pool), items = mine.slice(0, st.max);
    this._lists.set(id, items); (this._full ||= {})[id] = mine;
    sig(sec, JSON.stringify(['arr', JSON.stringify(this._c.home_style?.[id] || {}), own, cfg(this._c, 'image_style'), this._v.secOpen?.[id], this._v.secKind?.[id],
      JSON.stringify(this._kinds(id)), items.map((x) => [x.title, x.poster, x.lines])]), () => { this._fill(id, sec, SEC_TYPE_TITLE.upcoming, mine.length, items, id); });
  }

  /** Search every library from Home: results grouped by library replace the sections while there's a query. */
  async _homeSearch() {
    const main = this._root.querySelector('.plc-main');
    const q = this._v.query;
    main.classList.toggle('searching', !!q);
    let box = main.querySelector('[data-sec="search"]');
    if (!q) { box?.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'plc-sec plc-search-res'; box.dataset.sec = 'search'; main.prepend(box); }
    box.innerHTML = '<div class="plc-msg">Searching…</div>';
    const tv = this._tv();
    let groups;
    try { groups = await cached(this._hass, `search:${tv.id}:${q}`, REFRESH_MS, () => ws(this._hass, 'search', { tv: tv.id, query: q, limit: 30 })); }
    catch (e) { box.innerHTML = `<div class="plc-msg err">${esc(e?.message || e)}</div>`; return; }
    if (this._v.query !== q || !box.isConnected) return;
    if (!groups.length) { box.innerHTML = `<div class="plc-msg">Nothing matches “${esc(q)}”.</div>`; return; }
    box.innerHTML = groups.map((g, gi) => { this._lists.set(`search:${gi}`, g.items); return `<div class="plc-sec-h"><span class="name caps">${esc(g.library)}</span> <span class="n">${g.items.length}</span></div>
      <div class="plc-row">${g.items.map((it, i) => this._tile(it, `search:${gi}`, i)).join('')}</div>`; }).join('');
  }

  /** The sessions Watching now shows (every TV, or only the one in the selector). */
  _watchList() {
    // Plex keeps sessions of a TV that's been turned off: drop them (a resume card stands in when there's one)
    const plex = (peek('sessions') || []).filter((x) => {
      const t = this._tvForSession(x);
      if (!t) return true;
      if (tvPower(this._hass, t) === false) return false;
      return !(this._resumeFor(t) && (this._stuck(t) || (x.player_state === 'paused' && !realOn(this._hass, t))));
    });
    const resumes = this._tvs().filter((t) => this._resumeFor(t) && (!realOn(this._hass, t) || this._stuck(t))).map((t) => {
      const r = this._resumeFor(t);
      return { _tv: t.id, _resume: r, key: `resume:${t.id}`, title: r.show || r.title || r.app || 'Paused', type: r.type || r.kind };
    });
    const cur = this._tv(), all = [...plex, ...(cfg(this._c, 'watching_apps') ? this._appSessions() : []), ...resumes];
    return all.filter((x) => cfg(this._c, 'watching_tvs') !== 'selected' || this._tvForSession(x)?.id === cur?.id);
  }
  /** TVs playing another app (HBO Max, Netflix …), from the TV's own entity: Plex doesn't know about them. */
  _appSessions() {
    if (!this._hass) return [];
    const plex = peek('sessions') || [];
    return this._tvs().flatMap((tv) => {
      const np = nowPlaying(this._hass, tv);
      const app = np?.st?.attributes?.app_name || '';
      if (!np?.live || /plex/i.test(app) || plex.some((x) => this._tvForSession(x)?.id === tv.id)) return [];
      const at = np.st.attributes || {}, dur = Number(at.media_duration) || 0, pos = livePosition(np.st);
      return [{ _tv: tv.id, _app: true, type: 'app', key: `app:${tv.id}`, title: np.title, poster: np.art || undefined,
        player: [tvLabel(tv), app].filter(Boolean).join(' · '), player_state: np.st.state === 'paused' ? 'paused' : 'playing',
        progress: dur && pos != null ? Math.round((pos / dur) * 100) : 0 }];
    });
  }
  _paintWatching(target = null) {
    const pop = !!target;
    if (!target) {   // the Watching now popover too, when open, and the header chip's count
      const p2 = this._root?.querySelector('.plc-watchpop [data-wpop]');
      if (p2) this._paintWatching(p2);
      this._renderTopChip();
    }
    const sec = target || this._root?.querySelector('[data-sec="watching"]');
    if (!sec) return;
    const s = this._watchList();
    if (!s.length) { sec.innerHTML = pop ? '<div class="plc-msg">Nothing is playing.</div>' : ''; return; }
    const tvFor = (x) => this._tvForSession(x), wlk = lookOwn(this._c, 'watching');
    applyLook(sec, wlk);
    const fanBg = (x) => (wlk.image && wlk.image !== 'poster' && (x.art || x.poster)
      ? ` style="background-image:linear-gradient(90deg, rgba(0,0,0,.82), rgba(0,0,0,${wlk.image === 'fade' ? '.15' : '.55'})), url('${cssUrl(x.art || x.poster)}')"` : '');
    const place = watchPage(this._v.tab), coll = !pop && !!cfg(this._c, `watching_coll_${place}`);
    const open = !coll || (this._v.wOpen?.[place] ?? !cfg(this._c, `watching_collapsed_${place}`));
    sec.classList.toggle('closed', !open);
    const hIcon = cfg(this._c, 'watching_icon') ? '<ha-icon icon="mdi:account-eye"></ha-icon>' : '';
    const cpos = cfg(this._c, 'watching_chevron_pos'), cpx = Number(cfg(this._c, 'watching_chevron_px')) || 0, cw = cfg(this._c, 'watching_chevron_weight');
    const cst = [cpx ? `font-size:${cpx}px` : '', cw ? `font-weight:${cw}` : ''].filter(Boolean).join(';');
    const chev = coll && cfg(this._c, 'watching_chevron') ? `<span class="chev${cpos === 'end' ? ' end' : ''}" aria-hidden="true"${cst ? ` style="${cst}"` : ''}>›</span>` : '';
    const ch = (p) => (cpos === p ? chev : '');
    sec.innerHTML = `${pop ? '' : `<div class="plc-sec-h${coll ? ' tap' : ''}"${coll ? ` role="button" tabindex="0" data-wtoggle="${place}" aria-expanded="${open}"` : ''}>${hIcon}${ch('left')}<span>Watching now</span>${ch('right')} <span class="n">${s.length}</span>${ch('count')}${ch('end')}</div>`}<div class="plc-watch${pop ? ' pop' : ''}"${open ? '' : ' hidden'}>${s.map((x) => {
      if (x._resume) return this._resumeCardHtml(x);
      const tv = tvFor(x);
      return `
      <${tv ? `button class="plc-sess tap${wlk.image && wlk.image !== 'poster' ? ' fan' : ''}" data-sesstv="${esc(tv.id)}" title="Controls for ${esc(tvLabel(tv))}"` : `div class="plc-sess${wlk.image && wlk.image !== 'poster' ? ' fan' : ''}"`}${fanBg(x)}>${x._app ? `<div class="plc-sess-art app"><ha-icon icon="mdi:television-play"></ha-icon>${x.poster ? `<i style="background-image:url('${cssUrl(x.poster)}')"></i>` : ''}</div>`
        : `<div class="plc-sess-art"${x.poster ? ` style="background-image:url('${cssUrl(x.poster)}')"` : ''}></div>`}
        <div style="min-width:0">${fieldLines('watching', wlk, { title: x.show || x.title, number: x.type === 'episode' && x.season != null && x.episode != null ? `S${x.season} · E${x.episode}` : '',
          eptitle: x.type === 'episode' ? x.title : '', year: x.type === 'episode' ? '' : x.year, viewer: [x.user, x.player || x.device].filter(Boolean).join(' · '),
          state: x.player_state === 'paused' ? 'paused' : '' }).map(([, h], i) => `<div class="${i === 0 ? 'plc-t' : 'plc-s'}">${h}</div>`).join('')}
          <div class="plc-bar-track"><div class="plc-bar-fill" style="width:${Math.min(100, Number(x.progress) || 0)}%"></div></div></div>${tv ? '<ha-icon class="plc-sess-go" icon="mdi:remote-tv"></ha-icon>' : ''}</${tv ? 'button' : 'div'}>`;
    }).join('')}</div>`;
  }
  /** A Watching now card for a TV that's off with something to resume. */
  _resumeCardHtml(x) {
    const tv = this._tvs().find((t) => t.id === x._tv), r = x._resume, art = tv && this._resumeArt(tv, r);
    const sub = r.kind === 'plex' ? (r.type === 'episode' && r.season != null ? `S${r.season} · E${r.episode}${r.show && r.title ? ` · ${r.title}` : ''}` : '') : (r.app || '');
    const off = tvPower(this._hass, tv) !== true;
    return `<div class="plc-sess resume" role="button" tabindex="0" data-sesstv="${esc(x._tv)}" title="${esc(off ? 'Off · ready to resume' : 'Ready to resume')}">
      <div class="plc-sess-art app"><ha-icon icon="mdi:television-off"></ha-icon>${art ? `<i style="background-image:url('${cssUrl(art)}')"></i>` : ''}</div>
      <div style="min-width:0"><div class="plc-t">${esc(x.title)}</div>${sub ? `<div class="plc-s">${esc(sub)}</div>` : ''}
        <div class="plc-s plc-resume-st">${off ? 'TV off · ' : ''}${esc(this._pausedAt(r))} · ${esc(tvLabel(tv))}</div>
        <div class="plc-resume-btns"><button class="plc-btn main" data-resume="${esc(x._tv)}"><ha-icon icon="mdi:play-circle-outline"></ha-icon>Resume</button>
          <button class="plc-icon-btn" data-resumex="${esc(x._tv)}" title="Forget it"><ha-icon icon="mdi:close"></ha-icon></button></div></div></div>`;
  }

  _paintContinue(sec, items, force = false) {
    const lk = lookOwn(this._c, 'continue'), st = secStyle(this._c, 'continue');
    const layout = st.s.layout || (this._phone ? 'row' : 'banner');
    // the hubs refresh repaints every few seconds: only when something changed, or the auto-rotate restarts every time
    const sg = JSON.stringify([layout, this._c._screen, JSON.stringify(st.s), JSON.stringify(lk), this._v.hero || 0, items.map((x) => [x.key, x.offset, x.watched])]);
    if (!force && sec.dataset.cwsig === sg && sec.firstElementChild) return;
    sec.dataset.cwsig = sg;
    this._anim = this._anim || {};
    if (layout !== 'banner' || st.auto === 'off') { clearInterval(this._anim.continueBanner); clearTimeout(this._anim.continueBanner); delete this._anim.continueBanner; this._cwTimer = null; }
    if (layout !== 'banner') {   // a row / column like the other sections (items to show, scroll, auto-rotate, image style)
      this._lists.set('continue', items);
      this._fill('continue', sec, 'Continue watching', items.length, items.slice(0, st.max), 'continue');
      return;
    }
    applyLook(sec, lk);
    sec.style.setProperty('--plc-fade-ms', `${Math.max(0, Number(st.fade_ms))}ms`);
    // one timer for the banner, kept across repaints (a repaint must not restart it); it reads the current list each time
    const tsig = JSON.stringify([st.auto, st.scroll_dir, st.speed, st.fade_ms, cfg(this._c, 'stagger_rotate'), cfg(this._c, 'stagger_gap'), this._stepSections()]);
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (st.auto !== 'off' && items.length > 1 && !reduce) {
      if (!this._anim.continueBanner || this._cwTimer !== tsig) {
        clearInterval(this._anim.continueBanner); clearTimeout(this._anim.continueBanner);
        this._cwTimer = tsig;
        const ms = Math.max(0, Number(st.fade_ms)), [off, period] = this._stepTiming('continue', Math.max(2, Number(st.s.speed ?? 5) || 5) * 1000 + 2 * ms);
        const step2 = () => {
          const box = this._root?.querySelector('[data-sec="continue"]'), list = this._lists.get('continue') || [];
          if (!box || !box.isConnected || list.length < 2 || this._cwHold) return;   // paused only while the pointer is on its buttons
          const hero = box.querySelector('.plc-hero'), nxt = list[((this._v.hero || 0) + 1) % list.length];
          preloadImages(`url('${cssUrl(nxt?.art || nxt?.still || nxt?.poster || '')}')`);
          const slide = st.auto === 'scroll', dir = st.scroll_dir || 'left';
          if (slide) { box.classList.add('plc-sliding'); hero?.classList.add('plc-slide', `to-${dir}`); } else hero?.classList.add('plc-fade', 'out');
          setTimeout(() => {
            if (!box.isConnected) return;
            this._v.hero = ((this._v.hero || 0) + 1) % list.length; this._paintContinue(box, list, true);
            const nh = box.querySelector('.plc-hero');
            if (!nh) return;
            if (slide) { nh.classList.add('plc-slide', `from-${dir}`); void nh.offsetWidth; nextFrame(() => nh.classList.remove(`from-${dir}`)); setTimeout(() => box.classList.remove('plc-sliding'), ms + 50); }
            else { nh.classList.add('plc-fade', 'out'); void nh.offsetWidth; nextFrame(() => nh.classList.remove('out')); }
          }, ms);
        };
        if (off) this._anim.continueBanner = setTimeout(() => { this._anim.continueBanner = setInterval(step2, period); }, off);
        else this._anim.continueBanner = setInterval(step2, period);
      }
    } else { clearInterval(this._anim.continueBanner); clearTimeout(this._anim.continueBanner); delete this._anim.continueBanner; this._cwTimer = null; }
    const i = Math.min(this._v.hero || 0, items.length - 1), it = items[i];
    const sub = it.type === 'episode' ? `Season ${it.season}, Episode ${it.episode} · ${it.title}` : [it.year, it.duration ? fmtTime(it.duration) : ''].filter(Boolean).join(' · ');
    const left = it.offset ? `${fmtTime(it.offset)} of ${fmtTime(it.duration)} · ends ${endsAt((it.duration || 0) - it.offset, cfg(this._c, 'clock'))} if started now` : '';
    const img = it.art || it.still || it.poster;
    if (!sec.dataset.cwhold) {
      sec.dataset.cwhold = '1';
      sec.addEventListener('pointerover', (e) => { this._cwHold = e.pointerType === 'mouse' && !!e.target.closest?.('.plc-btns, .plc-pager'); });
      sec.addEventListener('pointerleave', () => { this._cwHold = false; });
    }
    sec.innerHTML = `<div class="plc-hero"><div class="plc-hero-img"${img ? ` style="background-image:url('${cssUrl(img)}')"` : ''}></div>
      <div class="plc-hero-info"><div class="plc-eyebrow">Continue watching on ${esc(tvLabel(this._tv()))}</div>
        <h2 class="plc-big">${esc(it.show || it.title)}</h2><div class="plc-meta">${esc(sub)}</div>
        ${it.progress ? `<div class="plc-bar-track"><div class="plc-bar-fill" style="width:${it.progress}%"></div></div><div class="plc-meta">${esc(left)}</div>` : ''}
        <div class="plc-btns"><button class="plc-btn main" data-qplay="continue|${i}" data-direct><ha-icon icon="mdi:play"></ha-icon>Resume${it.offset ? ` ${fmtTime(it.offset)}` : ''}</button>
          <button class="plc-btn" data-qrestart="continue|${i}"><ha-icon icon="mdi:restart"></ha-icon>Start over</button>
          <button class="plc-btn" data-cwmark="${i}" title="Mark as watched"><ha-icon icon="mdi:check"></ha-icon>Mark watched</button>${this._openShowHtml(it)}</div>
        <div class="plc-pager"><button class="plc-icon-btn" data-hero="-1" title="Previous"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
          ${i + 1} / ${items.length}<button class="plc-icon-btn" data-hero="1" title="Next"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
          ${items.length > 1 && st.cycle_chip ? this._cycleChip('continue', st) : ''}${items.length > 1 && st.view_all ? '<span class="plc-viewall" role="button" tabindex="0" data-viewsec="continue">View all →</span>' : ''}</div></div></div>`;
  }

  /** A Home section in its style: plain heading or collapsible bar; poster/fanart row or upcoming-media list. */
  _sectionHtml(id, sec, title, total, items, listId, extraHead = '') {
    const st = secStyle(this._c, id);
    sec.setAttribute('style', secVars(st));
    applyLook(sec, st.look, st.s);
    const open = this._v.secOpen?.[id] ?? !st.collapsed;
    sec.classList.toggle('closed', st.collapsible && !open);
    title = st.s.title || title;
    const count = `${total} ${total === 1 ? 'item' : 'items'}`;
    const icon = st.show_icon && st.icon ? `<ha-icon icon="${esc(st.icon)}"></ha-icon>` : '';
    const name = st.show_title ? `<span class="name ${st.head_style}">${esc(title)}</span>` : '<span class="name"></span>';
    const kinds = this._kinds(id);
    const chips = st.chips ? `<span class="plc-kchips">${[['movie', 'Movies'], ['show', 'TV']].map(([v, n]) =>
      `<span class="plc-chip${kinds[v] ? ' on' : ''}" role="button" data-seckind="${esc(id)}|${v}">${n}</span>`).join('')}</span>` : '';
    const hcls = `${st.head_style}-h${st.divider ? ' div' : ''}`;
    const slot = { l: [], c: [], r: [] }, at = (p) => (p === 'center' ? 'c' : p === 'right' ? 'r' : 'l');
    const ttl = st.collapsible ? `${icon}${name}` : `${icon}${name}${st.show_count ? ` <span class="n">${total}</span>` : ''}`;
    slot[at(st.title_pos)].push(`<span class="plc-sec-tt">${ttl}</span>`);
    if (chips) slot[at(st.chips_pos)].push(chips);
    const more = Math.max(total, items.length) > st.show;   // more than fits at once
    if (more && st.cycle_chip) slot.r.push(this._cycleChip(id, st));
    if (more && st.view_all && !extraHead) slot.r.push(`<span class="plc-viewall" role="button" tabindex="0" data-viewsec="${esc(id)}">View all →</span>`);
    if (st.collapsible) slot.r.push(`${st.show_count ? `<span class="n">${esc(total ? count : 'None')}</span>` : ''}<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>`);
    else if (extraHead) slot.r.push(extraHead);
    const noc = slot.c.length ? '' : ' noc';
    const slots = `<span class="sl l">${slot.l.join('')}</span><span class="sl c">${slot.c.join('')}</span><span class="sl r">${slot.r.join('')}</span>`;
    const head = st.collapsible
      ? `<button class="plc-sec-bar slots${noc} ${hcls}${total ? ' has' : ''}" data-secbar="${esc(id)}">${slots}</button>`
      : `<div class="plc-sec-h slots${noc} ${hcls}">${slots}</div>`;
    const page = st.auto === 'fade' ? this._fadePage?.[id] || 0 : 0;
    const body = this._sectionItems(st, items, listId, page);
    const mode = st.auto === 'scroll' ? 'scroll auto' : st.auto === 'fade' ? 'limit fadeset' : st.scroll ? 'scroll' : 'limit';
    return `${head}<div class="plc-sec-body ${mode}" data-secbody="${esc(id)}">${body}</div>`;
  }

  /** The items of a section: all of them when it scrolls, else one page of `show` (fade pages rotate). */
  _sectionItems(st, items, listId, page = 0) {
    const fan = st.image === 'fanart';
    const flagOn = st.flag;
    const scrolls = st.scroll || st.auto === 'scroll';
    const n = st.show;
    const idx = scrolls ? items.map((_, j) => j) : Array.from({ length: Math.min(n, items.length) }, (_, k) => (page * n + k) % items.length);
    const sel = idx.map((j) => [items[j], j]);
    let body;
    if (!items.length) body = '<div class="plc-msg">Nothing here.</div>';
    else if (st.layout === 'list') {
      body = `<div class="plc-list plc-fade">${sel.map(([it, j]) => {
        const img = fan ? (it.art || it.poster) : (it.poster || it.art);
        const lines = it.lines || [];
        const qp = it.key && ['movie', 'episode', 'show'].includes(it.type) ? `<span class="plc-play" data-qplay="${esc(listId)}|${j}" role="button" title="Play"><ha-icon icon="mdi:play"></ha-icon></span>` : '';
        return `<button class="plc-li${fan ? '' : ' poster'}" data-open="${esc(listId)}|${j}"><div class="plc-li-img"${img ? ` style="background-image:url('${cssUrl(img)}')"` : ''}></div>
          <div class="plc-li-text">${st.look?.fields ? rowFieldsHtml(st.look, rowVals(it, this._c)) : `<div class="plc-t">${esc(lines[0] || it.title)}</div>${lines.slice(1).map((l, n) => (l ? `<div class="plc-s l${n + 1}">${esc(l)}</div>` : '')).join('')}`}</div>
          ${flagOn ? flagsHtml(it, st, `${listId}|${j}`) : ''}${qp}</button>`;
      }).join('')}</div>`;
    } else {
      body = `<div class="plc-row plc-fade${fan ? ' fanart' : ''}">${sel.map(([it, j]) => this._tile({ ...it, flag: flagOn && it.flag }, listId, j,
        { fanart: fan, fade: !!st.fade, lines: it.lines || null, look: st.look, st })).join('')}</div>`;
    }
    return body;
  }

  /** Fill a section and start its auto scroll / fade (stopped on the next fill or when the card leaves). */
  _fill(id, sec, title, total, items, listId, extraHead = '') {
    sec.innerHTML = this._sectionHtml(id, sec, title, total, items, listId, extraHead);
    this._anim = this._anim || {};
    clearInterval(this._anim[id]); clearTimeout(this._anim[id]); delete this._anim[id];
    const st = secStyle(this._c, id);
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (st.auto === 'off' || reduce || items.length <= st.show) return;
    const body = sec.querySelector('[data-secbody]');
    let paused = false;
    body.addEventListener('pointerenter', () => { paused = true; });
    body.addEventListener('pointerleave', () => { paused = false; });
    if (st.auto === 'scroll') {
      const stg = this._stagger(id), step = 50, px = Math.max(1, st.speed) * (1 + (stg ? (stg - 0.5) * 0.3 : 0)) * step / 1000;
      // Left / Up: the items move left / up (forward); Right / Down: they move right / down (from the end back)
      const back = st.scroll_dir === 'right' || st.scroll_dir === 'down';
      let acc = 0, started = false, waitUntil = Date.now() + stg * 4000;
      this._anim[id] = setInterval(() => {
        if (Date.now() < waitUntil) return;
        const box = body.querySelector('.plc-row, .plc-list');
        if (!box || paused || !box.isConnected) return;
        const horiz = box.classList.contains('plc-row');
        const end = horiz ? box.scrollWidth - box.clientWidth : box.scrollHeight - box.clientHeight;
        const set = (v) => { if (horiz) box.scrollLeft = v; else box.scrollTop = v; };
        if (!started) { started = true; if (back) { set(end); return; } }
        acc += px;
        const move = Math.floor(acc); acc -= move;
        if (!move) return;
        const pos = horiz ? box.scrollLeft : box.scrollTop;
        set(back ? (pos <= 1 ? end : pos - move) : (pos >= end - 1 ? 0 : pos + move));
      }, step);
    } else {
      const pages = Math.ceil(items.length / st.show), [off, period] = this._stepTiming(id, Math.max(2, st.speed) * 1000 + 2 * st.fade_ms);
      const tick = () => {
        if (paused || !body.isConnected) return;
        const box = body.querySelector('.plc-fade');
        this._fadePage = { ...(this._fadePage || {}), [id]: ((this._fadePage?.[id] || 0) + 1) % pages };
        const next = this._sectionItems(st, items, listId, this._fadePage[id]);
        preloadImages(next);   // so the next set is ready when it fades in (no pop-in that makes the fade-in look shorter)
        box?.classList.add('out');
        setTimeout(() => {
          if (!body.isConnected) return;
          body.innerHTML = next;
          const nb = body.querySelector('.plc-fade');
          if (nb) { nb.classList.add('out'); void nb.offsetWidth; nextFrame(() => nb.classList.remove('out')); }
        }, st.fade_ms);
      };
      if (off) this._anim[id] = setTimeout(() => { if (body.isConnected) this._anim[id] = setInterval(tick, period); }, off);
      else this._anim[id] = setInterval(tick, period);
    }
  }

  /** Stagger (card-wide option): 0…1, this section's place among the auto-rotating ones on Home. */
  _stagger(id) {
    if (!cfg(this._c, 'stagger_rotate')) return 0;
    const ids = homeOrder(this._c).filter((x) => homeVisible(this._c, x) && secStyle(this._c, x).auto !== 'off');
    const i = ids.indexOf(id);
    return i <= 0 ? 0 : i / ids.length;
  }
  /** The sections that change in steps (fade, and the banner's slide), in Home order, with their own cycle (ms). */
  _stepSections() {
    const out = [];
    for (const x of homeOrder(this._c)) {
      if (!homeVisible(this._c, x)) continue;
      const st = secStyle(this._c, x);
      const banner = x === 'continue' && (st.s.layout || (this._phone ? 'row' : 'banner')) === 'banner';
      if (st.auto === 'fade' || (banner && st.auto === 'scroll')) {
        const sp = banner ? Number(st.s.speed ?? 5) || 5 : st.speed;
        out.push([x, Math.max(2, sp) * 1000 + 2 * Math.max(0, Number(st.fade_ms))]);
      }
    }
    return out;
  }
  /** When this section changes: [first delay, cycle] in ms. Staggered: one at a time, "Time between sections" apart. */
  _stepTiming(id, own) {
    if (!cfg(this._c, 'stagger_rotate')) return [0, own];
    const list = this._stepSections(), i = list.findIndex(([x]) => x === id);
    if (i < 0) return [0, own];
    const gap = Math.max(0, Number(cfg(this._c, 'stagger_gap'))) * 1000;
    const round = Math.max(gap * list.length, ...list.map(([, p]) => p));
    return [i * gap, round];
  }

  async _renderExtraCards() {
    const box = this._root.querySelector('.plc-cards');
    if (!box) return;
    if (!this._extra.length && window.loadCardHelpers) {
      try {
        const helpers = await window.loadCardHelpers();
        this._extra = this._c.home_cards.map((conf) => { const el = helpers.createCardElement(conf); el.hass = this._hass; return el; });
      } catch (e) { box.innerHTML = `<div class="plc-msg err">Extra cards: ${esc(e?.message || e)}</div>`; return; }
    }
    if (box.isConnected) box.replaceChildren(...this._extra);
  }
}

const STYLE_KEYS = ['search_width', 'screen_offset', 'poster_width', 'corner_radius', 'title_size', 'line_size', 'header_size', 'section_size', 'card_padding', 'card_radius',
  'card_border_width', 'card_shadow', 'box_shadows', 'text_shadows', 'layout', ...Object.keys(COLOR_DEFS)];
/** The buttons that start playback (held, when "Hold to play" is on). */
const HOLD_SEL = '[data-play], [data-qplay], [data-qrestart], [data-sheetplay], [data-calplay], [data-resume]';
const HOLDS = [['[data-markall]', 'hold_markall_ms', 'Mark all'], ['[data-mark], [data-cwmark]', 'hold_mark_ms', 'Mark watched'], [HOLD_SEL, 'hold_ms', 'Play']];
/** Run after the browser has painted (so a CSS transition starts from the state just set). */
const nextFrame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => requestAnimationFrame(fn)) : setTimeout(fn, 30));
/** Start loading the images in some HTML (background-image urls) before it is shown. */
function preloadImages(html) {
  if (typeof Image === 'undefined') return;
  for (const m of String(html).matchAll(/url\('([^']+)'\)/g)) { const im = new Image(); im.src = m[1]; }
}
function sig(node, s, paint) { if (node.dataset.sig === s) return; node.dataset.sig = s; paint(); }
const cssUrl = (u) => String(u).replace(/['"\\()\s]/g, (c) => encodeURIComponent(c));

Object.assign(PlexCenterCard.prototype, {
  // ---- library

  _libKey() { const l = this._libraries().find((x) => x.key === this._v.tab || x.title === this._v.tab); return l?.key; },
  _itemsKey(start = 0) { const v = this._v; return `items:${this._tv().id}:${this._libKey()}:${v.sort}:${v.unwatched ? 1 : 0}:${v.query}:${v.genre || ''}:${v.decade || ''}:${v.rating || ''}:${v.short ? 1 : 0}:${start}`; },

  _renderLibrary(main) {
    const lib = this._libKey();
    if (!lib) { main.innerHTML = '<div class="plc-msg">Loading…</div>'; return; }
    const list = this._v.view === 'list', lk = lookOwn(this._c, 'library');
    this._libImg = lk.image ? (lk.image === 'poster' ? 'poster' : 'fanart') : cfg(this._c, 'image_style');
    this._libFade = lk.image === 'fade';
    const watch = watchOn(this._c, 'lib') ? '<div class="plc-sec plc-libwatch" data-sec="watching"></div>' : '';
    main.innerHTML = `${watch}<div class="plc-gridwrap${this._jumpOn() ? ' jump' : ''}"><div class="plc-grid${list ? ' list' : this._libImg === 'fanart' ? ' fanart' : ''}"></div><div class="plc-sentinel"></div><div class="plc-jump-slot"></div></div>`;
    this._lists.set('grid', []);
    applyLook(main.querySelector('.plc-gridwrap'), lk);
    if (watch) this._paintWatching();
    this._page(main, 0);
    this._paintJump(main);
  },

  /** The A–Z bar: only for an A → Z list without search or filters (the letter counts are for the whole library). */
  _jumpOn() {
    const v = this._v;
    return !!cfg(this._c, 'jump_bar') && v.tab !== 'home' && v.tab !== 'calendar' && v.sort === 'title' && !v.query && !v.unwatched && !v.genre && !v.decade && !v.rating && !v.short;
  },
  async _paintJump(main, active = null) {
    const slot = main.querySelector('.plc-jump-slot');
    if (!slot || !this._jumpOn()) return;
    const tv = this._tv(), lib = this._libKey(), key = `letters:${tv.id}:${lib}`;
    let res;
    try { res = await cached(this._hass, key, REFRESH_MS * 10, () => ws(this._hass, 'letters', { tv: tv.id, library: lib })); } catch { return; }
    if (!slot.isConnected || (res.letters || []).length < 2) return;
    slot.innerHTML = `<nav class="plc-jump">${res.letters.map((l) => `<button class="plc-jump-l${active === l.start ? ' on' : ''}" data-jump="${l.start}" title="${esc(l.letter)} (${l.size})">${esc(l.letter)}</button>`).join('')}</nav>`;
  },

  async _page(main, start) {
    const grid = main.querySelector('.plc-grid');
    if (!grid) return;
    const key = this._itemsKey(start), tv = this._tv(), v = this._v;
    const req = { tv: tv.id, library: this._libKey(), start, size: PAGE, sort: v.sort, ...(v.unwatched ? { unwatched: true } : {}), ...(v.query ? { query: v.query } : {}),
      ...(v.genre ? { genre: v.genre } : {}), ...(v.decade ? { decade: Number(v.decade) } : {}), ...(v.rating ? { content_rating: v.rating } : {}), ...(v.short ? { max_minutes: 120 } : {}) };
    if (!peek(key) && start === 0) grid.innerHTML = '<div class="plc-msg">Loading…</div>';
    let res;
    try { res = await cached(this._hass, key, REFRESH_MS, () => ws(this._hass, 'items', req)); }
    catch (e) { grid.innerHTML = `<div class="plc-msg err">${esc(e?.message || e)}</div>`; return; }
    if (!grid.isConnected || this._itemsKey(start) !== key) return;
    if (start === 0) grid.innerHTML = '';
    const list = this._lists.get('grid');
    const from = list.length;
    list.push(...res.items);
    const fan = (this._libImg || cfg(this._c, 'image_style')) === 'fanart';
    grid.insertAdjacentHTML('beforeend', res.items.map((it, k) => (grid.classList.contains('list') ? this._lrow(it, 'grid', from + k) : this._tile(it, 'grid', from + k, { fanart: fan, fade: !!this._libFade, look: lookOwn(this._c, 'library') }))).join(''));
    if (!list.length) grid.innerHTML = `<div class="plc-msg">${v.query ? 'Nothing matches.' : 'Nothing here.'}</div>`;
    this._io?.disconnect();
    if (res.more && typeof IntersectionObserver !== 'undefined') {
      this._io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { this._io.disconnect(); this._page(main, start + PAGE); } }, { rootMargin: '600px' });
      this._io.observe(main.querySelector('.plc-sentinel'));
    }
  },

  // ---- detail

  _item(ref) { const [list, i] = String(ref || '').split('|'); return { list, i: Number(i), item: (this._lists.get(list) || [])[Number(i)] }; },

  async _renderDetail() {
    this._armPopup();
    const slot = this._root.querySelector('.plc-detail-slot');
    const body = this._root.querySelector('.plc-body');
    const d = this._v.detail;
    const base = d && (this._lists.get(d.list) || [])[d.i];
    body.classList.toggle('with-detail', !!base);
    if (!base) { slot.innerHTML = ''; return; }
    const tv = this._tv();
    const key = base.key && `item:${tv.id}:${base.key}`;
    const it = { ...base, ...(key ? peek(key) || {} : {}) };
    this._detailItem = it;
    const img = it.art || it.still || it.poster;
    const meta = [it.year, it.content_rating, (it.genres || []).join(', '), it.studio].filter(Boolean).join(' · ');
    const umc = it.umc ? (it.lines || []).slice(1).filter(Boolean).map((l) => `<div class="plc-meta">${esc(l)}</div>`).join('') : '';
    const summary = it.summary || it.umc?.summary;
    const playable = it.key && ['movie', 'episode', 'show'].includes(it.type);
    const resume = it.offset ? `Resume ${fmtTime(it.offset)}` : (it.type === 'show' && it.next ? `Play S${it.next.season} · E${it.next.episode}` : 'Play');
    const ends = it.duration ? `<div class="plc-meta">Ends at ${esc(endsAt(it.duration - (it.offset || 0), cfg(this._c, 'clock')))} if started now</div>` : '';
    const isEp = it.type === 'episode';
    const soon = it.ev ? this._calInfo(it.ev) : it.umc ? (() => {   // upcoming-media sensor items
      const u = it.umc, d = it.airdate ? new Date(it.airdate) : null, rt = Number.parseInt(u.runtime, 10);
      return { eyebrow: [d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Coming soon'],
        title: it.title, sub: u.episode || '', se: String(u.number || '').replace(/^S0*(\d+)E0*(\d+)$/i, 'S$1 · E$2'), runtime: rt ? fmtRun(rt * 60) : '', status: '',
        meta: [u.year, u.studio, u.genres].filter(Boolean).join(' · ') };
    })() : null;
    const eyebrow = isEp ? ['Episode'] : it.type === 'show' ? ['TV show'] : it.type === 'movie' ? ['Movie'] : null;
    const sub = isEp ? (it.show ? it.title : '') : (it.type === 'show' && it.episodes ? `${it.episodes} episodes${it.watched_episodes ? ` · ${it.watched_episodes} watched` : ''}` : '');
    const se = isEp && it.season != null ? `S${it.season} · E${it.episode}` : '';
    const inline = !playable && !this._canPick(it);   // nothing to play (Coming Soon): the buttons sit on the first text row
    const acts = `<button class="plc-chip plc-act" data-trailergo title="${it.trailer_key || it.trailer ? 'Trailer' : 'No trailer known: searches YouTube'}"><ha-icon icon="mdi:movie-open-play"></ha-icon>Trailer</button>
          ${it.key && it.type === 'show' ? `<button class="plc-chip plc-act" data-markall="${it.watched ? 0 : 1}"><ha-icon icon="mdi:${it.watched ? 'eye-off-outline' : 'check-all'}"></ha-icon>${it.watched ? 'Mark all unwatched' : 'Mark all watched'}</button>`
            : it.key && ['movie', 'episode'].includes(it.type) ? `<button class="plc-chip plc-act" data-mark="${it.watched ? 0 : 1}"><ha-icon icon="mdi:${it.watched ? 'eye-off-outline' : 'check'}"></ha-icon>${it.watched ? 'Mark unwatched' : 'Mark watched'}</button>` : ''}`;
    slot.innerHTML = `<div class="plc-detail">${this._infoHtml({ art: img, poster: it.poster, close: 'data-close',
      eyebrow: soon ? soon.eyebrow : eyebrow, title: soon ? soon.title : (it.show || it.title), sub: soon ? soon.sub : sub, se: soon ? soon.se : se,
      rating: this._ratingPills(it), runtime: soon ? soon.runtime : it.duration ? fmtRun(it.duration) : '', badges: it.badges, status: soon?.status,
      body: `${inline ? `<div class="plc-meta plc-target plc-firstrow">${esc(soon ? soon.meta || '' : meta || '')}<span class="plc-sp"></span>${acts}${this._openShowHtml(it, 'plc-chip plc-act')}</div>${soon ? '' : umc}`
        : `${soon ? (soon.meta ? `<div class="plc-meta">${esc(soon.meta)}</div>` : '') : `${meta ? `<div class="plc-meta">${esc(meta)}</div>` : ''}${umc}`}`}
        ${it.progress ? `<div class="plc-bar-track"><div class="plc-bar-fill" style="width:${it.progress}%"></div></div>` : ''}${ends}
        ${summary ? `<div>${esc(summary)}</div>` : ''}
        ${it.cast?.length ? `<div class="plc-cast">${esc(it.cast.join(', '))}</div>` : ''}
        ${inline ? '' : `<div class="plc-meta plc-target">${this._canPick(it) ? `Play on ${this._pickChip()}` : ''}<span class="plc-sp"></span>${acts}</div>`}
        ${inline ? '' : `<div class="plc-btns">${playable ? `<button class="plc-btn main" data-play="${it.type === 'show' ? 'next' : 'play'}"><ha-icon icon="mdi:${this._target() === 'local' ? 'open-in-new' : 'play'}"></ha-icon>${this._target() === 'local' ? 'Open on this device' : `${esc(resume)} on ${esc(tvLabel(this._target()))}`}</button>
          ${it.type !== 'show' && (it.offset || it.watched) ? '<button class="plc-btn" data-play="restart"><ha-icon icon="mdi:restart"></ha-icon>Start over</button>' : ''}` : ''}
          ${this._openShowHtml(it)}</div>`}
        ${it.type === 'show' ? '<div class="plc-eps" data-eps><div class="plc-msg">Loading seasons…</div></div>' : ''}` })}</div>`;
    if (it.type === 'show') this._paintSeasons(it);
    if (key && !peek(key)) {
      try { await cached(this._hass, key, REFRESH_MS, () => ws(this._hass, 'item', { tv: tv.id, key: base.key })); }
      catch { return; }
      if (this._v.detail === d) this._renderDetail();
    }
  },

  /** Open a title on this device: the Plex app on phones / tablets (falls back to Plex Web if it doesn't open), Plex Web on computers. */
  _openLocal(key) {
    const sid = String(this._conf?.server_id || '').replace(/[^A-Za-z0-9]/g, '');
    const k = String(key || '').replace(/[^0-9]/g, '');
    if (!sid || !k) return;
    const meta = encodeURIComponent(`/library/metadata/${k}`);
    const web = `https://app.plex.tv/desktop/#!/server/${sid}/details?key=${meta}`;
    const app = `plex://libraries/${sid}/unmatched/${meta}`;
    const pref = cfg(this._c, 'local_app');
    const ua = navigator.userAgent || '';
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || !!window.externalApp || !!window.webkit?.messageHandlers?.getExternalAuth;
    if (pref === 'web' || (pref === 'auto' && !mobile)) { window.open(web, '_blank', 'noopener'); return; }
    let left = false;
    const away = () => { if (document.visibilityState === 'hidden') left = true; };
    document.addEventListener('visibilitychange', away);
    window.open(app, '_blank');
    setTimeout(() => {
      document.removeEventListener('visibilitychange', away);
      if (!left && pref === 'auto') window.open(web, '_blank', 'noopener');
    }, 2000);
  },

  /** The popup's target: a TV, or 'local' (this device). */
  _target() { return this._pickTv === 'local' ? 'local' : (this._pickTv || this._tv()); },

  /** Where Play goes: a chip that opens the target menu. Only for titles in the library (Coming Soon has nothing to play). */
  _canPick(it = this._detailItem) {
    if (cfg(this._c, 'lock') || !it?.key || it.umc || it.ev || !['movie', 'episode', 'show'].includes(it.type)) return false;
    return cfg(this._c, 'client_choice') === 'ask' || !!cfg(this._c, 'popup_target');
  },
  _pickHtml(it = this._detailItem) {
    return this._canPick(it) ? `<div class="plc-meta plc-target">Play on ${this._pickChip()}</div>` : '';
  },
  _pickChip() {
    const cur = this._target(), icons = this._c.tv_icons || {};
    const icon = cur === 'local' ? 'mdi:cellphone-play' : (icons[cur?.id] || 'mdi:television');
    const name = cur === 'local' ? 'This device' : tvLabel(cur);
    return `<button class="plc-chip plc-menuchip" data-pickmenu><ha-icon icon="${esc(icon)}"></ha-icon><span class="plc-menuchip-n">${esc(name)}</span><ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></button>`;
  },
  _pickMenu(anchor) {
    const cur = this._target(), icons = this._c.tv_icons || {};
    this._menu(anchor, 'Play on', [...this._tvs().map((t) => {
      const busy = realOn(this._hass, t);
      return { icon: icons[t.id] || 'mdi:television', label: tvLabel(t), sub: busy ? 'Playing' : this._tvSub(t), on: t === cur,
        attr: `data-pickto="${esc(t.id)}"`, dot: `<span class="plc-dot ${this._dotCls(t)}"></span>` };
    }), { icon: 'mdi:cellphone-play', label: 'This device', sub: 'Opens the Plex app or Plex Web', on: cur === 'local', attr: 'data-pickto="local"' }]);
  },

  async _paintSeasons(show) {
    const box = this._root.querySelector('[data-eps]');
    if (!box || !show.seasons) return;
    const pick = show.seasons.find((s) => s.key === this._v.season) || show.seasons.find((s) => show.next && s.key === show.next.season_key) || show.seasons[0];
    this._v.season = pick.key;
    const seen = (x) => (x.watched ? ' ✓' : x.watched_episodes ? ` · ${x.watched_episodes}/${x.episodes}` : '');
    this._seasonsOf = show.seasons;
    const chip = `<button class="plc-chip plc-menuchip plc-seasonpick" data-seasonmenu title="Pick a season"><ha-icon icon="mdi:layers-outline"></ha-icon><span class="plc-menuchip-n">${esc(pick.title)}${esc(seen(pick))}</span>${show.seasons.length > 1 ? '<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>' : ''}</button>`;
    const row = this._root.querySelector('.plc-detail .plc-target, .plc-npfull .plc-target');
    this._root.querySelectorAll('.plc-seasonpick').forEach((n) => n.remove());
    if (row && row.closest('.plc-detail-body') === box.closest('.plc-detail-body')) row.insertAdjacentHTML('beforeend', chip);
    box.innerHTML = `${row ? '' : `<div class="plc-seasons">${chip}</div>`}<div data-eplist><div class="plc-msg">Loading episodes…</div></div>`;
    const tv = this._tv(), key = `item:${tv.id}:${pick.key}`;
    let season;
    try { season = await cached(this._hass, key, REFRESH_MS, () => ws(this._hass, 'item', { tv: tv.id, key: pick.key })); }
    catch (e) { box.querySelector('[data-eplist]').innerHTML = `<div class="plc-msg err">${esc(e?.message || e)}</div>`; return; }
    const list = box.querySelector('[data-eplist]');
    if (!list?.isConnected) return;
    const eps = season.episodes || [];
    this._lists.set('eps', eps);
    const nextKey = show.next?.key;
    list.innerHTML = eps.map((e, i) => `<div class="plc-ep${e.key === nextKey ? ' next' : ''}${e.watched ? ' seen' : ''}">
      <button class="plc-ep-img" data-qplay="eps|${i}" data-direct title="${e.offset ? `Resume ${fmtTime(e.offset)}` : 'Play'}"${e.still ? ` style="background-image:url('${cssUrl(e.still)}')"` : ''}>
        <ha-icon icon="mdi:play"></ha-icon>${e.progress ? `<div class="plc-prog"><div style="width:${Math.min(100, Number(e.progress))}%"></div></div>` : ''}${e.watched ? '<span class="plc-watched" title="Watched"><ha-icon icon="mdi:check"></ha-icon></span>' : ''}</button>
      <div class="plc-ep-txt"><div class="plc-t">${e.episode != null ? `${e.episode}. ` : ''}${esc(e.title)}</div>
        <div class="plc-s">${esc([e.duration ? fmtTime(e.duration) : '', e.offset ? `${fmtTime(e.offset)} watched` : '', e.key === nextKey ? 'Up next' : ''].filter(Boolean).join(' · '))}</div>
        ${e.summary ? `<div class="plc-lrow-sum">${esc(e.summary)}</div>` : ''}</div>
      ${e.offset || e.watched ? `<button class="plc-icon-btn" data-qrestart="eps|${i}" title="Start over"><ha-icon icon="mdi:restart"></ha-icon></button>` : '<span class="plc-icon-gap"></span>'}</div>`).join('') || '<div class="plc-msg">No episodes.</div>';
  },

  // ---- play

  async _play(it, mode) {
    const tv = this._target();
    if (!tv || !it?.key) return;
    if (tv === 'local') { this._openLocal(it.type === 'episode' ? it.key : it.key); return; }
    const what = it.type === 'episode' ? `${it.show || ''} S${it.season}E${it.episode}` : (it.show || it.title);
    this._toast(`${mode === 'restart' ? 'Starting over' : 'Playing'} ${what} on ${tvLabel(tv)}…`);
    if (cfg(this._c, 'after_play') === 'nowplaying') this._showPlaying(tv);
    const stop = this._roomWatch(tv);
    try { await this._hass.callService('plex_center', 'play', { tv: tv.id, key: String(it.key), mode }); }
    catch (e) { this._toast(`Could not start: ${e?.message || e}`); }
    finally { stop(); }
  },
  /** While a TV's room (theater) starts, show its progress ("Theater: starting · 3 / 7"). Returns a stop function. */
  _roomWatch(tv) {
    if (!tv?.status_entity || roomReady(this._hass, tv)) return () => {};
    let last = '';
    const tick = () => {
      if (roomReady(this._hass, tv)) return;
      const p = roomProgress(this._hass, tv);
      if (p && p !== last) { last = p; this._toast(`${tvLabel(tv)}: ${p}`); }
    };
    const t = setInterval(tick, 1500);
    return () => clearInterval(t);
  },

  /** Mark a title watched / unwatched for the TV's Plex user, after a confirmation. */
  _markWatched(it, watched, holdKey = 'hold_mark_ms') {
    const tv = this._tv();
    if (!it?.key || !tv) return;
    const what = it.type === 'episode' ? `${it.show || ''} S${it.season}E${it.episode}` : it.type === 'show' ? `every episode of ${it.show || it.title}` : (it.show || it.title);
    // held for the set time = confirmed; with no hold (0), ask
    if (!(Number(cfg(this._c, holdKey)) > 0) && !window.confirm(`Mark “${what}” as ${watched ? 'watched' : 'unwatched'} for ${tvLabel(tv)}?`)) return;
    this._hass.callService('plex_center', 'mark', { tv: tv.id, key: String(it.key), watched }).then(() => {
      for (const k of [...CACHE.keys()]) if (/^(items|hubs|item|phub|search):/.test(k) && k.includes(`:${tv.id}:`) || k === `hubs:${tv.id}`) CACHE.delete(k);
      this._toast(it.type === 'show' ? (watched ? 'Marked every episode as watched' : 'Marked every episode as unwatched') : watched ? 'Marked as watched' : 'Marked as unwatched');
      if (this._v.detail) this._renderDetail();
      this._v.hero = 0;
      if (this._v.tab === 'home') this._renderMain();
    }).catch((err) => this._toast(`Mark: ${err?.message || err}`));
  },

  /** After starting a title: close the popup / details and show Now playing for that TV (full screen on phones). */
  _showPlaying(tv) {
    clearTimeout(this._popTimer);
    if (this._root.querySelector('.plc-sheet')) this._closeSheet(true);
    this._v.detail = null;
    this._root.querySelectorAll('.plc-tile.sel').forEach((n) => n.classList.remove('sel'));
    if (tv && tv !== 'local' && tv.id !== this._tv()?.id) { this._v.tv = tv.id; try { localStorage.setItem(`plc-tv:${this._key}`, tv.id); } catch { /* */ } this._renderTop(); }
    this._pickTv = null;
    if (tv && tv !== 'local') this._v.npOpen = tv.id;
    if (!this._panelVisible()) { this._v.npFull = true; this._npFullAt = Date.now(); }
    this._renderDetail(); this._renderNP(true);
  },

  /** The Cycle chip: turns the section's scrolling / fading on and off. */
  _cycleChip(id, st) {
    const on = st.auto !== 'off';
    return `<span class="plc-chip plc-cycle${on ? ' on' : ''}" role="button" tabindex="0" data-cycle="${esc(id)}" title="${on ? 'Stop cycling' : `Cycle (${st.cycle_mode === 'fade' ? 'fade' : 'scroll'})`}"><ha-icon icon="mdi:${on ? 'pause' : st.cycle_mode === 'fade' ? 'animation-play-outline' : 'arrow-left-right'}"></ha-icon>Cycle</span>`;
  },
  /** View all: every item of a section in a popup grid. */
  _viewAll(id) {
    const items = this._full?.[id] || this._lists.get(id) || [];
    if (!items.length) return;
    this._lists.set(`va:${id}`, items);
    const title = homeSections(this._c).find(([x]) => x === id)?.[1] || 'All';
    this._sheet(`<div class="plc-detail-body plc-vasheet"><div class="plc-fpanel-h"><h2 class="plc-big">${esc(title)} <span class="n">${items.length}</span></h2><span class="plc-sp"></span>
      <button class="plc-btn" data-close-sheet>Close</button></div><div class="plc-grid">${items.map((it, i) => this._tile(it, `va:${id}`, i)).join('')}</div></div>`, null, false, 'fit');
  },

  /** The one info card for a title (details panel and the Calendar's quick look): fanart with the eyebrow, title,
   *  episode line, rating, runtime and badges over it, then the body. o: { art, poster, close, eyebrow: [text, icon, color],
   *  title, sub, rating: [html…], runtime, badges: [], status: html, cls, body } */
  _infoHtml(o) {
    const [eb, ic, col] = o.eyebrow || [];
    const facts = [o.se ? `<span class="plc-info-se">${esc(o.se)}</span>` : '', ...(o.rating || []), o.runtime ? `<span class="plc-fact"><ha-icon icon="mdi:clock-outline"></ha-icon>${esc(o.runtime)}</span>` : '',
      ...(o.badges || []).map((b) => `<span class="plc-av">${esc(b)}</span>`)].filter(Boolean).join('');
    return `<div class="plc-info${o.cls ? ` ${o.cls}` : ''}"><div class="plc-detail-img plc-info-art${o.art ? '' : ' noart'}"${o.art ? ` style="background-image:url('${cssUrl(o.art)}')"` : ''}>
        <button class="plc-icon-btn plc-detail-close" ${o.close} title="Close"><ha-icon icon="mdi:close"></ha-icon></button>${o.overlay || ''}
        <div class="plc-detail-head">${o.poster ? `<div class="plc-detail-poster" style="background-image:url('${cssUrl(o.poster)}')"></div>` : ''}
          <div class="plc-detail-ttl">${eb ? `<div class="plc-eyebrow"${col ? ` style="color:${col}"` : ''}>${ic ? `<ha-icon icon="${esc(ic)}"></ha-icon> ` : ''}${esc(eb)}</div>` : ''}
            <h2 class="plc-big">${esc(o.title || '')}</h2>${o.sub ? `<div class="plc-info-sub">${esc(o.sub)}</div>` : ''}
            ${facts ? `<div class="plc-rates">${facts}</div>` : ''}</div>${o.status ? `<div class="plc-cal-chips plc-info-status">${o.status}</div>` : ''}</div></div>
      <div class="plc-detail-body">${o.body || ''}</div></div>`;
  },
  /** The card's head fields for a Plex title (eyebrow, title, episode line, rating, runtime, badges). */
  _infoHead(it, eyebrowText = null) {
    const isEp = it.type === 'episode';
    const kind = isEp ? 'Episode' : it.type === 'show' ? 'TV show' : 'Movie';
    return { art: it.art || it.still || it.poster, poster: it.poster, eyebrow: [eyebrowText || kind],
      title: isEp ? (it.show || it.title) : (it.show || it.title), sub: isEp && it.show ? it.title : '', se: isEp && it.season != null ? `S${it.season} · E${it.episode}` : '',
      rating: this._ratingPills(it), runtime: it.duration ? fmtRun(it.duration) : '', badges: it.badges };
  },
  /** Rating pills: every source Plex has (TMDB / IMDb / Rotten Tomatoes), else the audience ★. */
  _ratingPills(it) {
    const out = (it.ratings || []).map((r) => (r.source === 'Rotten Tomatoes'
      ? `<span class="plc-rate big" title="Rotten Tomatoes ${r.kind}">${r.kind === 'audience' ? '🍿' : r.fresh ? '🍅' : '🤢'} ${Math.round(r.value * 10)}%</span>`
      : `<span class="plc-rate big" title="${esc(r.source)} ${r.kind}"><b>${esc(r.source)}</b> ${Number(r.value).toFixed(1)}</span>`));
    if (!out.length && it.rating) out.push(`<span class="plc-rate big" title="Rating"><b>★</b> ${Number(it.rating).toFixed(1)}</span>`);
    return out;
  },

  /** "Open show" for an episode (or season): jumps to the show's details. */
  _openShowHtml(it, cls = 'plc-btn') {
    if (!it || (it.type !== 'episode' && it.type !== 'season')) return '';
    const name = it.show || (it.umc || it.lines ? it.title : '');
    if (!it.show_key && !name) return '';
    return `<button class="${cls} plc-openshow" data-openshow="${esc(it.show_key || '')}" data-showtitle="${esc(name || '')}"><ha-icon icon="mdi:television-classic"></ha-icon>Open show</button>`;
  },
  async _openShow(key, title) {
    if (!key) {   // not linked to Plex yet (Coming Soon): find the show by its name
      const low = (x) => String(x || '').trim().toLowerCase();
      try {
        const res = await ws(this._hass, 'search', { tv: this._tv()?.id, query: title, limit: 10 });
        const shows = (res || []).flatMap((g) => g.items || []).filter((x) => x.type === 'show');
        key = (shows.find((x) => low(x.title) === low(title)) || shows[0])?.key;
      } catch { key = null; }
      if (!key) { this._toast(`${title || 'This show'} isn't in Plex yet`); return; }
    }
    if (this._root.querySelector('.plc-sheet')) this._closeSheet(true);
    if (this._v.npFull) { this._v.npFull = false; this._renderNP(true); }
    this._lists.set('openshow', [{ key: String(key), type: 'show', title: title || '' }]);
    this._openDetail({ list: 'openshow', i: 0 });
  },

  /** A ▶ tap: in-progress titles ask Resume / Start over; "ask each time" asks for the TV; a show plays its next episode. */
  _quickPlay(r, direct) {
    const it = r.item;
    if (!it) return;
    if (cfg(this._c, 'client_choice') === 'ask' && this._tvs().length > 1 && !direct && !cfg(this._c, 'lock')) { this._openDetail(r); return; }
    if (it.offset && !direct) {
      this._pickTv = null;
      this._sheet(this._infoHtml({ ...this._infoHead(it), cls: 'plc-cq', close: 'data-close-sheet',
        body: `${it.progress ? `<div class="plc-bar-track"><div class="plc-bar-fill" style="width:${it.progress}%"></div></div>` : ''}
        <div class="plc-meta">${esc(`${fmtTime(it.offset)} watched${it.duration ? ` · ${fmtTime(Math.max(0, it.duration - it.offset))} left` : ''}`)}</div>
        ${this._pickHtml(it) || `<div class="plc-meta plc-target">Play on <b>${esc(tvLabel(this._tv()))}</b></div>`}
        <div class="plc-btns"><button class="plc-btn main" data-sheetplay="play"><ha-icon icon="mdi:play"></ha-icon>Resume ${fmtTime(it.offset)}</button>
        <button class="plc-btn" data-sheetplay="restart"><ha-icon icon="mdi:restart"></ha-icon>Start over</button>
        ${this._openShowHtml(it)}<button class="plc-btn" data-close-sheet>Cancel</button></div>` }), it);
      return;
    }
    this._play(it, it.type === 'show' ? 'next' : 'play');
  },

  _openDetail(r) {
    this._v.detail = { list: r.list, i: r.i }; this._v.season = null; this._pickTv = null;
    this._detailItem = null;
    this._root.querySelectorAll('.plc-tile.sel').forEach((n) => n.classList.remove('sel'));
    this._renderDetail();
  },

  _sheet(html, item = null, autoClose = true, cls = '') {
    this._sheetItem = item;
    this._root.querySelector('.plc-sheet-slot').innerHTML = `<div class="plc-sheet${cls ? ` ${cls}` : ''}" data-close-sheet><div class="plc-sheet-in">${html}</div></div>`;
    this._sheetAuto = autoClose;
    this._armPopup();
  },
  _closeSheet(keepTarget = false) {
    clearInterval(this._count); clearTimeout(this._popTimer);
    this._root.querySelector('.plc-sheet-slot').innerHTML = ''; this._sheetItem = null;
    if (!keepTarget) this._pickTv = null;
    this._armPopup();
  },

  /** Popups close by themselves after popup_timeout seconds without a press (0 = never). Pressing anything in one restarts the time. */
  _armPopup() {
    clearTimeout(this._popTimer);
    const secs = Number(cfg(this._c, 'popup_timeout')) || 0;
    if (!secs || !this._root) return;
    const sheet = this._root.querySelector('.plc-sheet');
    const detailPopup = this._phone && this._v.detail;
    if (!(sheet && this._sheetAuto) && !detailPopup) return;
    this._popTimer = setTimeout(() => {
      if (this._root.querySelector('.plc-sheet') && this._sheetAuto) { this._closeSheet(); return; }
      if (this._phone && this._v.detail) { this._v.detail = null; this._pickTv = null; this._renderDetail(); }
    }, secs * 1000);
  },

  /** A trailer on the popup's target. TV: Plex's own trailer in Plex, else the YouTube trailer (or a YouTube search) in
   * the TV's YouTube app. This device: the YouTube trailer in the card, else YouTube / Plex Web in a new tab. */
  _playTrailer(it) {
    if (!it) return;
    const tgt = this._target();
    const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${it.show || it.title} ${it.year || ''} trailer`.replace(/\s+/g, ' ').trim())}`;
    if (tgt === 'local') {
      if (it.trailer) { this._trailer(it.trailer); return; }
      if (it.trailer_key && it.key) { this._openLocal(it.key); return; }
      window.open(search, '_blank', 'noopener');
      return;
    }
    if (!tgt) return;
    this._toast(`Playing the trailer on ${tvLabel(tgt)}…`);
    const data = it.trailer_key ? { key: String(it.key) } : { url: it.trailer || search };
    this._hass.callService('plex_center', 'play_trailer', { tv: tgt.id, ...data }).catch((err) => this._toast(`Trailer: ${err?.message || err}`));
  },

  _trailer(url) {
    const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/.exec(String(url || ''));
    if (!m) { window.open(url, '_blank', 'noopener'); return; }
    this._sheet(`<iframe class="plc-frame" src="https://www.youtube.com/embed/${m[1]}?autoplay=1" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>
      <div class="plc-btns" style="padding:0 14px"><a class="plc-btn" href="https://www.youtube.com/watch?v=${m[1]}" target="_blank" rel="noopener">Open in YouTube</a>
      <button class="plc-btn" data-close-sheet>Close</button></div>`, null, false);
  },

  async _surprise() {
    const lib = this._libKey() || this._libraries()[0]?.key;
    if (!lib) return;
    let it;
    try { it = await ws(this._hass, 'random', { tv: this._tv().id, library: lib }); } catch (e) { this._toast(e?.message || e); return; }
    if (!it) { this._toast('Nothing to pick from.'); return; }
    const TOTAL = 5000, C = 2 * Math.PI * 26;
    const countdown = cfg(this._c, 'surprise_countdown') !== false;
    let left = TOTAL;
    const ring = !countdown ? '' : `<button class="plc-ring" data-surprisecancel title="Cancel the countdown"><svg viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="26"></circle>
      <circle class="fg" cx="30" cy="30" r="26" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0"></circle></svg><span class="plc-ring-t"><span class="plc-ring-n">${TOTAL / 1000}</span><span class="plc-ring-c">Cancel</span></span></button>`;
    const paint = () => this._sheet(this._infoHtml({ ...this._infoHead(it, `Surprise · ${it.type === 'show' ? 'TV show' : it.type === 'episode' ? 'Episode' : 'Movie'}`), cls: 'plc-cq', close: 'data-close-sheet', overlay: ring,
      body: `<div class="plc-meta">${esc([it.year, it.content_rating, (it.genres || []).join(', ')].filter(Boolean).join(' · '))}</div>
      ${it.summary ? `<div>${esc(it.summary)}</div>` : ''}
      <div class="plc-btns"><button class="plc-btn main" data-sheetplay="play"><ha-icon icon="mdi:play"></ha-icon>Play now</button>
      <button class="plc-btn" data-surprise><ha-icon icon="mdi:auto-fix"></ha-icon>Find New Surprise</button></div>` }), it, false);
    paint();
    clearInterval(this._count);
    if (!countdown) return;
    const TICK = 100;
    this._count = setInterval(() => {
      const r = this._root.querySelector('.plc-ring');
      if (!r) { clearInterval(this._count); return; }
      left -= TICK;
      if (left <= 0) { clearInterval(this._count); this._closeSheet(); this._play(it, it.type === 'show' ? 'next' : 'play'); return; }
      r.querySelector('.fg').setAttribute('stroke-dashoffset', (C * (1 - left / TOTAL)).toFixed(2));
      r.querySelector('.plc-ring-n').textContent = Math.ceil(left / 1000);
    }, TICK);
  },

  // ---- now playing: side panel and full screen

  _renderNP(force = false) {
    const tv = this._tv();
    const np = nowPlaying(this._hass, tv);
    const mode = this._npMode();
    const panel = mode === 'panel' && this._panelVisible(np);
    const dup = this._v.tab === 'home' && watchOn(this._c, 'home') && !!this._sessionFor(tv);
    if (np?.live) this._npLiveAt = Date.now();
    else if (this._v.npFull && !this._resumeFor(tv) && Date.now() - (this._npFullAt || 0) > 90000) this._v.npFull = false;   // playback ended: don't pop up next time
    const vst = tv?.pipup && this._hass.states[tv.pipup];
    const s = JSON.stringify([this._v.tab, dup, this._v.npFull, mode, panel, JSON.stringify(this._resumeFor(tv)), tv && this._resumeFor(tv) && this._resumeArt(tv, this._resumeFor(tv)), np && [np.live, np.title, np.sub, np.art, np.st.state], vst?.attributes?.volume_level, vst?.attributes?.is_volume_muted, this._phone,
      this._tvs().map((t) => [t.id, realOn(this._hass, t)]), tv?.route]);
    if (!force && this._npSig === s) return;
    this._npSig = s;
    this._root.classList.toggle('side', !!panel);
    this._root.classList.toggle('fit', !!panel && !!cfg(this._c, 'fit_screen'));
    const side = this._root.querySelector('.plc-side');
    side.hidden = !panel;
    const wasPanel = this._root.dataset.panel === '1';
    side.innerHTML = panel ? `<div class="plc-phead"></div>${this._panelHtml(np)}` : '';
    this._root.dataset.panel = panel ? '1' : '0';
    if (panel || wasPanel) this._renderTop();
    const full = this._root.querySelector('.plc-npfull-slot');
    if (full) full.innerHTML = this._v.npFull && (np?.live || this._resumeFor(tv)) ? `<div class="plc-npfull">${this._panelHtml(np)}</div>` : '';
    this._progress();
  },

  _controls(np, big = true) {
    if (!np?.live) return '';
    const playing = np.st.state === 'playing';
    return `<div class="plc-np-ctl"><button class="plc-icon-btn" data-np="skip:-30" title="Back 30 s"><ha-icon icon="mdi:rewind-30"></ha-icon></button>
      <button class="plc-icon-btn" data-np="skip:-10" title="Back 10 s"><ha-icon icon="mdi:rewind-10"></ha-icon></button>
      <button class="plc-icon-btn${big ? ' big' : ''}" data-np="${playing ? 'pause' : 'play'}"><ha-icon icon="mdi:${playing ? 'pause' : 'play'}"></ha-icon></button>
      <button class="plc-icon-btn" data-np="skip:10" title="Forward 10 s"><ha-icon icon="mdi:fast-forward-10"></ha-icon></button>
      <button class="plc-icon-btn" data-np="skip:30" title="Forward 30 s"><ha-icon icon="mdi:fast-forward-30"></ha-icon></button>
      <button class="plc-icon-btn" data-np="stop" title="Stop"><ha-icon icon="mdi:stop"></ha-icon></button>
      <button class="plc-icon-btn" data-np="home" title="Home"><ha-icon icon="mdi:home"></ha-icon></button>
      ${this._volumeHtml(np)}</div>`;
  },

  _volumeHtml(np) {
    const st = np?.tv?.pipup && this._hass.states[np.tv.pipup];
    const muted = st?.attributes?.is_volume_muted, lvl = st?.attributes?.volume_level;
    return `<span class="plc-vol"><button class="plc-icon-btn" data-np="volume_down" title="Volume down"><ha-icon icon="mdi:volume-minus"></ha-icon></button>
      <button class="plc-icon-btn" data-np="mute" title="${muted ? 'Unmute' : 'Mute'}"><ha-icon icon="mdi:${muted ? 'volume-off' : 'volume-high'}"></ha-icon></button>
      <button class="plc-icon-btn" data-np="volume_up" title="Volume up"><ha-icon icon="mdi:volume-plus"></ha-icon></button>
      ${lvl != null ? `<span class="plc-vol-n">${Math.round(Number(lvl) * 100)}</span>` : ''}</span>`;
  },

  _powerHtml(np) {
    const on = np && (np.on ?? !['off', 'unavailable', 'standby'].includes(np.st?.state));
    if (on && np.tv && np.tv.power_off === false) return '';   // no ADB / Android TV Remote: Plex Center never turns it off
    return `<button class="plc-icon-btn plc-power${on ? ' on' : ''}" data-np="${on ? 'power_off' : 'power_on'}" title="Turn the TV ${on ? 'off' : 'on'}"><ha-icon icon="mdi:power"></ha-icon></button>`;
  },

  /** Up next for the episode playing on the card's TV: { cur, next, left } once the details are known; fetches them once. */
  _upNext(np = nowPlaying(this._hass, this._tv())) {
    if (!cfg(this._c, 'up_next') || !np?.live) return null;
    const tv = np.tv, s1 = this._sessionFor(tv), sess = s1?.type === 'episode' ? s1 : null;
    if (!sess?.key) return null;
    const key = `item:${tv.id}:${sess.key}`, d = peek(key);
    if (!d) {
      if (!this._upLoading?.has(key)) {
        (this._upLoading ||= new Set()).add(key);
        cached(this._hass, key, REFRESH_MS, () => ws(this._hass, 'item', { tv: tv.id, key: sess.key })).then(() => this._renderNP(true)).catch(() => {}).finally(() => this._upLoading.delete(key));
      }
      return null;
    }
    if (!d.next?.key) return null;
    const dur = Number(np.st.attributes.media_duration) || d.duration || 0, pos = livePosition(np.st) ?? 0;
    return { cur: sess.key, next: d.next, left: dur ? Math.max(0, dur - pos) : null };
  },
  _upNextHtml(np, compact = false) {
    const u = this._upNext(np);
    if (!u || u.left == null || u.left > (Number(cfg(this._c, 'up_next_secs')) || 120)) return '';
    const n = u.next, stop = this._stopAfter === u.cur;
    return `<div class="plc-upnext${compact ? ' compact' : ''}">${!compact && n.still ? `<div class="plc-upnext-img" style="background-image:url('${cssUrl(n.still)}')"></div>` : ''}
      <div class="plc-upnext-txt"><div class="plc-eyebrow">Up next <span data-upnext-t>${stop ? '· stopping after this' : `in ${fmtTime(u.left)}`}</span></div>
        <div class="plc-t">S${n.season} · E${n.episode} · ${esc(n.title)}</div></div>
      <div class="plc-upnext-btns"><button class="plc-btn main" data-upnext-play><ha-icon icon="mdi:skip-next"></ha-icon>Play next</button>
        <button class="plc-btn${stop ? ' on' : ''}" data-upnext-stop><ha-icon icon="mdi:stop-circle-outline"></ha-icon>${stop ? 'Keep playing' : 'Stop after this'}</button></div></div>`;
  },
  /** Every second: the countdown, Stop after this, and the optional auto-play. */
  _upTick(np) {
    const u = this._upNext(np), limit = Number(cfg(this._c, 'up_next_secs')) || 120;
    const shown = !!(u && u.left != null && u.left <= limit);
    if (shown !== !!this._upShown) { this._upShown = shown; this._renderNP(true); return; }
    if (!u || u.left == null) return;
    this._root.querySelectorAll('[data-upnext-t]').forEach((x) => { x.textContent = this._stopAfter === u.cur ? '· stopping after this' : `in ${fmtTime(u.left)}`; });
    if (u.left > 4 || this._upFired === u.cur) return;
    if (this._stopAfter === u.cur) {
      this._upFired = u.cur; this._stopAfter = null;
      this._hass.callService('plex_center', 'control', { tv: np.tv.id, action: 'stop' }).catch(() => {});
    } else if (cfg(this._c, 'up_next_autoplay') && u.left <= 2) {
      this._upFired = u.cur;
      setTimeout(() => this._hass.callService('plex_center', 'play', { tv: np.tv.id, key: String(u.next.key), mode: 'play' }).catch(() => {}), 3000);
    }
  },

  _bar(np) {
    if (!np?.live) return '';
    return `<div class="plc-bar${seekable(np.tv) ? ' seek' : ''}" data-bar><div class="plc-bar-track"><div class="plc-bar-fill"></div></div></div>
      <div class="plc-times"><span data-pos></span><span data-ends></span><span data-dur></span></div>`;
  },

  _panelHtml(np) {
    const rec = (!np.live || this._stuck(np.tv)) && this._resumeFor(np.tv);
    if (rec) return this._resumePanelHtml(np, rec);
    const others = this._tvs();
    const sessions = peek('sessions') || [];
    const who = (t) => {
      const s = this._sessionFor(t);
      if (s) return `${s.user} · ${s.show || s.title}`;
      return realOn(this._hass, t) ? 'playing' : this._tvSub(t).toLowerCase();
    };
    const move = others.length > 1 && !cfg(this._c, 'lock') && np.live && this._sessionFor(np.tv);
    // the icon (and app) sit under the picture: when the TV has no picture or it doesn't load (a 404 from another app), they show
    const app = np.st?.attributes?.app_name || '';
    return `<div class="plc-side-card"><div class="plc-side-art"><div class="plc-side-ph"><ha-icon icon="mdi:${np.live ? 'television-play' : 'television'}"></ha-icon>${app ? `<span>${esc(app)}</span>` : ''}</div>
        ${np.art ? `<div class="plc-side-img" style="background-image:url('${cssUrl(np.art)}')"></div>` : ''}
        <button class="plc-icon-btn plc-np-x" data-npx title="Close"><ha-icon icon="mdi:close"></ha-icon></button>
        ${move ? '<button class="plc-chip plc-np-move" data-movemenu title="Move to a different TV"><ha-icon icon="mdi:television-shimmer"></ha-icon>Move to a different TV</button>' : ''}
        ${cfg(this._c, 'np_power') ? `<span class="plc-np-power">${this._powerHtml(np)}</span>` : ''}</div>
      <div class="plc-side-info"><div class="plc-eyebrow">${np.live ? (np.st.state === 'playing' ? 'Now playing' : 'Paused') : 'Standing by'} · ${esc(tvLabel(np.tv))}</div>
        <h2 class="plc-big">${esc(np.title)}</h2>${np.sub ? `<div class="plc-info-sub">${esc(np.sub)}</div>` : ''}${(() => {
          const sx = np.live && this._sessionFor(np.tv), dur = Number(np.st?.attributes?.media_duration) || sx?.duration || 0;
          const pills = [...(sx ? this._ratingPills(sx) : []), dur ? `<span class="plc-fact"><ha-icon icon="mdi:clock-outline"></ha-icon>${esc(fmtRun(dur))}</span>` : ''].filter(Boolean).join('');
          return `${pills ? `<div class="plc-rates plc-np-facts">${pills}</div>` : ''}${sx ? this._openShowHtml(sx, 'plc-chip') : ''}`; })()}${this._bar(np)}${np.live ? this._controls(np) : `<div class="plc-np-ctl">${this._volumeHtml(np)}</div>`}${this._upNextHtml(np)}</div></div>`;
  },

  /** Now playing for a TV that's off (or just woken) with something to resume. */
  _resumePanelHtml(np, r) {
    const art = this._resumeArt(np.tv, r), off = np.on !== true;
    const sub = r.kind === 'plex' ? (r.type === 'episode' && r.season != null ? `S${r.season} · E${r.episode}${r.show && r.title ? ` · ${r.title}` : ''}` : '') : (r.app || '');
    return `<div class="plc-side-card"><div class="plc-side-art"><div class="plc-side-ph"><ha-icon icon="mdi:television-off"></ha-icon>${r.app ? `<span>${esc(r.app)}</span>` : ''}</div>
        ${art ? `<div class="plc-side-img" style="background-image:url('${cssUrl(art)}')"></div>` : ''}
        <button class="plc-icon-btn plc-np-x" data-npx title="Close"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="plc-side-info"><div class="plc-eyebrow">${off ? 'TV is off' : 'Ready to resume'} · ${esc(tvLabel(np.tv))}</div>
        <h2 class="plc-big">${esc(r.show || r.title || r.app || 'Paused')}</h2>${sub ? `<div class="plc-meta">${esc(sub)}</div>` : ''}
        <div class="plc-meta">${esc(this._pausedAt(r))}</div>${(() => { const d = r.kind === 'plex' && peek(`item:${np.tv.id}:${r.key}`); return d ? this._openShowHtml(d, 'plc-chip') : ''; })()}
        ${r.kind === 'app' ? `<p class="plc-meta">Opens ${esc(r.app || 'the app')} and presses Play; if the TV closed it, pick the title in its Continue watching row.</p>` : ''}
        <div class="plc-btns"><button class="plc-btn main" data-resume="${esc(np.tv.id)}"><ha-icon icon="mdi:power"></ha-icon>${off ? 'Turn on and resume' : 'Resume'}</button>
          <button class="plc-btn" data-resumex="${esc(np.tv.id)}"><ha-icon icon="mdi:close"></ha-icon>Forget it</button></div></div></div>`;
  },

  _progress() {
    const r = this._root;
    if (!r) return;
    const np = nowPlaying(this._hass, this._tv());
    if (!np?.live) return;
    this._upTick(np);
    const d = Number(np.st.attributes.media_duration) || 0;
    const p = this._seekTo ?? livePosition(np.st) ?? 0;
    r.querySelectorAll('[data-bar] .plc-bar-fill').forEach((f) => { f.style.width = d ? `${Math.min(100, (p / d) * 100)}%` : '0'; });
    r.querySelectorAll('[data-pos]').forEach((x) => { x.textContent = fmtTime(p); });
    r.querySelectorAll('[data-dur]').forEach((x) => { x.textContent = d ? fmtTime(d) : ''; });
    r.querySelectorAll('[data-ends]').forEach((x) => { x.textContent = d ? `Ends ${endsAt(d - p, cfg(this._c, 'clock'))}` : ''; });
  },

  _onScrub(e) {
    const bar = e.target.closest?.('[data-bar].seek');
    if (!bar) return;
    const np = nowPlaying(this._hass, this._tv());
    const d = Number(np?.st?.attributes?.media_duration) || 0;
    if (!d) return;
    const at = (ev) => { const b = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (ev.clientX - b.left) / b.width)) * d; };
    this._seekTo = at(e); this._progress();
    const move = (ev) => { this._seekTo = at(ev); this._progress(); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const to = this._seekTo; this._seekTo = null;
      this._control('seek', to);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    e.preventDefault();
  },

  _control(action, value) {
    const tv = this._tv();
    if (!tv) return;
    const stop = action === 'power_on' ? this._roomWatch(tv) : () => {};
    this._hass.callService('plex_center', 'control', { tv: tv.id, action, ...(value != null ? { value: Number(value) } : {}) })
      .catch((err) => this._toast(`${action === 'power_on' ? 'Turn on' : action}: ${err?.message || err}`)).finally(stop);
  },

  /** Ask the integration what other apps play (title + poster), once per app and title; repaint when it answers. */
  _appMetaFetch() {
    for (const tv of this._tvs()) {
      const k = appMetaKey(this._hass, tv), hit = k && CACHE.get(k);
      if (!k || hit?.pending || (hit && (hit.data || Date.now() - hit.ts < 60000))) continue;   // nothing found: ask again after a minute
      cached(this._hass, k, 6 * 3600000, () => ws(this._hass, 'app_media', { tv: tv.id }).catch(() => null), { force: !!hit })
        .then((d) => { if (d) { this._renderNP(true); this._appSig = null; this._updateStates(); } }).catch(() => {});
    }
  },
  _updateStates() {
    if (!this._root) return;
    const psig = JSON.stringify(this._tvs().map((t) => [t.id, tvPower(this._hass, t), realOn(this._hass, t)]));
    if (this._psig !== undefined && psig !== this._psig) { clearTimeout(this._rsT); this._rsT = setTimeout(() => this._fetchResumes(true), 2500); }
    this._psig = psig;
    for (const tv of this._tvs()) {
      const el = this._root.querySelector(`[data-dot="${tv.id}"]`);
      if (el) el.className = `plc-dot ${this._dotCls(tv)}`;
    }
    this._appMetaFetch();
    this._renderNP();
    const asig = JSON.stringify(this._appSessions().map((x) => [x._tv, x.title, x.player, x.player_state, x.poster]));
    if (asig !== this._appSig) { this._appSig = asig; this._paintWatching(); }
    if (this._v.tab === 'home') {
      this._paintUpcoming();
      homeOrder(this._c).filter((id) => secStyle(this._c, id).s.source).forEach((id) => this._paintRecent(id));
    }
  },

  // ---- events

  _onClick(e) {
    const t = (sel) => e.target.closest?.(sel);
    let el;
    if (t('.plc-vasheet .plc-tile') && !t('[data-qplay]')) this._closeSheet(true);
    if ((el = t('[data-openshow]'))) { e.stopPropagation(); this._closeMenu?.(); this._openShow(el.dataset.openshow, el.dataset.showtitle); return; }
    const menu = this._root.querySelector('.plc-menu');
    if (menu) {
      const inMenu = !!t('.plc-menu'), sameBtn = this._menuAnchor && this._menuAnchor.contains(e.target);
      if (!inMenu) { this._closeMenu(); if (sameBtn) return; }
      else if (t('.plc-menu-i')) setTimeout(() => this._closeMenu());
    }
    if (t('[data-reload]')) { try { location.reload(); } catch { /* */ } return; }
    if (this._v.tab === 'calendar' || t('.plc-cq')) { if (this._calClick(t)) return; }
    if ((el = t('[data-tabmenu]'))) { this._tabMenu(el); return; }
    if ((el = t('[data-fmenu]'))) { this._fMenu(el, el.dataset.fmenu); return; }
    if ((el = t('[data-fset]'))) {
      const [k, ...rest] = el.dataset.fset.split(':'), val = rest.join(':');
      if (k === 'watched') this._v.unwatched = val === '1'; else if (k === 'length') this._v.short = !!val; else if (k === 'sort') this._v.sort = val || 'title'; else this._v[k] = val;
      this._v.detail = null; this._closeMenu();
      this._renderTop(); this._renderMain(); this._renderDetail();
      if (this._root.querySelector('.plc-fpanel')) this._filtersPopover();
      return;
    }
    if ((el = t('[data-pickmenu]'))) { this._pickMenu(el); return; }
    if ((el = t('[data-pickto]'))) {
      const id = el.dataset.pickto;
      this._pickTv = id === 'local' ? 'local' : this._tvs().find((x) => x.id === id);
      this._closeMenu();
      if (this._root.querySelector('.plc-sheet')) {
        this._root.querySelectorAll('.plc-sheet [data-pickmenu]').forEach((n) => { n.outerHTML = this._pickChip(); });
        const cp = this._root.querySelector('.plc-cq [data-calplay]'), tg = this._target();
        if (cp && this._calHit) cp.innerHTML = `<ha-icon icon="mdi:${tg === 'local' ? 'open-in-new' : 'play'}"></ha-icon>${tg === 'local' ? 'Open on this device' : `${this._calHit.type === 'show' ? 'Play next episode' : 'Play'} on ${esc(tvLabel(tg))}`}`;
        this._armPopup();
      } else this._renderDetail();
      return;
    }
    if ((el = t('[data-movemenu]'))) { this._moveMenu(el); return; }
    if ((el = t('[data-moveto]'))) { const tv = this._tvs().find((x) => x.id === el.dataset.moveto); this._closeMenu(); if (tv) this._moveTo(tv); return; }
    if ((el = t('[data-resume]'))) { this._resume(el.dataset.resume); return; }
    if ((el = t('[data-resumex]'))) {
      ws(this._hass, 'resume_forget', { tv: el.dataset.resumex }).then(() => this._fetchResumes(true)).catch(() => {});
      return;
    }
    if ((el = t('[data-sesstv]'))) {
      if (el.closest('.plc-watchpop')) this._closeSheet(true);
      const tv = this._tvs().find((x) => x.id === el.dataset.sesstv);
      if (!tv) return;
      if (tv.id !== this._tv()?.id) this._setTv(tv);
      this._v.npHidden = null; this._v.npOpen = tv.id;
      if (!this._panelVisible()) { this._v.npFull = true; this._npFullAt = Date.now(); }
      this._renderNP(true); return;
    }
    if ((el = t('[data-seasonmenu]'))) {
      const list = this._seasonsOf || [];
      if (list.length > 1) this._menu(el, 'Season', list.map((x) => ({ icon: x.watched ? 'mdi:check-circle-outline' : 'mdi:layers-outline', label: x.title,
        sub: x.episodes ? `${x.watched_episodes || 0} of ${x.episodes} watched` : '', on: x.key === this._v.season, attr: `data-seasonpick="${esc(x.key)}"` })));
      return;
    }
    if ((el = t('[data-seasonpick]'))) {
      this._closeMenu(); this._v.season = el.dataset.seasonpick;
      if (this._detailItem) this._paintSeasons(this._detailItem);
      return;
    }
    if ((el = t('[data-cycle]'))) {
      e.stopPropagation();
      const id = el.dataset.cycle, on = secStyle(this._c, id).auto !== 'off';
      this._v.cycle = { ...(this._v.cycle || {}), [id]: !on }; this._c._cycle = this._v.cycle;
      this._saveView?.(); this._renderMain(); return;
    }
    if ((el = t('[data-viewsec]'))) { e.stopPropagation(); this._viewAll(el.dataset.viewsec); return; }
    if ((el = t('[data-seckind]'))) {
      e.stopPropagation();
      const [id, k] = el.dataset.seckind.split('|');
      const cur = this._kinds(id);
      this._v.secKind = { ...(this._v.secKind || {}), [id]: { ...cur, [k]: !cur[k] } };
      if (secType(this._c, id) === 'recent') this._paintRecent(id);
      else if (secType(this._c, id) === 'upcoming') this._paintUpcoming();
      else if (secType(this._c, id) === 'plexhub') this._paintPlexHubs();
      return;
    }
    if ((el = t('[data-secbar]'))) {
      const id = el.dataset.secbar, st = secStyle(this._c, id);
      this._v.secOpen = { ...(this._v.secOpen || {}), [id]: !(this._v.secOpen?.[id] ?? !st.collapsed) };
      el.closest('.plc-sec')?.classList.toggle('closed', !this._v.secOpen[id]);
      return;
    }
    if ((el = t('[data-trailerli]'))) { e.stopPropagation(); this._playTrailer(this._item(el.dataset.trailerli).item); return; }
    if ((el = t('[data-qplay]'))) { e.stopPropagation(); this._quickPlay(this._item(el.dataset.qplay), el.hasAttribute('data-direct')); return; }
    if ((el = t('[data-qrestart]'))) { e.stopPropagation(); const { item } = this._item(el.dataset.qrestart); if (item) this._play(item, 'restart'); return; }
    if ((el = t('[data-sheetplay]'))) { const it = this._sheetItem; this._closeSheet(true); if (it) this._play(it, el.dataset.sheetplay === 'restart' ? 'restart' : (it.type === 'show' ? 'next' : 'play')); return; }
    if ((el = t('[data-surprisecancel]'))) { clearInterval(this._count); el.remove(); return; }
    if (t('[data-surprise]')) { this._surprise(); return; }
    if ((el = t('[data-close-sheet]')) && (e.target === el || el.tagName === 'BUTTON')) { this._closeSheet(); return; }
    if ((el = t('[data-tv]'))) { const tv = this._tvs().find((x) => x.id === el.dataset.tv); if (tv) this._setTv(tv); return; }
    if ((el = t('[data-tab]'))) {
      if (this._v.tab === el.dataset.tab) return;
      Object.assign(this._v, { tab: el.dataset.tab, detail: null, genre: '', decade: '', rating: '', short: false });
      this._renderTop(); this._renderMain(); this._renderDetail(); this._refresh(); return;
    }
    if ((el = t('[data-viewall]'))) {
      const lib = this._libraries()[0];
      if (lib) { Object.assign(this._v, { tab: lib.key, sort: 'added', detail: null }); this._renderTop(); this._renderMain(); this._renderDetail(); }
      return;
    }
    if (t('[data-fpop]')) { this._filtersPopover(); return; }
    if ((el = t('[data-seasonchip]'))) { this._v.season = el.dataset.seasonchip; if (this._detailItem) this._paintSeasons(this._detailItem); return; }
    if (t('[data-upnext-play]')) { const u = this._upNext(); if (u) { this._upFired = u.cur; this._play({ ...u.next }, 'play'); } return; }
    if (t('[data-upnext-stop]')) {
      const u = this._upNext();
      if (u) { this._stopAfter = this._stopAfter === u.cur ? null : u.cur; this._renderNP(true); this._toast(this._stopAfter ? 'Will stop after this episode' : 'Stop after this: off'); }
      return;
    }
    if (t('[data-recentclear]')) { try { localStorage.removeItem(RECENT_KEY); } catch { /* */ } this._root.querySelector('.plc-recent')?.remove(); return; }
    if ((el = t('[data-recent]'))) {
      const q = el.dataset.recent, input = this._root.querySelector('.plc-top [data-search]');
      this._root.querySelector('.plc-recent')?.remove();
      if (input) { input.value = q; input.dispatchEvent(new Event('input', { bubbles: true })); }
      addRecent(q); return;
    }
    if ((el = t('[data-view]'))) {
      this._v.view = el.dataset.view === 'list' ? 'list' : 'grid'; this._v.detail = null;
      this._renderTop(); this._renderMain(); this._renderDetail();
      if (this._root.querySelector('.plc-fpanel')) this._filtersPopover();
      return;
    }
    if ((el = t('[data-jump]'))) {
      const main = this._root.querySelector('.plc-main'), grid = main.querySelector('.plc-grid'), start = Number(el.dataset.jump) || 0;
      if (!grid) return;
      this._v.detail = null; this._renderDetail();
      this._lists.set('grid', []); grid.innerHTML = '';
      main.querySelectorAll('.plc-jump-l').forEach((b) => b.classList.toggle('on', b === el));
      this._page(main, start);
      main.querySelector('.plc-gridwrap')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (t('[data-searchopen]')) { this._v.searchOpen = true; this._renderTop(); this._root.querySelector('.plc-top [data-search]')?.focus(); return; }
    if (t('[data-searchclose]')) {
      const had = !!this._v.query;
      Object.assign(this._v, { searchOpen: false, query: '' });
      this._renderTop();
      if (had) { if (this._v.tab === 'home') this._homeSearch(); else this._renderMain(); }
      return;
    }
    if ((el = t('[data-tvsheet]'))) { this._tvSheet(el); return; }
    if ((el = t('[data-tvpick]'))) { const tv = this._tvs().find((x) => x.id === el.dataset.tvpick); this._closeMenu(); if (tv) this._setTv(tv); return; }
    if (t('[data-fclear]')) {
      Object.assign(this._v, { unwatched: false, genre: '', decade: '', rating: '', short: false, sort: 'title', detail: null });
      this._renderTop(); this._renderMain(); this._renderDetail(); this._filtersPopover(); return;
    }
    if (t('[data-short]')) { this._v.short = !this._v.short; this._v.detail = null; this._renderTop(); this._renderMain(); this._renderDetail(); if (this._root.querySelector('.plc-fpanel')) this._filtersPopover(); return; }
    if ((el = t('[data-unw]'))) { this._v.unwatched = el.dataset.unw === '1'; this._v.detail = null; this._renderTop(); this._renderMain(); if (this._root.querySelector('.plc-fpanel')) this._filtersPopover(); this._renderDetail(); return; }
    if ((el = t('[data-hero]'))) {
      const items = this._lists.get('continue') || [];
      this._v.hero = ((this._v.hero || 0) + Number(el.dataset.hero) + items.length) % Math.max(1, items.length);
      const sec = this._root.querySelector('[data-sec="continue"]'); if (sec) this._paintContinue(sec, items, true); return;
    }
    if ((el = t('[data-open]'))) {
      if (this._v.query) addRecent(this._v.query);
      const r = this._item(el.dataset.open);
      if (!r.item) return;
      if (cfg(this._c, 'tap_action') === 'play' && r.item.key) { this._quickPlay(r, false); return; }
      this._openDetail(r); el.classList.add('sel'); return;
    }
    if (t('[data-close]')) { this._v.detail = null; this._pickTv = null; this._root.querySelectorAll('.plc-tile.sel').forEach((n) => n.classList.remove('sel')); this._renderDetail(); return; }
    if ((el = t('[data-play]'))) { if (this._detailItem) this._play(this._detailItem, el.dataset.play); return; }
    if (t('[data-trailergo]')) { this._playTrailer(this._detailItem); return; }
    if ((el = t('[data-cwmark]'))) { this._markWatched((this._lists.get('continue') || [])[Number(el.dataset.cwmark)], true); return; }
    if ((el = t('[data-markall]'))) { this._markWatched(this._detailItem, el.dataset.markall === '1', 'hold_markall_ms'); return; }
    if ((el = t('[data-mark]'))) { this._markWatched(this._detailItem, el.dataset.mark === '1'); return; }
    if (t('[data-trailer]')) { if (this._detailItem?.trailer) this._trailer(this._detailItem.trailer); return; }
    if ((el = t('[data-np]'))) {
      const [a, v] = el.dataset.np.split(':');
      if (a === 'power_off' && !window.confirm(`Turn ${tvLabel(this._tv())} off?`)) return;
      if ((a === 'play' || a === 'play_pause') && this._stuck(this._tv())) { this._resume(this._tv().id); return; }
      this._control(a, v); return;
    }
    if (t('[data-watchpop]')) { this._watchPopover(); return; }
    if ((el = t('[data-wtoggle]'))) {
      const pl = el.dataset.wtoggle, sec = el.closest('[data-sec="watching"]'), open = !sec.classList.contains('closed');
      this._v.wOpen = { ...(this._v.wOpen || {}), [pl]: !open }; this._paintWatching(); return;
    }
    if (t('[data-npclose]')) { this._v.npFull = false; this._renderNP(true); return; }
    if (t('[data-npx]')) {
      if (this._v.npFull) this._v.npFull = false;
      else { const np = nowPlaying(this._hass, this._tv()); this._v.npHidden = np ? `${np.tv?.id}|${np.title}` : null; this._v.npOpen = null; }
      this._renderNP(true); return;
    }
  },

  _onInput(e) {
    if (!e.target.matches?.('[data-search]')) return;
    this._v.query = e.target.value.trim();
    clearTimeout(this._qt);
    if (this._v.tab === 'home') { this._qt = setTimeout(() => this._homeSearch(), 350); return; }
    this._qt = setTimeout(() => { const main = this._root.querySelector('.plc-main'); this._lists.set('grid', []); if (main.querySelector('.plc-grid')) { main.querySelector('.plc-grid').innerHTML = ''; this._page(main, 0); } }, 300);
  },

  _onChange(e) {
    const el = e.target;
    if (el.matches?.('[data-sort]')) { this._v.sort = el.value; this._renderTop(); this._renderMain(); if (this._root.querySelector('.plc-fpanel')) this._filtersPopover(); return; }
    if (el.matches?.('[data-filter]')) { this._v[el.dataset.filter] = el.value; this._v.detail = null; this._renderTop(); this._renderMain(); this._renderDetail(); return; }
    if (el.matches?.('[data-season]')) { this._v.season = el.value; if (this._detailItem) this._paintSeasons(this._detailItem); }
  },
});

// ------------------------------------------------------------------------------------------- editor

const EDITOR_CSS = `
        .plce {
          /* Font sizes (by role, not by pixel) */
          --ltek-fs-panel-title: 16px;  /* top-level panel / section title */
          --ltek-fs-header: 15px;       /* editor header, panel summary */
          --ltek-fs-group: 14px;        /* group heading inside a panel */
          --ltek-fs-label: 13px;        /* standard field label / row */
          --ltek-fs-body: 12px;         /* body text, most controls */
          --ltek-fs-small: 11px;        /* hints, secondary text */
          --ltek-fs-tiny: 10px;         /* badges, micro-labels */
          /* Font weights */
          --ltek-fw-normal: 400;        /* control labels (recede) */
          --ltek-fw-medium: 500;
          --ltek-fw-semibold: 600;
          --ltek-fw-bold: 700;          /* titles, values (lead) */
          /* Text colors */
          --ltek-c-text: var(--primary-text-color, #e1e1e1);  /* primary */
          --ltek-c-label: #ccc;         /* control labels */
          --ltek-c-muted: #888;         /* hints / disabled */
          --ltek-c-accent: var(--primary-color, #2196F3);
          /* Accent tints — hover / active fills */
          --ltek-c-accent-fade: rgba(var(--rgb-primary-color,33,150,243),0.12);       /* active / pressed fill */
          --ltek-c-accent-fade-soft: rgba(var(--rgb-primary-color,33,150,243),0.08);  /* hover fill */
          --ltek-c-error-fade: rgba(244,67,54,0.15);         /* delete hover fill */
          /* Status colors — defer to the user's theme, fall back to Material. */
          --ltek-c-error: var(--error-color, #f44336);
          --ltek-c-success: var(--success-color, #4caf50);
          --ltek-c-warning: var(--warning-color, #ffb300);
          --ltek-c-info: var(--info-color, #2196F3);
          /* Second accent: the green "library / shared" grouping (NOT tied to --primary-color). */
          --ltek-c-accent-lib: #7fd18a;
          --ltek-c-on-accent: #fff;   /* text/icon on a solid accent fill */
          /* Action icons: neutral idle → brighten on hover; delete uses error on hover. */
          --ltek-c-icon: #aaa;        /* idle action icon */
          --ltek-c-icon-hover: #fff;  /* hovered action icon */
          /* Surfaces */
          --ltek-c-surface: rgba(255,255,255,0.015);        /* panels */
          --ltek-c-surface-raised: rgba(255,255,255,0.02);  /* cards / rows */
          /* Borders */
          --ltek-c-panel-border: #3a3a3a;   /* panels */
          --ltek-c-border: #444;            /* controls */
          --ltek-c-border-soft: #333;       /* subtle inner dividers */
          /* Radii */
          --ltek-r-panel: 12px;   /* panels */
          --ltek-r-card: 10px;    /* section cards */
          --ltek-r-md: 8px;       /* blocks */
          --ltek-r-ctrl: 6px;     /* inputs, selects, buttons */
          /* Spacing scale (4px base) */
          --ltek-sp-1: 4px;  --ltek-sp-2: 6px;  --ltek-sp-3: 8px;
          --ltek-sp-4: 10px; --ltek-sp-5: 12px; --ltek-sp-6: 16px;
          /* Control padding — uniform input/select/button height. */
          --ltek-ctrl-pad: 6px 10px;
          /* Icon sizes (two clear roles; one-off glyphs stay literal). */
          --ltek-icon-sm: 16px;   /* inline / action icons */
          --ltek-icon-lg: 20px;   /* panel-title icons */
          /* Slider row geometry */
          --ltek-slider-val-w: 44px;   /* value readout column width */
          display: flex; flex-direction: column; gap: 8px; font-family: var(--paper-font-body1_-_font-family, sans-serif);
        }
        .plce ha-icon { --mdc-icon-size: 18px; vertical-align: middle; }
        .plce-sec { border: 1px solid var(--ltek-c-panel-border); border-radius: var(--ltek-r-panel); background: var(--ltek-c-surface); overflow: hidden; }
        .plce-sec[open] { border-color: var(--ltek-c-accent); }
        .plce-sec > summary { display: flex; align-items: center; gap: var(--ltek-sp-3); padding: 14px 16px; cursor: pointer; user-select: none;
          list-style: none; font-size: var(--ltek-fs-panel-title); font-weight: var(--ltek-fw-bold); color: var(--ltek-c-text); }
        .plce-sec > summary::-webkit-details-marker { display: none; }
        .plce-sec > summary > ha-icon:not(.chev) { color: var(--ltek-c-accent); --mdc-icon-size: var(--ltek-icon-lg); }
        .plce-sec > summary .chev { margin-left: auto; color: #999; --mdc-icon-size: 20px; transition: transform .2s ease; transform: rotate(-90deg); }
        .plce-sec[open] > summary .chev { transform: none; }
        .plce-body { padding: 0 16px 16px; }
        .plce-hint { color: var(--ltek-c-muted); font-size: var(--ltek-fs-small); margin: 0 0 var(--ltek-sp-3); }
        .plce-hint code { font-size: var(--ltek-fs-tiny); }
        .plce-group { color: var(--accent-color, var(--ltek-c-accent)); font-size: var(--ltek-fs-group); font-weight: var(--ltek-fw-semibold);
          margin-top: var(--ltek-sp-4); padding-top: var(--ltek-sp-3); border-top: 1px solid var(--ltek-c-border-soft); }
        .plce-group.first { margin-top: 0; padding-top: 0; border-top: none; }
        .plce-gh { margin: 18px 2px 6px; color: var(--secondary-text-color); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; }
        .plce-gh.first { margin-top: 2px; }
        .plce-lockbar { display: flex; margin: 8px 0; }
        .plce-lock { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; cursor: pointer; font: inherit; font-weight: 600;
          border: 1px solid var(--divider-color, #555); background: transparent; color: var(--primary-text-color); }
        .plce-lock ha-icon { --mdc-icon-size: 18px; }
        .plce-lock.open { border-color: var(--accent-color, var(--ltek-c-accent)); background: color-mix(in srgb, var(--accent-color, var(--ltek-c-accent)) 18%, transparent); }
        .plce-hlist { display: flex; flex-direction: column; gap: 2px; }
        .plce-hchips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 5px 2px; border-bottom: 1px solid var(--divider-color, #333); }
        .plce-hchips .plce-name { flex: 1 1 140px; min-width: 0; }
        .plce-hchips.off .plce-name { opacity: .55; }
        .plce-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 999px; font-size: 12px;
          background: color-mix(in srgb, var(--primary-text-color) 9%, transparent); color: var(--primary-text-color); }
        .plce-chip.off { color: var(--secondary-text-color); }
        .plce-chip.pl-library { background: color-mix(in srgb, var(--info-color, #039be5) 22%, transparent); }
        .plce-chip.pl-player { background: color-mix(in srgb, #9c27b0 24%, transparent); }
        .plce-chip.pl-footer { background: color-mix(in srgb, var(--success-color, #43a047) 22%, transparent); }
        .plce-chip.pl-popover { background: color-mix(in srgb, var(--warning-color, #ffa600) 24%, transparent); }
        .plce-chip.row { background: color-mix(in srgb, var(--primary-text-color) 7%, transparent); }
        .plce-chip.al { background: transparent; border: 1px solid var(--divider-color, #444); }
        .plce-chip.st { background: transparent; border: 1px dashed var(--divider-color, #555); color: var(--secondary-text-color); }
        .plce-chip.inuse { background: color-mix(in srgb, var(--accent-color, var(--ltek-c-accent)) 22%, transparent); color: var(--accent-color, var(--ltek-c-accent)); font-weight: 600; }
        .plce-chip.reset { cursor: pointer; border: 1px solid var(--divider-color, #555); background: transparent; font: inherit; font-size: 12px; margin-left: 8px; }
        .plce-chip.reset:hover { border-color: var(--error-color, #db4437); color: var(--error-color, #db4437); }
        .plce-inuse { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0 4px; }
        .plce-inuse-on { font-size: 12px; color: var(--secondary-text-color); }
        .plce-item-ic { --mdc-icon-size: 18px; color: var(--secondary-text-color); flex: none; }
        .plce-hchips .plce-item-ic { margin-right: 2px; }
        .plce-chip.on { background: color-mix(in srgb, var(--accent-color, var(--ltek-c-accent)) 22%, transparent); color: var(--accent-color, var(--ltek-c-accent));
          text-transform: none; letter-spacing: 0; font-weight: 600; margin-left: 8px; }
        .plce-warn { border-left: 3px solid var(--warning-color, #ffa600); padding-left: 8px; }
        .plce-pgs { margin-top: 6px; }
        .plce-pg { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-top: 1px solid var(--divider-color, #333); }
        .plce-pg > input { margin: 2px 0 0; width: 18px; height: 18px; flex: none; accent-color: var(--accent-color, var(--ltek-c-accent)); }
        .plce-pg-t { text-transform: uppercase; letter-spacing: .08em; font-weight: 700; font-size: 13px; color: var(--accent-color, var(--ltek-c-accent)); }
        .plce-pg:not(.on) .plce-pg-t { opacity: .55; }
        .plce-pgd { flex: 1 1 auto; min-width: 0; }
        .plce-pgd > summary { display: flex; align-items: center; justify-content: space-between; cursor: pointer; list-style: none; }
        .plce-pgd > summary::-webkit-details-marker { display: none; }
        .plce-pgd > summary .chev { --mdc-icon-size: 22px; color: var(--accent-color, var(--ltek-c-accent)); transition: transform .15s; }
        .plce-pgd[open] > summary .chev { transform: rotate(90deg); }
        .plce-pg-body { padding-top: 8px; }
        dialog.plce-dlg { border: none; border-radius: 14px; padding: 0; width: min(560px, 92vw); background: var(--card-background-color, #1c1c1c); color: var(--primary-text-color); }
        .plce-dlg-in { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
        .plce-dlg-h { font-size: 16px; font-weight: 700; }
        .plce-dlg-t { min-height: 220px; width: 100%; box-sizing: border-box; font: 12px/1.4 ui-monospace, monospace; padding: 8px; border-radius: 8px;
          border: 1px solid var(--divider-color, #444); background: var(--secondary-background-color, #111); color: var(--primary-text-color); resize: vertical; }
        .plce-dlg-msg { font-size: 12px; color: var(--secondary-text-color); min-height: 1em; }
        .plce-dlg-msg.bad { color: var(--error-color, #db4437); }
        .plce-dlg-b { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
        .plce-btn { padding: 7px 14px; border-radius: 8px; border: 1px solid var(--divider-color, #555); background: transparent; color: var(--primary-text-color); font: inherit; cursor: pointer; }
        .plce-btn.main { background: var(--accent-color, var(--ltek-c-accent)); border-color: transparent; color: var(--text-primary-color, #fff); }
        .plce-dlg-name { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--divider-color, #444); background: var(--secondary-background-color, #111); color: var(--primary-text-color); font: inherit; }
        .plce-wrap { flex-wrap: wrap; gap: 6px; }
        .plce-chiprow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0; }
        .plce-chiplbl { flex: 0 0 100%; font-size: 12px; color: var(--secondary-text-color); }
        .plce-pick { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; cursor: pointer; font: inherit; font-size: 13px;
          border: 1px solid var(--divider-color, #555); background: transparent; color: var(--primary-text-color); }
        .plce-pick ha-icon { --mdc-icon-size: 16px; }
        .plce-pick.on { border-color: var(--accent-color, var(--ltek-c-accent)); background: color-mix(in srgb, var(--accent-color, var(--ltek-c-accent)) 22%, transparent); font-weight: 600; }
        .plce-pick.add { border-style: dashed; color: var(--accent-color, var(--ltek-c-accent)); }
        .plce-tight { margin: 0 0 2px; }
        .plce-divlbl { display: flex; align-items: center; gap: 10px; margin: 10px 0 6px; font-size: 12px; color: var(--secondary-text-color); }
        .plce-divlbl::before, .plce-divlbl::after { content: ''; flex: 1 1 auto; height: 1px; background: var(--divider-color, #444); }
        .plce-divlbl::before { flex: 0 0 14px; }
        .plce-divlbl .plce-chip.reset { flex: none; margin: 0; }
        .plce-divlbl b { color: var(--primary-text-color); }
        .plce-scrbox { margin: 4px 0 10px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--accent-color, var(--ltek-c-accent)) 45%, transparent);
          border-radius: 12px; background: color-mix(in srgb, var(--accent-color, var(--ltek-c-accent)) 5%, transparent); }
        .plce-scrbox-h { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 6px; }
        .plce-scrbox-h b { color: var(--primary-text-color); }
        plce-icon-pick { display: inline-block; position: relative; min-width: 0; }
        .pip-chip { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; padding: 5px 10px 5px 8px; border-radius: 999px; cursor: pointer; font: inherit; font-size: 13px;
          border: 1px solid var(--divider-color, #555); background: transparent; color: var(--primary-text-color); }
        .pip-chip ha-icon { --mdc-icon-size: 20px; color: var(--accent-color, var(--ltek-c-accent)); }
        .pip-chip.empty span { color: var(--secondary-text-color); }
        .pip-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, monospace; font-size: 12px; }
        .pip-chip .pip-chev { --mdc-icon-size: 16px; color: var(--secondary-text-color); }
        .pip-pop { margin-top: 6px; padding: 8px; border-radius: 10px; border: 1px solid var(--divider-color, #444); background: var(--card-background-color, #1c1c1c); width: min(320px, 80vw); }
        .pip-top { display: flex; gap: 6px; }
        .pip-q { flex: 1 1 auto; min-width: 0; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, #444); background: var(--secondary-background-color, #111);
          color: var(--primary-text-color); font: 12px ui-monospace, monospace; }
        .pip-clear { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--divider-color, #555); background: transparent; color: var(--primary-text-color); font: inherit; font-size: 12px; cursor: pointer; }
        .pip-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; margin-top: 8px; max-height: 180px; overflow-y: auto; }
        .pip-i { aspect-ratio: 1; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--primary-text-color); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .pip-i:hover { background: color-mix(in srgb, var(--primary-text-color) 8%, transparent); }
        .pip-i.on { border-color: var(--accent-color, var(--ltek-c-accent)); color: var(--accent-color, var(--ltek-c-accent)); }
        .pip-i ha-icon { --mdc-icon-size: 20px; }
        .pip-hint { margin-top: 6px; font-size: 11px; color: var(--secondary-text-color); }
        .plce-addrow { margin: 0 0 6px; }
        .plce-hide { margin-left: auto; font-size: 12px; }
        .plce-item.off select:disabled { opacity: .5; }
        .plce-pick.src { max-width: 100%; }
        .plce-src-n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .plce-srcbox { margin: 0 0 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--divider-color, #444); }
        .plce-pdot { width: 7px; height: 7px; border-radius: 50%; background: var(--success-color, #43a047); margin-left: 2px; }
        .plce-del:hover { color: var(--error-color, #db4437); border-color: var(--error-color, #db4437); }
        .plce-pg-sub { margin: 8px 0 2px; font-size: 12px; font-weight: 600; color: var(--secondary-text-color); }
        .plce-chip ha-icon { --mdc-icon-size: 14px; }
        .plce-row { display: flex; align-items: center; gap: var(--ltek-sp-4); padding: var(--ltek-sp-1) 0; flex-wrap: wrap; justify-content: flex-start; }
        .plce-row label.lbl { color: var(--ltek-c-label); font-size: var(--ltek-fs-body); font-weight: var(--ltek-fw-normal); flex: none; }
        .plce-row input[type="text"], .plce-row select { flex: 1 1 auto; min-width: 0; padding: var(--ltek-ctrl-pad);
          background: var(--secondary-background-color, #2a2a2a); border: 1px solid var(--ltek-c-border); border-radius: var(--ltek-r-ctrl);
          color: var(--ltek-c-text); font-size: var(--ltek-fs-body); }
        .plce-row input[type="range"] { flex: 1 1 auto; min-width: 100px; accent-color: var(--ltek-c-accent); cursor: pointer; }
        .plce-val { flex: 0 0 var(--ltek-slider-val-w); text-align: right; font-weight: var(--ltek-fw-bold); font-variant-numeric: tabular-nums;
          white-space: nowrap; color: var(--ltek-c-text); font-size: var(--ltek-fs-body); }
        .plce-nowrap { flex-wrap: nowrap; }
        .plce-checkrow { display: flex; flex-wrap: wrap; gap: 4px 18px; }
        .plce-check { display: flex; align-items: center; gap: var(--ltek-sp-2); padding: var(--ltek-sp-1) 0; color: var(--ltek-c-label);
          font-size: var(--ltek-fs-body); cursor: pointer; }
        .plce-check input { accent-color: var(--ltek-c-accent); }
        .plce-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0 var(--ltek-sp-4); }
        .plce-color { display: flex; flex: 1 1 auto; gap: var(--ltek-sp-2); flex-wrap: wrap; min-width: 0; }
        .plce-color select.plce-cmode, .plce-color select.plce-smode { flex: 0 0 auto; min-width: 120px; }
        .plce-color input[type="color"] { flex: 0 0 auto; width: 44px; height: 30px; padding: 0; border: none; background: none; cursor: pointer; }
        .plce-reset { border: none; background: none; padding: 0; color: var(--ltek-c-icon); cursor: pointer; }
        .plce-reset:hover { color: var(--ltek-c-icon-hover); }
        .plce-reset ha-icon { --mdc-icon-size: var(--ltek-icon-sm); }
        .plce-list { display: flex; flex-direction: column; gap: var(--ltek-sp-2); }
        .plce-item { display: flex; flex-direction: column; gap: var(--ltek-sp-1); padding: var(--ltek-sp-2) var(--ltek-sp-3);
          background: var(--ltek-c-surface-raised); border-radius: var(--ltek-r-card); }
        .plce-item-h { display: flex; align-items: center; gap: var(--ltek-sp-2); }
        .plce-item-h > ha-icon { color: var(--ltek-c-accent); --mdc-icon-size: var(--ltek-icon-lg); flex: none; }
        .plce-name { flex: 1 1 auto; min-width: 0; color: var(--ltek-c-text); font-size: var(--ltek-fs-label); font-weight: var(--ltek-fw-normal);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .plce-badge { flex: none; color: var(--ltek-c-muted); font-size: var(--ltek-fs-tiny); border: 1px solid var(--ltek-c-border);
          border-radius: var(--ltek-r-ctrl); padding: 0 var(--ltek-sp-1); }
        .plce-del { border: none; background: none; padding: 0; cursor: pointer; color: var(--ltek-c-icon); flex: none; line-height: 0; }
        .plce-del ha-icon { --mdc-icon-size: var(--ltek-icon-sm); }
        .plce-del:hover { color: var(--ltek-c-error); }
        .plce-add { align-self: flex-start; padding: var(--ltek-ctrl-pad); border: 1px dashed var(--ltek-c-accent); border-radius: var(--ltek-r-ctrl);
          background: transparent; color: var(--ltek-c-accent); font-size: var(--ltek-fs-body); font-weight: var(--ltek-fw-semibold); cursor: pointer; }
        .plce-add:hover { background: var(--ltek-c-accent-fade-soft); }
        .plce-tvlist { display: flex; flex-direction: column; gap: var(--ltek-sp-1); }
        .plce-badge.ok { color: var(--ltek-c-success); border-color: var(--ltek-c-success); box-shadow: 0 0 6px color-mix(in srgb, var(--ltek-c-success) 60%, transparent); }
        .plce-badge.bad { color: var(--ltek-c-error); border-color: var(--ltek-c-error); box-shadow: 0 0 6px color-mix(in srgb, var(--ltek-c-error) 60%, transparent); }
        .plce-sub { border: 1px solid transparent; border-radius: var(--ltek-r-ctrl); }
        .plce-sub + .plce-sub { border-top-color: var(--divider-color, #333); }
        .plce-sub[open] { border-color: var(--accent-color, var(--ltek-c-accent)); margin: var(--ltek-sp-1) 0; }
        .plce-sub[open] + .plce-sub { border-top-color: transparent; }
        .plce-sub > summary { display: flex; align-items: center; gap: var(--ltek-sp-2); padding: 10px 2px 8px; cursor: pointer; user-select: none;
          list-style: none; color: var(--ltek-c-accent); font-size: var(--ltek-fs-body); font-weight: var(--ltek-fw-semibold);
          text-transform: uppercase; letter-spacing: 0.04em; }
        .plce-sub[open] > summary { padding-left: var(--ltek-sp-3); padding-right: var(--ltek-sp-3); }
        .plce-sub > summary::-webkit-details-marker { display: none; }
        .plce-sub > summary::marker { content: ""; }
        .plce-sub > summary .chev { margin-left: auto; color: var(--ltek-c-accent); --mdc-icon-size: 22px; transition: transform .2s ease; transform: rotate(-90deg); }
        .plce-sub[open] > summary .chev { transform: none; }
        .plce-sub-body { padding: 0 var(--ltek-sp-4) var(--ltek-sp-4); }
        .plce-act { border: none; background: none; padding: 0; cursor: pointer; color: var(--ltek-c-icon); flex: none; line-height: 0; }
        .plce-act:hover { color: var(--ltek-c-icon-hover); }
        .plce-act:disabled { opacity: .3; cursor: default; }
        .plce-act ha-icon { --mdc-icon-size: var(--ltek-icon-sm); }
        .plce-act.on { color: var(--ltek-c-accent); }
        .plce-slot { flex: none; width: var(--ltek-icon-sm); }
        .plce-styled { padding: var(--ltek-sp-2) 0 0; border-top: 1px solid var(--ltek-c-border-soft); margin-top: var(--ltek-sp-2); }
        .plce-item.off .plce-name { opacity: .45; }
        .plce-foot { color: var(--ltek-c-muted); font-size: var(--ltek-fs-tiny); text-align: right; }
`;

const INTEGRATION_USES = {
  plex: ['Plex', 'required: the Plex server Plex Center reads'],
  pipup: ['PiPup', 'plays on Android / Google TVs (app 0.32+, clicks allowed for Plex)'],
  androidtv: ['Android TV (ADB)', 'plays without PiPup; screenshot when nothing plays'],
  androidtv_remote: ['Android TV Remote', 'found; not needed by Plex Center'],
  cast: ['Google Cast', 'found; not used (Cast plays in its own receiver, not the Plex app)'],
  tautulli: ['Tautulli', 'found; Plex Center reads sessions from Plex directly'],
  tautulli_active_streams: ['Tautulli Active Streams', 'found; history rows are on the roadmap'],
  sonarr: ['Sonarr', 'its upcoming sensor can be a Home row'],
  radarr: ['Radarr', 'its upcoming sensor can be a Home row'],
  plex_recently_added: ['Plex Recently Added', 'can be a Home row'],
  upcoming_media: ['Upcoming media', 'can be a Home row'],
};
const REVEAL_KEYS = new Set(['calendar', 'watching_resume', 'hold_play', 'watching_home', 'watching_cal', 'watching_lib', 'watching_coll_home', 'watching_coll_cal', 'watching_coll_lib', 'page_style', ...PAGE_ALL.filter((k) => !/_px$|_blur$|_spread$|_opacity$|_width$|_x$|_y$|radius|height|gap/.test(k)), ...SCREENS.flatMap(([sc]) => [`${sc}_header`, `${sc}_now_playing`]), 'up_next', 'tv_label', 'surprise', 'surprise_style', 'fit_screen', 'layout', 'image_style', 'now_playing', 'tv_picker', 'lock', 'client_choice', 'card_shadow']);

class PlexCenterCardEditor extends HTMLElement {
  constructor() { super(); this._config = {}; this._open = new Set(); this._cmode = {}; this._rendered = false; this._onScreen = () => { if (this._rendered) this._render(); }; }
  connectedCallback() { window.addEventListener('plex-center-screen', this._onScreen); }
  disconnectedCallback() { window.removeEventListener('plex-center-screen', this._onScreen); }

  setConfig(config) {
    const next = normalizeConfig(config);
    const changed = JSON.stringify(next) !== JSON.stringify(this._config);
    this._config = next;
    if (!this._rendered || changed) this._render();
  }
  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    if (first) {
      this._render();
      cached(h, 'config', REFRESH_MS, () => ws(h, 'config')).then(() => this._render()).catch((e) => { this._err = e?.message || String(e); this._render(); });
    }
  }

  _emit() {
    this._config = normalizeConfig(this._config);
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: { type: `custom:${CARD_TAG}`, ...this._config } }, bubbles: true, composed: true }));
  }
  _set(key, value) {
    if (key === 'title' && value === '') { this._config.title = ''; this._emit(); return; }
    if (value === '' || value === undefined || value === null || DEFAULTS[key] === value) delete this._config[key];
    else this._config[key] = value;
    this._emit();
  }
  _c(k) { return cfg(this._config, k); }

  _panel(id, icon, title, body) {
    return `<details class="plce-sec" data-panel="${id}"${this._open.has(id) ? ' open' : ''}>
      <summary><ha-icon icon="${icon}"></ha-icon>${title}<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></summary>
      <div class="plce-body">${body}</div></details>`;
  }
  _sub(id, title, body) {
    return `<details class="plce-sub" data-panel="${id}"${this._open.has(id) ? ' open' : ''}>
      <summary>${title}<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></summary><div class="plce-sub-body">${body}</div></details>`;
  }
  _check(key, label) { return `<label class="plce-check"><input type="checkbox" data-key="${key}"${this._c(key) ? ' checked' : ''}>${label}</label>`; }
  _text(key, label, ph = '') {
    const v = this._config[key] !== undefined ? this._config[key] : '';
    return `<div class="plce-row"><label class="lbl">${label}</label><input type="text" data-key="${key}" value="${esc(v)}" placeholder="${esc(ph)}"></div>`;
  }
  /** A one-of choice as chips (the design system prefers chips to dropdowns). */
  _chips(key, label, options) {
    const cur = String(this._c(key) ?? '');
    return `<div class="plce-chiprow"><span class="plce-chiplbl">${esc(label)}</span>${options.map(([v, n]) => `<button class="plce-pick${String(v) === cur ? ' on' : ''}" data-chipk="${esc(key)}|${esc(v)}">${esc(n)}</button>`).join('')}</div>`;
  }
  _select(key, label, options) {
    const cur = this._c(key);
    return `<div class="plce-row"><label class="lbl">${label}</label><select data-key="${key}">${options.map(([v, n]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
  }
  _slider(key, label, min, max, unit = 'px') {
    const v = Number(this._c(key));
    return `<div class="plce-row plce-nowrap"><label class="lbl">${label}</label><input type="range" data-skey="${key}" data-unit="${unit}" min="${min}" max="${max}" step="1" value="${v}">
      <span class="plce-val" data-val="${key}">${v}${unit}</span>${this._config[key] !== undefined ? `<button class="plce-reset" data-reset="${key}" title="Back to default"><ha-icon icon="mdi:restore"></ha-icon></button>` : ''}</div>`;
  }
  _getK(k) {
    if (String(k).startsWith('look:')) {
      const [, kind, screen, f] = String(k).split(':'), o = this._config.looks?.[`${kind}:${screen}`] || {};
      if (f.startsWith('fields.')) { const [, id, prop] = f.split('.'); return fieldLayout(kind, o)[id]?.[prop] ?? ''; }
      return o[f] ?? '';
    }
    return this._config[k];
  }
  _setK(k, v) {
    if (!String(k).startsWith('look:')) { this._set(k, v); return; }
    const [, kind, screen, f] = String(k).split(':'), lk = `${kind}:${screen}`, looks = { ...(this._config.looks || {}) }, o = { ...(looks[lk] || {}) };
    if (f.startsWith('fields.')) {   // the first change copies the defaults, so the layout is fixed from then on
      const [, id, prop] = f.split('.'), all = fieldLayout(kind, o);
      if (v === '' || v === undefined || v === null) delete all[id][prop]; else all[id][prop] = v;
      o.fields = all;
    } else if (v === '' || v === undefined || v === null) delete o[f]; else o[f] = v;
    looks[lk] = o; this._config.looks = looks; this._emit();
  }

  _colorControl(key, def = null) {
    const [label, defLabel, seed] = def || COLOR_DEFS[key];
    const cur = this._getK(key) || '';
    const mode = this._cmode[key] || (cur === 'transparent' ? 'transparent' : colorMode(cur));
    let field = '';
    if (mode === 'theme') field = `<select class="plce-ctheme" data-ckey="${key}">${THEME_COLORS.map(([v, n]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
    else if (mode === 'custom') field = `<input type="color" class="plce-chex" data-ckey="${key}" value="${/^#[0-9a-fA-F]{6}$/.test(cur) ? cur : seed}">`;
    else if (mode === 'css') field = `<input type="text" class="plce-ccss" data-ckey="${key}" value="${esc(cur)}" placeholder="e.g. tomato, rgba(…), var(--my-color)">`;
    const modes = [['default', defLabel], ...(key === 'card_bg' || key === 'page_bg' || key === 'page_active_bg' ? [['transparent', 'Transparent']] : []), ['theme', 'Theme color'], ['custom', 'Custom color'], ['css', 'Custom CSS']];
    return `<div class="plce-row"><label class="lbl">${label}</label><div class="plce-color">
      <select class="plce-cmode" data-ckey="${key}" data-seed="${seed}">${modes.map(([m, n]) => `<option value="${m}"${m === mode ? ' selected' : ''}>${n}</option>`).join('')}</select>${field}</div></div>`;
  }

  get _conf() { return peek('config'); }

  _tvsBody() {
    const tvs = this._conf?.tvs || [];
    const pick = this._config.tvs || [];
    const routes = { pipup: 'PiPup', adb: 'ADB', plex: 'Plex remote control', open: 'PiPup (opens only)' };
    const reach = (t) => !!t.route && !['unavailable', 'unknown'].includes(t.state);
    const rows = tvs.map((t) => `<label class="plce-check"><input type="checkbox" data-tvpick="${esc(t.id)}"${!pick.length || pick.includes(t.id) ? ' checked' : ''}>
      ${esc(t.name)} <span class="plce-badge ${reach(t) ? 'ok' : 'bad'}" title="${reach(t) ? 'Reachable' : 'No reachable player'}">${esc(routes[t.route] || 'no player')}</span><span class="plce-badge">${esc(t.user || 'owner')}</span></label>`).join('');
    return `<p class="plce-hint">TVs, their Plex Home users and players are set in the integration: Settings → Devices &amp; services → Plex Center → Configure. Here you pick which ones this card offers.</p>
      ${this._err ? `<p class="plce-hint" style="color:var(--ltek-c-error)">${esc(this._err)}</p>` : ''}
      <div class="plce-tvlist">${rows || '<p class="plce-hint">No TVs yet.</p>'}</div>
      <div class="plce-group">TV picker</div>
      <p class="plce-hint">How the TV picker looks (a button for each TV, a chip or icon that opens a menu, or hidden) is set per screen in Layout.</p>
      ${this._select('tv_label', 'TV buttons show', [['name', 'Name'], ['icon', 'Icon only'], ['both', 'Icon and name']])}
      ${this._c('tv_label') !== 'name' ? tvs.map((t) => `<div class="plce-row"><label class="lbl">${esc(t.name)} icon</label><plce-icon-pick data-tvicon="${esc(t.id)}" value="${esc((this._config.tv_icons || {})[t.id] || '')}" placeholder="mdi:television"></plce-icon-pick></div>`).join('') : ''}
      ${this._select('default_tv', 'Default TV', [['', 'First in the list'], ...tvs.map((t) => [t.id, t.name])])}
      ${this._c('lock') ? '' : this._select('client_choice', 'When playing', [['card', "Use the card's TV"], ['ask', 'Ask which TV each time']])}
      ${this._check('lock', 'Lock to the default TV (wall tablet: no picker, no TV choice)')}`;
  }

  /** Sonarr / Radarr found and the Calendar page on: the page shows in the page lists. */
  _calAvail() { return !!this._c('calendar') && Object.values(this._conf?.arr || {}).some(Boolean); }

  /** The screen type being edited (one for the whole editor): the preview's, until a chip is picked. */
  _eds() { return this._edScreen && SCREENS.some(([sc]) => sc === this._edScreen) ? this._edScreen : (SHOWN.screen || 'tablet_landscape'); }
  /** Screen chips: the lit one is the screen being edited; a dot marks the one in the preview. */
  _scrChips(label = 'Screen') {
    const cur = this._eds(), short = { tablet_landscape: 'Tablet landscape', tablet_portrait: 'Tablet portrait', phone_portrait: 'Phone portrait', phone_landscape: 'Phone landscape' };
    const icon = (sc) => (sc.startsWith('phone') ? (sc.endsWith('portrait') ? 'mdi:cellphone' : 'mdi:cellphone-arrow-down') : (sc.endsWith('portrait') ? 'mdi:tablet' : 'mdi:tablet-dashboard'));
    return `<div class="plce-chiprow">${label ? `<span class="plce-chiplbl">${esc(label)}</span>` : ''}${SCREENS.map(([sc]) => `<button class="plce-pick${sc === cur ? ' on' : ''}" data-edscreen="${sc}"
      title="${sc === SHOWN.screen ? 'In the preview now' : ''}"><ha-icon icon="${icon(sc)}"></ha-icon>${esc(short[sc])}${sc === SHOWN.screen ? '<span class="plce-pdot"></span>' : ''}</button>`).join('')}</div>`;
  }

  /** The look of a kind of item on one screen type (picked under Editing; the preview's screen first). */
  _lookBody(kind, part = 'all') {
    const cal = kind === 'calendar';
    const lineLabel = (id, label) => (cal ? label : { title: 'Title', info: 'Line 1', when: 'Line 2', meta: 'Line 3', extra: 'Line 4' }[id]);
    const screen = this._eds();
    const l = lookFor(this._config, kind, screen), own = this._config.looks?.[`${kind}:${screen}`] || {}, K = (f) => `look:${kind}:${screen}:${f}`;
    const reset = (f) => (own[f] !== undefined ? `<button class="plce-reset" data-lookreset="${esc(K(f))}" title="Back to the default"><ha-icon icon="mdi:restore"></ha-icon></button>` : '');
    const chk = (f, label) => `<label class="plce-check"><input type="checkbox" data-lookk="${esc(K(f))}"${l[f] ? ' checked' : ''}>${label}</label>`;
    const sel = (f, label, opts) => `<div class="plce-row"><label class="lbl">${label}</label><select data-lookk="${esc(K(f))}">${opts.map(([v, n]) => `<option value="${v}"${String(l[f]) === v ? ' selected' : ''}>${n}</option>`).join('')}</select>${reset(f)}</div>`;
    const sl = (f, label, min, max) => `<div class="plce-row plce-nowrap"><label class="lbl">${label}</label><input type="range" data-lookr="${esc(K(f))}" min="${min}" max="${max}" step="1" value="${Number(l[f])}">
      <span class="plce-val" data-lookv="${esc(K(f))}">${Number(l[f])}px</span>${reset(f)}</div>`;
    const pct = (f, label, min, max, unit = '%') => `<div class="plce-row plce-nowrap"><label class="lbl">${label}</label><input type="range" data-lookr="${esc(K(f))}" data-unit="${unit}" min="${min}" max="${max}" step="1" value="${Number(l[f])}">
      <span class="plce-val" data-lookv="${esc(K(f))}">${Number(l[f])}${unit}</span>${reset(f)}</div>`;
    const weights = [['400', 'Regular'], ['500', 'Medium'], ['600', 'Semi-bold'], ['700', 'Bold'], ['800', 'Extra bold']];
    const imgs = [['poster', 'Poster', 'mdi:image-outline'], ['fanart', 'Fanart', 'mdi:image-area'], ['fade', 'Fanart fade', 'mdi:image-filter-hdr']];
    const visual = `<div class="plce-chiprow"><span class="plce-chiplbl">Image style</span>${imgs.map(([v, n, ic]) => `<button class="plce-pick${l.image === v ? ' on' : ''}" data-lookimg="${esc(K('image'))}|${v}"><ha-icon icon="${ic}"></ha-icon>${n}</button>`).join('')}
        ${Object.keys(own).length ? `<button class="plce-chip reset" data-lookresetall="${esc(`${kind}:${screen}`)}" title="Reset this screen's look"><ha-icon icon="mdi:restore"></ha-icon>Reset all</button>` : ''}</div>
      ${chk('border', cal ? 'Coloured border on the left (the type colour)' : 'Accent border on the left')}${chk('status', cal ? 'Status marks: a green dot when available, a tick when this TV\'s Plex user has watched it' : 'Watched tick')}
      ${chk('type_icon', 'Movie / TV icon in the lower-right corner')}${cal ? chk('time_corner', 'Air time in the lower-right corner (instead of the date line)') : ''}
      ${l.image === 'fanart' ? `${sel('text_bg', 'Text backdrop', [['gradient', 'Gradient'], ['box', 'A box only behind the text'], ['none', 'None']])}
        ${l.text_bg !== 'none' ? pct('text_bg_opacity', 'Backdrop opacity', 0, 100) : ''}
        ${l.text_bg === 'gradient' ? `${sel('text_bg_dir', 'Gradient direction', GRAD_DIRS)}${pct('text_bg_start', 'Fade starts at', 0, 95)}${pct('text_bg_reach', 'Gradient strength (how far it reaches)', 5, 100)}` : ''}
        ${l.text_bg === 'box' ? `${pct('text_bg_blur', 'Edge blur', 0, 40, 'px')}${sel('box_dir', 'Box fade direction', [['none', 'No fade'], ...GRAD_DIRS])}
          ${l.box_dir !== 'none' ? pct('box_start', 'Fade starts at', 0, 95) : ''}` : ''}` : ''}
      ${l.image === 'fade' ? `${pct('fade_start', 'Image fade starts at (from the left)', 0, 90)}${pct('fade_dist', 'Image fade length', 0, 100)}${pct('fade_width', 'Image width', 30, 100)}` : ''}
`;
    const lines = LOOK_LINES.filter(([id]) => !(cal && id === 'extra')).map(([id, label]) => `<div class="plce-group">${esc(lineLabel(id, label))}</div>${chk(`${id}_show`, 'Show')}${l[`${id}_show`] ? `${sl(`${id}_px`, 'Size', 8, 40)}${sel(`${id}_weight`, 'Weight', weights)}
        ${this._colorControl(K(`${id}_color`), ['Colour', id === 'title' ? 'Theme text' : 'Theme secondary text', id === 'title' ? '#ffffff' : '#bbbbbb'])}` : ''}`).join('');
    const hintTxt = cal ? '<p class="plce-hint">Posters and panels grow with the title size.</p>' : '';
    if (part === 'visual') return visual;
    if (part === 'lines') return lines;
    return `${visual}${this._sub(`lk-lines:${kind}`, 'Text Lines', lines)}${hintTxt}`;
  }

  _calendarBody() {
    const arr = this._conf?.arr || {}, found = Object.entries(arr).filter(([, v]) => v).map(([k]) => k[0].toUpperCase() + k.slice(1));
    return `${this._profile(`${this._visualSubs('calendar')}<p class="plce-hint">Posters and panels grow with the title size.</p>`, 'calendar')}
      ${this._everyScreen(`<p class="plce-hint">Upcoming episodes (Sonarr) and movie releases (Radarr: in cinemas, digital, Blu-ray), read through Home Assistant's own Sonarr
        and Radarr integrations. ${found.length ? `Found: <b>${esc(found.join(', '))}</b>.` : '<b>Neither is set up</b>: add Home Assistant\'s Sonarr or Radarr integration (Settings → Devices &amp; services).'}</p>
      ${this._check('calendar', 'Show the Calendar page (in the page menu)')}
      ${this._select('calendar_view', 'Opens in', [['month', 'Month'], ['week', 'Week'], ['day', 'Day']])}
      ${this._select('week_start', 'Weeks start on', [['mon', 'Monday'], ['sun', 'Sunday']])}
      ${this._slider('calendar_max', 'Entries per day in Month view (then “+N more”)', 1, 10, '')}`)}`;
  }

  /** Which controls layout the panel is editing: 'main' (Standard) or 'lay:<id>'. */
  _editKey() { const k = this._hdrFor; return k && k.startsWith('lay:') && this._config.layouts?.[k.slice(4)] ? k : 'main'; }

  _headerBody() {
    const key = this._editKey(), saved = Object.entries(this._config.layouts || {});
    const items = layoutItems(this._config, key), names = new Map(HEADER_ITEMS);
    const users = SCREENS.filter(([sc]) => layoutKeyFor(this._config, sc) === key).map(([, n]) => n);
    const cur = key.startsWith('lay:') ? this._config.layouts[key.slice(4)] : null;
    const sel = (i, k, opts, cur) => `<select data-hi="${i}" data-hk="${k}">${opts.map(([v, n]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
    const placeName = { library: 'Header', player: 'Player header', footer: 'Footer', popover: 'Filters popup' }, alignName = { left: 'Left', center: 'Middle', right: 'Right' };
    const styleName = (h) => { const st = ITEM_STYLES[h.id]; return st && h.style ? (st.find(([v]) => v === h.style) || [, ''])[1] : ''; };
    const locked = this._hdrLocked !== false;
    const icon = (h) => `<ha-icon class="plce-item-ic" icon="${ITEM_ICONS[h.id] || 'mdi:circle-small'}"></ha-icon>`;
    const chipRows = items.map((h) => `<div class="plce-hchips${h.hidden ? ' off' : ''}">${icon(h)}<span class="plce-name">${esc(names.get(h.id))}</span>${h.hidden
      ? '<span class="plce-chip off"><ha-icon icon="mdi:eye-off"></ha-icon>Hidden</span>'
      : `<span class="plce-chip pl-${h.section}">${placeName[h.section] || 'Header'}</span>${h.section === 'popover' ? '' : `<span class="plce-chip row">Row ${h.row}</span><span class="plce-chip al">${alignName[h.align]}</span>`}${
        styleName(h) ? `<span class="plce-chip st">${esc(styleName(h))}</span>` : ''}`}</div>`).join('');
    const rows = locked ? '' : items.map((h, i) => `<div class="plce-item${h.hidden ? ' off' : ''}"><div class="plce-item-h">${icon(h)}
        <span class="plce-name">${esc(names.get(h.id))}</span>
        <button class="plce-act" data-hiup="${i}" title="Move earlier"${i ? '' : ' disabled'}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button class="plce-act" data-hidown="${i}" title="Move later"${i < items.length - 1 ? '' : ' disabled'}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
        <button class="plce-act" data-hivis="${i}" title="${h.hidden ? 'Show' : 'Hide'}"><ha-icon icon="mdi:${h.hidden ? 'eye-off' : 'eye'}"></ha-icon></button></div>
      ${h.hidden ? '' : `<div class="plce-row">${sel(i, 'section', [['library', 'Header'], ['player', 'Player header'], ['footer', 'Footer'], ...(FILTER_IDS.has(h.id) ? [['popover', 'Filters popup']] : [])], h.section)}
        ${h.section === 'popover' ? '' : `${sel(i, 'row', [[1, 'Row 1'], [2, 'Row 2'], [3, 'Row 3']], h.row)}${sel(i, 'align', [['left', 'Left'], ['center', 'Middle'], ['right', 'Right']], h.align)}`}
        ${ITEM_STYLES[h.id] ? sel(i, 'style', ITEM_STYLES[h.id], h.style || ITEM_STYLES[h.id][0][0]) : ''}</div>`}</div>`).join('');
    return `${this._text('title', 'Title', 'Plex')}${this._check('show_title', 'Show the title (in every layout)')}
      <p class="plce-hint">Each item goes in the <b>Header</b> (above Home and the libraries), the <b>Player header</b> (above the side panel on
        tablets; in the Header when there's no side panel), the <b>Footer</b> (below the card; it can stick to the bottom of the screen, set per screen
        in Screens) or, for filters, the <b>Filters popup</b>. Each place has up to three rows with left / middle / right; items in the same spot follow
        this list's order.</p>
      ${(() => {
        const shown = SHOWN.screen, scName = (SCREENS.find(([sc]) => sc === shown) || [])[1];
        if (!shown) return '';
        const k = layoutKeyFor(this._config, shown), nm = k === 'main' ? 'Standard' : k === 'one_row' ? 'Compact one row (built in)' : `★ ${this._config.layouts[k.slice(4)].name}`;
        return `<div class="plce-inuse"><span class="plce-chip inuse"><ha-icon icon="mdi:check-circle-outline"></ha-icon>In use: ${esc(nm)}</span><span class="plce-inuse-on">on ${esc(scName)}, the screen in the preview</span></div>`;
      })()}
      <div class="plce-chiprow"><span class="plce-chiplbl">Editing</span><button class="plce-pick${key === 'main' ? ' on' : ''}" data-hdrpick="main">Standard</button>${
        saved.map(([id, l]) => `<button class="plce-pick${key === `lay:${id}` ? ' on' : ''}" data-hdrpick="lay:${esc(id)}">★ ${esc(l.name)}</button>`).join('')}
        ${key === 'main' && this._config.header ? '<button class="plce-chip reset" data-hreset title="Reset Standard to its built-in defaults"><ha-icon icon="mdi:restore"></ha-icon>Reset</button>' : ''}</div>
      <p class="plce-hint">${users.length ? `Used by: ${users.map(esc).join(', ')}.` : 'No screen uses this layout yet: pick it in Screens → a screen → Controls layout to use.'}
        <i>Compact one row</i> is built in and can't be edited; save it as a new layout to change it.</p>
      <div class="plce-row plce-wrap"><button class="plce-add" data-laysave><ha-icon icon="mdi:content-save-plus-outline"></ha-icon>Save as new layout</button>
        <button class="plce-add" data-laycompact><ha-icon icon="mdi:content-copy"></ha-icon>Copy Compact one row</button>
        ${cur ? `<button class="plce-add" data-layrename><ha-icon icon="mdi:rename-outline"></ha-icon>Rename</button>
        <button class="plce-add plce-del" data-laydelete><ha-icon icon="mdi:trash-can-outline"></ha-icon>Delete</button>` : ''}
        <button class="plce-add" data-layexport><ha-icon icon="mdi:export"></ha-icon>Export</button><button class="plce-add" data-layimport><ha-icon icon="mdi:import"></ha-icon>Import</button></div>
      <div class="plce-lockbar"><button class="plce-lock${locked ? '' : ' open'}" data-hlock><ha-icon icon="mdi:${locked ? 'lock' : 'lock-open-variant'}"></ha-icon>${locked ? 'Unlock to edit' : 'Editing: lock'}</button></div>
      ${locked ? `<div class="plce-hlist">${chipRows}</div>` : `<div class="plce-list">${rows}</div>`}
      <p class="plce-hint">How the page menu, search and TV picker look is set per screen in Screens.</p>
      ${this._slider('search_width', 'Search box width', 100, 800)}
`;
  }

  _libraryBody() {
    const tv = (this._conf?.tvs || []).find((t) => t.id === this._config.default_tv) || this._conf?.tvs?.[0];
    const libs = Array.isArray(this._conf?.libraries?.[tv?.user || '']) ? this._conf.libraries[tv.user || ''] : [];
    const pick = this._config.libraries || [];
    return `<p class="plce-hint">Each TV shows what its Plex user is shared. Untick libraries this card should hide.</p>
      ${libs.length ? `<div class="plce-checks">${libs.map((l) => `<label class="plce-check"><input type="checkbox" data-lib="${esc(l.title)}"${!pick.length || pick.includes(l.title) ? ' checked' : ''}>${esc(l.title)}</label>`).join('')}</div>` : '<p class="plce-hint">Libraries appear once Plex Center has loaded.</p>'}
      <div class="plce-group">Page order</div>
      <div class="plce-list">${tabOrder(this._config, libs.filter((l) => !pick.length || pick.includes(l.title)), this._calAvail()).map((t, i, all) => `<div class="plce-item"><div class="plce-item-h">
        <ha-icon icon="${t.id === 'home' ? 'mdi:home-variant' : 'mdi:folder-play-outline'}"></ha-icon><span class="plce-name">${esc(t.title)}</span>
        <button class="plce-act" data-tup="${i}" title="Move left"${i ? '' : ' disabled'}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button class="plce-act" data-tdown="${i}" title="Move right"${i < all.length - 1 ? '' : ' disabled'}><ha-icon icon="mdi:arrow-down"></ha-icon></button></div></div>`).join('')}</div>
      ${this._config.tab_order ? '<button class="plce-add" data-treset>Back to the default order</button>' : ''}
      ${this._select('start_tab', 'Start on', [['home', 'Home'], ...libs.map((l) => [l.key, l.title])])}
      ${this._check('hold_play', 'Hold to play: Play buttons start only after being held (not in Now playing)')}
      ${this._c('hold_play') ? this._slider('hold_ms', 'Play: hold for', 500, 5000, ' ms') : ''}
      ${this._slider('hold_mark_ms', 'Mark watched: hold for (0 = tap, then confirm)', 0, 5000, ' ms')}
      ${this._slider('hold_markall_ms', 'Mark all watched (a show): hold for (0 = tap, then confirm)', 0, 5000, ' ms')}
      ${this._select('tap_action', 'Tapping a poster', [['details', 'Opens its details'], ['play', 'Plays it at once']])}
      ${this._check('jump_bar', 'A–Z jump bar beside A → Z libraries')}
      ${this._check('remember_view', 'Remember the tab, filters, sort and view on each device')}
      ${this._check('recent_searches', 'Show recent searches when the search box is empty')}
      ${this._check('up_next', 'Up next: near the end of an episode, show the next one with Play next / Stop after this')}
      ${this._c('up_next') ? `${this._slider('up_next_secs', 'Show Up next this long before the end', 15, 600, ' s')}
        ${this._check('up_next_autoplay', 'Start the next episode when one ends (leave off if the Plex app already auto-plays)')}` : ''}
      ${this._select('after_play', 'After starting a title', [['nowplaying', 'Close the details and show Now playing'], ['stay', 'Stay on the details']])}
      ${this._sub('popups', 'Details &amp; popups', `${this._check('popup_target', 'Target dropdown (a TV or this device) in details and popups')}
        ${this._select('local_app', '"This device" opens', [['auto', 'Automatic: the Plex app on phones and tablets, Plex Web on computers'], ['app', 'The Plex app'], ['web', 'Plex Web']])}
        <p class="plce-hint">The Plex app and Plex Web open the title's page; press Play there.</p>
        ${this._slider('popup_timeout', 'Auto-close time', 0, 300, ' s')}<p class="plce-hint">Details (full screen on phones) and popups close after this long without a press. 0 = never. A trailer playing in the card and Surprise me don't close.</p>`)}`;
  }

  /** The Home list edits one screen type (the preview's first). */
  _homeScreen() { return this._eds(); }
  /** The panel (and row) a Home section is edited in. */
  _panelFor(id) {
    if (id === 'watching') return 'sec-watching';
    if (id === 'continue') return 'sec-continue';
    if (id === 'next') return 'sec-next';
    const t = secType(this._config, id);
    return ['recent', 'upcoming', 'plexhub'].includes(t) ? `row-${id}` : '';
  }
  /** One panel per Home row (Recently Added, Coming Soon, Plex row): its Source, its Screen Profile, and Remove for added rows. */
  _rowPanels() {
    const icons = { recent: 'mdi:new-box', upcoming: 'mdi:calendar-clock', plexhub: 'mdi:plex' };
    return homeSections(this._config).filter(([id]) => ['recent', 'upcoming', 'plexhub'].includes(secType(this._config, id))).map(([id]) => {
      const t = secType(this._config, id), base = SEC_TYPE_TITLE[t] || id;
      const own = SCREENS.map(([sc]) => this._config.sec_styles?.[`${id}:${sc}`]?.title).find(Boolean) || this._config.home_style?.[id]?.title;
      const added = (this._config.home_extra || []).some((x) => x.id === id);
      return this._panel(`row-${id}`, icons[t], own && own !== base ? `${base} · ${own}` : base, `${this._srcChip(id)}
        ${this._profile(`${this._secStyleBody(id, 'visual')}${this._secStyleBody(id, 'rest')}`, `row:${id}`)}
        ${added ? `<div class="plce-row"><button class="plce-add plce-del" data-xdelask="${esc(id)}"><ha-icon icon="mdi:trash-can-outline"></ha-icon>Remove this row</button></div>` : ''}`);
    }).join('');
  }
  _homeCfg() { const sc = this._homeScreen(); return { ...this._config, home_order: this._config[`home_order_${sc}`], home_hidden: this._config[`home_hidden_${sc}`] }; }

  _homeBody() {
    const hc = this._homeCfg(), hsc = this._homeScreen();
    const order = homeOrder(hc), labels = new Map(homeSections({ ...this._config, _screen: this._eds() }));
    const list = order.map((id, i) => `<div class="plce-item${homeVisible(hc, id) ? '' : ' off'}"><div class="plce-item-h">
        <ha-icon icon="${{ watching: 'mdi:account-eye', continue: 'mdi:play-pause', cards: 'mdi:cards-outline' }[id] || SEC_TYPE_ICON[secType(this._config, id)] || 'mdi:plex'}"></ha-icon>
        <span class="plce-name">${esc(labels.get(id) || id)}</span>
        <button class="plce-act" data-hup="${i}" title="Move up"${i ? '' : ' disabled'}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button class="plce-act" data-hdown="${i}" title="Move down"${i < order.length - 1 ? '' : ' disabled'}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
        <button class="plce-act" data-hvis="${esc(id)}" title="${homeVisible(hc, id) ? 'Hide' : 'Show'}"><ha-icon icon="mdi:${homeVisible(hc, id) ? 'eye' : 'eye-off'}"></ha-icon></button>
        ${this._panelFor(id) ? `<button class="plce-act" data-goto="${esc(this._panelFor(id))}" title="Open its panel"><ha-icon icon="mdi:pencil"></ha-icon></button>` : '<span class="plce-slot"></span>'}
        ${(this._config.home_extra || []).some((x) => x.id === id) ? `<button class="plce-del" data-xdel="${esc(id)}" title="Remove"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>` : '<span class="plce-slot"></span>'}</div>
</div>`).join('');
    const soon = upcomingSensors(this._hass, this._conf);
    return `${this._profile(`<p class="plce-hint">Order and show / hide the sections of the Home tab. The pencil opens the section's own panel.</p>
        <div class="plce-list">${list}</div>`, 'home')}
      ${this._everyScreen(`<div class="plce-group">Auto Rotate</div>
        ${this._check('stagger_rotate', 'Stagger: sections that fade or slide change one at a time')}
        ${this._c('stagger_rotate') ? `${this._slider('stagger_gap', 'Time between sections', 1, 15, ' s')}<p class="plce-hint">${esc(this._staggerNote())}</p>` : ''}
        <div class="plce-group">Surprise me</div>
        ${this._check('surprise', 'Surprise me button')}
        ${this._c('surprise') ? `${this._check('surprise_countdown', 'Countdown: plays the pick after 5 seconds unless cancelled')}
          ${this._select('surprise_style', 'Surprise me shows', [['icon', 'Icon only'], ['both', 'Icon and text'], ['text', 'Text only']])}
          ${this._c('surprise_style') !== 'icon' ? this._text('surprise_label', 'Text', DEFAULTS.surprise_label) : ''}
          ${this._c('surprise_style') !== 'text' ? `<div class="plce-row"><label class="lbl">Icon</label><plce-icon-pick data-icon="surprise_icon" value="${esc(this._c('surprise_icon'))}"></plce-icon-pick></div>` : ''}` : ''}
        <p class="plce-hint">Extra cards under the rows: <code>home_cards:</code> with any card configs, in YAML.</p>`)}`;
  }
  /** "3 sections: each changes every 9 s" for the screen being edited. */
  _staggerNote() {
    const c = { ...this._config, ...effectiveConfig(this._config, this._eds().startsWith('phone'), this._eds().endsWith('portrait')), _screen: this._eds() };
    const list = [];
    for (const x of homeOrder(c)) {
      if (!homeVisible(c, x)) continue;
      const st = secStyle(c, x), banner = x === 'continue' && (st.s.layout || (this._eds().startsWith('phone') ? 'row' : 'banner')) === 'banner';
      if (st.auto === 'fade' || (banner && st.auto === 'scroll')) list.push(Math.max(2, banner ? Number(st.s.speed ?? 5) || 5 : st.speed) + 2 * Math.max(0, Number(st.fade_ms)) / 1000);
    }
    if (list.length < 2) return 'Scrolling rows start a moment apart and run at slightly different speeds.';
    const gap = Number(this._c('stagger_gap')), round = Math.max(gap * list.length, ...list);
    return `${list.length} sections that fade / slide: one changes every ${gap} s, so each changes every ${Math.round(round * 10) / 10} s. Scrolling rows start apart and run at slightly different speeds.`;
  }

  async _loadHubChoices(lib) {
    this._hubChoices = this._hubChoices || {};
    if (this._hubChoices[lib] || this._hubLoading?.[lib]) return;
    this._hubLoading = { ...(this._hubLoading || {}), [lib]: true };
    const tv = this._conf?.tvs?.[0];
    try { this._hubChoices[lib] = await ws(this._hass, 'plex_hubs', { ...(tv ? { tv: tv.id } : {}), ...(lib ? { library: lib } : {}) }); }
    catch { this._hubChoices[lib] = []; }
    this._render();
  }

  /** Style of one Home section; every value unset = the card's setting (Appearance). */
  /** A row's settings as the screen being edited sees them (shared source + that screen's profile). */
  _secS(id) { return { ...((this._config.home_style || {})[id] || {}), ...((this._config.sec_styles || {})[`${id}:${this._eds()}`] || {}) }; }

  _secStyleBody(id, part = 'all') {
    const s = this._secS(id);
    const sel = (k, label, opts) => `<div class="plce-row"><label class="lbl">${label}</label><select data-sid="${esc(id)}" data-sk="${k}">${
      opts.map(([v, n]) => `<option value="${v}"${String(s[k] ?? '') === String(v) ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`;
    const sl = (k, label, min, max, def, unit = 'px') => {
      const v = s[k] ?? def;
      return `<div class="plce-row plce-nowrap"><label class="lbl">${label}</label><input type="range" data-sid="${esc(id)}" data-ssk="${k}" data-unit="${unit}" min="${min}" max="${max}" step="1" value="${v}">
        <span class="plce-val" data-sval="${esc(id)}:${k}">${v}${unit}</span>${s[k] !== undefined ? `<button class="plce-reset" data-sreset="${esc(id)}:${k}" title="Card default"><ha-icon icon="mdi:restore"></ha-icon></button>` : ''}</div>`;
    };
    const col = (k, label, seed, transparent = false, defLabel = 'Card default') => {
      const cur = s[k] || '';
      const mode = this._cmode[`${id}:${k}`] || (cur === 'transparent' ? 'transparent' : colorMode(cur));
      let field = '';
      if (mode === 'theme') field = `<select data-sid="${esc(id)}" data-sk="${k}">${THEME_COLORS.map(([v, n]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
      else if (mode === 'custom') field = `<input type="color" data-sid="${esc(id)}" data-sclr="${k}" value="${/^#[0-9a-fA-F]{6}$/.test(cur) ? cur : seed}">`;
      else if (mode === 'css') field = `<input type="text" data-sid="${esc(id)}" data-sk="${k}" value="${esc(cur)}" placeholder="e.g. lightgrey, rgba(…)">`;
      const modes = [['default', defLabel], ...(transparent ? [['transparent', 'Transparent']] : []), ['theme', 'Theme color'], ['custom', 'Custom color'], ['css', 'Custom CSS']];
      return `<div class="plce-row"><label class="lbl">${label}</label><div class="plce-color"><select class="plce-smode" data-sid="${esc(id)}" data-smode="${k}" data-seed="${seed}">${
        modes.map(([m, n]) => `<option value="${m}"${m === mode ? ' selected' : ''}>${n}</option>`).join('')}</select>${field}</div></div>`;
    };
    const list = s.layout === 'list';
    const st = secStyle({ ...this._config, _screen: this._eds() }, id);
    const chk = (k, label, def) => `<label class="plce-check"><input type="checkbox" data-sid="${esc(id)}" data-stri="${k}" data-def="${def ? 1 : 0}"${(s[k] ?? def) ? ' checked' : ''}>${label}</label>`;
    const sensorsAll = this._conf?.upcoming_sensors || [];
    const fn = (x) => this._hass.states[x]?.attributes?.friendly_name || x;
    const hubOpts = this._hubChoices?.[s.library || ''];
    if (st.type === 'plexhub' && !hubOpts) this._loadHubChoices(s.library || '');
    const libsAll = (() => { const tv = this._conf?.tvs?.[0]; const l = this._conf?.libraries?.[tv?.user || '']; return Array.isArray(l) ? l : []; })();
    const source = st.type === 'plexhub'
      ? `<div class="plce-row"><label class="lbl">Library</label><select data-sid="${esc(id)}" data-sk="library"><option value="">All libraries (Home)</option>${
          libsAll.map((l) => `<option value="${esc(l.key)}"${s.library === l.key ? ' selected' : ''}>${esc(l.title)}</option>`).join('')}</select></div>
        <div class="plce-row"><label class="lbl">Plex row</label><select data-sid="${esc(id)}" data-sk="hub"><option value="">— pick a row —</option>${
          (hubOpts || []).map((h) => `<option value="${esc(h.id)}"${s.hub === h.id ? ' selected' : ''}>${esc(h.title)}</option>`).join('')}</select></div>
        ${hubOpts ? '' : '<p class="plce-hint">Loading Plex\'s rows…</p>'}`
      : st.type === 'recent'
      ? `<div class="plce-row"><label class="lbl">Source</label><select data-sid="${esc(id)}" data-sk="source"><option value="">Plex Center (each TV's Plex user, recommended)</option>${
        sensorsAll.map((x) => `<option value="${esc(x)}"${s.source === x ? ' selected' : ''}>${esc(fn(x))}</option>`).join('')}</select></div>`
      : (() => {
        const arrOk = Object.values(this._conf?.arr || {}).some(Boolean);
        const src = arrOk ? `<div class="plce-row"><label class="lbl">Source</label><select data-sid="${esc(id)}" data-sk="source">
          <option value="">Upcoming-media sensors (Sonarr / Radarr through Plex Center when there are none)</option>
          <option value="arr"${s.source === 'arr' ? ' selected' : ''}>Plex Center: Sonarr / Radarr (recommended)</option></select></div>` : '';
        const relPick = `<div class="plce-group first">Movie releases</div><p class="plce-hint">Which releases to list. With more than one, <code>$type</code> says which it is.</p>
          <div class="plce-tvlist">${REL_TYPES.map(([r, n]) => `<label class="plce-check"><input type="checkbox" data-sid="${esc(id)}" data-srel="${r}"${!Array.isArray(s.releases) || s.releases.includes(r) ? ' checked' : ''}>${esc(n)}</label>`).join('')}</div>`;
        if (s.source === 'arr') return `${src}<p class="plce-hint">Each show's next episode and each movie's next release, for the next 60 days.</p>${relPick}`;
        return `${src}<div class="plce-group first">Sensors</div><p class="plce-hint">None ticked = automatic (the Radarr / Sonarr upcoming sensors).</p>
        <div class="plce-tvlist">${sensorsAll.map((x) => `<label class="plce-check"><input type="checkbox" data-sid="${esc(id)}" data-ssens="${esc(x)}"${(s.sensors || []).includes(x) ? ' checked' : ''}>${esc(fn(x))}</label>`).join('') || '<p class="plce-hint">No upcoming-media sensors found.</p>'}</div>`;
      })();
    const sub = (k, t, body) => this._sub(`${k}:${id}`, t, body);
    const visual = `<div class="plce-row"><label class="lbl">Section Title</label><input type="text" data-sid="${esc(id)}" data-sk="title" value="${esc(s.title || '')}" placeholder="${esc(SEC_TYPE_TITLE[st.type] || '')}"></div>
      ${st.type === 'plexhub' ? '' : sel('kind', 'Show', [['', 'Movies and TV'], ['movie', 'Movies'], ['show', 'TV']])}`;
    const pick = (k, label, opts, def) => `<div class="plce-chiprow"><span class="plce-chiplbl">${esc(label)}</span>${opts.map(([v, n]) =>
      `<button class="plce-pick${(s[k] || def) === v ? ' on' : ''}" data-sid="${esc(id)}" data-spick="${k}|${v === def ? '' : v}">${esc(n)}</button>`).join('')}</div>`;
    if (part === 'source') return source;
    if (part === 'visual') return visual;
    return `${part === 'all' ? `${source}${visual}` : ''}
      ${sub('head', 'Header', `<label class="plce-check"><input type="checkbox" data-sid="${esc(id)}" data-sbool="hide_title"${s.show_title === false ? ' checked' : ''}>Hide Section Title</label>
        ${s.show_title === false ? '' : pick('title_pos', 'Section Title', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], 'left')}
        ${st.type === 'plexhub' ? '' : `${chk('chips', 'Movies and TV chips in the header (turn each on or off)', false)}
        ${st.chips ? pick('chips_pos', 'Chips', [['center', 'Center'], ['right', 'Right']], 'right') : ''}`}
        ${chk('view_all', st.type === 'recent' ? 'Show “View all” (opens the library, newest first)' : 'Show “View all” when there are more than fit (opens them all in a popup)', true)}
        ${chk('show_count', 'Show the number of items', true)}
        ${chk('show_icon', 'Show the icon', st.collapsible || !!s.icon)}
        <div class="plce-row"><label class="lbl">Icon</label><plce-icon-pick data-sid="${esc(id)}" data-sicon="icon" value="${esc(s.icon || '')}"></plce-icon-pick></div>
        ${sel('head_style', 'Title style', [['', st.collapsible ? 'Plain (bar default)' : 'Section style (caps, accent)'], ['caps', 'Section style (caps, accent)'], ['plain', 'Plain']])}
        ${chk('divider', 'Divider line under the header', st.collapsible)}
        ${st.divider ? col('divider_color', 'Divider color', '#2196f3', false, 'Section text color') : ''}
        <label class="plce-check"><input type="checkbox" data-sid="${esc(id)}" data-sbool="collapsible"${s.collapsible ? ' checked' : ''}>Collapsible, with a header bar</label>
        ${s.collapsible ? `<label class="plce-check"><input type="checkbox" data-sid="${esc(id)}" data-sbool="collapsed"${s.collapsed ? ' checked' : ''}>Start collapsed</label>` : ''}`)}
      ${sub('items', 'Layout', `${pick('cycle_mode', 'Cycle content', [['scroll', 'Scroll'], ['fade', 'Fade']], st.cycle_mode)}
        ${chk('cycle_chip', 'Cycle chip in the header (turns cycling on and off; shown when there are more than fit)', true)}
        <p class="plce-hint">Cycle content is what the chip (and Auto rotate below) does when it's on.</p>
        ${id === 'continue' ? sel('layout', 'Layout', [['', this._eds().startsWith('phone') ? 'Row (phones\' default)' : 'Banner, one at a time (tablets\' default)'], ['banner', 'Banner, one at a time'], ['row', 'Row'], ['list', 'Column']])
          : sel('layout', 'Layout', [['', 'Row'], ['list', 'Column']])}
        ${id === 'continue' && (s.layout || (this._eds().startsWith('phone') ? 'row' : 'banner')) === 'banner' ? '' : `${sl('show', 'Items to show', 0, 20, 0, '')}
        <p class="plce-hint">0 = the screen's Posters across (half for Fanart rows).</p>`}
        ${id === 'continue' && (s.layout || (this._eds().startsWith('phone') ? 'row' : 'banner')) === 'banner' ? '' : chk('scroll', 'Scroll to see more items', false)}
        ${(() => {
          const lay = id === 'continue' ? (s.layout || (this._eds().startsWith('phone') ? 'row' : 'banner')) : (s.layout || 'row');
          if (lay === 'banner') {
            return `${sel('auto', 'Auto Rotate', [['', 'Off'], ['fade', 'Fade (fades to the next title)'], ['scroll', 'Slide (slides to the next title)']])}
              ${st.auto === 'scroll' ? `${sel('scroll_dir', 'Direction', [['left', 'Left'], ['right', 'Right'], ['up', 'Up'], ['down', 'Down']])}
                ${sl('speed', 'Next title every', 2, 60, s.speed ?? 5, ' s')}${sl('fade_ms', 'Slide time', 0, 3000, st.fade_ms, ' ms')}` : ''}
              ${st.auto === 'fade' ? `${sl('speed', 'Next title every', 2, 60, s.speed ?? 5, ' s')}${sl('fade_ms', 'Fade time', 0, 3000, st.fade_ms, ' ms')}` : ''}`;
          }
          return `${sel('auto', 'Auto Rotate', [['', 'Off'], ['scroll', 'Scroll (scrolls on its own)'], ['fade', 'Fade (fades to the next set)']])}
            ${st.auto === 'scroll' ? `${sel('scroll_dir', 'Direction', lay === 'list' ? [['up', 'Up'], ['down', 'Down']] : [['left', 'Left'], ['right', 'Right']])}${sl('speed', 'Scrolling speed', 5, 200, st.speed, ' px/s')}` : ''}`;
        })()}
        ${st.auto === 'fade' && !(id === 'continue' && (s.layout || (this._eds().startsWith('phone') ? 'row' : 'banner')) === 'banner') ? `${sl('speed', 'Next set every', 2, 60, st.speed, ' s')}${sl('fade_ms', 'Fade time', 0, 3000, st.fade_ms, ' ms')}` : ''}
        ${st.scroll || st.auto !== 'off' ? sl('total', id === 'continue' && (s.layout || (this._eds().startsWith('phone') ? 'row' : 'banner')) === 'banner' ? 'Titles to rotate through' : 'Items to load', st.show, 100, st.total, '') : ''}`)}
      ${sub('lines', 'Text Lines', this._fieldsBody(id))}
      ${sub('shape', 'Content Visuals', `${this._lookBody(id, 'visual')}${sel('flag', '"New" flag', [['', 'Card default'], ['true', 'On'], ['false', 'Off']])}
        ${st.flag ? `${sel('flag_style', 'Flag shows as', [['corner', 'A corner'], ['info', 'An info icon (i)'], ['icons', 'Icons: what it is'], ['labels', 'Labels: what it is']])}
          ${['icons', 'labels'].includes(st.flag_style) ? `<div class="plce-tvlist">${FACTS.map(([f, n]) => `<label class="plce-check"><input type="checkbox" data-sid="${esc(id)}" data-sfact="${f}"${st.flag_items.includes(f) ? ' checked' : ''}>${esc(n)}${f === 'trailer' ? ' (tap plays it)' : ''}</label>`).join('')}</div>
            ${sl('flag_px', 'Icon size', 12, 40, 20)}` : ''}${col('flag_color', 'Flag colour', '#0099cc')}` : ''}${list ? `${sl('list_w', 'Item width', 220, 800, 340)}${sl('item_h', 'Item height', 60, 400, 150)}` : '<p class="plce-hint">Row items take their width from the number of items to show.</p>'}
        ${sl('radius', 'Corner radius', 0, 30, this._c('corner_radius'))}
        ${list ? `${col('item_bg', 'Item background', '#0d0d0d', true)}${col('border_color', 'Item border', '#000000', true)}` : ''}`)}
`;
  }

  /** Phone panel: everything the phone layout uses, by orientation. Other panels set tablets and computers. */
  _layoutBody() {
    const screen = (sc, name) => {
      const k = (x) => `${sc}_${x}`, phone = sc.startsWith('phone');
      const np = this._c(k('now_playing'));
      void name;
      return `<div class="plce-scrbody" data-scr="${sc}">${this._slider(k('scale'), 'Scale (whole card)', 50, 200, '%')}
        ${this._slider(k('across'), 'Posters across (Home rows, libraries, search)', 1, 12, '')}
        <div class="plce-group">Header</div>
        ${this._select(k('header'), 'Controls layout to use', [['main', 'Standard (edit it in Controls layout)'], ['one_row', 'Compact one row (built in: pages left, buttons right)'],
          ...Object.entries(this._config.layouts || {}).map(([id, l]) => [`lay:${id}`, `★ ${l.name}`])])}
        ${this._select(k('tabs'), 'Page menu', [['tabs', 'Buttons'], ['chip', 'A chip with the page name that opens a menu'], ['button', 'An icon button that opens a menu']])}
        ${this._select(k('search'), 'Search', [['field', 'A search box'], ['icon', 'An icon that opens a search bar']])}
        ${this._select(k('tvs'), 'TV picker', [['chips', 'A button for each TV'], ['chip', 'A chip with the TV name that opens a menu'], ['button', 'An icon button that opens a menu'], ['hidden', 'Hidden (always the default TV)']])}
        ${this._select(k('filters'), 'Library filters', [['layout', 'As placed in the controls layout'], ['popover', 'All in the Filters popup (with a Filters button)']])}
        ${this._check(k('hide'), 'Hide the header while scrolling down (comes back when scrolling up)')}
        ${this._check(k('footer_sticky'), 'The footer sticks to the bottom of the screen')}
        ${this._check(k('swipe'), 'Swipe left / right on the content to change tab')}
        <div class="plce-group">Now playing</div>
        ${phone ? '<p class="plce-hint">Phones: tap a Watching now card to open the controls.</p>'
          : this._select(k('now_playing'), 'Side panel', [['panel', 'Show it while something plays'], ['off', 'Off (tap a Watching now card for the controls)']])}</div>`;
    };
    return `${this._select('layout', 'Device type', [['auto', `Automatic (phone when the card is narrower than ${PHONE_MAX_W}px)`], ['tablet', 'Always tablet / computer'], ['phone', 'Always phone']])}
      <p class="plce-hint">Portrait or landscape follows the screen. Each screen type has its own settings; the card uses the one that matches.
        The lit chip is the screen type you're editing (the dot is the one in the preview). How each section looks is set in its own panel.</p>
      ${this._scrChips('Editing')}
      <div class="plce-row"><button class="plce-chip reset" data-scrreset title="Reset everything for this screen type"><ha-icon icon="mdi:restore"></ha-icon>Reset this screen type</button></div>
      ${screen(this._eds(), '')}
      <div class="plce-group">Side panel (tablets, every screen)</div>
      ${this._check('fit_screen', 'Fit the card to the screen height: the player stays put, the library scrolls')}
      ${this._c('fit_screen') ? `${this._slider('screen_offset', 'Space above / below the card', 0, 300)}<p class="plce-hint">Room for the dashboard header and margins.</p>` : ''}
      <p class="plce-hint">Phones always get 44 px touch targets.</p>`;
  }

  /** The screen chips and the settings that belong to the lit screen. reset: what "Reset this section" clears. */
  _profile(inner, reset = '') {
    const name = (SCREENS.find(([sc]) => sc === this._eds()) || [, ''])[1];
    return `<div class="plce-group">Screen Profile</div><p class="plce-hint plce-tight">Select Screen type to edit that profile.</p>${this._scrChips('')}
      <div class="plce-divlbl"><span>Settings for <b>${esc(name)}</b></span>${reset ? `<button class="plce-chip reset" data-secreset="${esc(reset)}" title="Reset this section on ${esc(name)} to the built-in settings"><ha-icon icon="mdi:restore"></ha-icon>Reset</button>` : ''}</div>${inner}`;
  }
  /** The settings that don't depend on the screen type, at the bottom of a panel. */
  _everyScreen(inner) { return inner ? `<div class="plce-divlbl"><span><b>Every screen</b></span></div>${inner}` : ''; }
  /** A row's Source as a chip ("Source: Plex Center ▾") that opens its options. */
  _srcChip(id) {
    const s = this._secS(id), t = secType(this._config, id), fn = (x) => this._hass.states[x]?.attributes?.friendly_name || x;
    const libs = (() => { const tv = this._conf?.tvs?.[0]; const l = this._conf?.libraries?.[tv?.user || '']; return Array.isArray(l) ? l : []; })();
    const label = t === 'recent' ? (s.source ? fn(s.source) : 'Plex Center')
      : t === 'upcoming' ? (s.source === 'arr' ? 'Sonarr / Radarr' : s.sensors?.length ? s.sensors.map(fn).join(', ') : 'Upcoming-media sensors')
        : t === 'plexhub' ? ([libs.find((l) => l.key === s.library)?.title || 'All libraries', (this._hubChoices?.[s.library || ''] || []).find((h) => h.id === s.hub)?.title || (s.hub ? s.hub : 'pick a row')].join(' · ')) : '';
    const open = this._open.has(`src:${id}`);
    return `<div class="plce-chiprow"><span class="plce-chiplbl">Source (this row, every screen)</span><button class="plce-pick src${open ? ' on' : ''}" data-srcopen="${esc(id)}">
      <ha-icon icon="mdi:database-outline"></ha-icon><span class="plce-src-n">${esc(label)}</span><ha-icon icon="mdi:chevron-${open ? 'up' : 'down'}"></ha-icon></button></div>
      ${open ? `<div class="plce-srcbox">${this._secStyleBody(id, 'source')}</div>` : ''}`;
  }

  /** Clear one section's settings on one screen type. what: 'row:<id>' or a kind (watching, continue, library, calendar). */
  _resetSection(what, sc) {
    const c = this._config, drop = (bag, k) => { if (c[bag]) { delete c[bag][k]; if (!Object.keys(c[bag]).length) delete c[bag]; } };
    if (what.startsWith('row:')) { const id = what.slice(4); drop('sec_styles', `${id}:${sc}`); drop('looks', `${id}:${sc}`); }
    else if (what === 'home') { delete c[`home_order_${sc}`]; delete c[`home_hidden_${sc}`]; }
    else { drop('looks', `${what}:${sc}`); if (what === 'library') delete c[`${sc}_view`]; }
  }
  /** Clear everything for one screen type: its device settings, Home order / visibility, and every section's profile. */
  _resetScreen(sc) {
    const c = this._config;
    for (const k of Object.keys(c)) if (k.startsWith(`${sc}_`) || k === `home_order_${sc}` || k === `home_hidden_${sc}`) delete c[k];
    for (const bag of ['looks', 'sec_styles']) {
      if (!c[bag]) continue;
      for (const k of Object.keys(c[bag])) if (k.endsWith(`:${sc}`)) delete c[bag][k];
      if (!Object.keys(c[bag]).length) delete c[bag];
    }
  }
  _visualSubs(kind) {
    return `${this._sub(`lk-lines:${kind}`, 'Text Lines', this._fieldsBody(kind))}${this._sub(`lk-vis:${kind}`, 'Content Visuals', this._lookBody(kind, 'visual'))}`;
  }

  /** Text Lines: each field's line (or Hidden), its order on the line, and its size / weight / colour. */
  _fieldsBody(kind) {
    const screen = this._eds(), own = this._config.looks?.[`${kind}:${screen}`] || {}, lay = fieldLayout(kind, own), fam = FIELD_SETS[fieldFamily(kind)];
    const K = (id, prop) => `look:${kind}:${screen}:fields.${id}.${prop}`, locked = this._fLock?.[kind] !== false, ord = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
    const sorted = [...fam].sort((a, b) => (lay[a[0]].hidden - lay[b[0]].hidden) || (lay[a[0]].line - lay[b[0]].line) || (lay[a[0]].pos - lay[b[0]].pos));
    const chips = sorted.map(([id, label]) => `<div class="plce-hchips${lay[id].hidden ? ' off' : ''}"><span class="plce-name">${esc(label)}</span>
      <span class="plce-chip pl-library">Line ${lay[id].line}</span><span class="plce-chip row">${ord[lay[id].pos - 1] || lay[id].pos}</span>${
      lay[id].px ? `<span class="plce-chip al">${lay[id].px}px</span>` : ''}${lay[id].hidden ? '<span class="plce-chip off"><ha-icon icon="mdi:eye-off"></ha-icon>Hidden</span>' : ''}</div>`).join('');
    const weights = [['', 'Line default'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semi-bold'], ['700', 'Bold'], ['800', 'Extra bold']];
    const opt = (cur, list) => list.map(([v, n]) => `<option value="${v}"${String(cur ?? '') === String(v) ? ' selected' : ''}>${n}</option>`).join('');
    const rows = sorted.map(([id, label]) => { const off = lay[id].hidden, dis = off ? ' disabled' : ''; return `<div class="plce-item${off ? ' off' : ''}"><div class="plce-item-h"><span class="plce-name">${esc(label)}</span>
        <label class="plce-check plce-hide"><input type="checkbox" data-fldhide="${esc(K(id, 'hidden'))}"${off ? ' checked' : ''}>Hidden</label></div>
      <div class="plce-row plce-wrap"><select data-fld="${esc(K(id, 'line'))}"${dis}>${opt(lay[id].line, [[1, 'Line 1'], [2, 'Line 2'], [3, 'Line 3'], [4, 'Line 4'], [5, 'Line 5']])}</select>
        <select data-fld="${esc(K(id, 'pos'))}"${dis}>${opt(lay[id].pos, ord.map((n, i) => [i + 1, n]))}</select>
        <select data-fld="${esc(K(id, 'weight'))}"${dis}>${opt(lay[id].weight, weights)}</select></div>
      ${!off ? `<div class="plce-row plce-nowrap"><label class="lbl">Size</label><input type="range" data-fldr="${esc(K(id, 'px'))}" min="8" max="40" step="1" value="${Number(lay[id].px || (lay[id].line === 1 ? 15 : 12))}">
        <span class="plce-val" data-fldv="${esc(K(id, 'px'))}">${lay[id].px ? `${lay[id].px}px` : 'line'}</span>${lay[id].px ? `<button class="plce-reset" data-fldclr="${esc(K(id, 'px'))}" title="Line size"><ha-icon icon="mdi:restore"></ha-icon></button>` : ''}</div>
        ${this._colorControl(K(id, 'color'), ['Colour', 'Line colour', '#bbbbbb'])}` : ''}</div>`; }).join('');
    const tpl = fieldFamily(kind) === 'row' && !own.fields;
    return `${tpl ? '<p class="plce-hint">This row shows its current lines (Appearance → Row text) until you change one of these.</p>' : ''}
      <div class="plce-lockbar"><button class="plce-lock${locked ? '' : ' open'}" data-flock="${esc(kind)}"><ha-icon icon="mdi:${locked ? 'lock' : 'lock-open-variant'}"></ha-icon>${locked ? 'Unlock to edit' : 'Editing: lock'}</button>
        ${own.fields || LINE_IDS.some((x) => own[`${x}_show`] !== undefined || own[`${x}_px`] !== undefined) ? `<button class="plce-chip reset" data-fldreset="${esc(`${kind}:${screen}`)}"><ha-icon icon="mdi:restore"></ha-icon>Reset to defaults</button>` : ''}</div>
      ${locked ? `<div class="plce-hlist">${chips}</div>` : `<div class="plce-list">${rows}</div>`}
      <p class="plce-hint">Fields on the same line are joined with “ · ”; empty ones are left out.</p>`;
  }

  /** Watching now: what it shows (every screen), and its look per screen. */
  _watchBody() {
    return `${this._profile(this._visualSubs('watching'), 'watching')}
      ${this._everyScreen(`<p class="plce-hint">Tap a Watching now card to open that TV's controls (full screen on phones).</p>
        ${this._select('watching_tvs', 'Show', [['all', 'Every TV (and other Plex players)'], ['selected', 'Only the TV in the selector']])}
        ${this._check('watching_apps', 'Include TVs playing other apps (HBO Max, Netflix …), from the TV itself')}
        <div class="plce-group">When a TV is turned off</div>
        ${this._chips('watching_resume', 'What was playing', [['keep', 'Keep it, to resume later'], ['drop', 'Drop it']])}
        ${this._c('watching_resume') === 'drop' ? '' : `${this._slider('watching_forget_h', 'Forget after', 0, 48, ' h')}<p class="plce-hint">0 = never. Resume turns the TV on and starts the title where it was paused.</p>
          ${this._check('watching_resume_apps', 'Keep other apps too (HBO Max, Netflix …): Resume opens the app and presses Play, best effort')}`}
        ${this._watchPages()}
        ${this._check('np_power', 'Power button on the Now playing poster (asks before turning the TV off)')}`)}`;
  }
  /** Watching now per page: Show on page, Collapsible, Start collapsed. */
  _watchPages() {
    const pages = [['home', 'Home'], ['cal', 'Calendar'], ['lib', 'Library']];
    const col = (label, key, on = () => true) => `<div class="plce-group">${label}</div><div class="plce-checkrow">${pages.map(([pg, name]) => (on(pg)
      ? this._check(`${key}${pg}`, name) : '')).join('')}</div>`;
    return `${col('Show on page', 'watching_')}
      ${col('Collapsible (tap the header to fold it away)', 'watching_coll_', (pg) => this._c(`watching_${pg}`))}
      ${pages.some(([pg]) => this._c(`watching_${pg}`) && this._c(`watching_coll_${pg}`)) ? col('Start collapsed', 'watching_collapsed_', (pg) => this._c(`watching_${pg}`) && this._c(`watching_coll_${pg}`)) : ''}
      <div class="plce-group">Header</div>
      ${this._check('watching_icon', 'Show the header icon')}
      ${pages.some(([pg]) => this._c(`watching_${pg}`) && this._c(`watching_coll_${pg}`)) ? `${this._check('watching_chevron', 'Show the chevron (collapsible pages)')}
        ${this._c('watching_chevron') ? `${this._chips('watching_chevron_pos', 'Chevron', [['left', 'Left of the header text'], ['right', 'Right of the text'], ['count', 'After the count'], ['end', 'Far right']])}
          ${this._slider('watching_chevron_px', 'Chevron size', 0, 48, 'px')}<p class="plce-hint">0 = a little larger than the header text.</p>
          ${this._chips('watching_chevron_weight', 'Chevron weight', [['', 'Header text'], ['300', 'Light'], ['400', 'Normal'], ['700', 'Bold'], ['900', 'Heavy']])}` : ''}` : ''}
      <p class="plce-hint">Home also follows the Home order (the eye in Home layout). The header's <b>Watching now</b> chip (Controls layout) opens the cards in a popover on any page.</p>`;
  }
  /** Library: which libraries and in what order, how they behave, and per screen how the grid looks. */
  _libraryPanel() {
    const sc = this._eds();
    return `${this._profile(`${this._select(`${sc}_view`, 'Libraries show', [['grid', 'A poster grid'], ['list', 'A list (poster, title, details)']])}${this._visualSubs('library')}`, 'library')}
      ${this._everyScreen(this._libraryBody())}`;
  }

  /** A small dialog asking for a name; onSave(name, useNow). useScreen: offer "use it on the screen in the preview". */
  _nameDialog(title, hint, initial, onSave, useScreen = null) {
    this.querySelector('dialog.plce-dlg')?.remove();
    const scName = useScreen ? (SCREENS.find(([sc]) => sc === useScreen) || [])[1] : '';
    this.insertAdjacentHTML('beforeend', `<dialog class="plce-dlg"><style>dialog.plce-dlg::backdrop { background: rgba(0,0,0,.55); }</style><div class="plce-dlg-in">
      <div class="plce-dlg-h">${esc(title)}</div>${hint ? `<p class="plce-hint">${esc(hint)}</p>` : ''}
      <input class="plce-dlg-name" type="text" maxlength="60" value="${esc(initial)}" placeholder="Name">
      ${scName ? `<label class="plce-check"><input type="checkbox" data-dusenow checked>Use it on ${esc(scName)} (the screen in the preview)</label>` : ''}
      <div class="plce-dlg-msg"></div><div class="plce-dlg-b"><button class="plce-btn main" data-dsave>Save</button><button class="plce-btn" data-dclose>Cancel</button></div></div></dialog>`);
    const dlg = this.querySelector('dialog.plce-dlg'), name = dlg.querySelector('input.plce-dlg-name');
    const close = () => { try { dlg.close(); } catch { /* */ } dlg.remove(); };
    dlg.addEventListener('cancel', close); dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.querySelector('[data-dclose]').addEventListener('click', close);
    const save = () => {
      const n = name.value.trim();
      if (!n) { dlg.querySelector('.plce-dlg-msg').textContent = 'Give it a name.'; return; }
      const useNow = !!dlg.querySelector('[data-dusenow]')?.checked;
      close(); onSave(n, useNow);
    };
    dlg.querySelector('[data-dsave]').addEventListener('click', save);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    name.focus(); name.select?.();
  }

  /** Text export / import (design guide: native dialog, visible textarea, copy / paste with fallbacks). onImport(text) may throw. */
  _textDialog(title, hint, text, onImport = null) {
    this.querySelector('dialog.plce-dlg')?.remove();
    const imp = !!onImport;
    this.insertAdjacentHTML('beforeend', `<dialog class="plce-dlg"><style>dialog.plce-dlg::backdrop { background: rgba(0,0,0,.55); }</style>
      <div class="plce-dlg-in"><div class="plce-dlg-h">${esc(title)}</div><p class="plce-hint">${esc(hint)}</p>
      <textarea class="plce-dlg-t" spellcheck="false"${imp ? ' placeholder="Paste it here"' : ' readonly'}>${esc(text)}</textarea><div class="plce-dlg-msg"></div>
      <div class="plce-dlg-b">${imp ? '<button class="plce-btn" data-dpaste>Paste from clipboard</button><button class="plce-btn main" data-dimport>Import</button>' : '<button class="plce-btn" data-dcopy>Copy to clipboard</button>'}
        <button class="plce-btn" data-dclose>Close</button></div></div></dialog>`);
    const dlg = this.querySelector('dialog.plce-dlg'), ta = dlg.querySelector('textarea'), msg = (t, bad) => { const m = dlg.querySelector('.plce-dlg-msg'); m.textContent = t; m.classList.toggle('bad', !!bad); };
    const close = () => { try { dlg.close(); } catch { /* */ } dlg.remove(); };
    dlg.addEventListener('cancel', close); dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.querySelector('[data-dclose]').addEventListener('click', close);
    dlg.querySelector('[data-dcopy]')?.addEventListener('click', async (e) => {
      ta.focus(); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      if (!ok) { try { await navigator.clipboard.writeText(ta.value); ok = true; } catch { ok = false; } }
      e.target.textContent = ok ? 'Copied ✓' : 'Press Ctrl/Cmd+C';
    });
    dlg.querySelector('[data-dpaste]')?.addEventListener('click', async () => { try { ta.value = await navigator.clipboard.readText(); msg(''); } catch { ta.focus(); msg('Paste with Ctrl/Cmd+V.'); } });
    dlg.querySelector('[data-dimport]')?.addEventListener('click', () => { try { onImport(ta.value); close(); } catch (err) { msg(err.message, true); } });
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    ta.focus(); if (!imp) ta.select();
  }

  /** Save the current look as a preset of this card (asks for a name). */
  _savePresetDialog() {
    this.querySelector('dialog.plce-dlg')?.remove();
    this.insertAdjacentHTML('beforeend', `<dialog class="plce-dlg"><style>dialog.plce-dlg::backdrop { background: rgba(0,0,0,.55); }</style><div class="plce-dlg-in">
      <div class="plce-dlg-h">Save as a new preset</div><p class="plce-hint">Saves how the page buttons look now (the preset and every ticked group) as a preset of this card.</p>
      <input class="plce-dlg-name" type="text" maxlength="60" placeholder="Name, e.g. Glowtie"><div class="plce-dlg-msg"></div>
      <div class="plce-dlg-b"><button class="plce-btn main" data-dsave>Save</button><button class="plce-btn" data-dclose>Cancel</button></div></div></dialog>`);
    const dlg = this.querySelector('dialog.plce-dlg'), name = dlg.querySelector('input');
    const close = () => { try { dlg.close(); } catch { /* */ } dlg.remove(); };
    dlg.addEventListener('cancel', close); dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.querySelector('[data-dclose]').addEventListener('click', close);
    const save = () => {
      const n = name.value.trim();
      if (!n) { dlg.querySelector('.plce-dlg-msg').textContent = 'Give it a name.'; return; }
      const presets = { ...(this._config.page_presets || {}) };
      let id = n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'preset';
      for (let i = 2; presets[id]; i++) id = `${id.replace(/_\d+$/, '')}_${i}`;
      presets[id] = { name: n, ...flatPageStyle(this._config) };
      this._config.page_presets = presets;
      for (const k of PAGE_ALL) delete this._config[k];
      delete this._config.page_groups;
      this._config.page_style = `custom:${id}`;
      this._emit(); this._render(); close();
    };
    dlg.querySelector('[data-dsave]').addEventListener('click', save);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    name.focus();
  }

  /** Export / import dialog (design guide: native <dialog> in the top layer, a visible textarea, copy / paste with fallbacks). */
  _styleDialog(mode) {
    this.querySelector('dialog.plce-dlg')?.remove();
    const exp = mode === 'export', text = exp ? JSON.stringify(exportPageStyle(this._config), null, 2) : '';
    this.insertAdjacentHTML('beforeend', `<dialog class="plce-dlg"><style>dialog.plce-dlg::backdrop { background: rgba(0,0,0,.55); }</style>
      <div class="plce-dlg-in"><div class="plce-dlg-h">${exp ? 'Export page button style' : 'Import page button style'}</div>
      <p class="plce-hint">${exp ? 'Copy this text to use the same style on another Plex Center card. Page icons are not included.'
        : 'Paste a Plex Center page style, or a <b>Color Light Manager Button Style</b> (its export): its background, borders, gradient, glow, shadow, text, icon and size become the page button settings. This replaces the current style; page icons stay.'}</p>
      <textarea class="plce-dlg-t" spellcheck="false"${exp ? ' readonly' : ' placeholder="Paste the style here"'}>${esc(text)}</textarea><div class="plce-dlg-msg"></div>
      <div class="plce-dlg-b">${exp ? '<button class="plce-btn" data-dcopy>Copy to clipboard</button>' : '<button class="plce-btn" data-dpaste>Paste from clipboard</button><button class="plce-btn main" data-dimport>Import</button>'}
        <button class="plce-btn" data-dclose>Close</button></div></div></dialog>`);
    const dlg = this.querySelector('dialog.plce-dlg'), ta = dlg.querySelector('textarea'), msg = (t, bad) => { const m = dlg.querySelector('.plce-dlg-msg'); m.textContent = t; m.classList.toggle('bad', !!bad); };
    const close = () => { try { dlg.close(); } catch { /* */ } dlg.remove(); };
    dlg.addEventListener('cancel', close);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.querySelector('[data-dclose]').addEventListener('click', close);
    dlg.querySelector('[data-dcopy]')?.addEventListener('click', async (e) => {
      ta.focus(); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      if (!ok) { try { await navigator.clipboard.writeText(ta.value); ok = true; } catch { ok = false; } }
      e.target.textContent = ok ? 'Copied ✓' : 'Press Ctrl/Cmd+C';
    });
    dlg.querySelector('[data-dpaste]')?.addEventListener('click', async () => {
      try { ta.value = await navigator.clipboard.readText(); msg(''); } catch { ta.focus(); msg('Paste with Ctrl/Cmd+V.'); }
    });
    dlg.querySelector('[data-dimport]')?.addEventListener('click', () => {
      let st;
      try { st = importPageStyle(ta.value); } catch (err) { msg(err.message, true); return; }
      for (const k of PAGE_ALL) delete this._config[k];
      delete this._config.page_groups; delete this._config.page_style;
      Object.assign(this._config, st);
      this._open.add('ap-page');
      this._emit(); this._render();
      close();
    });
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    if (exp) { ta.focus(); ta.select(); } else ta.focus();
  }

  /** Appearance → Page menu: like the Style Builder. A preset, then groups: tick a group to set its values, untick to use the preset's. */
  _pageBody() {
    const pl = pageLook(this._config), groups = new Set(this._config.page_groups || []);
    const chk = (k, label) => `<label class="plce-check"><input type="checkbox" data-key="${k}"${pl[k] ? ' checked' : ''}>${label}</label>`;
    const sel = (k, label, opts) => `<div class="plce-row"><label class="lbl">${label}</label><select data-key="${k}">${opts.map(([v, n]) => `<option value="${v}"${String(pl[k]) === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`;
    const sl = (k, label, min, max, unit = 'px') => `<div class="plce-row plce-nowrap"><label class="lbl">${label}</label><input type="range" data-skey="${k}" data-unit="${unit}" min="${min}" max="${max}" step="1" value="${Number(pl[k])}">
      <span class="plce-val" data-val="${k}">${Number(pl[k])}${unit}</span></div>`;
    const sub = (t) => `<div class="plce-pg-sub">${t}</div>`;
    const bodies = {
      content: () => `${chk('page_show_icon', 'Show icons')}${chk('page_show_label', 'Show names')}${sel('page_icon_pos', 'Icon', [['above', 'Above the name'], ['beside', 'Beside the name']])}`,
      background: () => `${this._colorControl('page_active_bg')}${this._colorControl('page_bg')}`,
      border: () => `${sl('page_border_width', 'Width', 0, 6)}${pl.page_border_width ? `${this._colorControl('page_active_border_color')}${this._colorControl('page_border_color')}` : ''}
        ${chk('page_underline', 'Underline the active page (in its Active border color, else the Accent)')}`,
      gradient: () => `${chk('page_grad', 'Gradient lines (fade in and out along the edge)')}${pl.page_grad ? `${sel('page_grad_sides', 'Edges', [['top_bottom', 'Top and bottom'], ['bottom', 'Bottom'], ['top', 'Top'], ['all', 'All four']])}
        ${sl('page_grad_width', 'Width', 1, 6)}${this._colorControl('page_active_grad_color')}${this._colorControl('page_grad_color')}` : ''}`,
      glow: () => `${sel('page_glow', 'Glow', [['off', 'Off'], ['active', 'Active page only'], ['always', 'Every page']])}${pl.page_glow !== 'off' ? `${this._colorControl('page_glow_color')}
        ${sl('page_glow_blur', 'Blur', 0, 40)}${sl('page_glow_spread', 'Spread', 0, 16)}${sl('page_glow_opacity', 'Opacity', 0, 100, '%')}` : ''}`,
      shadow: () => `${chk('page_shadow', 'Drop shadow')}${pl.page_shadow ? `${this._colorControl('page_shadow_color')}${sl('page_shadow_x', 'X', -20, 20)}${sl('page_shadow_y', 'Y', -20, 20)}
        ${sl('page_shadow_blur', 'Blur', 0, 40)}${sl('page_shadow_spread', 'Spread', -10, 20)}${sl('page_shadow_opacity', 'Opacity', 0, 100, '%')}` : ''}`,
      text: () => `${sl('page_text_px', 'Size', 8, 28)}${sel('page_weight', 'Weight', [['400', 'Regular'], ['500', 'Medium'], ['600', 'Semi-bold'], ['700', 'Bold'], ['800', 'Extra bold']])}
        ${sub('Color')}${this._colorControl('page_active_text_color')}${this._colorControl('page_text_color')}`,
      icon: () => `${sl('page_icon_px', 'Size', 12, 40)}${sub('Color')}${this._colorControl('page_active_icon_color')}${this._colorControl('page_icon_color')}`,
      shape: () => `${sl('page_radius', 'Corner radius', 0, 40)}${sl('page_height', 'Height', 24, 80)}${sl('page_gap', 'Space between', 0, 24)}`,
    };
    const tv = (this._conf?.tvs || []).find((t) => t.id === this._config.default_tv) || this._conf?.tvs?.[0];
    const libs = Array.isArray(this._conf?.libraries?.[tv?.user || '']) ? this._conf.libraries[tv.user || ''] : [];
    const pages = tabOrder(this._config, libs, this._calAvail());
    const shown = SHOWN.screen, shownName = (SCREENS.find(([sc]) => sc === shown) || [])[1];
    const warn = shown && cfg(this._config, `${shown}_tabs`) !== 'tabs'
      ? `<p class="plce-hint plce-warn">The preview shows <b>${esc(shownName)}</b>, where the page menu is a ${cfg(this._config, `${shown}_tabs`) === 'button' ? 'icon button' : 'chip'}: these styles show
        where a screen's <i>Page menu</i> is <b>Buttons</b> (Screens → ${esc(shownName)}).</p>` : '';
    const saved = Object.entries(this._config.page_presets || {}), cur = savedPreset(this._config);
    const presetOpts = [...Object.entries(PAGE_PRESETS).map(([k, pr]) => [k, pr.name]), ...saved.map(([id, sp]) => [`custom:${id}`, `★ ${sp.name}`])];
    return `${warn}
      <p class="plce-hint">The page buttons (Page menu: Buttons, in the header or footer); the preview shows changes as you make them. Pick a preset; tick a
        group to set its own values, untick it to use the preset's. Colors left at <i>The preset</i> follow your theme and the Accent.</p>
      ${this._select('page_style', 'Preset', presetOpts)}
      <div class="plce-row"><button class="plce-add" data-pmsave><ha-icon icon="mdi:content-save-plus-outline"></ha-icon>Save as new preset</button>
        ${cur && groups.size ? `<button class="plce-add" data-pmupdate><ha-icon icon="mdi:content-save-edit-outline"></ha-icon>Update “${esc(cur.name)}”</button>` : ''}
        ${cur ? `<button class="plce-add plce-del" data-pmdelete><ha-icon icon="mdi:trash-can-outline"></ha-icon>Delete “${esc(cur.name)}”</button>` : ''}</div>
      <div class="plce-row"><button class="plce-add" data-pmexport><ha-icon icon="mdi:export"></ha-icon>Export style</button>
        <button class="plce-add" data-pmimport><ha-icon icon="mdi:import"></ha-icon>Import style</button></div>
      ${groups.size ? '<button class="plce-add" data-pmreset>Back to the preset (keeps the page icons)</button>' : ''}
      ${this._sub('pg-icons', 'Page icons', pages.map((t) => `<div class="plce-row"><label class="lbl">${esc(t.title)}</label><plce-icon-pick data-pageicon="${esc(t.id)}" value="${esc((this._config.page_icons || {})[t.id] || '')}" placeholder="${esc(tabIcon(t))}"></plce-icon-pick></div>`).join('')
        || '<p class="plce-hint">The pages appear here once Plex Center is connected.</p>')}
      <div class="plce-pgs">${PAGE_GROUPS.map(([g, title]) => {
        const on = groups.has(g), id = `pg-${g}`;
        return `<div class="plce-pg${on ? ' on' : ''}"><input type="checkbox" data-pgroup="${g}"${on ? ' checked' : ''} title="${on ? 'Use the preset for this group' : 'Set this group'}">
          ${on ? `<details class="plce-pgd" data-panel="${id}"${this._open.has(id) ? ' open' : ''}><summary><span class="plce-pg-t">${title}</span><ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></summary>
            <div class="plce-pg-body">${bodies[g]()}</div></details>` : `<span class="plce-pg-t">${title}</span>`}</div>`;
      }).join('')}</div>`;
  }

  _styleBody() {
    const px = (k, label, min, max) => this._slider(k, label, min, max);
    return `${this._sub('ap-card', 'Card', `${this._colorControl('card_bg')}
        ${this._slider('card_border_width', 'Border width', 0, 8)}${this._colorControl('card_border_color')}
        ${this._slider('card_radius', 'Corner radius', 0, 32)}
        ${this._select('card_shadow', 'Shadow', [['theme', 'Theme default'], ['none', 'None'], ['soft', 'Soft'], ['strong', 'Strong']])}
        ${this._slider('card_padding', 'Padding', 0, 32)}`)}
      ${this._sub('ap-posters', 'Posters &amp; rows', `<p class="plce-hint">Poster, Fanart or Fanart fade is set per section, in its Visuals.</p>
        ${this._slider('corner_radius', 'Poster corner radius', 0, 24)}
        ${this._check('box_shadows', 'Poster shadows')}${this._check('flag', '"New" flag on unwatched items')}`)}
      ${this._sub('ap-text', 'Text', `${px('header_size', 'Card title', 10, 40)}${px('section_size', 'Section headings', 8, 24)}
        ${px('title_size', 'Poster titles', 8, 28)}${px('line_size', 'Poster lines', 8, 24)}${this._check('text_shadows', 'Text shadows')}`)}
      ${this._sub('ap-colors', 'Colors', Object.keys(COLOR_DEFS).filter((k) => !k.startsWith('card_') && !k.startsWith('page_')).map((k) => this._colorControl(k)).join(''))}
      ${this._sub('ap-page', 'Page menu', this._pageBody())}

      ${this._sub('ap-rowtext', 'Row text (upcoming-media rows)', `<p class="plce-hint">Keywords: <code>$title $episode $number $se $type $release $date $day $time $aired $runtime $rating $genres $studio $empty</code>.
        A part between <code>-</code> whose keyword is empty is left out. Blank = the sensor's default.</p>
        ${['title_text', 'line1_text', 'line2_text', 'line3_text', 'line4_text', 'line5_text'].map((k, i) => this._text(k, i ? `Line ${i}` : 'Title')).join('')}
        ${this._text('date', 'Date format', 'mm/dd')}${this._select('clock', 'Clock', [['12', '12-hour'], ['24', '24-hour']])}`)}`;
  }

  _integrationsBody() {
    const found = new Set(this._conf?.integrations || []);
    return `<p class="plce-hint">What Home Assistant has, and what Plex Center does with it.</p>
      <div class="plce-list">${Object.entries(INTEGRATION_USES).map(([k, [name, use]]) => `<div class="plce-item"><div class="plce-item-h">
        <ha-icon icon="${found.has(k) ? 'mdi:check-circle' : 'mdi:circle-outline'}"></ha-icon><span class="plce-name">${esc(name)}</span>
        <span class="plce-badge">${found.has(k) ? 'found' : 'not installed'}</span></div><p class="plce-hint" style="margin:0">${esc(use)}</p></div>`).join('')}</div>
      ${this._conf ? `<p class="plce-hint">Plex Center ${esc(this._conf.version)} · card ${BUILD_NUMBER}</p>` : ''}`;
  }

  _render() {
    if (!this._hass) { this.innerHTML = ''; return; }
    this.innerHTML = `<style>${EDITOR_CSS}</style><div class="plce">
      <div class="plce-gh first">Card</div>
      ${this._panel('layout', 'mdi:responsive', 'Screens', this._layoutBody())}
      ${this._panel('header', 'mdi:page-layout-header-footer', 'Controls layout', this._headerBody())}
      ${this._panel('home', 'mdi:home-variant', 'Home', this._homeBody())}
      <div class="plce-gh">Sections</div>
      <div class="plce-row plce-wrap plce-addrow"><button class="plce-add" data-xadd="recent">+ Recently Added</button><button class="plce-add" data-xadd="upcoming">+ Coming Soon</button><button class="plce-add" data-xadd="plexhub">+ Plex row</button></div>
      ${this._panel('sec-watching', 'mdi:account-eye', 'Watching now', this._watchBody())}
      ${this._panel('sec-continue', 'mdi:play-pause', 'Continue watching', `${this._profile(`${this._secStyleBody('continue', 'visual')}${this._secStyleBody('continue', 'rest')}`, 'row:continue')}
        ${this._everyScreen(`${this._slider('watched_pct', 'Counts as watched at', 50, 100, ' %')}<p class="plce-hint">An episode or movie watched this far leaves Continue watching; for a show, the episode after it moves to <b>Next Episode</b>. Continue watching shows each show's latest episode in progress.</p>`)}`)}
      ${this._panel('sec-next', 'mdi:skip-next-circle-outline', 'Next Episode', `${this._profile(`${this._secStyleBody('next', 'visual')}${this._secStyleBody('next', 'rest')}`, 'row:next')}
        ${this._everyScreen('<p class="plce-hint">For each show you are watching, the next episode you haven\'t started (it is in Plex, so it isn\'t in Coming Soon). Shows with an episode in progress are in Continue watching instead.</p>')}`)}
      ${this._rowPanels()}
      ${this._panel('library', 'mdi:bookshelf', 'Library', this._libraryPanel())}
      ${this._panel('calendar', 'mdi:calendar-month', 'Calendar', this._calendarBody())}
      ${this._panel('style', 'mdi:palette', 'Appearance', this._styleBody())}
      <div class="plce-gh">Apps &amp; devices</div>
      ${this._panel('tvs', 'mdi:television-play', 'TVs', this._tvsBody())}
      ${this._panel('integrations', 'mdi:puzzle', 'Integrations found', this._integrationsBody())}
      <div class="plce-foot">Plex Center Card (Ltek) ${BUILD_NUMBER}</div></div>`;
    this._rendered = true;
    this._wire();
  }

  _wire() {
    const all = (sel, fn) => this.querySelectorAll(sel).forEach(fn);
    all('details.plce-sec', (d) => d.addEventListener('toggle', () => {
      if (d.open) {
        this.querySelectorAll('details.plce-sec[open]').forEach((o) => { if (o !== d) { o.open = false; this._open.delete(o.dataset.panel); } });
        this._open.add(d.dataset.panel);
        if (d.dataset.panel === 'header' && SHOWN.screen) {   // edit the layout the preview is using
          const k = layoutKeyFor(this._config, SHOWN.screen), want = k.startsWith('lay:') ? k : null;
          if ((this._hdrFor || null) !== want) { this._hdrFor = want; this._render(); }
        }
      } else this._open.delete(d.dataset.panel);
    }));
    all('details.plce-sub', (d) => d.addEventListener('toggle', () => { if (d.open) this._open.add(d.dataset.panel); else this._open.delete(d.dataset.panel); }));
    const order = () => homeOrder(this._homeCfg());
    const move = (i, dir) => { const o = order(); const j = i + dir; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; this._config[`home_order_${this._homeScreen()}`] = o; this._emit(); this._render(); };

    all('[data-hup]', (b) => b.addEventListener('click', () => move(Number(b.dataset.hup), -1)));
    all('[data-hdown]', (b) => b.addEventListener('click', () => move(Number(b.dataset.hdown), 1)));
    all('[data-hvis]', (b) => b.addEventListener('click', () => {
      const k = `home_hidden_${this._homeScreen()}`, id = b.dataset.hvis, h = new Set(this._config[k] || []);
      if (h.has(id)) h.delete(id); else h.add(id);
      this._config[k] = [...h]; this._emit(); this._render();
    }));
    all('[data-key]', (el) => el.addEventListener('change', () => {
      const k = el.dataset.key;
      this._set(k, el.type === 'checkbox' ? el.checked : el.value.trim());
      if (REVEAL_KEYS.has(k)) this._render();
    }));
    all('[data-skey]', (el) => {
      const k = el.dataset.skey, unit = el.dataset.unit;
      el.addEventListener('input', () => { const o = this.querySelector(`[data-val="${k}"]`); if (o) o.textContent = `${el.value}${unit}`; });
      el.addEventListener('change', () => { this._set(k, Number(el.value)); this._render(); });
    });
    all('[data-reset]', (b) => b.addEventListener('click', () => { this._set(b.dataset.reset, ''); this._render(); }));
    const hl = () => layoutItems(this._config, this._editKey());
    const putH = (list) => {
      const k = this._editKey();
      if (k === 'main') this._config.header = list;
      else this._config.layouts = { ...this._config.layouts, [k.slice(4)]: { ...this._config.layouts[k.slice(4)], items: list } };
      this._emit(); this._render();
    };
    all('[data-hdrpick]', (b) => b.addEventListener('click', () => { this._hdrFor = b.dataset.hdrpick === 'main' ? null : b.dataset.hdrpick; this._render(); }));
    const newLayout = (name, base, items) => {
      const layouts = { ...(this._config.layouts || {}) };
      let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'layout';
      for (let i = 2; layouts[id]; i++) id = `${id.replace(/_\d+$/, '')}_${i}`;
      layouts[id] = { name, base, items: items.map((h) => ({ ...h })) };
      this._config.layouts = layouts;
      return id;
    };
    all('[data-laysave]', (b) => b.addEventListener('click', () => {
      const k = this._editKey(), cur = k === 'main' ? null : this._config.layouts[k.slice(4)];
      this._nameDialog('Save as a new layout', 'Saves the list you are editing under a name. Pick it for any screen in Screens → Controls layout to use.',
        cur ? `${cur.name} copy` : '', (name, useNow) => {
          const id = newLayout(name, cur?.base || 'standard', hl());
          if (useNow && SHOWN.screen) this._config[`${SHOWN.screen}_header`] = `lay:${id}`;
          this._hdrFor = `lay:${id}`; this._emit(); this._render();
        }, SHOWN.screen);
    }));
    all('[data-laycompact]', (b) => b.addEventListener('click', () => {
      this._nameDialog('Copy Compact one row', 'Saves the built-in compact layout as a new layout you can change.', 'Compact copy', (name, useNow) => {
        const id = newLayout(name, 'compact', layoutItems(this._config, 'one_row'));
        if (useNow && SHOWN.screen) this._config[`${SHOWN.screen}_header`] = `lay:${id}`;
        this._hdrFor = `lay:${id}`; this._emit(); this._render();
      }, SHOWN.screen);
    }));
    all('[data-layrename]', (b) => b.addEventListener('click', () => {
      const id = this._editKey().slice(4), l = this._config.layouts[id];
      this._nameDialog('Rename layout', '', l.name, (name) => { this._config.layouts = { ...this._config.layouts, [id]: { ...l, name } }; this._emit(); this._render(); });
    }));
    all('[data-laydelete]', (b) => b.addEventListener('click', () => {
      const id = this._editKey().slice(4), l = this._config.layouts[id];
      if (!window.confirm(`Delete the layout “${l.name}”? Screens using it go back to Standard.`)) return;
      const layouts = { ...this._config.layouts }; delete layouts[id]; this._config.layouts = layouts;
      for (const [sc] of SCREENS) if (this._config[`${sc}_header`] === `lay:${id}`) delete this._config[`${sc}_header`];
      this._hdrFor = null; this._emit(); this._render();
    }));
    all('[data-layexport]', (b) => b.addEventListener('click', () => {
      const k = this._editKey(), l = k === 'main' ? { name: 'Standard', base: 'standard' } : this._config.layouts[k.slice(4)];
      this._textDialog('Export controls layout', 'Copy this text to use the same layout on another Plex Center card.',
        JSON.stringify({ kind: 'plex-center/controls-layout', v: 1, name: l.name, base: l.base, items: hl() }, null, 2));
    }));
    all('[data-layimport]', (b) => b.addEventListener('click', () => {
      this._textDialog('Import controls layout', 'Paste a Plex Center controls layout. It is added as a new saved layout (nothing is replaced).', '', (text) => {
        let o; try { o = JSON.parse(text); } catch { throw new Error('That isn\'t valid JSON.'); }
        if (o?.kind !== 'plex-center/controls-layout' || !Array.isArray(o.items)) throw new Error('Not a Plex Center controls layout.');
        const id = newLayout(String(o.name || 'Imported').slice(0, 60), o.base === 'compact' ? 'compact' : 'standard', o.items);
        this._hdrFor = `lay:${id}`; this._emit(); this._render();
      });
    }));
    all('[data-pmreset]', (b) => b.addEventListener('click', () => {
      for (const k of PAGE_ALL) delete this._config[k];
      delete this._config.page_groups;
      this._emit(); this._render();
    }));
    all('[data-pmexport]', (b) => b.addEventListener('click', () => this._styleDialog('export')));
    all('[data-pmsave]', (b) => b.addEventListener('click', () => this._savePresetDialog()));
    all('[data-pmupdate]', (b) => b.addEventListener('click', () => {
      const id = String(this._config.page_style).slice(7), sp = this._config.page_presets?.[id];
      if (!sp) return;
      this._config.page_presets = { ...this._config.page_presets, [id]: { name: sp.name, ...flatPageStyle(this._config) } };
      for (const k of PAGE_ALL) delete this._config[k];
      delete this._config.page_groups;
      this._emit(); this._render();
    }));
    all('[data-pmdelete]', (b) => b.addEventListener('click', () => {
      const id = String(this._config.page_style).slice(7), sp = this._config.page_presets?.[id];
      if (!sp || !window.confirm(`Delete the preset “${sp.name}”? The page buttons keep their look.`)) return;
      const f = flatPageStyle(this._config), presets = { ...this._config.page_presets };
      delete presets[id];
      this._config.page_presets = presets;
      this._config.page_style = f.base; this._config.page_groups = f.groups; Object.assign(this._config, f.values);   // the look stays, as the card's own settings
      this._emit(); this._render();
    }));
    all('[data-pmimport]', (b) => b.addEventListener('click', () => this._styleDialog('import')));
    all('[data-pgroup]', (el) => el.addEventListener('change', () => {
      const g = el.dataset.pgroup, on = new Set(this._config.page_groups || []);
      if (el.checked) { on.add(g); this._open.add(`pg-${g}`); }
      else { on.delete(g); for (const k of (PAGE_GROUPS.find(([x]) => x === g) || [, , []])[2]) delete this._config[k]; }
      this._config.page_groups = [...on];
      this._emit(); this._render();
    }));
    all('details.plce-pgd', (d) => d.addEventListener('toggle', () => { if (d.open) this._open.add(d.dataset.panel); else this._open.delete(d.dataset.panel); }));
    all('plce-icon-pick[data-pageicon]', (el) => el.addEventListener('value-changed', (e) => {
      const icons = { ...(this._config.page_icons || {}) }, v = (e.detail?.value || '').trim();
      if (v) icons[el.dataset.pageicon] = v; else delete icons[el.dataset.pageicon];
      this._config.page_icons = icons; this._emit();
    }));
    const scName = () => (SCREENS.find(([x]) => x === this._eds()) || [, ''])[1];
    all('[data-secreset]', (b) => b.addEventListener('click', () => {
      if (!window.confirm(`Reset this section on ${scName()} to its built-in settings? Other screen types keep theirs.`)) return;
      this._resetSection(b.dataset.secreset, this._eds()); this._emit(); this._render();
    }));
    all('[data-scrreset]', (b) => b.addEventListener('click', () => {
      if (!window.confirm(`Reset everything for ${scName()}: its screen settings, Home order and visible sections, and every section's settings on this screen? Sources and the other screen types are kept.`)) return;
      this._resetScreen(this._eds()); this._emit(); this._render();
    }));
    all('[data-edscreen]', (b) => b.addEventListener('click', () => { this._edScreen = b.dataset.edscreen; this._render(); }));
    all('[data-flock]', (b) => b.addEventListener('click', () => { const k = b.dataset.flock; this._fLock = { ...(this._fLock || {}), [k]: this._fLock?.[k] === false }; this._render(); }));
    all('[data-fld]', (el) => el.addEventListener('change', () => { const prop = el.dataset.fld.split('.').pop(); this._setK(el.dataset.fld, prop === 'weight' ? el.value : Number(el.value)); this._render(); }));
    all('[data-fldhide]', (el) => el.addEventListener('change', () => { this._setK(el.dataset.fldhide, el.checked); this._render(); }));
    all('[data-fldr]', (el) => {
      el.addEventListener('input', () => { const v = this.querySelector(`[data-fldv="${CSS.escape(el.dataset.fldr)}"]`); if (v) v.textContent = `${el.value}px`; });
      el.addEventListener('change', () => { this._setK(el.dataset.fldr, Number(el.value)); this._render(); });
    });
    all('[data-fldclr]', (b) => b.addEventListener('click', () => { this._setK(b.dataset.fldclr, ''); this._render(); }));
    all('[data-fldreset]', (b) => b.addEventListener('click', () => {
      if (!window.confirm('Put these text lines back to the defaults for this screen?')) return;
      const lk = b.dataset.fldreset, looks = { ...(this._config.looks || {}) }, o = { ...(looks[lk] || {}) };
      delete o.fields; for (const x of LINE_IDS) for (const p2 of ['show', 'px', 'weight', 'color']) delete o[`${x}_${p2}`];
      looks[lk] = o; this._config.looks = looks; this._emit(); this._render();
    }));
    all('[data-chipk]', (b) => b.addEventListener('click', () => {
      const i = b.dataset.chipk.indexOf('|'); this._setK(b.dataset.chipk.slice(0, i), b.dataset.chipk.slice(i + 1)); this._render();
    }));
    all('[data-lookimg]', (b) => b.addEventListener('click', () => {
      const [k, v] = b.dataset.lookimg.split('|'); this._setK(k, v); this._render();
    }));
    all('[data-srcopen]', (b) => b.addEventListener('click', () => { const k = `src:${b.dataset.srcopen}`; if (this._open.has(k)) this._open.delete(k); else this._open.add(k); this._render(); }));
    all('[data-secpick]', (b) => b.addEventListener('click', () => { const [kind, id] = b.dataset.secpick.split('|'); this._secPick = { ...(this._secPick || {}), [kind]: id }; this._render(); }));
    all('[data-goto]', (b) => b.addEventListener('click', () => {
      const [panel, pick] = b.dataset.goto.split('|');
      if (pick) this._secPick = { ...(this._secPick || {}), [panel.slice(4)]: pick };
      for (const k of [...this._open]) if (!k.includes(':') && !k.startsWith('ly-') && !k.startsWith('ap-') && !k.startsWith('pg-')) this._open.delete(k);
      this._open.add(panel); this._render();
      this.querySelector(`details.plce-sec[data-panel="${panel}"]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }));
    all('[data-lookk]', (el) => el.addEventListener('change', () => {
      const k = el.dataset.lookk, f = k.split(':')[3];
      const v = el.type === 'checkbox' ? el.checked : el.value;
      this._setK(k, v === lookBase(k.split(':')[1])[f] ? '' : v); this._render();
    }));
    all('[data-lookr]', (el) => {
      el.addEventListener('input', () => { const v = this.querySelector(`[data-lookv="${CSS.escape(el.dataset.lookr)}"]`); if (v) v.textContent = `${el.value}${el.dataset.unit || 'px'}`; });
      el.addEventListener('change', () => { const f = el.dataset.lookr.split(':')[3], n = Number(el.value); this._setK(el.dataset.lookr, n === LOOK_BASE[f] ? '' : n); this._render(); });
    });
    all('[data-lookreset]', (b) => b.addEventListener('click', () => { this._setK(b.dataset.lookreset, ''); this._render(); }));
    all('[data-lookresetall]', (b) => b.addEventListener('click', () => {
      const looks = { ...(this._config.looks || {}) }; delete looks[b.dataset.lookresetall]; this._config.looks = looks; this._emit(); this._render();
    }));
    all('[data-hlock]', (b) => b.addEventListener('click', () => { this._hdrLocked = this._hdrLocked === false; this._render(); }));
    all('[data-hiup]', (b) => b.addEventListener('click', () => { const l = hl(), i = Number(b.dataset.hiup); [l[i - 1], l[i]] = [l[i], l[i - 1]]; putH(l); }));
    all('[data-hidown]', (b) => b.addEventListener('click', () => { const l = hl(), i = Number(b.dataset.hidown); [l[i + 1], l[i]] = [l[i], l[i + 1]]; putH(l); }));
    all('[data-hivis]', (b) => b.addEventListener('click', () => { const l = hl(), h = l[Number(b.dataset.hivis)]; if (h.hidden) delete h.hidden; else h.hidden = true; putH(l); }));
    all('[data-hk]', (el) => el.addEventListener('change', () => {
      const l = hl(), h = l[Number(el.dataset.hi)], k = el.dataset.hk;
      if (k === 'style' && ITEM_STYLES[h.id]?.[0][0] === el.value) delete h.style; else h[k] = k === 'row' ? Number(el.value) : el.value;
      putH(l);
    }));
    const tabIds = () => { const tv = (this._conf?.tvs || []).find((t) => t.id === this._config.default_tv) || this._conf?.tvs?.[0];
      const libs = Array.isArray(this._conf?.libraries?.[tv?.user || '']) ? this._conf.libraries[tv.user || ''] : [];
      const pick = this._config.libraries || [];
      return tabOrder(this._config, libs.filter((l) => !pick.length || pick.includes(l.title)), this._calAvail()).map((t) => t.id); };
    const moveTab = (i, d) => { const o = tabIds(); const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; this._config.tab_order = o; this._emit(); this._render(); };
    all('[data-tup]', (b) => b.addEventListener('click', () => moveTab(Number(b.dataset.tup), -1)));
    all('[data-tdown]', (b) => b.addEventListener('click', () => moveTab(Number(b.dataset.tdown), 1)));
    all('[data-treset]', (b) => b.addEventListener('click', () => { delete this._config.tab_order; this._emit(); this._render(); }));
    const setSec = (id, k, v) => {
      const shared = SEC_SHARED.has(k), bag = shared ? 'home_style' : 'sec_styles', key = shared ? id : `${id}:${this._eds()}`;
      const all2 = { ...(this._config[bag] || {}) }, o = { ...(all2[key] || {}) };
      if (v === '' || v === undefined || v === null) delete o[k]; else o[k] = v;
      all2[key] = o; this._config[bag] = all2; this._emit();
    };
    all('[data-spick]', (el) => el.addEventListener('click', () => {
      const [k, v] = el.dataset.spick.split('|'); setSec(el.dataset.sid, k, v); this._render();
    }));
    all('[data-sk]', (el) => el.addEventListener('change', () => {
      const k = el.dataset.sk; let v = el.value.trim();
      if (k === 'flag') v = v === '' ? '' : v === 'true';
      if (k === 'auto') setSec(el.dataset.sid, 'speed', '');
      if (k === 'library') setSec(el.dataset.sid, 'hub', '');
      setSec(el.dataset.sid, k, v); if (['layout', 'auto', 'library', 'hub'].includes(k)) this._render();
    }));
    all('[data-stri]', (el) => el.addEventListener('change', () => {
      const def = el.dataset.def === '1';
      setSec(el.dataset.sid, el.dataset.stri, el.checked === def ? '' : el.checked); this._render();
    }));
    all('[data-srel]', (el) => el.addEventListener('change', () => {
      const id = el.dataset.sid, sel2 = `[data-srel][data-sid="${CSS.escape ? CSS.escape(id) : id}"]`;
      const on = [...this.querySelectorAll(sel2)].filter((x) => x.checked).map((x) => x.dataset.srel);
      setSec(id, 'releases', on.length === REL_TYPES.length ? '' : on);
    }));
    all('[data-sfact]', (el) => el.addEventListener('change', () => {
      const id = el.dataset.sid, sel2 = `[data-sfact][data-sid="${CSS.escape ? CSS.escape(id) : id}"]`;
      const on = [...this.querySelectorAll(sel2)].filter((x) => x.checked).map((x) => x.dataset.sfact);
      setSec(id, 'flag_items', on.length === FACTS.length ? '' : on);
    }));
    all('[data-ssens]', (el) => el.addEventListener('change', () => {
      const id = el.dataset.sid;
      const on = [...this.querySelectorAll(`[data-ssens][data-sid="${CSS.escape ? CSS.escape(id) : id}"]`)].filter((x) => x.checked).map((x) => x.dataset.ssens);
      setSec(id, 'sensors', on.length ? on : '');
    }));
    all('[data-xadd]', (b) => b.addEventListener('click', () => {
      const type = b.dataset.xadd, pre = { recent: 'recent', upcoming: 'soon', plexhub: 'hub' }[type], ex = this._config.home_extra || [];
      let n = pre === 'hub' ? 1 : 2; while (ex.some((x) => x.id === `${pre}-${n}`)) n += 1;
      this._config.home_extra = [...ex, { id: `${pre}-${n}`, type }];
      const panel = `row-${pre}-${n}`;
      for (const k of [...this._open]) if (!k.includes(':') && !k.startsWith('ly-') && !k.startsWith('ap-') && !k.startsWith('pg-')) this._open.delete(k);
      this._open.add(panel); this._emit(); this._render();
    }));
    all('[data-xdelask]', (b) => b.addEventListener('click', () => {
      if (!window.confirm('Remove this row from the card (on every screen)?')) return;
      const id = b.dataset.xdelask;
      this._config.home_extra = (this._config.home_extra || []).filter((x) => x.id !== id);
      if (this._config.home_style) delete this._config.home_style[id];
      for (const bag of ['sec_styles', 'looks']) if (this._config[bag]) for (const k of Object.keys(this._config[bag])) if (k.startsWith(`${id}:`)) delete this._config[bag][k];
      this._emit(); this._render();
    }));
    all('[data-xdel]', (b) => b.addEventListener('click', () => {
      const id = b.dataset.xdel;
      this._config.home_extra = (this._config.home_extra || []).filter((x) => x.id !== id);
      if (this._config.home_style) delete this._config.home_style[id];
      if (this._config.sec_styles) for (const k of Object.keys(this._config.sec_styles)) if (k.startsWith(`${id}:`)) delete this._config.sec_styles[k];
      this._emit(); this._render();
    }));
    all('[data-sbool]', (el) => el.addEventListener('change', () => {
      if (el.dataset.sbool === 'hide_title') setSec(el.dataset.sid, 'show_title', el.checked ? false : '');
      else setSec(el.dataset.sid, el.dataset.sbool, el.checked || '');
      this._render();
    }));
    all('[data-ssk]', (el) => {
      const key = `${el.dataset.sid}:${el.dataset.ssk}`;
      el.addEventListener('input', () => { const o = this.querySelector(`[data-sval="${CSS.escape ? CSS.escape(key) : key}"]`); if (o) o.textContent = `${el.value}${el.dataset.unit}`; });
      el.addEventListener('change', () => { setSec(el.dataset.sid, el.dataset.ssk, Number(el.value)); this._render(); });
    });
    all('[data-sreset]', (b) => b.addEventListener('click', () => { const [id, k] = b.dataset.sreset.split(/:(?=[^:]+$)/); setSec(id, k, ''); this._render(); }));
    all('[data-sclr]', (el) => el.addEventListener('input', () => setSec(el.dataset.sid, el.dataset.sclr, el.value)));
    all('[data-smode]', (el) => el.addEventListener('change', () => {
      const id = el.dataset.sid, k = el.dataset.smode, cur = this._secS(id)[k] || '', was = colorMode(cur);
      let next = '';
      if (el.value === 'theme') next = was === 'theme' ? cur : 'var(--primary-color)';
      else if (el.value === 'custom') next = /^#[0-9a-fA-F]{6}$/.test(cur) ? cur : el.dataset.seed;
      else if (el.value === 'css') next = cur === 'transparent' ? '' : cur;
      else if (el.value === 'transparent') next = 'transparent';
      this._cmode[`${id}:${k}`] = el.value; setSec(id, k, next); this._render();
    }));
    all('plce-icon-pick[data-sicon]', (el) => el.addEventListener('value-changed', (e) => setSec(el.dataset.sid, 'icon', (e.detail?.value || '').trim())));
    all('[data-hreset]', (b) => b.addEventListener('click', () => {
      if (!window.confirm('Reset the Standard layout to its built-in defaults?')) return;
      delete this._config.header; this._emit(); this._render();
    }));
    all('plce-icon-pick[data-tvicon]', (el) => el.addEventListener('value-changed', (e) => {
      const icons = { ...(this._config.tv_icons || {}) }, v = (e.detail?.value || '').trim();
      if (v) icons[el.dataset.tvicon] = v; else delete icons[el.dataset.tvicon];
      this._config.tv_icons = icons; this._emit();
    }));
    all('plce-icon-pick[data-icon]', (el) => el.addEventListener('value-changed', (e) => this._set(el.dataset.icon, (e.detail?.value || '').trim())));
    const checkedList = (attr, allValues) => {
      const on = [...this.querySelectorAll(`[${attr}]`)].filter((x) => x.checked).map((x) => x.getAttribute(attr));
      return on.length === allValues.length ? null : on;
    };
    all('[data-tvpick]', (el) => el.addEventListener('change', () => {
      const v = checkedList('data-tvpick', this._conf?.tvs || []);
      if (v) this._config.tvs = v; else delete this._config.tvs;
      this._emit();
    }));
    all('[data-lib]', (el) => el.addEventListener('change', () => {
      const v = checkedList('data-lib', [...this.querySelectorAll('[data-lib]')]);
      if (v) this._config.libraries = v; else delete this._config.libraries;
      this._emit();
    }));
    all('.plce-cmode', (sel) => sel.addEventListener('change', () => {
      const k = sel.dataset.ckey, cur = this._getK(k) || '', was = colorMode(cur);
      let next = '';
      if (sel.value === 'theme') next = was === 'theme' ? cur : 'var(--primary-color)';
      else if (sel.value === 'custom') next = /^#[0-9a-fA-F]{6}$/.test(cur) ? cur : sel.dataset.seed;
      else if (sel.value === 'css') next = cur === 'transparent' ? '' : cur;
      else if (sel.value === 'transparent') next = 'transparent';
      this._cmode[k] = sel.value; this._setK(k, next); this._render();
    }));
    all('.plce-ctheme', (el) => el.addEventListener('change', () => this._setK(el.dataset.ckey, el.value)));
    all('.plce-chex', (el) => el.addEventListener('input', () => this._setK(el.dataset.ckey, el.value)));
    all('.plce-ccss', (el) => el.addEventListener('change', () => this._setK(el.dataset.ckey, el.value.trim())));
  }
}

// ------------------------------------------------------------------------------------- registration

PlexCenterCard._test = { fieldLayout, fieldLines, rowVals, boxMask, fanShade, lookFor, LOOK_BASE, layoutItems, layoutKeyFor, flatPageStyle, presetLook, exportPageStyle, importPageStyle, pageLook, pageButtonsHtml, PAGE_PRESETS, PAGE_GROUPS, effectiveConfig, migratePhone, SCREENS, screenOf, secType, upcomingSensors, secStyle, plexAsUmc, headerLayout, DEFAULT_HEADER, normalizeConfig, cardVars, haCardStyle, homeOrder, homeSections, isRealPlayback, livePosition, fmtTime, nowPlaying, deepLinkKey, umcItems, umcLines,
  formatDate, colorMode, CARD_CSS, CACHE, VIEW };


// ---------------------------------------------------------------------------------------------------- calendar
/** Release types: label, icon, colour. */
const CAL_TYPES = { cinema: ['In cinemas', 'mdi:ticket-outline', '#ef4444'], digital: ['Digital', 'mdi:cloud-download-outline', '#a855f7'],
  physical: ['Blu-ray', 'mdi:disc', '#22c55e'], episode: ['Episodes', 'mdi:television-classic', '#38bdf8'] };
const CAL_STATUS = [['all', 'All', ''], ['monitored', 'Monitored', '#818cf8'], ['missing', 'Missing', '#f59e0b'], ['available', 'Available', '#22c55e']];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** The local day of an entry (movie releases are dates; episodes are times). */
const evDay = (ev) => (ev.all_day ? String(ev.at).slice(0, 10) : ymd(new Date(ev.at)));
const nx = (ev) => (ev.season != null ? `${ev.season}x${String(ev.episode).padStart(2, '0')}` : '');
/** One day's entries with a show's episodes on that day grouped: [{ n: first index, idx: [all], count }]. */
function calGroups(idx, events) {
  const out = [], seen = new Map();
  for (const n of idx) {
    const ev = events[n];
    const k = ev.kind === 'episode' ? `tv:${ev.tvdb || ev.title}` : `n:${n}`;
    if (seen.has(k)) { const g = out[seen.get(k)]; g.idx.push(n); g.count++; continue; }
    seen.set(k, out.length); out.push({ n, idx: [n], count: 1 });
  }
  return out;
}
const sxe = (ev) => (ev.kind === 'episode' && ev.season != null ? `S${String(ev.season).padStart(2, '0')}E${String(ev.episode).padStart(2, '0')}` : '');

Object.assign(PlexCenterCard.prototype, {
  /** The Calendar page shows when it's on and Home Assistant has Sonarr or Radarr. */
  _calOn() { return !!cfg(this._c, 'calendar') && Object.values(this._conf?.arr || {}).some(Boolean); },

  /** The days the current view covers: [first day, number of days]. */
  _calRange() {
    const v = this._v, view = v.calView || cfg(this._c, 'calendar_view'), at = v.calDate ? parseYmd(v.calDate) : new Date();
    const ws = cfg(this._c, 'week_start') === 'sun' ? 0 : 1, back = (d) => (d.getDay() - ws + 7) % 7;
    if (view === 'day') return [new Date(at.getFullYear(), at.getMonth(), at.getDate()), 1, view];
    if (view === 'week') { const d = new Date(at.getFullYear(), at.getMonth(), at.getDate()); return [addDays(d, -back(d)), 7, view]; }
    const first = new Date(at.getFullYear(), at.getMonth(), 1);
    return [addDays(first, -back(first)), 42, 'month'];
  },

  async _renderCalendar(main) {
    if (this._phone) { await this._renderCalPhone(main); this._calWatch(main); return; }
    const done = this._renderCalendarTablet(main);
    this._calWatch(main);
    return done;
  },
  _calWatch(main) {
    if (!watchOn(this._c, 'cal') || main.querySelector('[data-sec="watching"]')) return;
    main.insertAdjacentHTML('afterbegin', '<div class="plc-sec plc-libwatch" data-sec="watching"></div>');
    this._paintWatching();
  },
  async _renderCalendarTablet(main) {
    const v = this._v, [start, days, view] = this._calRange(), at = v.calDate ? parseYmd(v.calDate) : new Date();
    const key = `cal:${ymd(start)}:${days}:${this._tv()?.id || ''}`;
    const title = view === 'month' ? at.toLocaleDateString([], { month: 'long', year: 'numeric' })
      : view === 'week' ? `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${addDays(start, 6).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
        : at.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const types = new Set(v.calTypes || []), status = v.calStatus || 'all';
    const pill = (attr, on, color, label) => `<button class="plc-cal-pill${on ? ' on' : ''}" ${attr}>${color ? `<span class="plc-cal-dot" style="background:${color}"></span>` : ''}${esc(label)}</button>`;
    main.innerHTML = `<div class="plc-cal" data-view="${view}">
      <div class="plc-cal-bar"><div class="plc-cal-title"><ha-icon icon="mdi:calendar-month"></ha-icon><span>${esc(title)}</span></div>
        <div class="plc-cal-nav"><div class="plc-cal-views">${['month', 'week', 'day'].map((x) => `<button class="${x === view ? 'on' : ''}" data-calview="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div>
          <button class="plc-chip" data-calnav="today">Today</button><button class="plc-icon-btn" data-calnav="-1" title="Back"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
          <button class="plc-icon-btn" data-calnav="1" title="Forward"><ha-icon icon="mdi:chevron-right"></ha-icon></button></div></div>
      <div class="plc-cal-filters"><span class="plc-cal-lbl">Show</span>${pill('data-caltype=""', !types.size, '', 'All')}${Object.entries(CAL_TYPES).map(([k, [n, , c]]) => pill(`data-caltype="${k}"`, types.has(k), c, n)).join('')}
        <span class="plc-cal-lbl">Status</span>${CAL_STATUS.map(([k, n, c]) => pill(`data-calstatus="${k}"`, status === k, c, n)).join('')}</div>
      <div class="plc-cal-note"></div><div class="plc-cal-body"><div class="plc-msg">Loading…</div></div></div>`;
    let res;
    try {
      const end = addDays(start, days);
      res = await cached(this._hass, key, 120000, () => ws(this._hass, 'calendar', { start: start.toISOString(), end: end.toISOString(), tv: this._tv()?.id }));
    } catch (e) { main.querySelector('.plc-cal-body').innerHTML = `<div class="plc-msg err">${esc(e?.message || e)}</div>`; return; }
    if (!main.isConnected || this._v.tab !== 'calendar') return;
    const bad = Object.entries(res.sources || {}).filter(([, st]) => st === 'error').map(([a]) => a[0].toUpperCase() + a.slice(1));
    main.querySelector('.plc-cal-note').innerHTML = bad.length ? `<div class="plc-note err"><ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>${esc(bad.join(' and '))} couldn't be reached: its entries are missing.</span></div>` : '';
    const today = ymd(new Date());
    const keep = (ev) => (!types.size || types.has(ev.release)) && (status === 'all' || (status === 'monitored' && ev.monitored)
      || (status === 'available' && ev.has_file) || (status === 'missing' && !ev.has_file && ev.monitored && evDay(ev) <= today));
    const evs = (res.events || []).filter(keep);
    this._calEvents = evs;
    const byDay = new Map();
    evs.forEach((ev, i) => { const d = evDay(ev); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(i); });
    const body = main.querySelector('.plc-cal-body');
    body.innerHTML = view === 'month' ? this._calMonth(start, at, byDay, today) : view === 'week' ? this._calWeek(start, byDay, today) : this._calDay(ymd(start), byDay);
  },

  /** Phones (like nzb360): a compact month with dots, and the chosen day's entries as cards below. */
  async _renderCalPhone(main) {
    const v = this._v, at = v.calDate ? parseYmd(v.calDate) : new Date();
    const first = new Date(at.getFullYear(), at.getMonth(), 1), [start, days, view] = this._calRange(), today = ymd(new Date());
    const title = view === 'month' ? at.toLocaleDateString([], { month: 'long', year: 'numeric' })
      : view === 'week' ? `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${addDays(start, 6).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
        : at.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const step = { month: ['Last month', 'Next month'], week: ['Last week', 'Next week'], day: ['Previous day', 'Next day'] }[view];
    const types = new Set(v.calTypes || []), status = v.calStatus || 'all';
    const pill = (attr, on, color, label) => `<button class="plc-cal-pill${on ? ' on' : ''}" ${attr}>${color ? `<span class="plc-cal-dot" style="background:${color}"></span>` : ''}${esc(label)}</button>`;
    main.innerHTML = `<div class="plc-cal plc-calp"><div class="plc-calp-head"><ha-icon icon="mdi:calendar-month"></ha-icon>
        <div class="plc-calp-ttl"><span>Calendar</span><b>${esc(title)}</b></div>
        <span class="plc-calp-legend">${Object.values(CAL_TYPES).map(([, , c]) => `<i style="background:${c}"></i>`).join('')}</span><span class="plc-sp"></span>
        <button class="plc-icon-btn" data-calfilt title="Filters"><ha-icon icon="mdi:filter-variant"></ha-icon></button>
        <button class="plc-icon-btn" data-calnav="-1" title="${step[0]}"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
        <button class="plc-icon-btn" data-calnav="1" title="${step[1]}"><ha-icon icon="mdi:chevron-right"></ha-icon></button></div>
      <div class="plc-calp-views"><div class="plc-cal-views">${['month', 'week', 'day'].map((x) => `<button class="${x === view ? 'on' : ''}" data-calview="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div>
        <span class="plc-sp"></span><button class="plc-chip" data-calnav="today">Today</button></div>
      ${v.calFilt ? `<div class="plc-cal-filters">${pill('data-caltype=""', !types.size, '', 'All')}${Object.entries(CAL_TYPES).map(([k, [n, , c]]) => pill(`data-caltype="${k}"`, types.has(k), c, n)).join('')}
        ${CAL_STATUS.map(([k, n, c]) => pill(`data-calstatus="${k}"`, status === k, c, n)).join('')}</div>` : ''}
      <div class="plc-cal-note"></div><div class="plc-calp-body"><div class="plc-msg">Loading…</div></div></div>`;
    let res;
    try { res = await cached(this._hass, `cal:${ymd(start)}:${days}:${this._tv()?.id || ''}`, 120000, () => ws(this._hass, 'calendar', { start: start.toISOString(), end: addDays(start, days).toISOString(), tv: this._tv()?.id })); }
    catch (e) { main.querySelector('.plc-calp-body').innerHTML = `<div class="plc-msg err">${esc(e?.message || e)}</div>`; return; }
    if (!main.isConnected || this._v.tab !== 'calendar') return;
    const bad = Object.entries(res.sources || {}).filter(([, st]) => st === 'error').map(([a]) => a[0].toUpperCase() + a.slice(1));
    main.querySelector('.plc-cal-note').innerHTML = bad.length ? `<div class="plc-note err"><ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>${esc(bad.join(' and '))} couldn't be reached.</span></div>` : '';
    const keep = (ev) => (!types.size || types.has(ev.release)) && (status === 'all' || (status === 'monitored' && ev.monitored)
      || (status === 'available' && ev.has_file) || (status === 'missing' && !ev.has_file && ev.monitored && evDay(ev) <= today));
    this._calEvents = (res.events || []).filter(keep);
    const byDay = new Map();
    this._calEvents.forEach((ev, i) => { const d = evDay(ev); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(i); });
    this._calPhoneByDay = byDay;
    if (view !== 'month') { this._paintCalPhoneDays(main, view, at, today); return; }
    if (!v.calSel || parseYmd(v.calSel).getMonth() !== at.getMonth()) v.calSel = at.getMonth() === new Date().getMonth() && at.getFullYear() === new Date().getFullYear() ? today : ymd(first);
    this._paintCalPhone(main, start, at, today);
  },
  /** Phone Week / Day: a strip of the week's days (tap one for its Day), then the entries (Week: every day, Day: that day). */
  _paintCalPhoneDays(main, view, at, today) {
    const byDay = this._calPhoneByDay, ws2 = cfg(this._c, 'week_start') === 'sun' ? 0 : 1;
    const d0 = new Date(at.getFullYear(), at.getMonth(), at.getDate()), wk = addDays(d0, -((d0.getDay() - ws2 + 7) % 7)), sel = view === 'day' ? ymd(d0) : '';
    const strip = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(wk, i), k = ymd(d), list = (byDay.get(k) || []).map((n) => this._calEvents[n]);
      return `<button class="plc-calp-cell${k === today ? ' today' : ''}${k === sel ? ' sel' : ''}" data-calday="${k}"><span class="plc-calp-wd">${esc(d.toLocaleDateString([], { weekday: 'short' }))}</span>
        <span class="plc-calp-num">${d.getDate()}</span><span class="plc-calp-dots">${list.slice(0, 3).map((ev) => `<i style="background:${this._calColor(ev)}"></i>`).join('')}</span></button>`;
    }).join('');
    const dayList = (k) => calGroups(byDay.get(k) || [], this._calEvents).map((g) => this._calItem(g.n, { phone: true, group: g })).join('');
    let list;
    if (view === 'day') list = dayList(sel) || `<div class="plc-msg">Nothing on ${esc(d0.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))}.</div>`;
    else {
      list = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(wk, i), k = ymd(d), cards = dayList(k);
        return cards ? `<button class="plc-calp-dayh${k === today ? ' today' : ''}" data-calday="${k}">${esc(d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }))}${k === today ? ' · Today' : ''}</button>${cards}` : '';
      }).join('') || '<div class="plc-msg">Nothing this week.</div>';
    }
    main.querySelector('.plc-calp-body').innerHTML = `<div class="plc-calp-grid plc-calp-strip">${strip}</div><div class="plc-calp-sep"></div><div class="plc-calp-list">${list}</div>`;
  },
  _paintCalPhone(main, start, at, today) {
    const byDay = this._calPhoneByDay, sel = this._v.calSel, month = at.getMonth();
    const dows = Array.from({ length: 7 }, (_, i) => addDays(start, i).toLocaleDateString([], { weekday: 'short' }));
    const cells = Array.from({ length: 42 }, (_, i) => {
      const d = addDays(start, i), k = ymd(d), list = (byDay.get(k) || []).map((n) => this._calEvents[n]);
      const label = list.find((ev) => ev.premiere) ? (list.find((ev) => ev.premiere === 'series') ? 'Premiere' : 'New season') : list.find((ev) => ev.finale) ? 'Finale' : '';
      const labelEv = list.find((ev) => ev.premiere || ev.finale);
      const dots = list.slice(0, 3).map((ev) => `<i style="background:${this._calColor(ev)}"></i>`).join('');
      return `<button class="plc-calp-cell${d.getMonth() !== month ? ' out' : ''}${k === today ? ' today' : ''}${k === sel ? ' sel' : ''}" data-calsel="${k}">
        <span class="plc-calp-num">${d.getDate()}</span>${label ? `<span class="plc-calp-lbl" style="color:${this._calColor(labelEv)}">${esc(label)}</span>` : ''}<span class="plc-calp-dots">${dots}</span></button>`;
    }).join('');
    const groups = calGroups(byDay.get(sel) || [], this._calEvents);
    const cards = groups.map((g) => this._calItem(g.n, { phone: true, group: g })).join('');
    main.querySelector('.plc-calp-body').innerHTML = `<div class="plc-calp-grid">${dows.map((n) => `<div class="plc-cal-dow">${esc(n)}</div>`).join('')}${cells}</div>
      <div class="plc-calp-sep"></div><div class="plc-calp-list">${cards || `<div class="plc-msg">Nothing on ${esc(parseYmd(sel).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))}.</div>`}</div>`;
  },

  _calTime(ev) { return ev.all_day ? '' : new Date(ev.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: cfg(this._c, 'clock') !== '24' }); },
  _calColor(ev) { return (CAL_TYPES[ev.release] || CAL_TYPES.episode)[2]; },
  _calBadge(ev) { return ev.premiere === 'series' ? 'Premiere' : ev.premiere === 'season' ? 'New season' : ev.finale ? 'Finale' : ''; },

  _calMonth(start, at, byDay, today) {
    const max = Math.max(1, Number(cfg(this._c, 'calendar_max')) || 4), month = at.getMonth();
    const dows = Array.from({ length: 7 }, (_, i) => addDays(start, i).toLocaleDateString([], { weekday: 'short' }));
    const cells = Array.from({ length: 42 }, (_, i) => {
      const d = addDays(start, i), k = ymd(d), list = byDay.get(k) || [];
      const blocks = list.slice(0, max).map((n) => {
        const ev = this._calEvents[n], badge = this._calBadge(ev);
        return `<button class="plc-cal-block${ev.has_file ? ' has' : ''}" style="--c:${this._calColor(ev)}" data-calev="${n}" title="${esc(`${ev.title} ${sxe(ev)}`)}">${badge ? `<b>${esc(badge)}</b> ` : ''}${esc(ev.title)}${sxe(ev) ? ` <span>${sxe(ev)}</span>` : ''}</button>`;
      }).join('');
      return `<div class="plc-cal-cell${d.getMonth() !== month ? ' out' : ''}${k === today ? ' today' : ''}"><button class="plc-cal-num" data-calday="${k}">${d.getDate()}</button>
        <div class="plc-cal-evs">${blocks}${list.length > max ? `<button class="plc-cal-more" data-calday="${k}">+${list.length - max} more</button>` : ''}</div></div>`;
    }).join('');
    return `<div class="plc-cal-grid">${dows.map((n) => `<div class="plc-cal-dow">${esc(n)}</div>`).join('')}${cells}</div>`;
  },

  /** A calendar item in the look of this screen: poster / fanart / fanart-fade, the lines, corner icons, status. */
  _calItem(n, { big = false, phone = false, group = null } = {}) {
    const ev = this._calEvents[n], l = lookFor(this._c, 'calendar', this._c._screen || 'tablet_landscape');
    const c = this._calColor(ev), badge = this._calBadge(ev), [label, icon] = CAL_TYPES[ev.release] || CAL_TYPES.episode;
    const last = group && group.count > 1 ? this._calEvents[group.idx[group.idx.length - 1]] : null;
    const time = this._calTime(ev);
    const day = (ev.all_day ? parseYmd(ev.at) : new Date(ev.at)).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const info = ev.kind === 'episode' ? (last ? `${nx(ev)} – ${nx(last)}` : [phone ? nx(ev) : sxe(ev), ev.episode_title].filter(Boolean).join(phone ? ' • ' : ' · ')) : label;
    const own = (this._c.looks || {})[`calendar:${this._c._screen || 'tablet_landscape'}`] || {};
    const vals = { title: `${ev.title}${phone && ev.year && ev.kind === 'episode' ? ` (${ev.year})` : ''}`, badge,
      episode: ev.kind === 'episode' ? (last ? `${nx(ev)} – ${nx(last)}` : (phone ? nx(ev) : sxe(ev))) : '',
      eptitle: ev.kind === 'episode' && !last ? ev.episode_title : '', release: ev.kind === 'movie' ? label : '',
      date: day, time: l.time_corner ? '' : time, network: ev.network || ev.studio, runtime: ev.runtime ? `${ev.runtime} min` : '' };
    void info;
    const text = fieldLines('calendar', own, vals).map(([n2, h]) => `<span class="plc-ci-${LINE_IDS[n2 - 1]}">${h}</span>`).join('')
      + (big && ev.overview ? `<span class="plc-lrow-sum">${esc(ev.overview)}</span>` : '');
    const corner = `${l.time_corner && time ? `<span class="plc-ci-time">${esc(time)}</span>` : ''}${l.type_icon ? `<ha-icon class="plc-ci-type" icon="mdi:${ev.kind === 'movie' ? 'movie-open' : 'television-classic'}"></ha-icon>` : ''}`;
    const marks = `${l.status && ev.watched ? '<ha-icon class="plc-ci-watched" icon="mdi:check-circle" title="Watched"></ha-icon>' : ''}${l.status && ev.has_file && !ev.watched ? '<span class="plc-ci-avail" title="Available"></span>' : ''}`;
    const img = l.image === 'poster'
      ? `<span class="plc-ci-poster"${ev.poster ? ` style="background-image:url('${cssUrl(ev.poster)}')"` : ''}>${ev.poster ? '' : `<ha-icon icon="${icon}"></ha-icon>`}${corner}</span>`
      : `<span class="plc-ci-fan"${(ev.fanart || ev.poster) ? ` style="background-image:url('${cssUrl(ev.fanart || ev.poster)}')"` : ''}></span>`;
    return `<button class="plc-ci img-${l.image}${l.border ? ' bordered' : ''} tbg-${l.text_bg}${big ? ' big' : ''}${phone ? ' phone' : ''}" style="--c:${c};--li-fanbg-a:${Number(l.text_bg_opacity) / 100};--li-fanbg:${fanShade(l)};--li-fanbg-blur:${Number(l.text_bg_blur)}px;--li-fade-w:${Number(l.fade_width)}%;--li-fade-d:${Number(l.fade_dist)}%;--li-fade-s:${Number(l.fade_start)}%;--li-boxmask:${boxMask(l)};${lookVars(l)}" data-calev="${n}">
      ${img}<span class="plc-ci-txt">${text}</span>${l.image === 'poster' ? '' : `<span class="plc-ci-corner">${corner}</span>`}
      ${group && group.count > 1 ? `<span class="plc-calp-ring">${group.count}</span>` : ''}${marks}</button>`;
  },

  _calCard(n, big = false) { return this._calItem(n, { big }); },

  _calWeek(start, byDay, today) {
    return `<div class="plc-cal-week">${Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i), k = ymd(d), list = byDay.get(k) || [];
      return `<div class="plc-cal-wcol${k === today ? ' today' : ''}"><button class="plc-cal-whead" data-calday="${k}"><span>${esc(d.toLocaleDateString([], { weekday: 'short' }))}</span><b>${d.getDate()}</b></button>
        ${list.map((n) => this._calCard(n)).join('') || '<div class="plc-cal-empty">—</div>'}</div>`;
    }).join('')}</div>`;
  },

  _calDay(k, byDay) {
    const list = byDay.get(k) || [];
    return list.length ? `<div class="plc-cal-daylist">${list.map((n) => this._calCard(n, true)).join('')}</div>` : '<div class="plc-msg">Nothing on this day.</div>';
  },

  /** Quick look: fanart, poster, what and when, status, overview, Trailer, and Play / Open when it is in Plex. */
  /** A Sonarr / Radarr entry as the info card wants it (Calendar quick look and Coming Soon details). */
  _calInfo(ev) {
    const [label, icon] = CAL_TYPES[ev.release] || CAL_TYPES.episode, c = this._calColor(ev), badge = this._calBadge(ev);
    const when = `${(ev.all_day ? parseYmd(ev.at) : new Date(ev.at)).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}${this._calTime(ev) ? ` · ${this._calTime(ev)}` : ''}`;
    const status = [ev.watched && ['Watched', '#22c55e'], ev.has_file ? ['Available', '#22c55e'] : ev.monitored ? (evDay(ev) <= ymd(new Date()) ? ['Missing', '#f59e0b'] : ['Monitored', '#818cf8']) : ['Not monitored', '#9ca3af'],
      badge && [badge, c]].filter(Boolean).map(([t, col]) => `<span class="plc-cal-chip" style="--c:${col}">${esc(t)}</span>`).join('');
    const ep = ev.kind === 'episode';
    return { eyebrow: [ep ? when : `${label} · ${when}`, null, c], title: ev.title, status, icon,
      sub: ep ? ev.episode_title || '' : '', se: ep ? (ev.season != null && ev.episode != null ? `S${ev.season} · E${ev.episode}` : sxe(ev)) : '', runtime: ev.runtime ? fmtRun(ev.runtime * 60) : '',
      meta: [ev.year, ev.network || ev.studio, ev.certification, (ev.genres || []).join(', ')].filter(Boolean).join(' · ') };
  },
  async _calQuick(n) {
    const ev = this._calEvents?.[n];
    if (!ev) return;
    const ci = this._calInfo(ev), meta = ci.meta;
    this._sheet(this._infoHtml({ cls: 'plc-cq', art: ev.fanart || ev.poster, poster: ev.poster, close: 'data-close-sheet',
      eyebrow: ci.eyebrow, title: ci.title, sub: ci.sub, se: ci.se, runtime: ci.runtime, status: ci.status,
      body: `${meta ? `<div class="plc-meta">${esc(meta)}</div>` : ''}${ev.overview ? `<div>${esc(ev.overview)}</div>` : ''}
        <div class="plc-btns"><span data-calplex></span><button class="plc-btn" data-caltrailer><ha-icon icon="mdi:movie-open-play"></ha-icon>Trailer</button>
          <button class="plc-btn" data-close-sheet>Close</button></div>` }), null, false);
    this._calQuickEv = ev;
    if (ev.plex_key || ev.plex_show) {   // known in Plex from the calendar's marks
      this._calHit = ev.plex_key && ev.kind === 'movie' ? { key: ev.plex_key, type: 'movie', title: ev.title }
        : { key: ev.plex_show || ev.plex_key, type: 'show', title: ev.title };
      if (ev.kind === 'episode' && ev.plex_show) this._root.querySelector('.plc-cq [data-caltrailer]')?.insertAdjacentHTML('beforebegin', this._openShowHtml({ type: 'episode', show_key: ev.plex_show, show: ev.title }));
      const slot = this._root.querySelector('.plc-cq [data-calplex]'), tgt = this._target();
      this._root.querySelector('.plc-cq .plc-btns')?.insertAdjacentHTML('beforebegin', `<div class="plc-meta plc-target">Play on ${this._pickChip()}</div>`);
      if (slot) slot.outerHTML = `<button class="plc-btn main" data-calplay><ha-icon icon="mdi:${tgt === 'local' ? 'open-in-new' : 'play'}"></ha-icon>${tgt === 'local' ? 'Open on this device'
        : `${this._calHit.type === 'show' ? 'Play next episode' : 'Play'} on ${esc(tvLabel(tgt))}`}</button>`;
      return;
    }
    try {   // is it in Plex? (same title, the right type, the year for movies)
      const res = await ws(this._hass, 'search', { tv: this._tv()?.id, query: ev.title, limit: 10 });
      const want = ev.kind === 'movie' ? 'movie' : 'show', low = (x) => String(x || '').toLowerCase();
      const hit = (res || []).flatMap((g) => g.items || []).find((it) => it.type === want && low(it.title) === low(ev.title) && (want !== 'movie' || !ev.year || !it.year || Math.abs(it.year - ev.year) <= 1));
      const slot = this._root.querySelector('.plc-cq [data-calplex]');
      if (!hit || !slot) return;
      this._calHit = hit;
      if (hit.type === 'show') this._root.querySelector('.plc-cq [data-caltrailer]')?.insertAdjacentHTML('beforebegin', this._openShowHtml({ type: 'episode', show_key: hit.key, show: hit.title }));
      const tgt = this._target();
      this._root.querySelector('.plc-cq .plc-btns')?.insertAdjacentHTML('beforebegin', `<div class="plc-meta plc-target">Play on ${this._pickChip()}</div>`);
      slot.outerHTML = `<button class="plc-btn main" data-calplay><ha-icon icon="mdi:${tgt === 'local' ? 'open-in-new' : 'play'}"></ha-icon>${tgt === 'local' ? 'Open on this device'
        : `${hit.type === 'show' ? 'Play next episode' : 'Play'} on ${esc(tvLabel(tgt))}`}</button>`;
    } catch { /* not found: Trailer only */ }
  },

  _calClick(t) {
    let el;
    const v = this._v, rerender = () => this._renderCalendar(this._root.querySelector('.plc-main'));
    if ((el = t('[data-calsel]'))) {
      v.calSel = el.dataset.calsel;
      const main = this._root.querySelector('.plc-main'), at = v.calDate ? parseYmd(v.calDate) : new Date();
      const ws2 = cfg(this._c, 'week_start') === 'sun' ? 0 : 1, first = new Date(at.getFullYear(), at.getMonth(), 1);
      this._paintCalPhone(main, addDays(first, -((first.getDay() - ws2 + 7) % 7)), at, ymd(new Date()));
      return true;
    }
    if (t('[data-calfilt]')) { v.calFilt = !v.calFilt; rerender(); return true; }
    if ((el = t('[data-calview]'))) { v.calView = el.dataset.calview; rerender(); return true; }
    if ((el = t('[data-calnav]'))) {
      const dir = el.dataset.calnav, view = v.calView || cfg(this._c, 'calendar_view'), at = v.calDate ? parseYmd(v.calDate) : new Date();
      if (dir === 'today') v.calDate = null;
      else if (view === 'month') v.calDate = ymd(new Date(at.getFullYear(), at.getMonth() + Number(dir), 1));
      else v.calDate = ymd(addDays(at, Number(dir) * (view === 'week' ? 7 : 1)));
      rerender(); return true;
    }
    if ((el = t('[data-caltype]'))) {
      const k = el.dataset.caltype, s2 = new Set(v.calTypes || []);
      if (!k) s2.clear(); else if (s2.has(k)) s2.delete(k); else s2.add(k);
      v.calTypes = [...s2]; rerender(); return true;
    }
    if ((el = t('[data-calstatus]'))) { v.calStatus = el.dataset.calstatus; rerender(); return true; }
    if ((el = t('[data-calday]'))) { v.calView = 'day'; v.calDate = el.dataset.calday; rerender(); return true; }
    if ((el = t('[data-calev]'))) { this._calQuick(Number(el.dataset.calev)); return true; }
    if (t('[data-caltrailer]')) {
      const ev = this._calQuickEv;
      if (ev) this._playTrailer({ title: ev.title, year: ev.year, trailer: ev.trailer ? `https://www.youtube.com/watch?v=${ev.trailer}` : null });
      return true;
    }
    if (t('[data-calplay]')) { const it = this._calHit; this._closeSheet(true); if (it) this._play(it, it.type === 'show' ? 'next' : 'play'); return true; }
    return false;
  },
});

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, PlexCenterCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, PlexCenterCardEditor);

/** A compact icon picker for the editor: a chip with the icon and its name; it opens a small panel with a search box
 * (any mdi: name) and common icons. Fires value-changed like ha-icon-picker. */
const ICON_CHOICES = ['mdi:home', 'mdi:movie-open', 'mdi:movie-roll', 'mdi:filmstrip', 'mdi:television-classic', 'mdi:television', 'mdi:television-play', 'mdi:monitor',
  'mdi:projector', 'mdi:cellphone', 'mdi:tablet', 'mdi:sofa', 'mdi:bed', 'mdi:baby-face-outline', 'mdi:human-child', 'mdi:teddy-bear', 'mdi:music', 'mdi:music-box',
  'mdi:microphone-variant', 'mdi:podcast', 'mdi:camera', 'mdi:image-multiple', 'mdi:calendar-month', 'mdi:calendar-clock', 'mdi:new-box', 'mdi:star', 'mdi:heart',
  'mdi:fire', 'mdi:trophy', 'mdi:drama-masks', 'mdi:ghost', 'mdi:rocket-launch', 'mdi:sword-cross', 'mdi:emoticon-happy-outline', 'mdi:earth', 'mdi:book-open-variant',
  'mdi:auto-fix', 'mdi:dice-multiple', 'mdi:shuffle-variant', 'mdi:play-circle', 'mdi:folder-play', 'mdi:bookshelf', 'mdi:plex', 'mdi:youtube', 'mdi:account', 'mdi:account-group'];
class PlexIconPick extends HTMLElement {
  static get observedAttributes() { return ['value', 'placeholder']; }
  get value() { return this.getAttribute('value') || ''; }
  set value(v) { this.setAttribute('value', v || ''); }
  connectedCallback() { this._draw(); }
  attributeChangedCallback() { if (this.isConnected) this._draw(); }
  _draw() {
    const v = this.value, ph = this.getAttribute('placeholder') || 'mdi:';
    const open = !!this._open;
    const q = (this._q ?? '').toLowerCase();
    const list = ICON_CHOICES.filter((x) => !q || x.includes(q)).slice(0, 48);
    this.innerHTML = `<button type="button" class="pip-chip${v ? '' : ' empty'}"><ha-icon icon="${esc(v || ph)}"></ha-icon><span>${esc(v || `Default (${ph})`)}</span>
        <ha-icon class="pip-chev" icon="mdi:chevron-${open ? 'up' : 'down'}"></ha-icon></button>
      ${open ? `<div class="pip-pop"><div class="pip-top"><input class="pip-q" type="text" spellcheck="false" placeholder="Search or type mdi:name" value="${esc(this._q ?? v)}">
          <button type="button" class="pip-clear" title="Back to the default">Default</button></div>
        <div class="pip-grid">${list.map((x) => `<button type="button" class="pip-i${x === v ? ' on' : ''}" data-pi="${esc(x)}" title="${esc(x)}"><ha-icon icon="${esc(x)}"></ha-icon></button>`).join('')}</div>
        <div class="pip-hint">Any Material Design icon works: type its name, e.g. <code>mdi:popcorn</code>, and press Enter.</div></div>` : ''}`;
    this.querySelector('.pip-chip').onclick = () => { this._open = !this._open; this._q = undefined; this._draw(); if (this._open) this.querySelector('.pip-q')?.focus(); };
    if (!open) return;
    const input = this.querySelector('.pip-q');
    input.oninput = () => { this._q = input.value; const pos = input.selectionStart; this._draw(); const ni = this.querySelector('.pip-q'); ni.focus(); ni.setSelectionRange(pos, pos); };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') { const t = input.value.trim(); this._pick(t ? (t.includes(':') ? t : `mdi:${t}`) : ''); }
      if (e.key === 'Escape') { this._open = false; this._draw(); }
    };
    this.querySelector('.pip-clear').onclick = () => this._pick('');
    this.querySelectorAll('[data-pi]').forEach((b) => { b.onclick = () => this._pick(b.dataset.pi); });
  }
  _pick(v) {
    this._open = false; this._q = undefined; this.value = v;
    this.dispatchEvent(new CustomEvent('value-changed', { detail: { value: v }, bubbles: true, composed: true }));
  }
}
if (!customElements.get('plce-icon-pick')) customElements.define('plce-icon-pick', PlexIconPick);
if (typeof window !== 'undefined') {
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === CARD_TAG)) {
    window.customCards.push({ type: CARD_TAG, name: 'Plex Center Card (Ltek)', preview: false,
      description: 'Browse Plex and play on your TVs. Needs the Plex Center integration.' });
  }
  console.info(`%c PLEX-CENTER-CARD %c ${BUILD_NUMBER} `, 'color:#fff;background:#e5a00d;font-weight:700', 'color:#e5a00d;background:#222');
}
