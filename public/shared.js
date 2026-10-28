const API = '';

// Inline SVG icons for card titles — kept as raw markup strings (not <use>
// refs to a sprite sheet) so pages stay self-contained with no extra fetch.
// viewBox is a fixed 0 0 24 24; sizing/color come from .card-title-icon in
// shared.css (stroke: currentColor, so each icon inherits .card-title's text
// color automatically — no per-icon color needed here).
const ICONS = {
  device: '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M8 10h8M8 14h5"/>',
  soil: '<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11Z"/>',
  battery: '<rect x="3" y="8" width="16" height="9" rx="2"/><path d="M20 11v3"/><path d="M7 12v3"/>',
  pump: '<circle cx="9" cy="13" r="5"/><path d="M9 13h.01"/><path d="M14 13h4a2 2 0 0 0 2-2V6"/><path d="M18 8l2-2 2 2"/>',
  water: '<path d="M7 4c2 2.7 4 5 4 7.3a4 4 0 0 1-8 0C3 9 5 6.7 7 4Z"/><path d="M17 10c1.5 2 3 3.7 3 5.5a3 3 0 0 1-6 0c0-1.8 1.5-3.5 3-5.5Z"/>',
};

function cardTitle(icon, label) {
  return `<svg class="card-title-icon" viewBox="0 0 24 24">${ICONS[icon] || ''}</svg><span>${label}</span>`;
}

