// Plex Center Card (Ltek) — Home Assistant Dashboard card, the front end of the Plex Center integration
// Version: v2026.11.14.12
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

const BUILD_NUMBER = 'v2026.11.14.12';
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
};
const SIZE_PX = { title_size: { large: 17, medium: 14, small: 12 }, line_size: { large: 14, medium: 12, small: 11 } };
const SHADOWS = { none: 'none', soft: '0 2px 8px rgba(0,0,0,.25)', strong: '0 8px 28px rgba(0,0,0,.55)' };
const HEADER_ITEMS = [['title', 'Title'], ['tabs', 'Tabs (Home and libraries)'], ['search', 'Search'], ['surprise', 'Surprise me'],
  ['filters', 'All / Unwatched'], ['sort', 'Sort'], ['tvs', 'TV picker']];
const DEFAULT_HEADER = [
  { id: 'title', section: 'library', row: 1, align: 'left' }, { id: 'tabs', section: 'library', row: 1, align: 'left' },
  { id: 'search', section: 'library', row: 1, align: 'right' }, { id: 'surprise', section: 'library', row: 1, align: 'right' },
  { id: 'filters', section: 'library', row: 1, align: 'right' }, { id: 'sort', section: 'library', row: 1, align: 'right' },
  { id: 'tvs', section: 'library', row: 2, align: 'left' }];
const ALIGNS = ['left', 'center', 'right'];
const HOME_BUILTIN = [['watching', 'Watching now'], ['continue', 'Continue watching'], ['recent', 'Recently Added'], ['soon', 'Coming Soon']];
const SEC_TYPE_TITLE = { recent: 'Recently Added', upcoming: 'Coming Soon' };
const SEC_TYPE_ICON = { recent: 'mdi:plex', upcoming: 'mdi:calendar-clock', sensor: 'mdi:view-carousel' };
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
const DEFAULTS = {
  title: 'Plex',
  layout: 'auto',
  tv_picker: 'chips',
  tv_label: 'name',
  search_width: 280,
  client_choice: 'card',
  tap_action: 'details',
  start_tab: 'home',
  surprise: true,
  surprise_style: 'icon',
  surprise_icon: 'mdi:auto-fix',
  surprise_label: 'Surprise me',
  lock: false,
  now_playing: 'auto',
  slim_position: 'bottom',
  slim_controls: 'toggle',
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
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function colorMode(cur) {
  cur = cur == null ? '' : String(cur);
  if (cur === '') return 'default';
  if (/^#[0-9a-fA-F]{3,8}$/.test(cur)) return 'custom';
  if (/^var\(/.test(cur) && THEME_COLORS.some(([v]) => v === cur)) return 'theme';
  return 'css';
}


/** Merge defaults; keep only known shapes. Idempotent: normalize(normalize(c)) equals normalize(c). */
function normalizeConfig(raw) {
  const c = { ...(raw || {}) };
  delete c.type;
  for (const k of ['title_size', 'line_size']) if (typeof c[k] === 'string') c[k] = SIZE_PX[k][c[k]] ?? DEFAULTS[k];
  const hidden = new Set(Array.isArray(c.home_hidden) ? c.home_hidden : []);
  for (const [id] of HOME_BUILTIN) { if (c[`show_${id}`] === false) hidden.add(id); delete c[`show_${id}`]; }
  c.home_hidden = [...hidden];
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
    c.home_extra = c.home_extra.filter((e) => e && /^(recent|soon)-\d+$/.test(e.id) && ['recent', 'upcoming'].includes(e.type) && !ids.has(e.id) && ids.add(e.id))
      .map((e) => ({ id: e.id, type: e.type }));
    if (!c.home_extra.length) delete c.home_extra;
  } else delete c.home_extra;
  if (c.home_style && typeof c.home_style === 'object') {
    const o = Object.fromEntries(Object.entries(c.home_style).map(([k, v]) => [k, cleanSecStyle(v)]).filter(([, v]) => Object.keys(v).length));
    if (Object.keys(o).length) c.home_style = o; else delete c.home_style;
  } else delete c.home_style;
  for (const k of ['libraries', 'tvs', 'home_cards', 'home_hidden', 'tab_order']) if (!Array.isArray(c[k]) || !c[k].length) delete c[k];
  if (Array.isArray(c.header)) {
    const h = headerLayout(c);
    if (JSON.stringify(h) === JSON.stringify(DEFAULT_HEADER)) delete c.header; else c.header = h;
  } else delete c.header;
  if (c.tv_icons && typeof c.tv_icons === 'object') {
    const o = Object.fromEntries(Object.entries(c.tv_icons).filter(([k, v]) => k && typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim()]));
    if (Object.keys(o).length) c.tv_icons = o; else delete c.tv_icons;
  } else delete c.tv_icons;
  if (Array.isArray(c.home_order)) {
    const order = homeOrder(c);
    if (JSON.stringify(order) === JSON.stringify(homeSections(c).map(([id]) => id))) delete c.home_order; else c.home_order = order;
  } else delete c.home_order;
  return c;
}
const cfg = (c, k) => (c[k] !== undefined ? c[k] : DEFAULTS[k]);

/** The header items in order, each { id, section, row, align, hidden? }; unknown ids dropped, missing ones added. */
function headerLayout(c) {
  const known = new Set(HEADER_ITEMS.map(([id]) => id));
  const seen = new Set();
  const out = [];
  for (const h of Array.isArray(c.header) ? c.header : []) {
    if (!h || !known.has(h.id) || seen.has(h.id)) continue;
    seen.add(h.id);
    const d = DEFAULT_HEADER.find((x) => x.id === h.id);
    out.push({ id: h.id, section: h.section === 'player' ? 'player' : 'library', row: [1, 2, 3].includes(Number(h.row)) ? Number(h.row) : d.row,
      align: ALIGNS.includes(h.align) ? h.align : d.align, ...(h.hidden ? { hidden: true } : {}) });
  }
  for (const d of DEFAULT_HEADER) if (!seen.has(d.id)) out.push({ ...d });
  return out;
}

// Per-section look (Recently added and each sensor row): stored sparse in home_style[<section id>].
const SEC_KEYS = { show: 'num', scroll: 'bool', total: 'num', auto: ['off', 'scroll', 'fade'], speed: 'num', sensors: 'list', source: 'str', kind: ['movie', 'show', 'both'], chips: 'bool', title: 'str', show_title: 'bool', head_style: ['caps', 'plain'],
  show_count: 'bool', show_icon: 'bool', divider: 'bool', divider_color: 'str', item_h: 'num', l1_px: 'num', l2_px: 'num', l3_px: 'num', l4_px: 'num',
  l1_color: 'str', l2_color: 'str', l3_color: 'str', l4_color: 'str', layout: ['row', 'list'], image: ['poster', 'fanart'], collapsible: 'bool', collapsed: 'bool', icon: 'str', max: 'num',
  radius: 'num', title_px: 'num', line_px: 'num', list_w: 'num', title_color: 'str', line_color: 'str', flag_color: 'str', item_bg: 'str',
  border_color: 'str', flag: 'bool' };
function cleanSecStyle(o) {
  const out = {};
  for (const [k, kind] of Object.entries(SEC_KEYS)) {
    const v = o?.[k];
    if (v === undefined || v === null || v === '') continue;
    if (kind === 'list') { const l = (Array.isArray(v) ? v : []).map(String).filter((x) => /^sensor\.[a-z0-9_]+$/.test(x)); if (l.length) out[k] = [...new Set(l)]; continue; }
    if (Array.isArray(kind)) { if (kind.includes(v)) out[k] = v; } else if (kind === 'bool') out[k] = !!v;
    else if (kind === 'num') { if (Number.isFinite(Number(v))) out[k] = Number(v); } else if (String(v).trim()) out[k] = String(v).trim();
  }
  return out;
}
/** One resolver for a section: its own setting, else the card's. */
function secStyle(c, id) {
  const s = (c.home_style || {})[id] || {};
  const type = secType(c, id) || 'sensor';
  const collapsible = !!s.collapsible;
  return { layout: s.layout || 'row', image: s.image || cfg(c, 'image_style'), collapsible, collapsed: !!s.collapsed,
    icon: s.icon || SEC_TYPE_ICON[type] || '', show_icon: s.show_icon ?? (collapsible || !!s.icon), show_title: s.show_title ?? true,
    show_count: s.show_count ?? true, divider: s.divider ?? collapsible, head_style: s.head_style || (collapsible ? 'plain' : 'caps'), kind: s.kind || 'both', chips: !!s.chips,
    show: Math.max(1, Number(s.show ?? s.max ?? (['recent', 'upcoming'].includes(type) ? 5 : cfg(c, 'max'))) || 5),
    scroll: !!s.scroll, auto: s.auto || 'off', speed: Number(s.speed ?? (s.auto === 'fade' ? 6 : 30)),
    flag: s.flag ?? cfg(c, 'flag'), list_w: Number(s.list_w ?? 340), type, s,
    get total() { return this.scroll || this.auto !== 'off' ? Math.max(this.show, Number(s.total ?? 30)) : this.show; },
    get max() { return this.total; } };
}
/** The section's own CSS custom properties (inline on the section; inherit the card's when unset). */
function secVars(st) {
  const s = st.s, clean = (v) => String(v).replace(/[;{}<>]/g, ''), v = [`--plc-li-w:${st.list_w}px`, `--plc-show:${st.show}`];
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
function tabOrder(c, libs) {
  const all = [{ id: 'home', title: 'Home' }, ...libs.map((l) => ({ ...l, id: l.title }))];
  const want = (Array.isArray(c.tab_order) ? c.tab_order : []).filter((id) => all.some((t) => t.id === id));
  return [...want.map((id) => all.find((t) => t.id === id)), ...all.filter((t) => !want.includes(t.id))];
}

/** Home sections in their default order: [id, label]. Rows are keyed by their sensor. */
function homeSections(c) {
  return [...HOME_BUILTIN.map(([id, n]) => [id, (c.home_style?.[id]?.title) || n]),
    ...(c.home_extra || []).map((e) => [e.id, (c.home_style?.[e.id]?.title) || SEC_TYPE_TITLE[e.type]]),
    ...(c.home_cards?.length ? [['cards', 'Extra cards']] : [])];
}
/** The user's order (unknown ids dropped, new sections appended). */
function homeOrder(c) {
  const all = homeSections(c).map(([id]) => id);
  const want = (c.home_order || []).filter((id) => all.includes(id));
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
  if (c.card_radius !== undefined) o.push(`--ha-card-border-radius:${Number(c.card_radius)}px`, `border-radius:${Number(c.card_radius)}px`, 'overflow:hidden');
  if (SHADOWS[c.card_shadow]) o.push(`--ha-card-box-shadow:${SHADOWS[c.card_shadow]}`, `box-shadow:${SHADOWS[c.card_shadow]}`);
  return o.join(';');
}

/** Per-card custom properties (never written into the stylesheet). */
function cardVars(c) {
  const v = [`--plc-poster-w:${Number(cfg(c, 'poster_width')) || 130}px`, `--plc-radius:${Number(cfg(c, 'corner_radius'))}px`,
    `--plc-title-px:${Number(cfg(c, 'title_size'))}px`, `--plc-line-px:${Number(cfg(c, 'line_size'))}px`,
    `--plc-head-px:${Number(cfg(c, 'header_size'))}px`, `--plc-sec-px:${Number(cfg(c, 'section_size'))}px`, `--plc-pad:${Number(cfg(c, 'card_padding'))}px`,
    `--plc-offset:${Number(cfg(c, 'screen_offset'))}px`, `--plc-search-w:${Number(cfg(c, 'search_width'))}px`];
  for (const [k, d] of Object.entries(COLOR_DEFS)) if (c[k] && d[3]) v.push(`${d[3]}:${String(c[k]).replace(/[;{}<>]/g, '')}`);
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

const KEYWORDS = /\$title|\$episode|\$genres|\$number|\$rating|\$release|\$runtime|\$studio|\$day|\$date|\$time|\$aired|\$tmdb_id|\$empty/g;

/** Title + line 1–4 of an item: $keywords replaced; a '-'-separated part whose keyword is empty is dropped. */
function umcLines(item, defaults, c, now = Date.now()) {
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
    $number: item.number || null, $rating: item.rating || null,
    $release: String(item.release || '').replace('$date', formatDate(item.airdate, fmt)).replace('$year', formatDate(item.airdate, 'yy')) || null,
    $runtime: runtime || null, $studio: item.studio || null,
    $day: air && !isNaN(air) ? air.toLocaleDateString([], { weekday: days <= 7 ? 'long' : 'short' }) : null,
    $date: formatDate(item.airdate, fmt) || null,
    $time: air && !isNaN(air) ? air.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: cfg(c, 'clock') !== '24' }) : null,
    $aired: formatDate(item.aired, fmt) || null, $tmdb_id: item.tmdb_id || null, $empty: '',
  };
  const tpl = [c.title_text || defaults.title_default || '$title', c.line1_text || defaults.line1_default || '$episode',
    c.line2_text || defaults.line2_default || '$release', c.line3_text || defaults.line3_default || '$rating - $runtime',
    c.line4_text || defaults.line4_default || '$number - $studio'];
  return tpl.map((t) => {
    const parts = String(t).replace(/ - /g, '-').split('-')
      .map((p) => p.replace(KEYWORDS, (k) => (keys[k] == null ? '\u0001' : keys[k])))
      .filter((p) => !p.includes('\u0001'));
    return parts.join(' - ').replace(KEYWORDS, (k) => keys[k] ?? '').trim();
  });
}

