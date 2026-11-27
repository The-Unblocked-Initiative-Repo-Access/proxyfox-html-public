// proxyfox.svg's script (svg/make-svg.mjs builds it into the SVG): a standalone loader.
//
// Put proxyfox.svg on any site (or open it from disk) and it downloads the newest proxyfox.html
// from this repository through a WISP relay, and runs it in a frame that fills the window.
//
// The connection is TLS done with the browser's own crypto (tls.js, based on zaka13alt's loader),
// which doesn't check GitHub's certificate. What makes it safe is the signature instead: each
// proxyfox.html has a proxyfox.html.sig (made by svg/sign.mjs with a private key only the sign
// workflow has), and the loader runs a file only if its SHA-256 and size match a signature that
// checks out with PUBLIC_KEY. A relay that answers in GitHub's place can't make one.
//
// Where the site allows it (Cache Storage), the file is kept: later opens start it at once and
// look for a newer signed file in the background, which the next open uses. Multi-threading and a
// saved profile need the page showing this SVG to be cross-origin isolated; the frame inherits it.
import { httpsGet } from './tls.js';

const BASE = 'https://raw.githubusercontent.com/The-Unblocked-Initiative-Repo-Access/proxyfox-html-public/main/';
// The relays, per web filter ({ "GoGuardian": [relays], ..., "Not sure": [...] }; an old plain list is
// one filter). The person picks their filter (Choose your filter, the first time), and for each
// request its relays are tried top to bottom, then the other filters': the next one only when one
// refuses, fails or stops answering. Built in from wisps.json (svg/make-svg.mjs); once a download
// worked, the repository's newest wisps.json is kept (localStorage) and used from the next open,
// followed by the built-in relays it doesn't list. The chosen filter is kept under the name
// Proxyfox reads too (proxyfox-filter), and the frame is named after it for a loader opened from a
// file, so Proxyfox doesn't ask again.
const BUILT_IN = __WISPS__;
const WISPS_KEY = 'proxyfox-svg-wisps';
const FILTER_KEY = 'proxyfox-filter';
const isRelay = (u) => typeof u === 'string' && /^wss?:\/\/[^\s"]+$/.test(u);
function parseFilters(data) {
  if (Array.isArray(data)) data = { 'All relays': data };
  if (!data || typeof data !== 'object') return null;
  const out = {};
  for (const [name, list] of Object.entries(data)) {
    const urls = Array.isArray(list) ? [...new Set(list.filter(isRelay))] : [];
    if (name.trim() && urls.length) out[name.trim()] = urls;
  }
  return Object.keys(out).length ? out : null;
}
function filters() {
  try { return parseFilters(JSON.parse(localStorage.getItem(WISPS_KEY) || 'null')) || BUILT_IN; } catch { return BUILT_IN; }
}
let chosen = '';
function relays() {
  const f = filters();
  return [...new Set([...(f[chosen] || []), ...Object.values(f).flat(), ...Object.values(BUILT_IN).flat()])];
}
async function refreshRelays() {
  try {
    const list = JSON.parse(new TextDecoder().decode(await get(`wisps.json?t=${Date.now()}`)));
    if (parseFilters(list)) localStorage.setItem(WISPS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[proxyfox.svg] wisps.json not updated:', e?.message || e);
  }
}
// The filter: the kept one if the list still has it, the only one if there is just one, else asked.
async function chooseFilter() {
  const names = Object.keys(filters());
  let name = '';
  try { name = localStorage.getItem(FILTER_KEY) || ''; } catch {}
  if (!names.includes(name)) name = names.length === 1 ? names[0] : await askFilter(names);
  try { localStorage.setItem(FILTER_KEY, name); } catch {}
  chosen = name;
}
function askFilter(names) {
  const select = $('pf-filter-select'), go = $('pf-filter-go');
  const option = (value, text) => {
    const o = document.createElementNS('http://www.w3.org/1999/xhtml', 'option'); // an SVG page has no new Option()
    o.value = value;
    o.textContent = text;
    return o;
  };
  select.replaceChildren(option('', 'Select your filter'), ...names.map((n) => option(n, n)));
  select.firstChild.disabled = true;
  select.value = '';
  go.disabled = true;
  go.style.opacity = '.5';
  $('pf-filter').style.display = 'flex';
  return new Promise((resolve) => {
    select.onchange = () => { go.disabled = !select.value; go.style.opacity = select.value ? '1' : '.5'; };
    go.onclick = () => {
      if (!select.value) return;
      $('pf-filter').style.display = 'none';
      resolve(select.value);
    };
  });
}
// svg/sign.mjs --new-key prints this (and the private key, for the PROXYFOX_SIGNING_KEY secret).
const PUBLIC_KEY = { kty: 'EC', crv: 'P-256', x: 'g6ninswrJTM9o-G1PSQXPRAXvrOILC7-fVOIVR8plng', y: 'x9iac4XTqmRNVRoynlrAeW1nkSoyyL4ijBX5LL0Xiz8' };
const CACHE = 'proxyfox-svg';
const TEST = globalThis.__proxyfoxSvgTest || null; // local tests only: { base, relays, noDirect }
const base = () => TEST?.base || BASE;
const KEY = () => `${base()}proxyfox.html`; // the kept copy's key in Cache Storage

const $ = (id) => document.getElementById(id);
const hex = (b) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

// A file of this repository: through the relays, then straight from the browser.
// Relays that failed in this page load: skipped for the files after, so each dead one costs once,
// not once per file. The relay that last worked goes first.
const failed = new Set();
let preferred = null;
// The relays race to connect: the first starts at once, and each HEDGE_MS without a TLS handshake
// done (or a failure) starts the next one too. The first to finish its handshake gets the request
// and the others are closed, so a dead or slow relay costs HEDGE_MS instead of its whole 3 s.
const HEDGE_MS = 500;
function race(queue, name, progress, range) {
  return new Promise((resolve) => {
    const live = new Map(); // relay -> AbortController
    let winner = null, timer = 0, last = null;
    const finish = (v) => { clearTimeout(timer); resolve(v); };
    const launch = () => {
      clearTimeout(timer);
      if (winner) return;
      const relay = queue.shift();
      if (!relay) { if (!live.size) finish({ last }); return; }
      const ctrl = new AbortController();
      live.set(relay, ctrl);
      httpsGet(relay, base() + name, (n, t) => progress?.(n, t), {
        signal: ctrl.signal,
        range,
        onConnect: () => {
          if (winner) { if (winner !== relay) ctrl.abort(); return; } // a redirect connects the winner again
          winner = relay;
          clearTimeout(timer);
          for (const [r, c] of live) if (r !== relay) { c.abort(); queue.unshift(r); } // not their fault: kept for a retry
        },
      }).then((r) => {
        live.delete(relay);
        if (r.status !== (range ? 206 : 200)) throw new Error(`GitHub answered ${r.status}`);
        if (range && !String(r.headers?.['content-range'] || '').startsWith(`bytes ${range[0]}-${range[1]}/`)) throw new Error('GitHub answered another range');
        preferred = relay;
        finish({ body: r.body });
      }).catch((e) => {
        live.delete(relay);
        if (ctrl.signal.aborted && winner !== relay) return; // lost the race
        last = e;
        if (!/GitHub answered/.test(String(e?.message))) failed.add(relay); // GitHub's own answer isn't the relay's fault
        console.warn(`[proxyfox.svg] ${name} not through ${relay}: ${e?.message || e}`);
        if (winner === relay) finish({ retry: true, last }); // failed after it connected: race the rest again
        else launch();
      });
      timer = setTimeout(launch, HEDGE_MS);
    };
    launch();
  });
}
async function viaRelays(name, progress, range) {
  const queue = (TEST?.relays || relays()).filter((r) => !failed.has(r));
  if (preferred && queue.includes(preferred)) queue.unshift(...queue.splice(queue.indexOf(preferred), 1));
  let last = new Error('no relay left to try');
  while (queue.length) {
    const r = await race(queue, name, progress, range);
    if (r.body) return r.body;
    last = r.last;
    if (!r.retry) break;
  }
  throw last;
}
// range = [first, last]: only those bytes (partial updates).
async function get(name, progress, range) {
  let last = null;
  try {
    return await viaRelays(name, progress, range);
  } catch (e) {
    last = e;
  }
  if (TEST?.noDirect) throw last;
  const res = await fetch(base() + name, { cache: 'no-store', headers: range ? { Range: `bytes=${range[0]}-${range[1]}` } : {} })
    .catch((e) => { throw new Error(`no relay got it (${last?.message}), nor GitHub directly (${e.message})`); });
  if (res.status !== (range ? 206 : 200)) throw new Error(`GitHub answered ${res.status}`);
  // Read as it arrives, so the loading bar moves on this path too (signedFile gives the total).
  const reader = res.body.getReader(), parts = [];
  let got = 0;
  for (let r; !(r = await reader.read()).done;) {
    parts.push(r.value);
    got += r.value.length;
    progress?.(got, 0);
  }
  const body = new Uint8Array(got);
  let at = 0;
  for (const p of parts) { body.set(p, at); at += p.length; }
  return body;
}

// The newest signature, checked. Asked for with a fresh address each time, so no cache answers.
async function latestSignature() {
  const sig = JSON.parse(new TextDecoder().decode(await get(`proxyfox.html.sig?t=${Date.now()}`)));
  const key = await crypto.subtle.importKey('jwk', PUBLIC_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = sig?.format === 1 && /^[0-9a-f]{64}$/.test(sig.sha256) && Number.isInteger(sig.size) && await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key, Uint8Array.from(atob(sig.signature), (c) => c.charCodeAt(0)),
    new TextEncoder().encode(`proxyfox.html\n${sig.sha256}\n${sig.size}\n`));
  if (!ok) throw new Error('proxyfox.html.sig is not signed by Proxyfox');
  return sig;
}

const isSigned = async (sig, body) => body.length === sig.size && hex(await crypto.subtle.digest('SHA-256', body)) === sig.sha256;

// The file the signature names, checked against it (its own address per version, so a cache
// can't hand back another one). `body` is a download already made, used if it is the signed one.
async function signedFile(sig, progress, body = null) {
  if (body && await isSigned(sig, body)) return body;
  // The total is what the wire carries (gzip through a relay), or the file's size.
  body = await get(`proxyfox.html?v=${sig.sha256.slice(0, 16)}`, (n, total) => progress?.(n, total || sig.size));
  if (!await isSigned(sig, body)) {
    throw new Error('the downloaded proxyfox.html is not the signed one (an update may be going out: try again in a minute)');
  }
  return body;
}

// ------------------------------------------------------------------- partial updates --
// An update for a device that keeps an older proxyfox.html downloads only the parts that changed.
// proxyfox.html.sig lists the new file's parts (svg/sign.mjs: each embedded asset's Base64, and the
// page text between them) with their hashes; parts the kept copy has are taken from it, the others
// are downloaded by byte range, and the rebuilt file must match the signed SHA-256 like any other
// download. An app-only update is about 2 MB instead of the whole 67 MB. If anything doesn't work
// out, the whole file is downloaded.
const PART_GAP = 512 * 1024; // changed parts closer than this are one request (the bytes between too)
const ASSET_OPEN = '<script type="application/octet-stream" data-asset="';
function validParts(sig) {
  if (!Array.isArray(sig.parts) || !sig.parts.length || sig.parts.length > 1000) return false;
  let at = 0;
  for (const p of sig.parts) {
    if (p?.at !== at || !Number.isInteger(p.len) || p.len <= 0 || !/^[0-9a-f]{64}$/.test(p.sha256)) return false;
    at += p.len;
  }
  return at === sig.size;
}
// The parts of a kept copy from before parts were kept with it: cut the way svg/sign.mjs cuts.
async function partsOf(blob) {
  const CH = 1 << 22;
  const cuts = [0];
  for (let pos = 0; pos < blob.size;) {
    const text = await ascii(blob, pos, Math.min(blob.size, pos + CH));
    const tag = text.indexOf(ASSET_OPEN);
    const gt = tag < 0 ? -1 : text.indexOf('>', tag + ASSET_OPEN.length);
    if (gt < 0) {
      if (pos + CH >= blob.size) break;
      pos = tag > 0 ? pos + tag : pos + CH - ASSET_OPEN.length; // a tag cut by the chunk's end is read again whole
      continue;
    }
    const start = pos + gt + 1;
    let end = -1;
    for (let q = start; q < blob.size && end < 0; q += CH) {
      const i = (await ascii(blob, q, Math.min(blob.size, q + CH))).indexOf('<'); // Base64 has none: this opens </script>
      if (i >= 0) end = q + i;
    }
    if (end < 0) break;
    cuts.push(start, end);
    pos = end;
  }
  cuts.push(blob.size);
  const parts = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const at = cuts[i], len = cuts[i + 1] - cuts[i];
    if (len > 0) parts.push({ at, len, sha256: hex(await crypto.subtle.digest('SHA-256', await blob.slice(at, at + len).arrayBuffer())) });
  }
  return parts;
}
async function partialFile(sig, kept, progress) {
  if (!validParts(sig)) return null;
  const old = await kept.blob();
  let oldParts = null;
  try { oldParts = JSON.parse(kept.headers.get('X-Parts') || 'null'); } catch {}
  if (!Array.isArray(oldParts)) oldParts = await partsOf(old);
  const have = new Map(oldParts.map((p) => [`${p.sha256}:${p.len}`, p]));
  const pieces = sig.parts.map((p) => {
    const k = have.get(`${p.sha256}:${p.len}`);
    return k ? { at: p.at, len: p.len, blob: old.slice(k.at, k.at + k.len) } : { at: p.at, len: p.len };
  });
  const ranges = [];
  for (const p of pieces) {
    if (p.blob) continue;
    const r = ranges.at(-1);
    if (r && p.at - (r.at + r.len) < PART_GAP) r.len = p.at + p.len - r.at;
    else ranges.push({ at: p.at, len: p.len });
  }
  const need = ranges.reduce((n, r) => n + r.len, 0);
  if (!ranges.length || need > sig.size / 2) return null; // mostly new: the whole file (gzip) is cheaper
  let done = 0;
  for (const r of ranges) {
    r.data = await get(`proxyfox.html?v=${sig.sha256.slice(0, 16)}`, (n) => progress?.(done + n, need), [r.at, r.at + r.len - 1]);
    if (r.data.length !== r.len) throw new Error(`got ${r.data.length} of ${r.len} bytes`);
    done += r.len;
  }
  const out = [];
  let pos = 0, ri = 0;
  for (const p of pieces) {
    if (p.at < pos) continue; // inside a downloaded range
    const r = ranges[ri];
    if (r && r.at === p.at) { out.push(r.data); pos = r.at + r.len; ri++; }
    else { out.push(p.blob); pos = p.at + p.len; }
  }
  const body = new Uint8Array(await new Blob(out).arrayBuffer());
  if (!await isSigned(sig, body)) throw new Error('the rebuilt proxyfox.html is not the signed one');
  console.log(`[proxyfox.svg] partial update: downloaded ${(need / 1048576).toFixed(1)} MB of ${(sig.size / 1048576).toFixed(1)} MB`);
  return body;
}
// A new version: only what changed when this device keeps an older one, else the whole file.
async function newVersion(sig, kept, progress) {
  if (kept) {
    try {
      const body = await partialFile(sig, kept, progress);
      if (body) return body;
    } catch (e) {
      console.warn('[proxyfox.svg] partial update failed, downloading the whole file:', e?.message || e);
    }
  }
  return signedFile(sig, progress);
}

async function openCache() {
  try { return await caches.open(CACHE); } catch { return null; } // none on file:// and some hosts
}
async function keep(cache, sig, body) {
  if (!cache) return;
  try {
    const headers = { 'Content-Type': 'text/html', 'X-Sha256': sig.sha256 };
    if (validParts(sig)) headers['X-Parts'] = JSON.stringify(sig.parts); // for the next partial update
    await cache.put(KEY(), new Response(body, { headers }));
  } catch (e) {
    console.warn('[proxyfox.svg] not kept on this device:', e?.message || e);
  }
}

// The loading bar: while Proxyfox downloads (or, from this device, starts); gone once it shows.
function progressBar(n, total) {
  $('pf-progress').style.display = 'flex';
  const pct = total ? Math.min(n >= total ? 100 : 99, (n / total) * 100) : 0;
  $('pf-bar').style.width = `${pct}%`;
}
// ------------------------------------------------------------------ light copy --
// proxyfox.html keeps its engine files (gecko.wasm, chrome-assets.tar, ...) on this device after the
// first start (its engine-cache.js, in the site's private storage, OPFS: the same storage as this
// page's, which the frame shares). Then most of the 87 MB it is made of is Base64 it won't read,
// but the browser still has to parse it. So the frame gets a light copy: the page with the content
// of those blocks left out, like the website's service worker does (sw.js). A block is left out
// only if its file is there and passes the same check the page makes (size and 16 samples hashed),
// so the page finds every file it needs. The pieces are slices of the kept copy: nothing is copied.
const ENGINE_DIR = 'proxyfox-engine-cache';
const ENGINE_ASSETS = ['chrome-assets.tar', 'gecko.wasm', 'ublock.tar', 'emoji.ttf', 'fonts.tar'];
const OPTS_KEY = 'firefox-html-opts-v2'; // the page's options: engineCache false turns its cache off
const MANIFEST_TAG = '<script type="application/json" id="asset-manifest">';
const ASSET_TAG = '<script type="application/octet-stream" data-asset="';
const ascii = async (blob, from, to) => new TextDecoder('latin1').decode(await blob.slice(from, to).arrayBuffer());
async function samplesOk(file, size, expected) {
  const n = size, s = Math.min(64 * 1024, n);
  const buf = new Uint8Array(16 * s + 8);
  for (let i = 0; i < 16; i++) {
    const at = Math.floor((n - s) * i / 15);
    buf.set(new Uint8Array(await file.slice(at, at + s).arrayBuffer()), i * s);
  }
  new DataView(buf.buffer).setFloat64(16 * s, n);
  return hex(await crypto.subtle.digest('SHA-256', buf)) === expected;
}
async function lighten(full) {
  try {
    // The page keeps engine files only when it runs from a website (not from a file on disk).
    if (!/^https?:\/\//.test(location.origin) || !navigator.storage?.getDirectory) return full;
    try { if (JSON.parse(localStorage.getItem(OPTS_KEY) || '{}').engineCache === false) return full; } catch {}
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(ENGINE_DIR);
    const kept = JSON.parse(await (await (await dir.getFileHandle('meta.json')).getFile()).text());
    if (kept?.format !== 1 || !kept.files) return full;
    const head = await ascii(full, 0, 1 << 20);
    const m = head.indexOf(MANIFEST_TAG);
    if (m < 0) return full;
    const mEnd = head.indexOf('<', m + MANIFEST_TAG.length);
    const assets = JSON.parse(head.slice(m + MANIFEST_TAG.length, mEnd)).assets;
    // latin1 keeps one character per byte, so positions in the text are positions in the file.
    const parts = [];
    let pos = mEnd, from = 0;
    for (;;) {
      const near = await ascii(full, pos, pos + 256);
      const t = near.indexOf(ASSET_TAG);
      if (t < 0) break;
      const close = near.indexOf('>', t);
      const name = near.slice(t + ASSET_TAG.length).split('"')[0];
      const a = assets[name];
      if (close < 0 || !a || a.encoding !== 'base64') break;
      const start = pos + close + 1, end = start + 4 * Math.ceil(a.stored / 3);
      if ((await ascii(full, end, end + 9)) !== '</script>') break; // not laid out as expected: stop here
      const entry = kept.files[a.sha256Raw];
      if (ENGINE_ASSETS.includes(name) && entry?.name === name && entry.size === a.size) {
        const file = await (await dir.getFileHandle(a.sha256Raw)).getFile().catch(() => null);
        if (file?.size === a.size && await samplesOk(file, a.size, entry.samples)) {
          parts.push(full.slice(from, start));
          from = end;
        }
      }
      pos = end;
    }
    if (!parts.length) return full;
    parts.push(full.slice(from));
    const light = new Blob(parts, { type: 'text/html' });
    console.log(`[proxyfox.svg] light copy: ${(light.size / 1048576).toFixed(1)} MB instead of ${(full.size / 1048576).toFixed(1)} MB (engine files are on this device)`);
    return light;
  } catch {
    return full; // no engine files kept (yet), or no storage here
  }
}

let running = ''; // the SHA-256 of the proxyfox.html the frame runs
async function show(body, sha256 = '') {
  const frame = $('pf-frame');
  frame.name = `proxyfox-filter:${chosen}`;
  const full = body instanceof Blob ? body : new Blob([body], { type: 'text/html' });
  const old = frame.src;
  running = sha256;
  frame.src = URL.createObjectURL(await lighten(full));
  if (old.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(old), 10000);
  frame.addEventListener('load', () => {
    $('pf-progress').style.display = 'none';
    try { frame.focus(); } catch {}
  }, { once: true });
}

// Installable app (PWA): loader-sw.js keeps this page so the installed app opens without a network.
// Its scope is /loader (loader.html, loader.svg): sw.js keeps the rest of the site.
//
// It also gives Proxyfox real threads: Proxyfox is multi-threaded (and keeps its profile) only on a
// cross-origin isolated page, which takes COOP/COEP headers that some hosts (GitHub Pages, a CDN
// pull zone) don't send. loader-sw.js adds them to the loader page it serves; on the first visit
// there is no worker yet, so once it is active the page reloads once under it.
async function registerAppWorker() {
  if (TEST || !/^https?:$/.test(location.protocol) || !navigator.serviceWorker) return;
  const FLAG = 'proxyfox-svg-isolating';
  try {
    const reg = await navigator.serviceWorker.register(new URL('loader-sw.js', location.href), { scope: new URL('loader', location.href).pathname });
    if (globalThis.crossOriginIsolated) return;
    if (sessionStorage.getItem(FLAG)) { sessionStorage.removeItem(FLAG); return; } // reloaded once already
    await navigator.serviceWorker.ready;
    if (!reg.active) return;
    sessionStorage.setItem(FLAG, '1');
    location.reload();
    await new Promise(() => {}); // the reload takes over
  } catch (e) {
    console.warn('[proxyfox.svg] app worker not registered (single-threaded here):', e?.message || e);
  }
}

// Update now (Proxyfox's Check for updates, inside this frame): Proxyfox can't replace itself here, so
// it asks this page, which gets the newest signed proxyfox.html (the one the background check already
// downloaded, or now, through the relays), keeps it and restarts the frame with it. Proxyfox shows the
// progress it's sent: proxyfox-update-started, -progress { got, total }, -ready, -none, -error { message }.
let background = null; // the background update check of this open (start)
let backgroundProgress = null; // set while Update now waits for that download
let updating = false;
addEventListener('message', async (e) => {
  const frame = $('pf-frame');
  if (e.source !== frame.contentWindow || e.data?.type !== 'proxyfox-update' || updating) return;
  const tell = (m) => { try { frame.contentWindow?.postMessage(m, '*'); } catch {} };
  updating = true;
  tell({ type: 'proxyfox-update-started' });
  try {
    const progress = (got, total) => tell({ type: 'proxyfox-update-progress', got, total });
    backgroundProgress = progress;
    await background; // a download already going: let it finish instead of starting a second
    const sig = await latestSignature();
    if (sig.sha256 === running) { tell({ type: 'proxyfox-update-none' }); return; }
    const cache = await openCache();
    const kept = cache ? await cache.match(KEY()).catch(() => null) : null;
    let body = kept && kept.headers.get('X-Sha256') === sig.sha256 ? await kept.blob() : null;
    if (!body) {
      body = await newVersion(sig, kept && await cache.match(KEY()).catch(() => null), (n, total) => progress(n, total || sig.size));
      await keep(cache, sig, body);
    }
    tell({ type: 'proxyfox-update-ready' });
    await show(body, sig.sha256);
  } catch (err) {
    tell({ type: 'proxyfox-update-error', message: err?.message || String(err) });
  } finally {
    backgroundProgress = null;
    updating = false;
  }
});

// ------------------------------------------------------------------- activity --
// The activity report (pr0xyfox.dev's gate, /v, kind loader): every open of this loader, wherever it
// runs (pr0xyfox.dev, a BYOD domain, a copy on another site, a file), with the exact page it is on
// (no fragment, and no query parameter that could be a secret) and the visitor's IP for the map.
// Sent through the relays like the download (a network that blocks pr0xyfox.dev doesn't stop it),
// else straight from the page. Proxyfox reports again when it starts (kind app).
const REPORT = 'https://pr0xyfox.dev/v';
const SECRET_PARAM = /code|token|key|pass|pwd|secret|sess|auth|sig|otp|pin|jwt|cred|login|mail|user|account|phone/i;
function pageAddress() {
  let href = '';
  try { if (window.parent !== window) href = window.parent.location.href; } catch {} // a copy that frames this one
  if (!href) href = location.href;
  try {
    const u = new URL(href);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    for (const k of [...new Set(u.searchParams.keys())]) if (SECRET_PARAM.test(k)) u.searchParams.delete(k);
    return u.origin + u.pathname + u.search;
  } catch { return ''; }
}
// The visitor's IP as websites see it: asked straight from this page (through a relay it would be the
// relay's), from several "what is my IP" sites at once; the first good answer wins.
const IP_SITES = ['https://api.ipify.org?format=json', 'https://api64.ipify.org?format=json', 'https://ipinfo.io/json', 'https://api.ip.sb/jsonip', 'https://api.seeip.org/jsonip', 'https://ipwho.is/'];
async function lookUpIp() {
  try {
    return await Promise.any(IP_SITES.map(async (url) => {
      const res = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(6000) });
      const ip = res.ok ? String((await res.json())?.ip || '') : '';
      if (!/^[0-9a-f.:]{3,45}$/i.test(ip)) throw new Error('no IP');
      return ip;
    }));
  } catch {
    return '';
  }
}
async function reportOpen() {
  if (TEST) return;
  try {
    const page = pageAddress();
    const src = page ? new URL(page).hostname : location.protocol === 'file:' ? 'file' : 'loader';
    const url = `${REPORT}?${new URLSearchParams({ kind: 'loader', ip: await lookUpIp(), src, page })}`;
    for (const relay of relays().slice(0, 3)) {
      try {
        const r = await httpsGet(relay, url, null, { signal: AbortSignal.timeout(15000) });
        if (r.status < 500) return;
      } catch {}
    }
    await fetch(url, { cache: 'no-store', credentials: 'omit' });
  } catch (e) {
    console.warn('[proxyfox.svg] activity report not sent:', e?.message || e);
  }
}