function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5)  return t('time.justNow');
  if (s < 60) return t('time.secondsAgo', { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('time.minutesAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.hoursAgo', { n: h });
  return t('time.daysAgo', { n: Math.floor(h / 24) });
}

// Full elapsed time, every unit down to seconds ("1d 2h 20m 5s ago"), for
// places where the exact age matters rather than a glanceable approximation
// — how long ago a device last checked in, above all. Once a larger unit is
// in play every smaller one follows, including zeros ("3d 0h 0m 7s"), so the
// value reads as one continuous count rather than a rounded summary. Leading
// zero units are skipped, so a fresh timestamp reads "12s ago".
// `smallest` is the finest unit to print — 's' by default, or 'm'/'h' for
// ages measured in days, where the smaller digits only churn without telling
// you anything. Units below it are dropped, not rounded. If the age is
// shorter than `smallest` the next unit down is used anyway, so a fresh
// timestamp never reads "0h ago".
function exactAge(iso, smallest = 's') {
  if (!iso) return '—';
  const totalS = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units = [
    ['d', Math.floor(totalS / 86400)],
    ['h', Math.floor((totalS % 86400) / 3600)],
    ['m', Math.floor((totalS % 3600) / 60)],
    ['s', totalS % 60],
  ];
  // The largest non-zero unit starts the string; everything below it prints
  // down to `smallest`. When the whole age is shorter than `smallest` there
  // is no non-zero unit, so fall back to the finest one rather than printing
  // a bare "0h".
  const first = units.findIndex(([, n]) => n > 0);
  const limit = units.findIndex(([u]) => u === smallest);
  const from = first === -1 ? units.length - 1 : first;
  const to = Math.max(from, limit);
  return t('time.ago', {
    time: units.slice(from, to + 1).map(([u, n]) => t(`time.unit.${u}`, { n })).join(' '),
  });
}

// Fixed allowance for the network part of one wake — WiFi connect plus the
// sync/report round-trips. Added on top of the configured measurement time
// when estimating how long the device is actually awake per cycle.
const REQUEST_OVERHEAD_MS = 8000;

// Estimated awake window of one wake cycle: soil sampling (soilAvgCount
// samples every soilEveryMs) + battery sampling (one window per battery the
// firmware measures: esp32, and since firmware 0.4.0 the pump cell too) +
// request overhead. A cycle that waters runs longer by the pump time; that
// is rare enough not to count here. `soil`/`batteries` may be null/empty
// (failed fetch, brand-new device) — missing parts just drop out of the
// sum, leaving at least the overhead.
function awakeWindowMs(soil, batteries) {
  const soilMs = soil ? (soil.soilAvgCount ?? 0) * (soil.soilEveryMs ?? 0) : 0;
  const batteryMs = (batteries || [])
    .filter((b) => b.type === 'esp32' || b.type === 'pump')
    .reduce((sum, b) => sum + (b.checkAvgCount ?? 0) * (b.checkEveryMs ?? 0), 0);
  return soilMs + batteryMs + REQUEST_OVERHEAD_MS;
}

// Expected check-in rhythm, derived from the device's own stored config —
// no fixed grace windows beyond REQUEST_OVERHEAD_MS:
// - isActive: one full cycle is sleepSeconds of deep sleep plus the awake
//   window, and the device is only reachable during that awake window.
// - !isActive, deactivated less than one full sleep cycle ago: the device
//   may still be mid-way through the active cycle it was in when
//   deactivated (deactivation takes effect on its next wake check, not
//   instantly), so it's still graded as a sleeper until that cycle would
//   have completed.
// - !isActive otherwise: heartbeat-only loop every deviceLogsSeconds — the
//   device stays connected, so it's expected reachable the whole cycle.
// Returns { cycleMs, asleep }: cycleMs = expected period between check-ins,
// asleep = whether the device deep-sleeps between them.
function checkinCycle(d, awakeMs = REQUEST_OVERHEAD_MS) {
  const sleepCycleMs = (d.sleepSeconds ?? 0) * 1000 + awakeMs;
  if (d.isActive) return { cycleMs: sleepCycleMs, asleep: true };
  if (d.deactivatedAt) {
    const sinceDeactivatedMs = Date.now() - new Date(d.deactivatedAt).getTime();
    if (sinceDeactivatedMs < sleepCycleMs) return { cycleMs: sleepCycleMs, asleep: true };
  }
  return { cycleMs: (d.deviceLogsSeconds ?? 300) * 1000 + REQUEST_OVERHEAD_MS, asleep: false };
}

// Freshness window for "is the latest reading still current" checks
// (index.html readouts, device.html battery/soil cards).
function expectedCycleMs(d, awakeMs) {
  return checkinCycle(d, awakeMs).cycleMs;
}

// A sleeper (isActive, or just-deactivated and still finishing its last
// active cycle) spends almost all of every cycle in deep sleep, so
// 'sleeping' is its normal state — 'online' only while it's expected to
// actually be awake, i.e. within the estimated awake window right after a
// check-in. A heartbeat-loop device stays connected, so it's 'online' for
// the whole cycle. Either way 'offline' = missed two expected check-ins
// in a row.
function deviceStatus(d, awakeMs = REQUEST_OVERHEAD_MS) {
  if (!d.lastSeenAt) return 'offline';
  const { cycleMs, asleep } = checkinCycle(d, awakeMs);
  const sinceMs = Date.now() - new Date(d.lastSeenAt).getTime();
  if (sinceMs >= cycleMs * 2) return 'offline';
  if (asleep) return sinceMs < awakeMs ? 'online' : 'sleeping';
  return sinceMs < cycleMs ? 'online' : 'sleeping';
}

function statusLabel(status) {
  return t(`status.${status}`);
}

function statusBadge(d, awakeMs) {
  const status = deviceStatus(d, awakeMs);
  let title = '';
  if (d.lastSeenAt) {
    title = t('status.lastSeen', { time: relativeTime(d.lastSeenAt) });
    const { cycleMs, asleep } = checkinCycle(d, awakeMs);
    const cycleS = Math.round(cycleMs / 1000);
    // Signed distance to the next expected check-in: positive = still due
    // in the future, negative = overdue by that much.
    const remainingS = Math.round(
      (cycleMs - (Date.now() - new Date(d.lastSeenAt).getTime())) / 1000
    );
    if (status === 'sleeping' || (status === 'online' && !asleep)) {
      if (asleep) {
        title += remainingS >= 0
          ? t('status.wakesIn', { s: remainingS, cycle: cycleS })
          : t('status.wakeOverdue', { s: -remainingS, cycle: cycleS });
      } else {
        title += remainingS >= 0
          ? t('status.nextHeartbeatIn', { s: remainingS, cycle: cycleS })
          : t('status.heartbeatOverdue', { s: -remainingS, cycle: cycleS });
      }
    }
  }
  return `<span class="badge ${status}" title="${escapeAttr(title)}">${statusLabel(status)}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// Admin token for write requests. Reads need nothing; anything that changes
// data asks for the token once, then remembers it so a session of edits
// doesn't prompt per field. Stored per browser only — the server compares it
// against ADMIN_TOKEN from its own .env.
const ADMIN_TOKEN_KEY = 'esp32-admin-token';

function getAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch (e) {
    return ''; // private mode / storage blocked: ask every time
  }
}

function setAdminToken(token) {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch (e) { /* not fatal: the token just won't persist */ }
}

// Returns the token, prompting if it isn't known yet. null = the user
// cancelled, in which case the caller must abort the write.
function askAdminToken(message) {
  const entered = prompt(message || t('auth.prompt'), getAdminToken());
  if (entered === null) return null;
  const token = entered.trim();
  setAdminToken(token);
  return token;
}

// fetch() for mutating requests: attaches the token, and on a 401 clears the
// stored one, asks again and retries once — so a wrong or rotated token is
// fixed in place rather than needing a reload.
async function adminFetch(url, options = {}) {
  let token = getAdminToken();
  if (!token) {
    token = askAdminToken();
    if (token === null) return null; // cancelled
  }

  const send = (tok) =>
    fetch(url, { ...options, headers: { ...(options.headers || {}), 'X-Admin-Token': tok } });

  let res = await send(token);
  if (res.status === 401) {
    setAdminToken('');
    const retry = askAdminToken(t('auth.invalid'));
    if (retry === null) return null;
    res = await send(retry);
    if (res.status === 401) {
      setAdminToken('');
      alert(t('auth.invalid'));
    }
  }
  return res;
}

function escapeAttr(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// `tooltip`, when given, wraps the label so it can trigger the shared
// field-tooltip on hover (see fieldTooltipShow/Hide below) — a plain-text
// explanation of what the value means/is used for, not shown anywhere else.
function fieldLabel(label, tooltip) {
  if (!tooltip) return `<span class="field-label">${label}</span>`;
  return `<span class="field-label has-tooltip" data-tooltip="${escapeAttr(tooltip)}"
    onmouseenter="fieldTooltipShow(this)" onmouseleave="fieldTooltipHide()">${label}</span>`;
}

function field(label, value, mono = false, tooltip) {
  return `
    <div class="field-row">
      ${fieldLabel(label, tooltip)}
      <span class="field-value${mono ? ' mono' : ''}">${value ?? '—'}</span>
    </div>`;
}

// Click-to-edit field. `endpointUrl` is PUT-ed with { [key]: <parsed value> }
// on save; the page's global loadDetail() re-renders afterward.
function editableField(label, key, value, endpointUrl, type, suffix = '', tooltip) {
  const display = type === 'checkbox'
    ? (value ? 'On' : 'Off')
    : `${value === '' || value == null ? '—' : value}${suffix}`;
  return `
    <div class="field-row">
      ${fieldLabel(label, tooltip)}
      <span class="field-value editable" data-key="${key}" data-type="${type}"
            data-value="${escapeAttr(value)}" data-endpoint="${endpointUrl}"
            onclick="startEdit(this)">${display}</span>
    </div>`;
}

// Singleton tooltip element, repositioned/refilled per hover rather than
// creating one per field row. Positioned above the label, centered, flipped
// to below if it would overflow the top of the viewport.
let _fieldTooltipEl = null;
function fieldTooltipShow(labelEl) {
  if (!_fieldTooltipEl) {
    _fieldTooltipEl = document.createElement('div');
    _fieldTooltipEl.className = 'field-tooltip';
    document.body.appendChild(_fieldTooltipEl);
  }
  const tip = _fieldTooltipEl;
  tip.textContent = labelEl.dataset.tooltip;
  tip.classList.remove('visible');

  const rect = labelEl.getBoundingClientRect();
  tip.style.left = '0px';
  tip.style.top = '0px';
  // Measure after content is set but before final positioning (opacity is
  // still 0, so this doesn't flash).
  requestAnimationFrame(() => {
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    const above = rect.top - tipRect.height - 10;
    const top = above < 8 ? rect.bottom + 10 : above;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.classList.add('visible');
  });
}

function fieldTooltipHide() {
  if (_fieldTooltipEl) _fieldTooltipEl.classList.remove('visible');
}

function startEdit(span) {
  if (span.querySelector('input')) return;
  const { key, type, value, endpoint } = span.dataset;

  const input = document.createElement('input');
  input.className = 'edit-input';
  if (type === 'checkbox') {
    input.type = 'checkbox';
    input.checked = value === 'true';
  } else {
    input.type = type === 'number' ? 'number' : 'text';
    input.value = value;
  }

  const original = span.innerHTML;
  span.innerHTML = '';
  span.appendChild(input);
  span.onclick = null;
  input.focus();
  if (input.select) input.select();

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    if (!save) { render(); return; }
    // Nothing changed (or a number field left empty): no request, no
    // revision bump — just close the editor.
    const unchanged = type === 'checkbox'
      ? input.checked === (value === 'true')
      : input.value === value || (type === 'number' && input.value.trim() === '');
    if (unchanged) { render(); return; }

    const newValue = type === 'checkbox' ? input.checked : type === 'number' ? Number(input.value) : input.value;
    input.disabled = true;
    try {
      const res = await adminFetch(`${API}${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: newValue }),
      });
      if (!res) { render(); return; } // token prompt cancelled
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (typeof loadDetail === 'function') loadDetail();
    } catch (e) {
      alert(t('device.failedToSave', { error: e.message }));
      render();
    }
  };
  const render = () => { span.innerHTML = original; span.onclick = () => startEdit(span); };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  if (type === 'checkbox') input.addEventListener('change', () => finish(true));
}