/** YouTube watch / youtu.be link → embed URL; anything else unchanged. */
function trailerEmbed(url) {
  const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/.exec(String(url || ''));
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1` : null;
}

// ------------------------------------------------------------------------------------------- card CSS
// Constant for every instance. Per-card values arrive as custom properties on .plc (cardVars()).

const CARD_CSS = `
.plc { --plc-a: var(--plc-accent, var(--accent-color, var(--primary-color)));
  --plc-bg2: var(--secondary-background-color, rgba(127,127,127,.12));
  --plc-r: var(--plc-radius, 10px);
  display: block; position: relative; overflow: hidden; color: var(--primary-text-color); padding: var(--plc-pad, 14px); box-sizing: border-box; }
.plc *, .plc *::before, .plc *::after { box-sizing: border-box; }
.plc button { font: inherit; color: inherit; cursor: pointer; }
.plc ha-icon { --mdc-icon-size: 20px; }
.plc-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.plc-title { margin: 0; font-size: var(--plc-head-px, 20px); font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.plc-sp { flex: 1; }
.plc-tvs { display: flex; gap: 6px; flex-wrap: wrap; }
.plc-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--divider-color, #444);
  background: transparent; font-size: .85em; font-weight: 600; white-space: nowrap; }
.plc-chip.on { border-color: var(--plc-a); background: color-mix(in srgb, var(--plc-a) 18%, transparent); }
.plc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--disabled-text-color, #777); }
.plc-dot.on { background: var(--success-color, #4caf50); } .plc-dot.play { background: var(--plc-a); }
.plc-select, .plc-search { padding: 7px 10px; border-radius: 8px; border: 1px solid var(--divider-color, #444); background: var(--plc-bg2);
  color: var(--primary-text-color); font: inherit; font-size: .9em; min-width: 0; }
.plc-search { flex: 1 1 180px; max-width: 320px; }
.plc-tabs { display: flex; gap: 4px; margin: 10px 0 8px; overflow-x: auto; scrollbar-width: none; }
.plc-tabs::-webkit-scrollbar { display: none; }
.plc-tab { padding: 7px 14px; border: none; border-radius: 8px; background: transparent; font-weight: 700; font-size: .92em; white-space: nowrap;
  color: var(--secondary-text-color); }
.plc-tab.on { color: var(--primary-text-color); background: var(--plc-bg2); box-shadow: inset 0 -2px 0 var(--plc-a); }
.plc-chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 10px; }
.plc-msg { color: var(--secondary-text-color); font-size: .9em; padding: 12px 2px; }
.plc-msg.err { color: var(--error-color, #f44336); }
.plc-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.plc.tablet .plc-body.with-detail { grid-template-columns: minmax(0, 1fr) minmax(280px, 34%); }
.plc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--plc-poster-w, 130px), 1fr)); gap: 14px 12px; }
.plc.phone .plc-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 8px; }
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
.plc-t { margin-top: 6px; font-size: var(--plc-title-px, 14px); font-weight: 700; line-height: 1.25; color: var(--plc-title-c, var(--primary-text-color));
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.plc-s { font-size: var(--plc-line-px, 12px); color: var(--plc-line-c, var(--secondary-text-color)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plc.tshadow .plc-t, .plc.tshadow .plc-s { text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.plc-sentinel { height: 30px; }
.plc-sec { margin: 4px 0 16px; }
.plc-sec-h { display: flex; align-items: baseline; gap: 8px; margin: 0 0 8px; font-size: var(--plc-sec-px, 12px); font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
  color: var(--plc-a); }
.plc-sec-h .n { color: var(--secondary-text-color); letter-spacing: .04em; }
.plc-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; scroll-snap-type: x proximity; }
.plc-row > .plc-tile { flex: 0 0 var(--plc-poster-w, 130px); scroll-snap-align: start; }
.plc.phone .plc-row > .plc-tile { flex-basis: 30%; }
.plc-row.fanart > .plc-tile { flex: 0 0 calc(var(--plc-poster-w, 130px) * 2.2); }
.plc.phone .plc-row.fanart > .plc-tile { flex-basis: 78%; }
.plc-row.fanart .plc-poster, .plc-grid.fanart .plc-poster { aspect-ratio: 16 / 9; }
.plc-grid.fanart { grid-template-columns: repeat(auto-fill, minmax(calc(var(--plc-poster-w, 130px) * 2), 1fr)); }
.plc.phone .plc-grid.fanart { grid-template-columns: minmax(0, 1fr); }
.plc.phone .plc-tvs { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
.plc-fan-text { position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 10px 8px; text-align: left;
  background: linear-gradient(transparent, rgba(0,0,0,.85)); }
.plc-fan-text .plc-t, .plc-fan-text .plc-s { color: #fff; }
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
.plc-detail-img { aspect-ratio: 16 / 10; background: center / cover no-repeat; position: relative; }
.plc-detail-img .plc-big { position: absolute; left: 14px; right: 14px; bottom: 12px; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.9); }
.plc-detail-body { padding: 12px 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.plc-detail-close { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,.55); border: none; color: #fff; }
.plc.phone .plc-detail { position: fixed; inset: 0; z-index: 8; border-radius: 0; overflow-y: auto; background: var(--card-background-color, var(--ha-card-background, #1c1c1c)); }
.plc.phone .plc-detail .plc-btns { position: sticky; bottom: 0; padding: 10px 0 4px; background: inherit; }
.plc-eps { display: flex; flex-direction: column; gap: 2px; max-height: 50vh; overflow-y: auto; }
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
.plc-slim { position: sticky; z-index: 6; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center;
  padding: 8px 12px; background: var(--card-background-color, var(--ha-card-background, #1c1c1c)); border: 1px solid var(--divider-color, #333);
  border-radius: calc(var(--plc-r) + 4px); }
.plc-slim.bottom { bottom: 0; margin-top: 12px; }
.plc-slim.top { top: 0; margin-bottom: 10px; }
.plc-slim-art { width: 40px; aspect-ratio: 2 / 3; border-radius: 6px; background: var(--plc-bg2) center / cover no-repeat; }
.plc-slim-t { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plc-slim .plc-bar-track { background: color-mix(in srgb, var(--primary-text-color) 20%, transparent); }
.plc-slim .plc-times { color: var(--secondary-text-color); }
.plc-slim-btns { display: flex; gap: 6px; align-items: center; }
.plc-slim-ctl { grid-column: 1 / -1; display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.plc-slim .plc-icon-btn { width: 36px; height: 36px; }
.plc-prog { height: 4px; border-radius: 2px; background: rgba(0,0,0,.45); position: absolute; left: 6px; right: 6px; bottom: 6px; overflow: hidden; }
.plc-prog > div { height: 100%; background: var(--plc-a); }
.plc-watched { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border-radius: 50%; background: rgba(0,0,0,.6); color: #fff;
  display: flex; align-items: center; justify-content: center; }
.plc-watched ha-icon { --mdc-icon-size: 16px; }
.plc-watch { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
.plc-sess { flex: 0 0 260px; display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 10px; padding: 8px; border-radius: 12px; background: var(--plc-bg2); }
.plc-sess-art { aspect-ratio: 2 / 3; border-radius: 6px; background: rgba(127,127,127,.2) center / cover no-repeat; }
.plc-sess .plc-bar-track { height: 4px; background: color-mix(in srgb, var(--primary-text-color) 18%, transparent); margin-top: 6px; }
.plc-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--plc-li-w, 340px)), 1fr)); gap: 12px; }
.plc-li { position: relative; display: block; width: 100%; min-height: var(--plc-li-h, 150px); padding: 0; text-align: left; overflow: hidden; color: inherit;
  border-radius: var(--plc-radius, 10px); border: 2px solid var(--plc-li-bd, #000); background: var(--plc-li-bg, #0d0d0d); }
.plc.shadows .plc-li { box-shadow: 0 4px 12px rgba(0,0,0,.5); }
.plc-li-img { position: absolute; top: 0; right: 0; bottom: 0; width: 60%; background: center / cover no-repeat;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 40%); mask-image: linear-gradient(to right, transparent, #000 40%); }
.plc-li-text { position: relative; padding: 10px 14px; max-width: 64%; display: flex; flex-direction: column; gap: 3px; }
.plc-li .plc-t { margin: 0; -webkit-line-clamp: 1; color: var(--plc-title-c, #d3d3d3); }
.plc-li .plc-s { color: var(--plc-line-c, #9a9a9a); }
.plc-li-flag { position: absolute; top: 0; right: 0; width: 0; height: 0; border-style: solid; border-width: 0 46px 46px 0;
  border-color: transparent var(--plc-flag-c, var(--plc-a)) transparent transparent; }
.plc-li.poster { display: grid; grid-template-columns: calc(var(--plc-li-h, 144px) * 2 / 3) minmax(0, 1fr); min-height: var(--plc-li-h, 0); }
.plc-s.l1 { font-size: var(--plc-l1-px, var(--plc-line-px, 12px)); color: var(--plc-l1-c, var(--plc-line-c, var(--secondary-text-color))); }
.plc-s.l2 { font-size: var(--plc-l2-px, var(--plc-line-px, 12px)); color: var(--plc-l2-c, var(--plc-line-c, var(--secondary-text-color))); }
.plc-s.l3 { font-size: var(--plc-l3-px, var(--plc-line-px, 12px)); color: var(--plc-l3-c, var(--plc-line-c, var(--secondary-text-color))); }
.plc-s.l4 { font-size: var(--plc-l4-px, var(--plc-line-px, 12px)); color: var(--plc-l4-c, var(--plc-line-c, var(--secondary-text-color))); }
.plc-li .plc-s.l1 { color: var(--plc-l1-c, var(--plc-line-c, #9a9a9a)); } .plc-li .plc-s.l2 { color: var(--plc-l2-c, var(--plc-line-c, #9a9a9a)); }
.plc-li .plc-s.l3 { color: var(--plc-l3-c, var(--plc-line-c, #9a9a9a)); } .plc-li .plc-s.l4 { color: var(--plc-l4-c, var(--plc-line-c, #9a9a9a)); }
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
.plc-sec-body.limit .plc-row { overflow-x: hidden; }
.plc-sec-body.scroll .plc-row { overflow-x: auto; }
.plc-sec-body.limit .plc-row > .plc-tile, .plc-sec-body.scroll .plc-row > .plc-tile {
  flex: 0 0 calc((100% - (var(--plc-show, 5) - 1) * 12px) / var(--plc-show, 5)); }
.plc-sec-body.scroll .plc-list { grid-template-columns: minmax(0, 1fr); overflow-y: auto; scrollbar-width: thin;
  max-height: calc(var(--plc-show, 5) * (var(--plc-li-h, 150px) + 16px) - 12px); }
.plc-sec-body.limit .plc-list { grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--plc-li-w, 340px)), 1fr)); }
.plc-sec-body.auto .plc-row, .plc-sec-body.auto .plc-list { scrollbar-width: none; }
.plc-sec-body.auto .plc-row::-webkit-scrollbar, .plc-sec-body.auto .plc-list::-webkit-scrollbar { display: none; }
.plc-fade { transition: opacity .6s ease; }
.plc-fade.out { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .plc-fade { transition: none; } }
.plc-viewall { margin-left: auto; border: none; background: none; color: var(--secondary-text-color); font-size: .9em; letter-spacing: .04em; }
.plc-top { display: block; margin-bottom: 8px; }
.plc-hrow { display: flex; align-items: center; gap: 10px; }
.plc-hrow + .plc-hrow { margin-top: 8px; }
.plc-hl, .plc-hc, .plc-hr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.plc-hl { flex: 1 1 auto; justify-content: flex-start; }
.plc-hc { flex: 0 1 auto; justify-content: center; }
.plc-hr { flex: 1 1 auto; justify-content: flex-end; }
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
.plc-count { font-size: 2.6em; font-weight: 800; color: var(--plc-a); text-align: center; }
.plc-cast { color: var(--secondary-text-color); font-size: .85em; }
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

const realOn = (hass, tv) => [tv.pipup, tv.plex_client, tv.adb].some((id) => id && isRealPlayback(hass.states[id]));
const tvLabel = (tv) => tv?.name || tv?.id || 'TV';

/** Now playing on a TV, from its players' states (the Plex player supplies the poster and episode). */
function nowPlaying(hass, tv) {
  if (!tv) return null;
  const p = tv.pipup && hass.states[tv.pipup], x = tv.plex_client && hass.states[tv.plex_client], a = tv.adb && hass.states[tv.adb];
  const src = [p, x, a].find((s) => isRealPlayback(s));
  if (src) {
    const meta = x && isRealPlayback(x) ? x.attributes : {};
    const at = src.attributes, series = meta.media_series_title;
    return { tv, live: true, st: src, title: series || at.media_title || meta.media_title || 'Playing',
      sub: series ? `S${meta.media_season} · E${meta.media_episode}${meta.media_title ? ` · ${meta.media_title}` : ''}` : (at.app_name || ''),
      art: meta.entity_picture || (src === a ? null : at.entity_picture) || null };
  }
  const on = [p, x, a].find((s) => s && !['off', 'unavailable', 'standby', 'unknown'].includes(s.state));
  return { tv, live: false, st: on || p || a || x || { state: 'off', attributes: {} },
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
    const prev = this._c;
    this._c = normalizeConfig(config);
    if (!this._built) return;
    this._applyLook();
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
    clearInterval(this._tick); this._tick = setInterval(() => this._progress(), 1000);
    clearInterval(this._poll); this._poll = setInterval(() => this._refresh(), SESSIONS_MS);
    if (this._root && !this._ro) this._observeSize();
  }
  disconnectedCallback() {
    clearInterval(this._tick); clearInterval(this._poll); this._tick = this._poll = null;
    for (const t of Object.values(this._anim || {})) clearInterval(t); this._anim = {};
    this._ro?.disconnect(); this._ro = null; this._io?.disconnect();
  }

  // ---- state

  get _key() { return `${this._c.title || ''}|${this._c.default_tv || ''}`; }
  get _v() {
    if (!VIEW.has(this._key)) VIEW.set(this._key, { tab: cfg(this._c, 'start_tab'), unwatched: false, sort: 'title', query: '',
      detail: null, season: null, hero: 0, ctl: cfg(this._c, 'slim_controls') === 'shown' });
    return VIEW.get(this._key);
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
    return m === 'auto' ? (this._phone ? 'slim' : 'panel') : m;
  }

  // ---- build once

  _build() {
    this._built = true;
    this.innerHTML = `<ha-card><div class="plc"><style>${CARD_CSS}</style><div class="plc-wrap">
      <div class="plc-side" hidden></div>
      <div class="plc-content"><div class="plc-slim-slot" data-slot="top"></div><div class="plc-top"></div>
        <div class="plc-body"><div class="plc-main"></div><div class="plc-detail-slot"></div></div>
        <div class="plc-slim-slot" data-slot="bottom"></div></div></div>
      <div class="plc-sheet-slot"></div></div></ha-card>`;
    this._root = this.querySelector('.plc');
    this._applyLook();
    this._observeSize();
    this._root.addEventListener('click', (e) => this._onClick(e));
    this._root.addEventListener('input', (e) => this._onInput(e));
    this._root.addEventListener('change', (e) => this._onChange(e));
    this._root.addEventListener('pointerdown', (e) => this._onScrub(e));
    this._renderAll();
    this._refresh(true);
  }

  async _refresh(first = false) {
    if (!this._hass) return;
    try {
      const had = !!this._conf;
      await cached(this._hass, 'config', first ? 0 : REFRESH_MS, () => ws(this._hass, 'config'), { force: first && !had });
      this._err = null;
      if (!had || first) this._renderAll();
      if (homeVisible(this._c, 'watching') && this._v.tab === 'home') {
        const before = JSON.stringify(peek('sessions') || []);
        await cached(this._hass, 'sessions', SESSIONS_MS - 1000, () => ws(this._hass, 'sessions'));
        if (JSON.stringify(peek('sessions') || []) !== before) this._paintWatching();
      }
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
    const want = cfg(this._c, 'layout');
    const w = this.offsetWidth || this._root?.offsetWidth || 1000;
    const phone = want === 'phone' || (want === 'auto' && w > 0 && w < PHONE_MAX_W);
    if (!this._root || this._phone === phone) return;
    this._phone = phone;
    this._root.classList.toggle('phone', phone);
    this._root.classList.toggle('tablet', !phone);
    if (this._built) this._renderAll();
  }

  _renderAll() { this._renderTop(); this._renderTabs(); this._renderMain(); this._renderDetail(); this._renderNP(true); }

  // ---- header

  /** Each header item's HTML ('' when it has nothing to show here). */
  _headerPieces() {
    const tvs = this._tvs(), cur = this._tv();
    const mode = cfg(this._c, 'lock') ? 'hidden' : cfg(this._c, 'tv_picker');
    const how = cfg(this._c, 'tv_label');
    const icons = this._c.tv_icons || {};
    const dot = (tv) => `<span class="plc-dot ${realOn(this._hass, tv) ? 'play' : (tv.state && !['off', 'unavailable', 'standby'].includes(tv.state) ? 'on' : '')}" data-dot="${esc(tv.id)}"></span>`;
    const face = (t) => {
      const ic = `<ha-icon icon="${esc(icons[t.id] || 'mdi:television')}"></ha-icon>`;
      return how === 'icon' ? `${dot(t)}${ic}` : how === 'both' ? `${dot(t)}${ic}${esc(tvLabel(t))}` : `${dot(t)}${esc(tvLabel(t))}`;
    };
    const cls = how === 'icon' ? ' icononly' : '';
    let picker = '';
    if (tvs.length > 1 && mode !== 'hidden') {
      picker = mode === 'dropdown'
        ? `<select class="plc-select" data-tvsel>${tvs.map((t) => `<option value="${esc(t.id)}"${t === cur ? ' selected' : ''}>${esc(tvLabel(t))}</option>`).join('')}</select>`
        : `<div class="plc-tvs">${tvs.map((t) => `<button class="plc-chip${cls}${t === cur ? ' on' : ''}" data-tv="${esc(t.id)}" title="${esc(tvLabel(t))}">${face(t)}</button>`).join('')}</div>`;
    } else if (cur && mode !== 'hidden') picker = `<span class="plc-chip${cls} on" title="${esc(tvLabel(cur))}">${face(cur)}</span>`;
    const title = this._c.title === undefined ? DEFAULTS.title : this._c.title;
    const libs = this._libraries();
    if (this._v.tab !== 'home' && this._conf && !libs.some((l) => l.key === this._v.tab || l.title === this._v.tab)) this._v.tab = 'home';
    const on = (l) => this._v.tab === l.key || this._v.tab === l.title;
    const v = this._v, inLib = v.tab !== 'home';
    const style = cfg(this._c, 'surprise_style'), icon = cfg(this._c, 'surprise_icon') || DEFAULTS.surprise_icon;
    const label = cfg(this._c, 'surprise_label') || DEFAULTS.surprise_label;
    const sorts = [['title', 'A → Z'], ['added', 'Recently added'], ['released', 'Release date'], ['year', 'Year'], ['rating', 'Rating'], ['viewed', 'Last watched']];
    return {
      title: title ? `<h1 class="plc-title">${esc(title)}</h1>` : '',
      tabs: `<div class="plc-tabs" role="tablist">${tabOrder(this._c, libs).map((t) => (t.id === 'home'
        ? `<button class="plc-tab${v.tab === 'home' ? ' on' : ''}" data-tab="home">Home</button>`
        : `<button class="plc-tab${on(t) ? ' on' : ''}" data-tab="${esc(t.key)}">${esc(t.title)}</button>`)).join('')}</div>`,
      search: inLib ? `<input class="plc-search" type="search" placeholder="Search" value="${esc(v.query)}" data-search>` : '',
      surprise: !cfg(this._c, 'surprise') || !libs.length ? ''
        : style === 'icon' ? `<button class="plc-icon-btn" data-surprise title="${esc(label)}"><ha-icon icon="${esc(icon)}"></ha-icon></button>`
          : `<button class="plc-chip" data-surprise>${style === 'both' ? `<ha-icon icon="${esc(icon)}"></ha-icon>` : ''}${esc(label)}</button>`,
      filters: inLib ? `<button class="plc-chip${!v.unwatched ? ' on' : ''}" data-unw="0">All</button><button class="plc-chip${v.unwatched ? ' on' : ''}" data-unw="1">Unwatched</button>` : '',
      sort: inLib ? `<select class="plc-select" data-sort>${sorts.map(([k, n]) => `<option value="${k}"${v.sort === k ? ' selected' : ''}>${n}</option>`).join('')}</select>` : '',
      tvs: picker,
    };
  }

  /** Up to three rows of left / middle / right groups; a row with nothing to show is left out. */
  _headerHtml(section, pieces, playerShown) {
    const rows = [1, 2, 3].map((row) => {
      const groups = { left: [], center: [], right: [] };
      for (const h of headerLayout(this._c)) {
        const sec = h.section === 'player' && !playerShown ? 'library' : h.section;
        if (h.hidden || sec !== section || h.row !== row || !pieces[h.id]) continue;
        groups[h.align].push(pieces[h.id]);
      }
      if (!groups.left.length && !groups.center.length && !groups.right.length) return '';
      return `<div class="plc-hrow" data-hrow="${row}"><div class="plc-hl">${groups.left.join('')}</div><div class="plc-hc">${groups.center.join('')}</div><div class="plc-hr">${groups.right.join('')}</div></div>`;
    });
    return rows.join('');
  }

  _renderTop() {
    const pieces = this._headerPieces();
    const playerShown = this._panelVisible();
    this._root.querySelector('.plc-top').innerHTML = this._headerHtml('library', pieces, playerShown);
    const ph = this._root.querySelector('.plc-phead');
    if (ph) ph.innerHTML = this._headerHtml('player', pieces, playerShown);
  }

  _panelVisible(np = nowPlaying(this._hass, this._tv())) {
    return this._npMode() === 'panel' && !this._phone && !!np && (np.live || cfg(this._c, 'panel_when') === 'always');
  }

  _renderTabs() { /* the tabs live in the header row: _renderTop() draws them */ }

  // ---- tiles

  _tile(it, listId, i, { fanart = false, lines = null } = {}) {
    const art = fanart ? (it.art || it.poster) : (it.poster || it.art);
    const ln = lines || [it.show || it.title, it.type === 'episode' ? `S${it.season} · E${it.episode} · ${it.title}` : (it.year || '')];
    const text = `<div class="plc-t">${esc(ln[0])}</div>${ln.slice(1).map((l, n) => (l ? `<div class="plc-s l${n + 1}">${esc(l)}</div>` : '')).join('')}`;
    const sel = this._v.detail && this._v.detail.list === listId && this._v.detail.i === i ? ' sel' : '';
    const flag = it.flag && cfg(this._c, 'flag') ? '<span class="plc-badge">New</span>' : '';
    const watched = it.watched ? '<span class="plc-watched" title="Watched"><ha-icon icon="mdi:check"></ha-icon></span>' : '';
    const prog = it.progress ? `<div class="plc-prog"><div style="width:${Math.min(100, Number(it.progress))}%"></div></div>` : '';
    const qp = it.key && ['movie', 'episode', 'show'].includes(it.type) ? `<span class="plc-play" data-qplay="${esc(listId)}|${i}" role="button" title="Play"><ha-icon icon="mdi:play"></ha-icon></span>` : '';
    return `<button class="plc-tile${sel}" data-open="${esc(listId)}|${i}"><div class="plc-poster"${art ? ` style="background-image:url('${cssUrl(art)}')"` : ''}>${art ? '' : esc(it.title)}${flag}${watched}${qp}${prog}${fanart ? `<div class="plc-fan-text">${text}</div>` : ''}</div>${fanart ? '' : text}</button>`;
  }

  // ---- main

  _renderMain() {
    const main = this._root.querySelector('.plc-main');
    this._io?.disconnect();
    if (this._err) { main.innerHTML = `<div class="plc-msg err">${esc(this._err)}</div>`; return; }
    if (!this._conf) { main.innerHTML = '<div class="plc-msg">Loading…</div>'; return; }
    if (!this._tvs().length) { main.innerHTML = '<div class="plc-msg">No TVs yet: add them in Plex Center\'s options (Settings → Devices & services → Plex Center → Configure).</div>'; return; }
    if (this._v.tab === 'home') this._renderHome(main); else this._renderLibrary(main);
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
      if (!homeVisible(this._c, id)) continue;
      if (id === 'cards') parts.push('<div class="plc-cards"></div>');
      else parts.push(`<div class="plc-sec" data-sec="${esc(id)}"></div>`);
    }
    main.innerHTML = parts.join('') || '<div class="plc-msg">Nothing on the Home tab. Turn sections on in the card editor, or pick a library above.</div>';
    this._paintWatching();
    this._paintUpcoming();
    this._renderExtraCards();
    const tv = this._tv();
    const key = `hubs:${tv.id}`;
    const recentIds = homeOrder(this._c).filter((id) => secType(this._c, id) === 'recent' && homeVisible(this._c, id) && !secStyle(this._c, id).s.source);
    homeOrder(this._c).filter((id) => secType(this._c, id) === 'recent' && homeVisible(this._c, id) && secStyle(this._c, id).s.source).forEach((id) => this._paintRecent(id));
    const paint = (h) => {
      const c = main.querySelector('[data-sec="continue"]');
      this._lists.set('continue', h.continue || []);
      if (c) { if (h.continue?.length) this._paintContinue(c, h.continue); else c.remove(); }
      this._recent = h.recent || [];
      for (const id of recentIds) this._paintRecent(id);
    };
    if (peek(key)) paint(peek(key));
    if (homeVisible(this._c, 'continue') || recentIds.length) {
      const size = Math.min(100, Math.max(Number(cfg(this._c, 'max')) || 12, ...recentIds.map((id) => secStyle(this._c, id).max * (secStyle(this._c, id).kind === 'both' ? 1 : 3))));
      cached(this._hass, key, REFRESH_MS, () => ws(this._hass, 'hubs', { tv: tv.id, size }))
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
      this._lists.set(id, items);
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
        this._libraries()[0] ? '<button class="plc-viewall" data-viewall="added">View all →</button>' : ''));
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
      if (!sensors.length) { sec.remove(); continue; }
      const pool = this._sensorItems(sensors).sort((a, b) => String(a.airdate).localeCompare(String(b.airdate)));
      const mine = this._byKind(id, pool), items = mine.slice(0, st.max);
      this._lists.set(id, items);
      sig(sec, JSON.stringify([JSON.stringify(this._c.home_style?.[id] || {}), cfg(this._c, 'image_style'), this._v.secOpen?.[id], this._v.secKind?.[id],
        JSON.stringify(this._kinds(id)), items.map((x) => [x.title, x.poster, x.lines])]), () => { this._fill(id, sec, SEC_TYPE_TITLE.upcoming, mine.length, items, id); });
    }
  }

  _paintWatching() {
    const sec = this._root?.querySelector('[data-sec="watching"]');
    if (!sec) return;
    const s = peek('sessions') || [];
    if (!s.length) { sec.innerHTML = ''; return; }
    sec.innerHTML = `<div class="plc-sec-h">Watching now <span class="n">${s.length}</span></div><div class="plc-watch">${s.map((x) => `
      <div class="plc-sess"><div class="plc-sess-art"${x.poster ? ` style="background-image:url('${cssUrl(x.poster)}')"` : ''}></div>
        <div style="min-width:0"><div class="plc-t">${esc(x.show || x.title)}</div>
          <div class="plc-s">${esc(x.type === 'episode' ? `S${x.season} · E${x.episode} · ${x.title}` : (x.year || ''))}</div>
          <div class="plc-s">${esc([x.user, x.player || x.device].filter(Boolean).join(' · '))}${x.player_state === 'paused' ? ' · paused' : ''}</div>
          <div class="plc-bar-track"><div class="plc-bar-fill" style="width:${Math.min(100, Number(x.progress) || 0)}%"></div></div></div></div>`).join('')}</div>`;
  }

  _paintContinue(sec, items) {
    if (this._phone) {
      sec.innerHTML = `<div class="plc-sec-h">Continue watching <span class="n">${items.length}</span></div>
        <div class="plc-row${cfg(this._c, 'image_style') === 'fanart' ? ' fanart' : ''}">${items.map((it, i) => this._tile(it, 'continue', i, { fanart: cfg(this._c, 'image_style') === 'fanart' })).join('')}</div>`;
      return;
    }
    const i = Math.min(this._v.hero || 0, items.length - 1), it = items[i];
    const sub = it.type === 'episode' ? `Season ${it.season}, Episode ${it.episode} · ${it.title}` : [it.year, it.duration ? fmtTime(it.duration) : ''].filter(Boolean).join(' · ');
    const left = it.offset ? `${fmtTime(it.offset)} of ${fmtTime(it.duration)} · ends ${endsAt((it.duration || 0) - it.offset, cfg(this._c, 'clock'))} if started now` : '';
    const img = it.art || it.still || it.poster;
    sec.innerHTML = `<div class="plc-hero"><div class="plc-hero-img"${img ? ` style="background-image:url('${cssUrl(img)}')"` : ''}></div>
      <div class="plc-hero-info"><div class="plc-eyebrow">Continue watching on ${esc(tvLabel(this._tv()))}</div>
        <h2 class="plc-big">${esc(it.show || it.title)}</h2><div class="plc-meta">${esc(sub)}</div>
        ${it.progress ? `<div class="plc-bar-track"><div class="plc-bar-fill" style="width:${it.progress}%"></div></div><div class="plc-meta">${esc(left)}</div>` : ''}
        <div class="plc-btns"><button class="plc-btn main" data-qplay="continue|${i}" data-direct><ha-icon icon="mdi:play"></ha-icon>Resume${it.offset ? ` ${fmtTime(it.offset)}` : ''}</button>
          <button class="plc-btn" data-qrestart="continue|${i}"><ha-icon icon="mdi:restart"></ha-icon>Start over</button></div>
        <div class="plc-pager"><button class="plc-icon-btn" data-hero="-1" title="Previous"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
          ${i + 1} / ${items.length}<button class="plc-icon-btn" data-hero="1" title="Next"><ha-icon icon="mdi:chevron-right"></ha-icon></button></div></div></div>`;
  }

  /** A Home section in its style: plain heading or collapsible bar; poster/fanart row or upcoming-media list. */
  _sectionHtml(id, sec, title, total, items, listId, extraHead = '') {
    const st = secStyle(this._c, id);
    sec.setAttribute('style', secVars(st));
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
    const head = st.collapsible
      ? `<button class="plc-sec-bar ${hcls}${total ? ' has' : ''}" data-secbar="${esc(id)}">${icon}${name}${chips}
          ${st.show_count ? `<span class="n">${esc(total ? count : 'None')}</span>` : ''}<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></button>`
      : `<div class="plc-sec-h ${hcls}">${icon}${name}${st.show_count ? ` <span class="n">${total}</span>` : ''}${chips}${extraHead}</div>`;
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
          <div class="plc-li-text"><div class="plc-t">${esc(lines[0] || it.title)}</div>${lines.slice(1).map((l, n) => (l ? `<div class="plc-s l${n + 1}">${esc(l)}</div>` : '')).join('')}</div>
          ${flagOn && it.flag ? '<span class="plc-li-flag"></span>' : ''}${qp}</button>`;
      }).join('')}</div>`;
    } else {
      body = `<div class="plc-row plc-fade${fan ? ' fanart' : ''}">${sel.map(([it, j]) => this._tile({ ...it, flag: flagOn && it.flag }, listId, j,
        { fanart: fan, lines: it.lines || null })).join('')}</div>`;
    }
    return body;
  }

  /** Fill a section and start its auto scroll / fade (stopped on the next fill or when the card leaves). */
  _fill(id, sec, title, total, items, listId, extraHead = '') {
    sec.innerHTML = this._sectionHtml(id, sec, title, total, items, listId, extraHead);
    this._anim = this._anim || {};
    clearInterval(this._anim[id]); delete this._anim[id];
    const st = secStyle(this._c, id);
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (st.auto === 'off' || reduce || items.length <= st.show) return;
    const body = sec.querySelector('[data-secbody]');
    let paused = false;
    body.addEventListener('pointerenter', () => { paused = true; });
    body.addEventListener('pointerleave', () => { paused = false; });
    if (st.auto === 'scroll') {
      const step = 50, px = Math.max(1, st.speed) * step / 1000;
      let acc = 0;
      this._anim[id] = setInterval(() => {
        const box = body.querySelector('.plc-row, .plc-list');
        if (!box || paused || !box.isConnected) return;
        const horiz = box.classList.contains('plc-row');
        acc += px;
        const move = Math.floor(acc); acc -= move;
        if (!move) return;
        const end = horiz ? box.scrollWidth - box.clientWidth : box.scrollHeight - box.clientHeight;
        const pos = horiz ? box.scrollLeft : box.scrollTop;
        const next = pos >= end - 1 ? 0 : pos + move;
        if (horiz) box.scrollLeft = next; else box.scrollTop = next;
      }, step);
    } else {
      const pages = Math.ceil(items.length / st.show);
      this._anim[id] = setInterval(() => {
        if (paused || !body.isConnected) return;
        const box = body.querySelector('.plc-fade');
        this._fadePage = { ...(this._fadePage || {}), [id]: ((this._fadePage?.[id] || 0) + 1) % pages };
        box?.classList.add('out');
        setTimeout(() => {
          if (!body.isConnected) return;
          body.innerHTML = this._sectionItems(st, items, listId, this._fadePage[id]);
          const nb = body.querySelector('.plc-fade');
          if (nb) { nb.classList.add('out'); setTimeout(() => nb.classList.remove('out'), 30); }
        }, 600);
      }, Math.max(2, st.speed) * 1000);
    }
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
function sig(node, s, paint) { if (node.dataset.sig === s) return; node.dataset.sig = s; paint(); }
const cssUrl = (u) => String(u).replace(/['"\\()\s]/g, (c) => encodeURIComponent(c));

Object.assign(PlexCenterCard.prototype, {
  // ---- library

  _libKey() { const l = this._libraries().find((x) => x.key === this._v.tab || x.title === this._v.tab); return l?.key; },
  _itemsKey(start = 0) { const v = this._v; return `items:${this._tv().id}:${this._libKey()}:${v.sort}:${v.unwatched ? 1 : 0}:${v.query}:${start}`; },

  _renderLibrary(main) {
    const lib = this._libKey();
    if (!lib) { main.innerHTML = '<div class="plc-msg">Loading…</div>'; return; }
    main.innerHTML = `      <div class="plc-gridwrap"><div class="plc-grid${cfg(this._c, 'image_style') === 'fanart' ? ' fanart' : ''}"></div><div class="plc-sentinel"></div></div>`;
    this._lists.set('grid', []);
    this._page(main, 0);
  },

  async _page(main, start) {
    const grid = main.querySelector('.plc-grid');
    if (!grid) return;
    const key = this._itemsKey(start), tv = this._tv(), v = this._v;
    const req = { tv: tv.id, library: this._libKey(), start, size: PAGE, sort: v.sort, ...(v.unwatched ? { unwatched: true } : {}), ...(v.query ? { query: v.query } : {}) };
    if (!peek(key) && start === 0) grid.innerHTML = '<div class="plc-msg">Loading…</div>';
    let res;
    try { res = await cached(this._hass, key, REFRESH_MS, () => ws(this._hass, 'items', req)); }
    catch (e) { grid.innerHTML = `<div class="plc-msg err">${esc(e?.message || e)}</div>`; return; }
    if (!grid.isConnected || this._itemsKey(start) !== key) return;
    if (start === 0) grid.innerHTML = '';
    const list = this._lists.get('grid');
    const from = list.length;
    list.push(...res.items);
    const fan = cfg(this._c, 'image_style') === 'fanart';
    grid.insertAdjacentHTML('beforeend', res.items.map((it, k) => this._tile(it, 'grid', from + k, { fanart: fan })).join(''));
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
    const meta = [it.year, it.content_rating, it.duration ? fmtTime(it.duration) : '', it.rating ? `★ ${Number(it.rating).toFixed(1)}` : '', (it.genres || []).join(', ')].filter(Boolean).join(' · ');
    const ep = it.type === 'episode' ? `<div class="plc-meta">${esc(`${it.show || ''} · S${it.season} · E${it.episode}`)}</div>` : '';
    const umc = it.umc ? (it.lines || []).slice(1).filter(Boolean).map((l) => `<div class="plc-meta">${esc(l)}</div>`).join('') : '';
    const summary = it.summary || it.umc?.summary;
    const playable = it.key && ['movie', 'episode', 'show'].includes(it.type);
    const resume = it.offset ? `Resume ${fmtTime(it.offset)}` : (it.type === 'show' && it.next ? `Play S${it.next.season} · E${it.next.episode}` : 'Play');
    const ends = it.duration ? `<div class="plc-meta">Ends at ${esc(endsAt(it.duration - (it.offset || 0), cfg(this._c, 'clock')))} if started now</div>` : '';
    slot.innerHTML = `<div class="plc-detail"><div class="plc-detail-img"${img ? ` style="background-image:url('${cssUrl(img)}')"` : ''}>
        <button class="plc-icon-btn plc-detail-close" data-close title="Close"><ha-icon icon="mdi:close"></ha-icon></button>
        <h2 class="plc-big">${esc(it.type === 'episode' ? it.title : (it.show || it.title))}</h2></div>
      <div class="plc-detail-body">${ep}${meta ? `<div class="plc-meta">${esc(meta)}</div>` : ''}${umc}
        ${it.progress ? `<div class="plc-bar-track"><div class="plc-bar-fill" style="width:${it.progress}%"></div></div>` : ''}${ends}
        ${summary ? `<div>${esc(summary)}</div>` : ''}
        ${it.cast?.length ? `<div class="plc-cast">${esc(it.cast.join(', '))}</div>` : ''}
        ${it.type === 'show' ? '<div class="plc-eps" data-eps><div class="plc-msg">Loading seasons…</div></div>' : ''}
        ${this._pickHtml()}
        <div class="plc-btns">${playable ? `<button class="plc-btn main" data-play="${it.type === 'show' ? 'next' : 'play'}"><ha-icon icon="mdi:play"></ha-icon>${esc(resume)} on ${esc(tvLabel(this._pickTv || tv))}</button>
          ${it.type !== 'show' && (it.offset || it.watched) ? '<button class="plc-btn" data-play="restart"><ha-icon icon="mdi:restart"></ha-icon>Start over</button>' : ''}` : ''}
          ${it.trailer ? '<button class="plc-btn" data-trailer><ha-icon icon="mdi:movie-open-play"></ha-icon>Trailer</button>' : ''}</div></div></div>`;
    if (it.type === 'show') this._paintSeasons(it);
    if (key && !peek(key)) {
      try { await cached(this._hass, key, REFRESH_MS, () => ws(this._hass, 'item', { tv: tv.id, key: base.key })); }
      catch { return; }
      if (this._v.detail === d) this._renderDetail();
    }
  },

  _pickHtml() {
    const tvs = this._tvs();
    if (cfg(this._c, 'client_choice') !== 'ask' || tvs.length < 2 || cfg(this._c, 'lock')) return '';
    const cur = this._pickTv || this._tv();
    return `<label class="plc-meta">Play on <select class="plc-select" data-pick>${tvs.map((t) => `<option value="${esc(t.id)}"${t === cur ? ' selected' : ''}>${esc(tvLabel(t))}</option>`).join('')}</select></label>`;
  },

  async _paintSeasons(show) {
    const box = this._root.querySelector('[data-eps]');
    if (!box || !show.seasons) return;
    const pick = show.seasons.find((s) => s.key === this._v.season) || show.seasons.find((s) => show.next && s.key === show.next.season_key) || show.seasons[0];
    box.innerHTML = `<select class="plc-select" data-season>${show.seasons.map((s) => `<option value="${esc(s.key)}"${s === pick ? ' selected' : ''}>${esc(s.title)}${s.watched ? ' ✓' : ''}</option>`).join('')}</select><div data-eplist><div class="plc-msg">Loading episodes…</div></div>`;
    const tv = this._tv(), key = `item:${tv.id}:${pick.key}`;
    let season;
    try { season = await cached(this._hass, key, REFRESH_MS, () => ws(this._hass, 'item', { tv: tv.id, key: pick.key })); }
    catch (e) { box.querySelector('[data-eplist]').innerHTML = `<div class="plc-msg err">${esc(e?.message || e)}</div>`; return; }
    const list = box.querySelector('[data-eplist]');
    if (!list?.isConnected) return;
    const eps = season.episodes || [];
    this._lists.set('eps', eps);
    list.innerHTML = eps.map((e, i) => `<div class="plc-ep"><span>${e.watched ? '✓ ' : ''}${e.episode != null ? `${e.episode}. ` : ''}${esc(e.title)}${e.progress ? ` · ${e.progress}%` : ''}</span>
      <button class="plc-icon-btn" data-qplay="eps|${i}" data-direct title="${e.offset ? `Resume ${fmtTime(e.offset)}` : 'Play'}"><ha-icon icon="mdi:play"></ha-icon></button>
      <button class="plc-icon-btn" data-qrestart="eps|${i}" title="Start over"><ha-icon icon="mdi:restart"></ha-icon></button></div>`).join('') || '<div class="plc-msg">No episodes.</div>';
  },

  // ---- play

  async _play(it, mode) {
    const tv = this._pickTv || this._tv();
    if (!tv || !it?.key) return;
    const what = it.type === 'episode' ? `${it.show || ''} S${it.season}E${it.episode}` : (it.show || it.title);
    this._toast(`${mode === 'restart' ? 'Starting over' : 'Playing'} ${what} on ${tvLabel(tv)}…`);
    try { await this._hass.callService('plex_center', 'play', { tv: tv.id, key: String(it.key), mode }); }
    catch (e) { this._toast(`Could not start: ${e?.message || e}`); }
  },

  /** A ▶ tap: in-progress titles ask Resume / Start over; "ask each time" asks for the TV; a show plays its next episode. */
  _quickPlay(r, direct) {
    const it = r.item;
    if (!it) return;
    if (cfg(this._c, 'client_choice') === 'ask' && this._tvs().length > 1 && !direct && !cfg(this._c, 'lock')) { this._openDetail(r); return; }
    if (it.offset && !direct) {
      this._sheet(`<div class="plc-detail-body"><h2 class="plc-big">${esc(it.show || it.title)}</h2><div class="plc-meta">${esc(tvLabel(this._tv()))}</div>
        <div class="plc-btns"><button class="plc-btn main" data-sheetplay="play"><ha-icon icon="mdi:play"></ha-icon>Resume ${fmtTime(it.offset)}</button>
        <button class="plc-btn" data-sheetplay="restart"><ha-icon icon="mdi:restart"></ha-icon>Start over</button>
        <button class="plc-btn" data-close-sheet>Cancel</button></div></div>`, it);
      return;
    }
    this._play(it, it.type === 'show' ? 'next' : 'play');
  },

  _openDetail(r) {
    this._v.detail = { list: r.list, i: r.i }; this._v.season = null; this._pickTv = null;
    this._root.querySelectorAll('.plc-tile.sel').forEach((n) => n.classList.remove('sel'));
    this._renderDetail();
  },

  _sheet(html, item = null) {
    this._sheetItem = item;
    this._root.querySelector('.plc-sheet-slot').innerHTML = `<div class="plc-sheet" data-close-sheet><div class="plc-sheet-in">${html}</div></div>`;
  },
  _closeSheet() { clearInterval(this._count); this._root.querySelector('.plc-sheet-slot').innerHTML = ''; this._sheetItem = null; },

  _trailer(url) {
    const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/.exec(String(url || ''));
    if (!m) { window.open(url, '_blank', 'noopener'); return; }
    this._sheet(`<iframe class="plc-frame" src="https://www.youtube.com/embed/${m[1]}?autoplay=1" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>
      <div class="plc-btns" style="padding:0 14px"><a class="plc-btn" href="https://www.youtube.com/watch?v=${m[1]}" target="_blank" rel="noopener">Open in YouTube</a>
      <button class="plc-btn" data-close-sheet>Close</button></div>`);
  },

  async _surprise() {
    const lib = this._libKey() || this._libraries()[0]?.key;
    if (!lib) return;
    let it;
    try { it = await ws(this._hass, 'random', { tv: this._tv().id, library: lib }); } catch (e) { this._toast(e?.message || e); return; }
    if (!it) { this._toast('Nothing to pick from.'); return; }
    let n = 5;
    const paint = () => this._sheet(`<div class="plc-detail-img"${it.art || it.poster ? ` style="background-image:url('${cssUrl(it.art || it.poster)}')"` : ''}><h2 class="plc-big">${esc(it.show || it.title)}</h2></div>
      <div class="plc-detail-body"><div class="plc-meta">${esc([it.year, it.duration ? fmtTime(it.duration) : '', (it.genres || []).join(', ')].filter(Boolean).join(' · '))}</div>
      ${it.summary ? `<div>${esc(it.summary)}</div>` : ''}<div class="plc-count">${n}</div>
      <div class="plc-btns"><button class="plc-btn main" data-sheetplay="play"><ha-icon icon="mdi:play"></ha-icon>Play now</button>
      <button class="plc-btn" data-surprise>Something else</button><button class="plc-btn" data-close-sheet>Not tonight</button></div></div>`, it);
    paint();
    clearInterval(this._count);
    this._count = setInterval(() => {
      n -= 1;
      const c = this._root.querySelector('.plc-count');
      if (!c) { clearInterval(this._count); return; }
      if (n <= 0) { clearInterval(this._count); this._closeSheet(); this._play(it, it.type === 'show' ? 'next' : 'play'); return; }
      c.textContent = n;
    }, 1000);
  },

  // ---- now playing: slim bar + side panel

  _renderNP(force = false) {
    const tv = this._tv();
    const np = nowPlaying(this._hass, tv);
    const mode = this._npMode();
    const panel = mode === 'panel' && this._panelVisible(np);
    const slim = mode !== 'off' && !panel && np;
    const s = JSON.stringify([mode, panel, slim, np && [np.live, np.title, np.sub, np.art, np.st.state], this._v.ctl, this._phone,
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
    const pos = cfg(this._c, 'slim_position') === 'top' ? 'top' : 'bottom';
    this._root.querySelectorAll('.plc-slim-slot').forEach((slot) => { slot.innerHTML = slim && slot.dataset.slot === pos ? this._slimHtml(np) : ''; });
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
      <button class="plc-icon-btn" data-np="home" title="Home"><ha-icon icon="mdi:home"></ha-icon></button></div>`;
  },

  _bar(np) {
    if (!np?.live) return '';
    return `<div class="plc-bar${seekable(np.tv) ? ' seek' : ''}" data-bar><div class="plc-bar-track"><div class="plc-bar-fill"></div></div></div>
      <div class="plc-times"><span data-pos></span><span data-ends></span><span data-dur></span></div>`;
  },

  _panelHtml(np) {
    const others = this._tvs();
    const sessions = peek('sessions') || [];
    const who = (t) => {
      const s = sessions.find((x) => x.user && t.user && x.user === t.user);
      if (s) return `${s.user} · ${s.show || s.title}`;
      return realOn(this._hass, t) ? 'playing' : (t.state || '');
    };
    return `<div class="plc-side-card"><div class="plc-side-art"${np.art ? ` style="background-image:url('${cssUrl(np.art)}')"` : ''}>${np.art ? '' : '<ha-icon icon="mdi:television"></ha-icon>'}</div>
      <div class="plc-side-info"><div class="plc-eyebrow">${np.live ? (np.st.state === 'playing' ? 'Now playing' : 'Paused') : 'Standing by'} · ${esc(tvLabel(np.tv))}</div>
        <h2 class="plc-big">${esc(np.title)}</h2>${np.sub ? `<div class="plc-meta">${esc(np.sub)}</div>` : ''}${this._bar(np)}${this._controls(np)}</div></div>
      ${others.length > 1 && !cfg(this._c, 'lock') ? `<div class="plc-playon"><div class="plc-playon-h">Play on</div>${others.map((t) => `<button class="plc-tvrow${t.id === np.tv.id ? ' on' : ''}" data-tv="${esc(t.id)}">
        <ha-icon icon="mdi:television"></ha-icon><b>${esc(tvLabel(t))}</b><small>${esc(who(t))}</small></button>`).join('')}</div>` : ''}`;
  },

  _slimHtml(np) {
    const pos = cfg(this._c, 'slim_position') === 'top' ? 'top' : 'bottom';
    const mode = cfg(this._c, 'slim_controls');
    const show = np.live && (mode === 'shown' || (mode === 'toggle' && this._v.ctl));
    const playing = np.st.state === 'playing';
    return `<div class="plc-slim ${pos}"><div class="plc-slim-art"${np.art ? ` style="background-image:url('${cssUrl(np.art)}')"` : ''}></div>
      <div style="min-width:0"><div class="plc-slim-t">${esc(np.title)}</div><div class="plc-s">${esc([tvLabel(np.tv), np.sub].filter(Boolean).join(' · '))}</div>${this._bar(np)}</div>
      <div class="plc-slim-btns">${np.live ? `<button class="plc-icon-btn" data-np="${playing ? 'pause' : 'play'}"><ha-icon icon="mdi:${playing ? 'pause' : 'play'}"></ha-icon></button>` : ''}
        ${np.live && mode === 'toggle' ? `<button class="plc-icon-btn" data-ctltoggle title="${show ? 'Hide' : 'Show'} the remote buttons"><ha-icon icon="mdi:${show ? 'chevron-down' : 'remote-tv'}"></ha-icon></button>` : ''}</div>
      ${show ? `<div class="plc-slim-ctl">${this._controls(np, false)}</div>` : ''}</div>`;
  },

  _progress() {
    const r = this._root;
    if (!r) return;
    const np = nowPlaying(this._hass, this._tv());
    if (!np?.live) return;
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
    this._hass.callService('plex_center', 'control', { tv: tv.id, action, ...(value != null ? { value: Number(value) } : {}) })
      .catch((err) => this._toast(`${action}: ${err?.message || err}`));
  },

  _updateStates() {
    if (!this._root) return;
    for (const tv of this._tvs()) {
      const el = this._root.querySelector(`[data-dot="${tv.id}"]`);
      if (el) el.className = `plc-dot ${realOn(this._hass, tv) ? 'play' : (tv.state && !['off', 'unavailable', 'standby'].includes(tv.state) ? 'on' : '')}`;
    }
    this._renderNP();
    if (this._v.tab === 'home') {
      this._paintUpcoming();
      homeOrder(this._c).filter((id) => secStyle(this._c, id).s.source).forEach((id) => this._paintRecent(id));
    }
  },

  // ---- events

  _onClick(e) {
    const t = (sel) => e.target.closest?.(sel);
    let el;
    if ((el = t('[data-seckind]'))) {
      e.stopPropagation();
      const [id, k] = el.dataset.seckind.split('|');
      const cur = this._kinds(id);
      this._v.secKind = { ...(this._v.secKind || {}), [id]: { ...cur, [k]: !cur[k] } };
      if (secType(this._c, id) === 'recent') this._paintRecent(id);
      else if (secType(this._c, id) === 'upcoming') this._paintUpcoming();
      return;
    }
    if ((el = t('[data-secbar]'))) {
      const id = el.dataset.secbar, st = secStyle(this._c, id);
      this._v.secOpen = { ...(this._v.secOpen || {}), [id]: !(this._v.secOpen?.[id] ?? !st.collapsed) };
      el.closest('.plc-sec')?.classList.toggle('closed', !this._v.secOpen[id]);
      return;
    }
    if ((el = t('[data-qplay]'))) { e.stopPropagation(); this._quickPlay(this._item(el.dataset.qplay), el.hasAttribute('data-direct')); return; }
    if ((el = t('[data-qrestart]'))) { e.stopPropagation(); const { item } = this._item(el.dataset.qrestart); if (item) this._play(item, 'restart'); return; }
    if ((el = t('[data-sheetplay]'))) { const it = this._sheetItem; this._closeSheet(); if (it) this._play(it, el.dataset.sheetplay === 'restart' ? 'restart' : (it.type === 'show' ? 'next' : 'play')); return; }
    if (t('[data-surprise]')) { this._surprise(); return; }
    if ((el = t('[data-close-sheet]')) && (e.target === el || el.tagName === 'BUTTON')) { this._closeSheet(); return; }
    if ((el = t('[data-tv]'))) { const tv = this._tvs().find((x) => x.id === el.dataset.tv); if (tv) this._setTv(tv); return; }
    if ((el = t('[data-tab]'))) {
      if (this._v.tab === el.dataset.tab) return;
      Object.assign(this._v, { tab: el.dataset.tab, detail: null });
      this._renderTop(); this._renderTabs(); this._renderMain(); this._renderDetail(); this._refresh(); return;
    }
    if ((el = t('[data-viewall]'))) {
      const lib = this._libraries()[0];
      if (lib) { Object.assign(this._v, { tab: lib.key, sort: 'added', detail: null }); this._renderTop(); this._renderTabs(); this._renderMain(); this._renderDetail(); }
      return;
    }
    if ((el = t('[data-unw]'))) { this._v.unwatched = el.dataset.unw === '1'; this._v.detail = null; this._renderTop(); this._renderMain(); this._renderDetail(); return; }
    if ((el = t('[data-hero]'))) {
      const items = this._lists.get('continue') || [];
      this._v.hero = ((this._v.hero || 0) + Number(el.dataset.hero) + items.length) % Math.max(1, items.length);
      const sec = this._root.querySelector('[data-sec="continue"]'); if (sec) this._paintContinue(sec, items); return;
    }
    if ((el = t('[data-open]'))) {
      const r = this._item(el.dataset.open);
      if (!r.item) return;
      if (cfg(this._c, 'tap_action') === 'play' && r.item.key) { this._quickPlay(r, false); return; }
      this._openDetail(r); el.classList.add('sel'); return;
    }
    if (t('[data-close]')) { this._v.detail = null; this._root.querySelectorAll('.plc-tile.sel').forEach((n) => n.classList.remove('sel')); this._renderDetail(); return; }
    if ((el = t('[data-play]'))) { if (this._detailItem) this._play(this._detailItem, el.dataset.play); return; }
    if (t('[data-trailer]')) { if (this._detailItem?.trailer) this._trailer(this._detailItem.trailer); return; }
    if ((el = t('[data-np]'))) { const [a, v] = el.dataset.np.split(':'); this._control(a, v); return; }
    if (t('[data-ctltoggle]')) { this._v.ctl = !this._v.ctl; this._renderNP(true); }
  },

  _onInput(e) {
    if (!e.target.matches?.('[data-search]')) return;
    this._v.query = e.target.value.trim();
    clearTimeout(this._qt);
    this._qt = setTimeout(() => { const main = this._root.querySelector('.plc-main'); this._lists.set('grid', []); if (main.querySelector('.plc-grid')) { main.querySelector('.plc-grid').innerHTML = ''; this._page(main, 0); } }, 300);
  },

  _onChange(e) {
    const el = e.target;
    if (el.matches?.('[data-tvsel]')) { const tv = this._tvs().find((x) => x.id === el.value); if (tv) this._setTv(tv); return; }
    if (el.matches?.('[data-pick]')) { this._pickTv = this._tvs().find((x) => x.id === el.value); this._renderDetail(); return; }
    if (el.matches?.('[data-sort]')) { this._v.sort = el.value; this._renderTop(); this._renderMain(); return; }
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
        .plce-row { display: flex; align-items: center; gap: var(--ltek-sp-4); padding: var(--ltek-sp-1) 0; flex-wrap: wrap; justify-content: flex-start; }
        .plce-row label.lbl { color: var(--ltek-c-label); font-size: var(--ltek-fs-body); font-weight: var(--ltek-fw-normal); flex: none; }
        .plce-row input[type="text"], .plce-row select { flex: 1 1 auto; min-width: 0; padding: var(--ltek-ctrl-pad);
          background: var(--secondary-background-color, #2a2a2a); border: 1px solid var(--ltek-c-border); border-radius: var(--ltek-r-ctrl);
          color: var(--ltek-c-text); font-size: var(--ltek-fs-body); }
        .plce-row input[type="range"] { flex: 1 1 auto; min-width: 100px; accent-color: var(--ltek-c-accent); cursor: pointer; }
        .plce-val { flex: 0 0 var(--ltek-slider-val-w); text-align: right; font-weight: var(--ltek-fw-bold); font-variant-numeric: tabular-nums;
          white-space: nowrap; color: var(--ltek-c-text); font-size: var(--ltek-fs-body); }
        .plce-nowrap { flex-wrap: nowrap; }
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
        .plce-sub { border-top: 1px solid var(--ltek-c-border-soft); border-radius: var(--ltek-r-ctrl); }
        .plce-sub[open] { border: 1px solid var(--accent-color, var(--ltek-c-accent)); margin: var(--ltek-sp-1) 0; }
        .plce-sub > summary { display: flex; align-items: center; gap: var(--ltek-sp-2); padding: var(--ltek-sp-3) var(--ltek-sp-2); cursor: pointer;
          list-style: none; color: var(--ltek-c-accent); font-size: var(--ltek-fs-label); font-weight: var(--ltek-fw-semibold);
          text-transform: uppercase; letter-spacing: 0.04em; }
        .plce-sub > summary::-webkit-details-marker { display: none; }
        .plce-sub > summary .chev { margin-left: auto; color: #999; --mdc-icon-size: 20px; transition: transform .2s ease; transform: rotate(-90deg); }
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
const REVEAL_KEYS = new Set(['tv_label', 'surprise', 'surprise_style', 'fit_screen', 'layout', 'image_style', 'now_playing', 'tv_picker', 'lock', 'client_choice', 'slim_controls', 'card_shadow']);

class PlexCenterCardEditor extends HTMLElement {
  constructor() { super(); this._config = {}; this._open = new Set(); this._cmode = {}; this._rendered = false; }

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
  _select(key, label, options) {
    const cur = this._c(key);
    return `<div class="plce-row"><label class="lbl">${label}</label><select data-key="${key}">${options.map(([v, n]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
  }
  _slider(key, label, min, max, unit = 'px') {
    const v = Number(this._c(key));
    return `<div class="plce-row plce-nowrap"><label class="lbl">${label}</label><input type="range" data-skey="${key}" data-unit="${unit}" min="${min}" max="${max}" step="1" value="${v}">
      <span class="plce-val" data-val="${key}">${v}${unit}</span>${this._config[key] !== undefined ? `<button class="plce-reset" data-reset="${key}" title="Back to default"><ha-icon icon="mdi:restore"></ha-icon></button>` : ''}</div>`;
  }
  _colorControl(key) {
    const [label, defLabel, seed] = COLOR_DEFS[key];
    const cur = this._config[key] || '';
    const mode = this._cmode[key] || (cur === 'transparent' ? 'transparent' : colorMode(cur));
    let field = '';
    if (mode === 'theme') field = `<select class="plce-ctheme" data-ckey="${key}">${THEME_COLORS.map(([v, n]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
    else if (mode === 'custom') field = `<input type="color" class="plce-chex" data-ckey="${key}" value="${/^#[0-9a-fA-F]{6}$/.test(cur) ? cur : seed}">`;
    else if (mode === 'css') field = `<input type="text" class="plce-ccss" data-ckey="${key}" value="${esc(cur)}" placeholder="e.g. tomato, rgba(…), var(--my-color)">`;
    const modes = [['default', defLabel], ...(key === 'card_bg' ? [['transparent', 'Transparent']] : []), ['theme', 'Theme color'], ['custom', 'Custom color'], ['css', 'Custom CSS']];
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
      ${this._select('tv_picker', 'Show the TV picker', [['chips', 'As buttons'], ['dropdown', 'As a dropdown'], ['hidden', 'Hidden (always the default TV)']])}
      ${this._select('tv_label', 'TV buttons show', [['name', 'Name'], ['icon', 'Icon only'], ['both', 'Icon and name']])}
      ${this._c('tv_label') !== 'name' ? tvs.map((t) => `<div class="plce-row"><label class="lbl">${esc(t.name)} icon</label><ha-icon-picker data-tvicon="${esc(t.id)}" value="${esc((this._config.tv_icons || {})[t.id] || '')}" placeholder="mdi:television"></ha-icon-picker></div>`).join('') : ''}
      ${this._select('default_tv', 'Default TV', [['', 'First in the list'], ...tvs.map((t) => [t.id, t.name])])}
      ${this._c('lock') ? '' : this._select('client_choice', 'When playing', [['card', "Use the card's TV"], ['ask', 'Ask which TV each time']])}
      ${this._check('lock', 'Lock to the default TV (wall tablet: no picker, no TV choice)')}`;
  }

  _headerBody() {
    const items = headerLayout(this._config), names = new Map(HEADER_ITEMS);
    const sel = (i, k, opts, cur) => `<select data-hi="${i}" data-hk="${k}">${opts.map(([v, n]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
    const rows = items.map((h, i) => `<div class="plce-item${h.hidden ? ' off' : ''}"><div class="plce-item-h"><ha-icon icon="mdi:drag-horizontal-variant"></ha-icon>
        <span class="plce-name">${esc(names.get(h.id))}</span>
        <button class="plce-act" data-hiup="${i}" title="Move earlier"${i ? '' : ' disabled'}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button class="plce-act" data-hidown="${i}" title="Move later"${i < items.length - 1 ? '' : ' disabled'}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
        <button class="plce-act" data-hivis="${i}" title="${h.hidden ? 'Show' : 'Hide'}"><ha-icon icon="mdi:${h.hidden ? 'eye-off' : 'eye'}"></ha-icon></button></div>
      ${h.hidden ? '' : `<div class="plce-row">${sel(i, 'section', [['library', 'Library / Home header'], ['player', 'Player header']], h.section)}
        ${sel(i, 'row', [[1, 'Row 1'], [2, 'Row 2'], [3, 'Row 3']], h.row)}${sel(i, 'align', [['left', 'Left'], ['center', 'Middle'], ['right', 'Right']], h.align)}</div>`}</div>`).join('');
    return `<p class="plce-hint">Two headers: the <b>Library / Home</b> header above the library, and the <b>Player</b> header above the player side panel
        (tablets). Each item goes in a row (up to three) and on the left, in the middle or on the right; items in the same place are shown in this
        list's order. Rows with nothing to show are left out. When the side panel isn't showing, Player items appear in the Library header.</p>
      <div class="plce-list">${rows}</div>
      ${this._slider('search_width', 'Search box width', 100, 800)}
      ${this._config.header ? '<button class="plce-add" data-hreset>Back to the default header</button>' : ''}`;
  }

  _libraryBody() {
    const tv = (this._conf?.tvs || []).find((t) => t.id === this._config.default_tv) || this._conf?.tvs?.[0];
    const libs = Array.isArray(this._conf?.libraries?.[tv?.user || '']) ? this._conf.libraries[tv.user || ''] : [];
    const pick = this._config.libraries || [];
    return `<p class="plce-hint">Each TV shows what its Plex user is shared. Untick libraries this card should hide.</p>
      ${libs.length ? `<div class="plce-checks">${libs.map((l) => `<label class="plce-check"><input type="checkbox" data-lib="${esc(l.title)}"${!pick.length || pick.includes(l.title) ? ' checked' : ''}>${esc(l.title)}</label>`).join('')}</div>` : '<p class="plce-hint">Libraries appear once Plex Center has loaded.</p>'}
      <div class="plce-group">Tab order</div>
      <div class="plce-list">${tabOrder(this._config, libs.filter((l) => !pick.length || pick.includes(l.title))).map((t, i, all) => `<div class="plce-item"><div class="plce-item-h">
        <ha-icon icon="${t.id === 'home' ? 'mdi:home-variant' : 'mdi:folder-play-outline'}"></ha-icon><span class="plce-name">${esc(t.title)}</span>
        <button class="plce-act" data-tup="${i}" title="Move left"${i ? '' : ' disabled'}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button class="plce-act" data-tdown="${i}" title="Move right"${i < all.length - 1 ? '' : ' disabled'}><ha-icon icon="mdi:arrow-down"></ha-icon></button></div></div>`).join('')}</div>
      ${this._config.tab_order ? '<button class="plce-add" data-treset>Back to the default order</button>' : ''}
      ${this._select('start_tab', 'Start on', [['home', 'Home'], ...libs.map((l) => [l.key, l.title])])}
      ${this._select('tap_action', 'Tapping a poster', [['details', 'Opens its details'], ['play', 'Plays it at once']])}`;
  }

  _homeBody() {
    const order = homeOrder(this._config), labels = new Map(homeSections(this._config));
    const list = order.map((id, i) => `<div class="plce-item${homeVisible(this._config, id) ? '' : ' off'}"><div class="plce-item-h">
        <ha-icon icon="${{ watching: 'mdi:account-eye', continue: 'mdi:play-pause', cards: 'mdi:cards-outline' }[id] || (secType(this._config, id) === 'upcoming' ? 'mdi:calendar-clock' : 'mdi:plex')}"></ha-icon>
        <span class="plce-name">${esc(labels.get(id) || id)}</span>
        <button class="plce-act" data-hup="${i}" title="Move up"${i ? '' : ' disabled'}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button class="plce-act" data-hdown="${i}" title="Move down"${i < order.length - 1 ? '' : ' disabled'}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
        <button class="plce-act" data-hvis="${esc(id)}" title="${homeVisible(this._config, id) ? 'Hide' : 'Show'}"><ha-icon icon="mdi:${homeVisible(this._config, id) ? 'eye' : 'eye-off'}"></ha-icon></button>
        ${secType(this._config, id) ? `<button class="plce-act${this._open.has(`sty:${id}`) ? ' on' : ''}" data-sedit="${esc(id)}" title="Edit the style"><ha-icon icon="mdi:pencil"></ha-icon></button>` : '<span class="plce-slot"></span>'}
        ${(this._config.home_extra || []).some((x) => x.id === id) ? `<button class="plce-del" data-xdel="${esc(id)}" title="Remove"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>` : '<span class="plce-slot"></span>'}</div>
        ${secType(this._config, id) && this._open.has(`sty:${id}`) ? `<div class="plce-sub-body plce-styled">${this._secStyleBody(id)}</div>` : ''}</div>`).join('');
    const soon = upcomingSensors(this._hass, this._conf);
    return `<p class="plce-hint">Order and show / hide the sections of the Home tab. <b>Coming Soon</b> uses the upcoming-media sensors found:
        ${soon.length ? soon.map((x) => `<code>${esc(x.id)}</code>`).join(', ') : 'none (install Radarr / Sonarr upcoming sensors)'}.</p>
      <div class="plce-list">${list}</div>
      <div class="plce-row"><button class="plce-add" data-xadd="recent">+ Recently Added</button><button class="plce-add" data-xadd="upcoming">+ Coming Soon</button></div>
      ${this._check('surprise', 'Surprise me button')}
      ${this._c('surprise') ? `${this._select('surprise_style', 'Surprise me shows', [['icon', 'Icon only'], ['both', 'Icon and text'], ['text', 'Text only']])}
        ${this._c('surprise_style') !== 'icon' ? this._text('surprise_label', 'Text', DEFAULTS.surprise_label) : ''}
        ${this._c('surprise_style') !== 'text' ? `<div class="plce-row"><label class="lbl">Icon</label><ha-icon-picker data-icon="surprise_icon" value="${esc(this._c('surprise_icon'))}"></ha-icon-picker></div>` : ''}` : ''}
      <p class="plce-hint">Extra cards under the rows: <code>home_cards:</code> with any card configs, in YAML.</p>`;
  }

  /** Style of one Home section; every value unset = the card's setting (Appearance). */
  _secStyleBody(id) {
    const s = (this._config.home_style || {})[id] || {};
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
    const st = secStyle(this._config, id);
    const chk = (k, label, def) => `<label class="plce-check"><input type="checkbox" data-sid="${esc(id)}" data-stri="${k}" data-def="${def ? 1 : 0}"${(s[k] ?? def) ? ' checked' : ''}>${label}</label>`;
    const lineRows = [1, 2, 3, 4].map((n) => `${sl(`l${n}_px`, `Line ${n} size`, 8, 24, s.line_px ?? this._c('line_size'))}${col(`l${n}_color`, `Line ${n} color`, '#9a9a9a')}`).join('');
    const sensorsAll = this._conf?.upcoming_sensors || [];
    const fn = (x) => this._hass.states[x]?.attributes?.friendly_name || x;
    const source = st.type === 'recent'
      ? `<div class="plce-row"><label class="lbl">Source</label><select data-sid="${esc(id)}" data-sk="source"><option value="">Plex Center (each TV's Plex user, recommended)</option>${
        sensorsAll.map((x) => `<option value="${esc(x)}"${s.source === x ? ' selected' : ''}>${esc(fn(x))}</option>`).join('')}</select></div>`
      : `<div class="plce-group first">Sensors</div><p class="plce-hint">None ticked = automatic (the Radarr / Sonarr upcoming sensors).</p>
        <div class="plce-tvlist">${sensorsAll.map((x) => `<label class="plce-check"><input type="checkbox" data-sid="${esc(id)}" data-ssens="${esc(x)}"${(s.sensors || []).includes(x) ? ' checked' : ''}>${esc(fn(x))}</label>`).join('') || '<p class="plce-hint">No upcoming-media sensors found.</p>'}</div>`;
    return `${source}<div class="plce-row"><label class="lbl">Title</label><input type="text" data-sid="${esc(id)}" data-sk="title" value="${esc(s.title || '')}" placeholder="${esc(SEC_TYPE_TITLE[st.type] || '')}"></div>
      ${sel('kind', 'Show', [['', 'Movies and TV'], ['movie', 'Movies'], ['show', 'TV']])}
      ${chk('chips', 'Movies and TV chips in the header (turn each on or off)', false)}
      <div class="plce-group">Header</div>
      ${chk('show_title', 'Show the title', true)}${chk('show_count', 'Show the number of items', true)}${chk('show_icon', 'Show the icon', st.collapsible || !!s.icon)}
      ${chk('divider', 'Divider line under the header', st.collapsible)}
      ${st.divider ? col('divider_color', 'Divider color', '#2196f3', false, 'Section text color') : ''}
      ${sel('head_style', 'Title style', [['', st.collapsible ? 'Plain (bar default)' : 'Section style (caps, accent)'], ['caps', 'Section style (caps, accent)'], ['plain', 'Plain']])}
      <div class="plce-group">Items</div>
      ${sel('layout', 'Layout', [['', 'Row'], ['list', 'Column']])}
      ${sel('image', 'Image', [['', 'Card default'], ['poster', 'Poster'], ['fanart', 'Fanart']])}
      <label class="plce-check"><input type="checkbox" data-sid="${esc(id)}" data-sbool="collapsible"${s.collapsible ? ' checked' : ''}>Collapsible, with a header bar</label>
      ${s.collapsible ? `<label class="plce-check"><input type="checkbox" data-sid="${esc(id)}" data-sbool="collapsed"${s.collapsed ? ' checked' : ''}>Start collapsed</label>` : ''}
      <div class="plce-row"><label class="lbl">Icon</label><ha-icon-picker data-sid="${esc(id)}" data-sicon="icon" value="${esc(s.icon || '')}"></ha-icon-picker></div>
      ${sel('flag', '"New" flag', [['', 'Card default'], ['true', 'On'], ['false', 'Off']])}
      ${sl('show', 'Items to show', 1, 20, st.show, '')}
      ${chk('scroll', 'Scroll to see more items', false)}
      ${sel('auto', 'Auto play', [['', 'Off'], ['scroll', 'Ticker (scrolls on its own)'], ['fade', 'Fade (fades to the next set)']])}
      ${st.auto === 'scroll' ? sl('speed', 'Ticker speed', 5, 200, st.speed, ' px/s') : ''}
      ${st.auto === 'fade' ? sl('speed', 'Next set every', 2, 60, st.speed, ' s') : ''}
      ${st.scroll || st.auto !== 'off' ? sl('total', 'Items to load', st.show, 100, st.total, '') : ''}
      ${list ? `${sl('list_w', 'Item width', 220, 800, 340)}${sl('item_h', 'Item height', 60, 400, 150)}` : ''}
      ${sl('radius', 'Corner radius', 0, 30, this._c('corner_radius'))}
      ${sl('title_px', 'Title size', 8, 30, this._c('title_size'))}${sl('line_px', 'Line size', 8, 24, this._c('line_size'))}
      ${col('title_color', 'Title color', '#d3d3d3')}${col('line_color', 'Line color (all lines)', '#9a9a9a')}${col('flag_color', 'Flag color', '#0099cc')}
      ${this._sub(`lines:${id}`, 'Each line', `<p class="plce-hint">Size and color per line; unset = the values above.</p>${lineRows}`)}
      ${list ? `${col('item_bg', 'Item background', '#0d0d0d', true)}${col('border_color', 'Item border', '#000000', true)}` : ''}`;
  }

  _npBody() {
    const m = this._c('now_playing');
    return `<p class="plce-hint">The side panel (tablets) shows the poster, big controls and every TV. Slim controls show whenever the panel does not.</p>
      ${this._select('now_playing', 'Now playing', [['auto', 'Automatic (side panel on tablets, slim controls on phones)'], ['panel', 'Side panel'], ['slim', 'Slim controls'], ['off', 'Off']])}
      ${m === 'panel' || m === 'auto' ? `${this._select('panel_when', 'Side panel', [['always', 'Always'], ['playing', 'Only while something plays']])}
        ${this._check('fit_screen', 'Fit the card to the screen height: the player stays put, the library scrolls')}
        ${this._c('fit_screen') ? `${this._slider('screen_offset', 'Space above / below the card', 0, 300)}<p class="plce-hint">Room for the dashboard header and margins. Raise it if the card runs past the bottom of the screen.</p>` : ''}` : ''}
      ${m !== 'off' ? `${this._select('slim_position', 'Slim controls position', [['bottom', 'Bottom'], ['top', 'Top']])}
        ${this._select('slim_controls', 'Remote buttons in the slim controls', [['toggle', 'Button to show / hide them'], ['shown', 'Always shown'], ['hidden', 'Hidden']])}` : ''}`;
  }

  _styleBody() {
    const px = (k, label, min, max) => this._slider(k, label, min, max);
    return `${this._sub('ap-layout', 'Layout', `<p class="plce-hint">Automatic uses the phone layout when the card is narrower than ${PHONE_MAX_W}px.</p>
        ${this._select('layout', 'Layout', [['auto', 'Automatic'], ['tablet', 'Tablet'], ['phone', 'Phone']])}${this._text('title', 'Title', 'Plex')}`)}
      ${this._sub('ap-card', 'Card', `${this._colorControl('card_bg')}
        ${this._slider('card_border_width', 'Border width', 0, 8)}${this._colorControl('card_border_color')}
        ${this._slider('card_radius', 'Corner radius', 0, 32)}
        ${this._select('card_shadow', 'Shadow', [['theme', 'Theme default'], ['none', 'None'], ['soft', 'Soft'], ['strong', 'Strong']])}
        ${this._slider('card_padding', 'Padding', 0, 32)}`)}
      ${this._sub('ap-posters', 'Posters &amp; rows', `${this._select('image_style', 'Image style', [['poster', 'Poster'], ['fanart', 'Fanart (wide backdrops)']])}
        ${this._slider('max', 'Items per row', 1, 50, '')}${this._slider('poster_width', 'Poster width', 80, 260)}${this._slider('corner_radius', 'Poster corner radius', 0, 24)}
        ${this._check('box_shadows', 'Poster shadows')}${this._check('flag', '"New" flag on unwatched items')}`)}
      ${this._sub('ap-text', 'Text', `${px('header_size', 'Card title', 10, 40)}${px('section_size', 'Section headings', 8, 24)}
        ${px('title_size', 'Poster titles', 8, 28)}${px('line_size', 'Poster lines', 8, 24)}${this._check('text_shadows', 'Text shadows')}`)}
      ${this._sub('ap-colors', 'Colors', Object.keys(COLOR_DEFS).filter((k) => !k.startsWith('card_')).map((k) => this._colorControl(k)).join(''))}
      ${this._sub('ap-rowtext', 'Row text (upcoming-media rows)', `<p class="plce-hint">Keywords: <code>$title $episode $number $release $date $day $time $aired $runtime $rating $genres $studio $empty</code>.
        A part between <code>-</code> whose keyword is empty is left out. Blank = the sensor's default.</p>
        ${['title_text', 'line1_text', 'line2_text', 'line3_text', 'line4_text'].map((k, i) => this._text(k, i ? `Line ${i}` : 'Title')).join('')}
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
      ${this._panel('tvs', 'mdi:television-play', 'TVs', this._tvsBody())}
      ${this._panel('header', 'mdi:page-layout-header', 'Header', this._headerBody())}
      ${this._panel('library', 'mdi:plex', 'Library', this._libraryBody())}
      ${this._panel('home', 'mdi:home-variant', 'Home', this._homeBody())}
      ${this._panel('np', 'mdi:play-box-outline', 'Now playing', this._npBody())}
      ${this._panel('style', 'mdi:palette', 'Appearance', this._styleBody())}
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
      } else this._open.delete(d.dataset.panel);
    }));
    all('details.plce-sub', (d) => d.addEventListener('toggle', () => { if (d.open) this._open.add(d.dataset.panel); else this._open.delete(d.dataset.panel); }));
    const order = () => homeOrder(this._config);
    const move = (i, dir) => { const o = order(); const j = i + dir; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; this._config.home_order = o; this._emit(); this._render(); };
    all('[data-hup]', (b) => b.addEventListener('click', () => move(Number(b.dataset.hup), -1)));
    all('[data-hdown]', (b) => b.addEventListener('click', () => move(Number(b.dataset.hdown), 1)));
    all('[data-hvis]', (b) => b.addEventListener('click', () => {
      const id = b.dataset.hvis, h = new Set(this._config.home_hidden || []);
      if (h.has(id)) h.delete(id); else h.add(id);
      this._config.home_hidden = [...h]; this._emit(); this._render();
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
    const hl = () => headerLayout(this._config);
    const putH = (list) => { this._config.header = list; this._emit(); this._render(); };
    all('[data-hiup]', (b) => b.addEventListener('click', () => { const l = hl(), i = Number(b.dataset.hiup); [l[i - 1], l[i]] = [l[i], l[i - 1]]; putH(l); }));
    all('[data-hidown]', (b) => b.addEventListener('click', () => { const l = hl(), i = Number(b.dataset.hidown); [l[i + 1], l[i]] = [l[i], l[i + 1]]; putH(l); }));
    all('[data-hivis]', (b) => b.addEventListener('click', () => { const l = hl(), h = l[Number(b.dataset.hivis)]; if (h.hidden) delete h.hidden; else h.hidden = true; putH(l); }));
    all('[data-hk]', (el) => el.addEventListener('change', () => { const l = hl(), h = l[Number(el.dataset.hi)]; h[el.dataset.hk] = el.dataset.hk === 'row' ? Number(el.value) : el.value; putH(l); }));
    const tabIds = () => { const tv = (this._conf?.tvs || []).find((t) => t.id === this._config.default_tv) || this._conf?.tvs?.[0];
      const libs = Array.isArray(this._conf?.libraries?.[tv?.user || '']) ? this._conf.libraries[tv.user || ''] : [];
      const pick = this._config.libraries || [];
      return tabOrder(this._config, libs.filter((l) => !pick.length || pick.includes(l.title))).map((t) => t.id); };
    const moveTab = (i, d) => { const o = tabIds(); const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; this._config.tab_order = o; this._emit(); this._render(); };
    all('[data-tup]', (b) => b.addEventListener('click', () => moveTab(Number(b.dataset.tup), -1)));
    all('[data-tdown]', (b) => b.addEventListener('click', () => moveTab(Number(b.dataset.tdown), 1)));
    all('[data-treset]', (b) => b.addEventListener('click', () => { delete this._config.tab_order; this._emit(); this._render(); }));
    const setSec = (id, k, v) => {
      const all2 = { ...(this._config.home_style || {}) }, o = { ...(all2[id] || {}) };
      if (v === '' || v === undefined || v === null) delete o[k]; else o[k] = v;
      all2[id] = o; this._config.home_style = all2; this._emit();
    };
    all('[data-sk]', (el) => el.addEventListener('change', () => {
      const k = el.dataset.sk; let v = el.value.trim();
      if (k === 'flag') v = v === '' ? '' : v === 'true';
      if (k === 'auto') setSec(el.dataset.sid, 'speed', '');
      setSec(el.dataset.sid, k, v); if (['layout', 'auto'].includes(k)) this._render();
    }));
    all('[data-stri]', (el) => el.addEventListener('change', () => {
      const def = el.dataset.def === '1';
      setSec(el.dataset.sid, el.dataset.stri, el.checked === def ? '' : el.checked); this._render();
    }));
    all('[data-ssens]', (el) => el.addEventListener('change', () => {
      const id = el.dataset.sid;
      const on = [...this.querySelectorAll(`[data-ssens][data-sid="${CSS.escape ? CSS.escape(id) : id}"]`)].filter((x) => x.checked).map((x) => x.dataset.ssens);
      setSec(id, 'sensors', on.length ? on : '');
    }));
    all('[data-sedit]', (b) => b.addEventListener('click', () => {
      const k = `sty:${b.dataset.sedit}`;
      if (this._open.has(k)) this._open.delete(k); else this._open.add(k);
      this._render();
    }));
    all('[data-xadd]', (b) => b.addEventListener('click', () => {
      const type = b.dataset.xadd, pre = type === 'recent' ? 'recent' : 'soon', ex = this._config.home_extra || [];
      let n = 2; while (ex.some((x) => x.id === `${pre}-${n}`)) n += 1;
      this._config.home_extra = [...ex, { id: `${pre}-${n}`, type }]; this._emit(); this._render();
    }));
    all('[data-xdel]', (b) => b.addEventListener('click', () => {
      const id = b.dataset.xdel;
      this._config.home_extra = (this._config.home_extra || []).filter((x) => x.id !== id);
      if (this._config.home_style) delete this._config.home_style[id];
      this._emit(); this._render();
    }));
    all('[data-sbool]', (el) => el.addEventListener('change', () => { setSec(el.dataset.sid, el.dataset.sbool, el.checked || ''); this._render(); }));
    all('[data-ssk]', (el) => {
      const key = `${el.dataset.sid}:${el.dataset.ssk}`;
      el.addEventListener('input', () => { const o = this.querySelector(`[data-sval="${CSS.escape ? CSS.escape(key) : key}"]`); if (o) o.textContent = `${el.value}${el.dataset.unit}`; });
      el.addEventListener('change', () => { setSec(el.dataset.sid, el.dataset.ssk, Number(el.value)); this._render(); });
    });
    all('[data-sreset]', (b) => b.addEventListener('click', () => { const [id, k] = b.dataset.sreset.split(/:(?=[^:]+$)/); setSec(id, k, ''); this._render(); }));
    all('[data-sclr]', (el) => el.addEventListener('input', () => setSec(el.dataset.sid, el.dataset.sclr, el.value)));
    all('[data-smode]', (el) => el.addEventListener('change', () => {
      const id = el.dataset.sid, k = el.dataset.smode, cur = (this._config.home_style?.[id] || {})[k] || '', was = colorMode(cur);
      let next = '';
      if (el.value === 'theme') next = was === 'theme' ? cur : 'var(--primary-color)';
      else if (el.value === 'custom') next = /^#[0-9a-fA-F]{6}$/.test(cur) ? cur : el.dataset.seed;
      else if (el.value === 'css') next = cur === 'transparent' ? '' : cur;
      else if (el.value === 'transparent') next = 'transparent';
      this._cmode[`${id}:${k}`] = el.value; setSec(id, k, next); this._render();
    }));
    all('ha-icon-picker[data-sicon]', (el) => el.addEventListener('value-changed', (e) => setSec(el.dataset.sid, 'icon', (e.detail?.value || '').trim())));
    all('[data-hreset]', (b) => b.addEventListener('click', () => { delete this._config.header; this._emit(); this._render(); }));
    all('ha-icon-picker[data-tvicon]', (el) => el.addEventListener('value-changed', (e) => {
      const icons = { ...(this._config.tv_icons || {}) }, v = (e.detail?.value || '').trim();
      if (v) icons[el.dataset.tvicon] = v; else delete icons[el.dataset.tvicon];
      this._config.tv_icons = icons; this._emit();
    }));
    all('ha-icon-picker[data-icon]', (el) => el.addEventListener('value-changed', (e) => this._set(el.dataset.icon, (e.detail?.value || '').trim())));
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
      const k = sel.dataset.ckey, cur = this._config[k] || '', was = colorMode(cur);
      let next = '';
      if (sel.value === 'theme') next = was === 'theme' ? cur : 'var(--primary-color)';
      else if (sel.value === 'custom') next = /^#[0-9a-fA-F]{6}$/.test(cur) ? cur : sel.dataset.seed;
      else if (sel.value === 'css') next = cur === 'transparent' ? '' : cur;
      else if (sel.value === 'transparent') next = 'transparent';
      this._cmode[k] = sel.value; this._set(k, next); this._render();
    }));
    all('.plce-ctheme', (el) => el.addEventListener('change', () => this._set(el.dataset.ckey, el.value)));
    all('.plce-chex', (el) => el.addEventListener('input', () => this._set(el.dataset.ckey, el.value)));
    all('.plce-ccss', (el) => el.addEventListener('change', () => this._set(el.dataset.ckey, el.value.trim())));
  }
}

// ------------------------------------------------------------------------------------- registration

PlexCenterCard._test = { secType, upcomingSensors, secStyle, plexAsUmc, headerLayout, DEFAULT_HEADER, normalizeConfig, cardVars, haCardStyle, homeOrder, homeSections, isRealPlayback, livePosition, fmtTime, nowPlaying, deepLinkKey, umcItems, umcLines,
  formatDate, colorMode, CARD_CSS, CACHE, VIEW };

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, PlexCenterCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, PlexCenterCardEditor);
if (typeof window !== 'undefined') {
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === CARD_TAG)) {
    window.customCards.push({ type: CARD_TAG, name: 'Plex Center Card (Ltek)', preview: false,
      description: 'Browse Plex and play on your TVs. Needs the Plex Center integration.' });
  }
  console.info(`%c PLEX-CENTER-CARD %c ${BUILD_NUMBER} `, 'color:#fff;background:#e5a00d;font-weight:700', 'color:#e5a00d;background:#222');
}