async function start() {
  await registerAppWorker();
  void reportOpen(); // not after the filter question: someone who never answers it is counted too
  await chooseFilter();
  const cache = await openCache();
  const kept = cache ? await cache.match(KEY()).catch(() => null) : null;
  if (kept) {
    progressBar(1, 1);
    await show(await kept.blob(), kept.headers.get('X-Sha256') || '');
    // A newer signed file for the next open, in the background (Update now in Proxyfox uses it).
    background = (async () => {
      const sig = await latestSignature();
      void refreshRelays();
      if (sig.sha256 !== kept.headers.get('X-Sha256')) {
        const old = await cache.match(KEY()).catch(() => null); // kept was read to start it: read again
        await keep(cache, sig, await newVersion(sig, old, (n, total) => backgroundProgress?.(n, total)));
        console.log('[proxyfox.svg] a newer Proxyfox was downloaded; it opens next time');
      }
    })().catch((e) => console.warn('[proxyfox.svg] update check failed:', e?.message || e));
    await background;
    return;
  }
  try {
    progressBar(0, 0);
    // The signature and the file at once: the file's address changes every 5 minutes (so caches
    // between here and GitHub can serve it, yet not for long); if it isn't the signed one after all
    // (an update going out), the signed one is downloaded by its own address.
    let size = 0;
    const early = get(`proxyfox.html?b=${Math.floor(Date.now() / 300000)}`, (n, total) => progressBar(n, total || size))
      .catch((e) => { console.warn('[proxyfox.svg] early download failed:', e?.message || e); return null; });
    const sig = await latestSignature();
    size = sig.size;
    const body = await signedFile(sig, progressBar, await early);
    progressBar(1, 1);
    // Shown first; kept on the device (an 87 MB write) while it starts.
    await show(body, sig.sha256);
    await keep(cache, sig, body);
    void refreshRelays(); // after the big download, not competing with it
  } catch (e) {
    console.error(`[proxyfox.svg] Proxyfox couldn't be downloaded: ${e?.message || e}`);
    $('pf-bar').style.width = '100%';
    $('pf-bar').style.background = '#d03b3b'; // red: it failed (the console says why)
  }
}

void start();