// Single-series line+area chart for soil moisture % over time, with a
// crosshair tooltip surfacing the secondary metrics (raw/voltage/rssi/uptime)
// for the hovered reading. `readings` is expected oldest-first for a
// left-to-right timeline.
function renderMoistureChart(containerId, readings) {
  const container = document.getElementById(containerId);
  if (!readings.length) {
    container.innerHTML = `<div class="chart-empty">${t('chart.noReadingsYet')}</div>`;
    return;
  }

  const W = 900, H = 260;
  const padL = 36, padR = 16, padT = 16, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const points = readings.map((r, i) => ({ ...r, pct: Math.max(0, Math.min(100, r.percent ?? 0)), i }));
  const x = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (pct) => padT + plotH - (pct / 100) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.pct).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${padT + plotH} L ${x(0).toFixed(1)} ${padT + plotH} Z`;

  const gridLines = [0, 25, 50, 75, 100].map(pct => `
    <line class="chart-grid" x1="${padL}" x2="${W - padR}" y1="${y(pct).toFixed(1)}" y2="${y(pct).toFixed(1)}" />
    <text class="chart-axis-label" x="${padL - 8}" y="${(y(pct) + 3).toFixed(1)}" text-anchor="end">${pct}%</text>
  `).join('');

  const last = points[points.length - 1];
  const hitAreas = points.map((p, i) => {
    const left = i === 0 ? padL : (x(i - 1) + x(i)) / 2;
    const right = i === points.length - 1 ? W - padR : (x(i) + x(i + 1)) / 2;
    return `<rect class="chart-hit-area" x="${left.toFixed(1)}" y="${padT}" width="${(right - left).toFixed(1)}" height="${plotH}"
      data-i="${i}" onmouseenter="chartHover('${containerId}', ${i})" onmouseleave="chartUnhover('${containerId}')" />`;
  }).join('');

  container.innerHTML = `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" id="${containerId}-svg">
        ${gridLines}
        <path class="chart-area" d="${areaPath}" />
        <path class="chart-line" d="${linePath}" />
        <circle class="chart-end-dot" cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.pct).toFixed(1)}" r="4" />
        <text class="chart-end-label" x="${(x(points.length - 1) - 8).toFixed(1)}" y="${(y(last.pct) - 10).toFixed(1)}" text-anchor="end">${last.pct}%</text>
        <line class="chart-crosshair" id="${containerId}-crosshair" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" />
        <circle class="chart-hover-dot" id="${containerId}-hover-dot" r="5" />
        ${hitAreas}
      </svg>
      <div class="chart-tooltip" id="${containerId}-tooltip"></div>
    </div>`;

  container._chartPoints = points;
  container._chartX = points.map((_, i) => x(i));
  container._chartY = points.map(p => y(p.pct));
}

// Charge-level color ramp, worst (empty) → best (full) — same red/yellow/green
// semantics as the soil-moisture bar-fill classes (.bar-fill.dry/.mid/.wet)
// and the RSSI tier strip, so "red = bad" reads consistently across the page.
// Thresholds are the pct AT OR ABOVE which a color applies (checked
// highest-first), matching how chargeColor() below consumes the list.
const CHARGE_STOPS = [
  { min: 70, color: 'var(--accent2)' },
  { min: 40, color: 'var(--warn)' },
  { min: 0,  color: 'var(--danger)' },
];

function chargeColor(pct) {
  return (CHARGE_STOPS.find(s => pct >= s.min) || CHARGE_STOPS[CHARGE_STOPS.length - 1]).color;
}

// Generic single-series 0–100% line+area chart, same visual shape as
// renderMoistureChart but reusable for any percentage series (currently:
// battery charge). `points` is oldest-first, each `{ pct, ...extra }`.
// Colored by charge level (CHARGE_STOPS) — each segment between two points
// is its own flat-colored <path>, keyed off that segment's average pct, so
// a battery chart's whole point ("is this low") reads at a glance instead
// of just distinguishing one battery's line from another's. (A single SVG
// gradient keyed to the Y axis was tried first but renders unreliably under
// preserveAspectRatio="none" non-uniform scaling — flat per-segment colors
// sidestep that entirely and are arguably clearer anyway, since they track
// the same discrete thresholds as the moisture bar/RSSI tiers.)
// `opts.tooltip(p)` returns the rows shown under the bolded value line.
// `opts.width`/`opts.height` override the viewBox. Since the SVG scales to
// its container with preserveAspectRatio="none", the viewBox aspect ratio
// is what decides how big the text ends up: a 900x220 box squeezed into a
// narrow column shrinks the labels horizontally. Charts in narrow columns
// should pass a proportionally narrower/taller box to keep text legible.
function renderPercentChart(containerId, points, opts = {}) {
  const container = document.getElementById(containerId);
  if (!points.length) {
    container.innerHTML = `<div class="chart-empty">${opts.emptyLabel || t('chart.noReadingsYet')}</div>`;
    return;
  }
  const valueLabel = opts.valueLabel || ((p) => `${p.pct}%`);
  const tooltipRows = opts.tooltip || (() => []);

  const W = opts.width ?? 900, H = opts.height ?? 220;
  // padL leaves room for the axis labels; a chart without them (opts
  // .gridLabels false, for sparklines too narrow to fit five) can pass a
  // smaller one and use the width for the plot instead.
  // padT/padB leave room above the curve for the end label and below it for
  // an x-axis. A sparkline has no x-axis and little height to spare, so it
  // can shrink both and give the room to the plot itself.
  const padL = opts.padL ?? 36, padR = 16;
  const padT = opts.padT ?? 16, padB = opts.padB ?? 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const pts = points.map((p, i) => ({ ...p, pct: Math.max(0, Math.min(100, p.pct)), i }));
  const x = (i) => padL + (pts.length === 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW);
  const y = (pct) => padT + plotH - (pct / 100) * plotH;

  const lineSegments = pts.length === 1
    ? '' // single point: nothing to draw a line between, just the end dot
    : pts.slice(1).map((p, idx) => {
        const prev = pts[idx];
        const color = chargeColor((prev.pct + p.pct) / 2);
        return `<path fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
          d="M ${x(prev.i).toFixed(1)} ${y(prev.pct).toFixed(1)} L ${x(p.i).toFixed(1)} ${y(p.pct).toFixed(1)}" />`;
      }).join('');

  const areaSegments = pts.length === 1
    ? ''
    : pts.slice(1).map((p, idx) => {
        const prev = pts[idx];
        const color = chargeColor((prev.pct + p.pct) / 2);
        const x1 = x(prev.i).toFixed(1), x2 = x(p.i).toFixed(1);
        const y1 = y(prev.pct).toFixed(1), y2 = y(p.pct).toFixed(1);
        return `<path fill="${color}" opacity="0.1" stroke="none"
          d="M ${x1} ${y1} L ${x2} ${y2} L ${x2} ${padT + plotH} L ${x1} ${padT + plotH} Z" />`;
      }).join('');

  // Gridlines are always drawn at every 25%; `opts.labelAt` narrows which of
  // them get a label, so a sparkline too narrow for five can show just a
  // couple of reference marks. Labels are right-anchored just left of the
  // axis, so padL has to cover the widest label plus `labelGap` or the text
  // is clipped by the viewBox edge.
  const labelAt = opts.labelAt ?? [0, 25, 50, 75, 100];
  const labelGap = opts.labelGap ?? 8;
  const gridLines = [0, 25, 50, 75, 100].map(pct => `
    <line class="chart-grid" x1="${padL}" x2="${W - padR}" y1="${y(pct).toFixed(1)}" y2="${y(pct).toFixed(1)}" />
    ${labelAt.includes(pct)
      ? `<text class="chart-axis-label" x="${padL - labelGap}" y="${(y(pct) + 3).toFixed(1)}" text-anchor="end">${pct}%</text>`
      : ''}
  `).join('');

  const last = pts[pts.length - 1];
  const lastColor = chargeColor(last.pct);
  const hitAreas = pts.map((p, i) => {
    const left = i === 0 ? padL : (x(i - 1) + x(i)) / 2;
    const right = i === pts.length - 1 ? W - padR : (x(i) + x(i + 1)) / 2;
    return `<rect class="chart-hit-area" x="${left.toFixed(1)}" y="${padT}" width="${(right - left).toFixed(1)}" height="${plotH}"
      onmouseenter="percentChartHover('${containerId}', ${i})" onmouseleave="percentChartUnhover('${containerId}')" />`;
  }).join('');

  container.innerHTML = `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" id="${containerId}-svg">
        ${gridLines}
        ${areaSegments}
        ${lineSegments}
        <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last.pct).toFixed(1)}" r="4" fill="${lastColor}" stroke="var(--surface)" stroke-width="2" />
        <text class="chart-end-label" x="${(x(pts.length - 1) - 8).toFixed(1)}" y="${(y(last.pct) - 10).toFixed(1)}" text-anchor="end">${valueLabel(last)}</text>
        <line class="chart-crosshair" id="${containerId}-crosshair" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" />
        <circle class="chart-hover-dot" id="${containerId}-hover-dot" r="5" />
        ${hitAreas}
      </svg>
      <div class="chart-tooltip" id="${containerId}-tooltip"></div>
    </div>`;

  container._chartPoints = pts;
  container._chartX = pts.map((_, i) => x(i));
  container._chartY = pts.map(p => y(p.pct));
  container._valueLabel = valueLabel;
  container._tooltipRows = tooltipRows;
  // Tooltip positioning converts viewBox units to pixels, so it needs the
  // same box this chart was drawn with.
  container._chartW = W;
  container._chartH = H;
}

// Splits a percentage history into cycles. A jump UP of at least
// `breakPct` points between consecutive readings means the level was
// replenished — the battery recharged, or the soil watered — so a new cycle
// starts there. Only upward jumps count: within a cycle the level drifts
// down, and a sudden drop is the sensor misreading, not a new cycle.
// `readings` is newest-first (as the API returns it); the returned cycles
// are oldest-first, and so are the readings inside each one.
// A silence longer than the stale-gap threshold also ends a cycle, whatever
// the level did across it: readings separated by that long with no contact
// aren't one continuous run, and joining them would draw a straight line
// over a period nothing is known about. The threshold is three of the
// device's own sleep intervals ("Sleep (connected)" × 3) rather than a fixed
// number of hours, so it scales with how often the board is configured to
// report — three missed check-ins is a real outage at any interval.
// A run of fewer than MIN_CYCLE_LOGS readings is dropped rather than shown
// or merged. Merging it into the neighbouring cycle would mean carrying a
// reading back across the very boundary that separated them — a 10% reading
// followed by 51% would end up in one "cycle", making it look like the level
// jumped mid-decline. A couple of readings also can't show a curve on their
// own, so there's nothing to chart. The newest run is the exception: it's
// the cycle the device is in right now, and hiding it would leave the
// current state off the page.
const BATTERY_BREAK_PCT = 15;
const SOIL_BREAK_PCT = 30;
const MIN_CYCLE_LOGS = 3;
const STALE_GAP_CYCLES = 3;

// Falls back to the server's own sleepSeconds default when the device's
// config isn't available, so the threshold is never zero (which would split
// on every reading).
function staleGapMs(device) {
  const sleepS = device && device.sleepSeconds > 0 ? device.sleepSeconds : 50;
  return sleepS * 1000 * STALE_GAP_CYCLES;
}

// `opts.pct` reads a reading's percentage, `opts.at` its timestamp — the two
// histories name those fields differently (percentage/createdAt for battery
// logs, percent/recordedAt for soil readings).
// `opts.splitOnGap` enables the reporting-gap rule and the minimum-length
// filter. Battery cycles use both; soil cycles are split purely on the
// moisture step, so a gap in reporting continues the same cycle and a short
// cycle is still charted.
function splitCycles(readings, device, opts) {
  const breakPct = opts.breakPct;
  const pctOf = opts.pct;
  const at = (r) => new Date(opts.at(r)).getTime();
  const STALE_GAP_MS = staleGapMs(device);
  const chrono = [...readings].reverse();

  const runs = [];
  let cur = [];
  for (const r of chrono) {
    const prev = cur[cur.length - 1];
    if (prev) {
      const replenished = pctOf(r) - pctOf(prev) >= breakPct;
      const staleGap = opts.splitOnGap && at(r) - at(prev) > STALE_GAP_MS;
      if (replenished || staleGap) {
        runs.push(cur);
        cur = [];
      }
    }
    cur.push(r);
  }
  if (cur.length) runs.push(cur);

  if (!opts.splitOnGap) return runs;
  return runs.filter(
    (run, i) => run.length >= MIN_CYCLE_LOGS || i === runs.length - 1,
  );
}

const BATTERY_CYCLE_OPTS = {
  breakPct: BATTERY_BREAK_PCT,
  pct: (l) => l.percentage,
  at: (l) => l.createdAt,
  splitOnGap: true,
};

// Soil moisture rises only when the plant is watered (or it rains), so a
// +30% step is a watering event and starts a new cycle. The cycle then shows
// how long the soil took to dry out again. Unlike battery cycles, nothing
// else splits one: a stretch with no readings is still the same drying
// period, and a cycle with only a reading or two is kept rather than hidden.
const SOIL_CYCLE_OPTS = {
  breakPct: SOIL_BREAK_PCT,
  pct: (r) => r.percent,
  at: (r) => r.recordedAt,
  splitOnGap: false,
};

function splitBatteryCycles(logs, device) {
  return splitCycles(logs, device, BATTERY_CYCLE_OPTS);
}

function splitSoilCycles(readings, device) {
  return splitCycles(readings, device, SOIL_CYCLE_OPTS);
}

// Cycles from a paginated slice of the history. The oldest cycle in a page
// is cut off mid-decline whenever older readings still exist — its earlier
// readings simply haven't been fetched — so charting it would show a cycle
// that appears to start at, say, 40% and last only a few hours. It's held
// back until the page that completes it arrives.
// The exception is when nothing older exists (`hasMore` false): then the
// oldest cycle really does begin there, even if its first reading wasn't at
// full.
function splitLoadedBatteryCycles(logs, device, hasMore) {
  const cycles = splitBatteryCycles(logs, device);
  return hasMore ? cycles.slice(1) : cycles;
}

function splitLoadedSoilCycles(readings, device, hasMore) {
  const cycles = splitSoilCycles(readings, device);
  return hasMore ? cycles.slice(1) : cycles;
}

// "8d 20h" / "2h 15m" — how long a cycle lasted, which is the whole point of
// charting cycles separately (how long does one charge actually last).
function formatDuration(ms) {
  const totalMin = Math.round(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return t('duration.dh', { d, h });
  if (h > 0) return t('duration.hm', { h, m });
  return t('duration.m', { m });
}

function percentChartHover(containerId, i) {
  const container = document.getElementById(containerId);
  const points = container._chartPoints;
  const p = points[i];
  const cx = container._chartX[i], cy = container._chartY[i];

  const crosshair = document.getElementById(`${containerId}-crosshair`);
  crosshair.setAttribute('x1', cx); crosshair.setAttribute('x2', cx);
  crosshair.style.opacity = 1;

  const dot = document.getElementById(`${containerId}-hover-dot`);
  dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
  dot.style.opacity = 1;

  const tooltip = document.getElementById(`${containerId}-tooltip`);
  const svg = document.getElementById(`${containerId}-svg`);
  const svgRect = svg.getBoundingClientRect();
  const scaleX = svgRect.width / (container._chartW ?? 900);
  tooltip.style.left = `${cx * scaleX}px`;
  tooltip.style.top = `${(cy / (container._chartH ?? 220)) * svgRect.height - 10}px`;
  tooltip.innerHTML = '';
  const valueEl = document.createElement('div');
  valueEl.className = 'tt-value';
  valueEl.textContent = container._valueLabel(p);
  tooltip.appendChild(valueEl);
  for (const [label, value] of container._tooltipRows(p)) {
    const row = document.createElement('div');
    row.className = 'tt-row';
    row.textContent = `${label}: ${value}`;
    tooltip.appendChild(row);
  }
  tooltip.style.opacity = 1;
}

function percentChartUnhover(containerId) {
  document.getElementById(`${containerId}-crosshair`).style.opacity = 0;
  document.getElementById(`${containerId}-hover-dot`).style.opacity = 0;
  document.getElementById(`${containerId}-tooltip`).style.opacity = 0;
}

function chartHover(containerId, i) {
  const container = document.getElementById(containerId);
  const points = container._chartPoints;
  const p = points[i];
  const cx = container._chartX[i], cy = container._chartY[i];

  const crosshair = document.getElementById(`${containerId}-crosshair`);
  crosshair.setAttribute('x1', cx); crosshair.setAttribute('x2', cx);
  crosshair.style.opacity = 1;

  const dot = document.getElementById(`${containerId}-hover-dot`);
  dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
  dot.style.opacity = 1;

  const tooltip = document.getElementById(`${containerId}-tooltip`);
  const svg = document.getElementById(`${containerId}-svg`);
  const svgRect = svg.getBoundingClientRect();
  const scaleX = svgRect.width / 900;
  tooltip.style.left = `${cx * scaleX}px`;
  tooltip.style.top = `${(cy / 260) * svgRect.height - 10}px`;
  tooltip.innerHTML = '';
  const valueEl = document.createElement('div');
  valueEl.className = 'tt-value';
  valueEl.textContent = t('chart.moisture', { pct: p.pct });
  tooltip.appendChild(valueEl);
  const rows = [
    [t('chart.tooltip.time'), fmtDate(p.recordedAt)],
    [t('chart.tooltip.raw'), p.raw ?? '—'],
    [t('chart.tooltip.voltage'), p.voltage != null ? `${p.voltage.toFixed(2)} V` : '—'],
    [t('chart.tooltip.rssi'), p.rssi != null ? `${p.rssi} dBm` : '—'],
    [t('chart.tooltip.uptime'), p.uptimeSec != null ? `${p.uptimeSec} s` : '—'],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'tt-row';
    row.textContent = `${label}: ${value}`;
    tooltip.appendChild(row);
  }
  tooltip.style.opacity = 1;
}

function chartUnhover(containerId) {
  document.getElementById(`${containerId}-crosshair`).style.opacity = 0;
  document.getElementById(`${containerId}-hover-dot`).style.opacity = 0;
  document.getElementById(`${containerId}-tooltip`).style.opacity = 0;
}

// Three-line categorical chart: raw (accent, primary signal — thicker) plotted
// against its calibration bounds minRaw/maxRaw (thinner reference lines).
// `readings` is expected oldest-first.
function rawSeries() {
  return [
    { key: 'raw',    label: t('chart.raw.legend.raw'),    color: 'var(--accent)',        width: 3 },
    { key: 'minRaw', label: t('chart.raw.legend.minRaw'), color: 'var(--series-orange)', width: 1.5 },
    { key: 'maxRaw', label: t('chart.raw.legend.maxRaw'), color: 'var(--series-violet)', width: 1.5 },
  ];
}

function renderRawChart(containerId, readings) {
  const RAW_SERIES = rawSeries();
  const container = document.getElementById(containerId);
  if (!readings.length) {
    container.innerHTML = `<div class="chart-empty">${t('chart.noReadingsYet')}</div>`;
    return;
  }

  const W = 900, H = 220;
  const padL = 44, padR = 16, padT = 16, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const allValues = readings.flatMap(r => [r.raw, r.minRaw, r.maxRaw]).filter(v => v != null);
  const dataMin = Math.min(...allValues), dataMax = Math.max(...allValues);
  const span = Math.max(1, dataMax - dataMin);
  const yMin = dataMin - span * 0.08, yMax = dataMax + span * 0.08;

  const x = (i) => padL + (readings.length === 1 ? plotW / 2 : (i / (readings.length - 1)) * plotW);
  const y = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const steps = 4;
  const gridLines = Array.from({ length: steps + 1 }, (_, s) => {
    const v = yMin + (s / steps) * (yMax - yMin);
    return `
      <line class="chart-grid" x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" />
      <text class="chart-axis-label" x="${padL - 8}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>
    `;
  }).join('');

  const linesSvg = RAW_SERIES.map(s => {
    const path = readings.map((r, i) => {
      const v = r[s.key];
      return v == null ? '' : `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    }).filter(Boolean).join(' ');
    return `<path fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linejoin="round" stroke-linecap="round" d="${path}" />`;
  }).join('');

  const hitAreas = readings.map((r, i) => {
    const left = i === 0 ? padL : (x(i - 1) + x(i)) / 2;
    const right = i === readings.length - 1 ? W - padR : (x(i) + x(i + 1)) / 2;
    return `<rect class="chart-hit-area" x="${left.toFixed(1)}" y="${padT}" width="${(right - left).toFixed(1)}" height="${plotH}"
      onmouseenter="rawChartHover('${containerId}', ${i})" onmouseleave="rawChartUnhover('${containerId}')" />`;
  }).join('');

  const dotsSvg = RAW_SERIES.map(s => `<circle class="raw-hover-dot" id="${containerId}-dot-${s.key}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2" style="opacity:0" />`).join('');

  const legend = RAW_SERIES.map(s => `
    <div class="chart-legend-item">
      <span class="chart-legend-swatch" style="background:${s.color}"></span>
      <span>${s.label}</span>
    </div>`).join('');

  container.innerHTML = `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" id="${containerId}-svg">
        ${gridLines}
        ${linesSvg}
        <line class="chart-crosshair" id="${containerId}-crosshair" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" />
        ${dotsSvg}
        ${hitAreas}
      </svg>
      <div class="chart-tooltip" id="${containerId}-tooltip"></div>
    </div>
    <div class="chart-legend">${legend}</div>`;

  container._chartPoints = readings;
  container._chartX = readings.map((_, i) => x(i));
  container._chartYFn = y;
}

function rawChartHover(containerId, i) {
  const container = document.getElementById(containerId);
  const points = container._chartPoints;
  const r = points[i];
  const cx = container._chartX[i];
  const y = container._chartYFn;

  const crosshair = document.getElementById(`${containerId}-crosshair`);
  crosshair.setAttribute('x1', cx); crosshair.setAttribute('x2', cx);
  crosshair.style.opacity = 1;

  const RAW_SERIES = rawSeries();
  for (const s of RAW_SERIES) {
    const dot = document.getElementById(`${containerId}-dot-${s.key}`);
    const v = r[s.key];
    if (v == null) { dot.style.opacity = 0; continue; }
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', y(v));
    dot.style.opacity = 1;
  }

  const tooltip = document.getElementById(`${containerId}-tooltip`);
  const svg = document.getElementById(`${containerId}-svg`);
  const svgRect = svg.getBoundingClientRect();
  const scaleX = svgRect.width / 900;
  tooltip.style.left = `${cx * scaleX}px`;
  tooltip.style.top = `${svgRect.height * 0.4}px`;
  tooltip.innerHTML = '';
  const valueEl = document.createElement('div');
  valueEl.className = 'tt-value';
  valueEl.textContent = fmtDate(r.recordedAt);
  tooltip.appendChild(valueEl);
  for (const s of RAW_SERIES) {
    const row = document.createElement('div');
    row.className = 'tt-row';
    row.textContent = `${s.label}: ${r[s.key] ?? '—'}`;
    tooltip.appendChild(row);
  }
  tooltip.style.opacity = 1;
}

function rawChartUnhover(containerId) {
  document.getElementById(`${containerId}-crosshair`).style.opacity = 0;
  document.getElementById(`${containerId}-tooltip`).style.opacity = 0;
  for (const s of rawSeries()) {
    document.getElementById(`${containerId}-dot-${s.key}`).style.opacity = 0;
  }
}

// RSSI signal-quality band strip — buckets dBm into a fixed 5-tier scale and
// renders it as a strip of colored segments (status ramp), not raw numbers.
// Exact dBm is still available in the hover tooltip.
function rssiTiers() {
  return [
    { key: 'excellent', label: t('rssi.excellent'), min: -50, color: 'var(--rssi-excellent)' },
    { key: 'good',      label: t('rssi.good'),      min: -60, color: 'var(--rssi-good)' },
    { key: 'fair',      label: t('rssi.fair'),      min: -70, color: 'var(--rssi-fair)' },
    { key: 'weak',      label: t('rssi.weak'),      min: -80, color: 'var(--rssi-weak)' },
    { key: 'poor',      label: t('rssi.poor'),      min: -Infinity, color: 'var(--rssi-poor)' },
  ];
}

function rssiTier(dbm) {
  const tiers = rssiTiers();
  return tiers.find(tier => dbm >= tier.min) ?? tiers[tiers.length - 1];
}

function renderRssiStrip(containerId, readings) {
  const container = document.getElementById(containerId);
  const withRssi = readings.filter(r => r.rssi != null);
  if (!withRssi.length) {
    container.innerHTML = `<div class="chart-empty">${t('chart.noSignalDataYet')}</div>`;
    return;
  }

  const W = 900, H = 60;
  const padL = 0, padR = 0;
  const plotW = W - padL - padR;
  const bandW = plotW / withRssi.length;

  const bands = withRssi.map((r, i) => {
    const tier = rssiTier(r.rssi);
    const bx = padL + i * bandW;
    return `<rect class="rssi-band" x="${bx.toFixed(1)}" y="0" width="${Math.ceil(bandW) + 1}" height="${H}"
      fill="${tier.color}" onmouseenter="rssiHover('${containerId}', ${i})" onmouseleave="rssiUnhover('${containerId}')" />`;
  }).join('');

  const legend = rssiTiers().map(tier => `
    <div class="rssi-legend-item">
      <span class="rssi-legend-swatch" style="background:${tier.color}"></span>
      <span>${tier.label}</span>
    </div>`).join('');

  container.innerHTML = `
    <div class="rssi-strip-wrap">
      <div class="chart-wrap">
        <svg class="rssi-strip-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" id="${containerId}-svg">
          ${bands}
        </svg>
        <div class="chart-tooltip" id="${containerId}-tooltip"></div>
      </div>
      <div class="rssi-legend">${legend}</div>
    </div>`;

  container._chartPoints = withRssi;
  container._bandW = bandW;
}

function rssiHover(containerId, i) {
  const container = document.getElementById(containerId);
  const r = container._chartPoints[i];
  const tier = rssiTier(r.rssi);
  const cx = (i + 0.5) * container._bandW;

  const tooltip = document.getElementById(`${containerId}-tooltip`);
  const svg = document.getElementById(`${containerId}-svg`);
  const svgRect = svg.getBoundingClientRect();
  const scaleX = svgRect.width / 900;
  tooltip.style.left = `${cx * scaleX}px`;
  tooltip.style.top = `0px`;
  tooltip.innerHTML = '';
  const valueEl = document.createElement('div');
  valueEl.className = 'tt-value';
  valueEl.textContent = `${tier.label} (${r.rssi} dBm)`;
  tooltip.appendChild(valueEl);
  const row = document.createElement('div');
  row.className = 'tt-row';
  row.textContent = fmtDate(r.recordedAt);
  tooltip.appendChild(row);
  tooltip.style.opacity = 1;
}

function rssiUnhover(containerId) {
  document.getElementById(`${containerId}-tooltip`).style.opacity = 0;
}
