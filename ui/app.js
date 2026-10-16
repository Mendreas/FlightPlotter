/* Flight Plotter v2 — interface (fala com o Python via window.pywebview.api) */
'use strict';

const $ = id => document.getElementById(id);
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('pt-PT'));
const CLS_COLOR = { arr: '#3b9cff', dep: '#ff9b2f', lvl: '#8a93a6' };
const CLS_NAME = { arr: 'Chegada', dep: 'Partida', lvl: 'Sobrevoo' };
const PALETTE = ['#4cc9f0', '#f72585', '#b5e48c', '#ffd166', '#c77dff', '#06d6a0', '#ff8fab', '#90e0ef', '#f9c74f', '#a0c4ff', '#ffadad', '#caffbf'];
const THR = { LPPT: { '02': [38.766428, -9.143903], '20': [38.792331, -9.130047] },
  LPFR: { '10': [37.017222, -7.985614], '28': [37.013450, -7.959042] },
  LPMA: { '05': [32.689932, -16.783751], '23': [32.705841, -16.765150] },
  LPPR: { '17': [41.260681, -8.684561], '35': [41.233886, -8.677536] } };
const AIRPORT_CENTER = { LPPT: [38.78, -9.14], LPFR: [37.02, -7.97], LPMA: [32.70, -16.77], LPPR: [41.25, -8.68] };

const state = {
  filters: null, airport: 'LPPT', days: new Set(), blocks: new Set(),
  flights: [], byId: new Map(), hidden: new Set(), selected: null,
  tracks: {}, layers: new Map(), points: null, sortKey: 'date', sortAsc: true,
};

/* ------------------------------------------------------------- API bridge */
function api() { return window.pywebview && window.pywebview.api; }
async function call(name, ...args) {
  const a = api();
  if (!a) throw new Error('Backend Python não disponível (a app tem de correr via app.py).');
  const r = await a[name](...args);
  if (!r || !r.ok) throw new Error((r && r.error) || 'Erro desconhecido');
  return r.data;
}

/* ------------------------------------------------------------- UI helpers */
let toastT;
function toast(msg, kind = '') {
  const t = $('toast'); t.textContent = msg; t.className = 'toast ' + kind;
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), kind === 'err' ? 9000 : 4500);
}
function status(msg, dot = 'on', time = '') { $('sTxt').textContent = msg; $('sDot').className = 'dot ' + dot; $('sTime').textContent = time; }
function haversineNm(a, b) {
  const R = 3440.065, d2r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * d2r, dLon = (b[1] - a[1]) * d2r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * d2r) * Math.cos(b[0] * d2r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function nearestThr(airport, latlon) {
  const t = THR[airport] || THR.LPPT; let best = null;
  for (const k in t) { const d = haversineNm(latlon, t[k]); if (!best || d < best.d) best = { rwy: k, d }; }
  return best;
}

/* ------------------------------------------------------------- Map */
let map, tiles, trackGroup, pointGroup, hiLayer;
function initMap() {
  map = L.map('map', { zoomControl: true, preferCanvas: true }).setView(AIRPORT_CENTER.LPPT, 10);
  const BASES = {
    osm:  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19, className: 'tiles-dark' }),
    sat:  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri', maxZoom: 18 }),
    ruas: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri', maxZoom: 18 }),
  };
  tiles = BASES.osm;
  Object.values(BASES).forEach(t => t.on('tileerror', () => { if (!t._warned) { t._warned = true; toast('Sem acesso ao mapa de fundo (sem internet?). As trajetórias continuam visíveis.', 'err'); } }));
  $('selBase').onchange = e => { map.removeLayer(tiles); tiles = BASES[e.target.value]; if ($('chkTiles').checked) tiles.addTo(map); };
  tiles.addTo(map);
  trackGroup = L.layerGroup().addTo(map);
  pointGroup = L.layerGroup().addTo(map);
  // escala em NM
  L.control.scale({ imperial: false, nautical: true, metric: false }).addTo(map);
}
function drawPoints() {
  pointGroup.clearLayers();
  if (!state.points || !$('chkPoints').checked) return;
  const g = $('selGroup').value;
  let names = null;
  if (g && g !== 'ALL') names = new Set(state.points.groups[g] || []);
  const seen = new Set();
  for (const p of state.points.points) {
    if (names && !names.has(p.name)) continue;
    if (seen.has(p.name)) continue; seen.add(p.name);
    const isThr = p.name.startsWith('THR');
    L.circleMarker([p.lat, p.lon], { radius: isThr ? 4 : 3, color: isThr ? '#ffd166' : '#7fb3ff', weight: 1, fillOpacity: .9 })
      .bindTooltip(`${p.name}<br><span style="color:#8a93a6">${p.desc || ''}</span>`, { direction: 'top' })
      .addTo(pointGroup);
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'aip-lbl', html: p.name, iconAnchor: [-6, 6] }), interactive: false }).addTo(pointGroup);
  }
}
function colorFor(f) {
  if ($('chkColorCls').checked) return CLS_COLOR[f.cls] || CLS_COLOR.lvl;
  let h = 0; for (const ch of f.csn) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function drawTracks() {
  trackGroup.clearLayers(); state.layers.clear();
  let bounds = null;
  for (const f of state.flights) {
    if (state.hidden.has(f.flight_id)) continue;
    const pts = state.tracks[f.flight_id]; if (!pts || pts.length < 2) continue;
    const ll = pts.map(p => [p[0], p[1]]);
    const sel = state.selected === f.flight_id;
    const line = L.polyline(ll, { color: colorFor(f), weight: sel ? 4 : 1.6, opacity: sel ? 1 : .75 });
    line.bindTooltip(`<b>${f.csn}</b> ${f.actype || ''} · ${CLS_NAME[f.cls]}<br>${f.tod_first} → ${f.tod_last}`, { sticky: true });
    line.on('click', () => selectFlight(f.flight_id, false));
    line.addTo(trackGroup); state.layers.set(f.flight_id, line);
    const b = line.getBounds(); bounds = bounds ? bounds.extend(b) : b;
  }
  if (bounds && bounds.isValid() && !state.selected) map.fitBounds(bounds.pad(0.05));
}

/* ------------------------------------------------------------- Filters UI */
function renderFilters() {
  const f = state.filters;
  const selA = $('selAirport'); selA.innerHTML = '';
  for (const a of f.airports) selA.insertAdjacentHTML('beforeend', `<option value="${a}">${a}</option>`);
  if (!f.airports.includes(state.airport)) state.airport = f.airports[0] || 'LPPT';
  selA.value = state.airport;
  renderDays(); renderBlocks();
}
function renderDays() {
  const list = $('dayList'); list.innerHTML = '';
  const days = state.filters.dates.filter(d => d.airport === state.airport);
  for (const d of days) {
    const on = state.days.has(d.date);
    list.insertAdjacentHTML('beforeend',
      `<label title="${d.files} ficheiro(s) · ${fmt(d.rows)} plots · blocos ${d.blocks}"><input type="checkbox" data-d="${d.date}" ${on ? 'checked' : ''}> ${d.label} <span class="n">${d.files}</span></label>`);
  }
  if (!days.length) list.innerHTML = '<div class="empty" style="grid-column:1/-1">Sem dados para este aeroporto.</div>';
  list.querySelectorAll('input').forEach(i => i.onchange = () => { i.checked ? state.days.add(i.dataset.d) : state.days.delete(i.dataset.d); updDayCount(); });
  updDayCount();
}
function updDayCount() { $('dayCount').textContent = state.days.size ? `(${state.days.size} selecionados)` : ''; }
function renderBlocks() {
  const c = $('blockChips'); c.innerHTML = '';
  for (const b of state.filters.blocks) {
    const el = document.createElement('span'); el.className = 'chip' + (state.blocks.has(b) ? ' on' : ''); el.textContent = b;
    el.onclick = () => { state.blocks.has(b) ? state.blocks.delete(b) : state.blocks.add(b); el.classList.toggle('on'); };
    c.appendChild(el);
  }
}

/* ------------------------------------------------------------- Flights */
async function applyFilter() {
  if (!state.days.size) { toast('Seleciona pelo menos um dia.', 'err'); return; }
  const t0 = performance.now();
  status('A consultar…', 'busy');
  try {
    const dates = [...state.days], blocks = [...state.blocks];
    state.flights = await call('get_flights', state.airport, dates, blocks, $('inpCsn').value.trim(), $('selCls').value);
    state.byId = new Map(state.flights.map(f => [f.flight_id, f]));
    state.hidden.clear(); state.selected = null; closeDetail();
    const t1 = performance.now();
    const tr = await call('get_tracks', state.flights.map(f => f.flight_id));
    state.tracks = tr.tracks;
    const t2 = performance.now();
    renderFlightList(); renderTable(); drawTracks();
    const st = await call('get_stats', state.airport, dates, blocks);
    const arr = state.flights.filter(f => f.cls === 'arr').length, dep = state.flights.filter(f => f.cls === 'dep').length;
    status(`${state.flights.length} movimento(s) · ${arr} chegadas · ${dep} partidas · ${fmt(tr.points)} plots desenhados` +
      (tr.step > 1 ? ` (1 em cada ${tr.step})` : '') + ` · ${dates.length} dia(s)`, 'on',
      `consulta ${Math.round(t1 - t0)} ms · trajetórias ${Math.round(t2 - t1)} ms · total ${Math.round(performance.now() - t0)} ms`);
    $('tblInfo').textContent = `${state.flights.length} movimentos · ${fmt(st.points)} plots nos dias selecionados`;
  } catch (e) { status('Erro: ' + e.message, 'err'); toast(e.message, 'err'); }
}
function renderFlightList() {
  const list = $('flList'); list.innerHTML = '';
  $('flCount').textContent = `(${state.flights.length})`;
  if (!state.flights.length) { list.innerHTML = '<div class="empty">Nenhum movimento com estes filtros.</div>'; return; }
  const frag = document.createDocumentFragment();
  for (const f of state.flights) {
    const el = document.createElement('div');
    el.className = 'fl' + (state.hidden.has(f.flight_id) ? ' off' : '') + (state.selected === f.flight_id ? ' sel' : '');
    el.dataset.id = f.flight_id;
    el.innerHTML = `<span class="sw" style="background:${colorFor(f)}"></span><span class="csn">${f.csn}</span>` +
      `<span class="typ">${f.actype || ''}</span><span class="badge ${f.cls}">${f.cls.toUpperCase()}</span><span class="t">${f.tod_first.slice(0, 5)}</span>`;
    el.onclick = ev => { if (ev.shiftKey) toggleHidden(f.flight_id); else selectFlight(f.flight_id, true); };
    el.title = `${f.date} · ${f.tod_first}–${f.tod_last} · ${f.n} plots · Shift+clique: mostrar/esconder`;
    frag.appendChild(el);
  }
  list.appendChild(frag);
}
function toggleHidden(id) { state.hidden.has(id) ? state.hidden.delete(id) : state.hidden.add(id); renderFlightList(); drawTracks(); }
function renderTable() {
  const tb = $('flTable').querySelector('tbody'); tb.innerHTML = '';
  const k = state.sortKey, asc = state.sortAsc ? 1 : -1;
  const rows = [...state.flights].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * asc);
  const frag = document.createDocumentFragment();
  for (const f of rows) {
    const tr = document.createElement('tr'); tr.dataset.id = f.flight_id;
    tr.innerHTML = `<td>${f.date}</td><td><b>${f.csn}</b></td><td>${f.actype || ''}</td><td>${f.wtc || ''}</td>` +
      `<td><span class="badge ${f.cls}">${f.cls.toUpperCase()}</span></td><td>${f.tod_first}</td><td>${f.tod_last}</td>` +
      `<td>${fmt(f.alt_first)}</td><td>${fmt(f.alt_last)}</td><td>${fmt(f.alt_max)}</td><td>${f.n}</td><td>${f.blocks}</td>`;
    tr.onclick = () => { showTab('map'); selectFlight(f.flight_id, true); };
    frag.appendChild(tr);
  }
  tb.appendChild(frag);
}

/* ------------------------------------------------------------- Detail */
async function selectFlight(id, zoom) {
  state.selected = (state.selected === id) ? null : id;
  renderFlightList();
  state.layers.forEach((l, fid) => l.setStyle({ weight: fid === state.selected ? 4 : 1.6, opacity: fid === state.selected ? 1 : .75 }));
  if (state.selected == null) { closeDetail(); return; }
  const l = state.layers.get(id); if (l) { l.bringToFront(); if (zoom) map.fitBounds(l.getBounds().pad(0.2)); }
  const f = state.byId.get(id);
  try {
    const pts = await call('get_flight', id);
    openDetail(f, pts);
  } catch (e) { toast(e.message, 'err'); }
}
function closeDetail() { $('detail').classList.add('hidden'); }
function openDetail(f, pts) {
  $('detail').classList.remove('hidden');
  $('dCsn').textContent = f.csn;
  $('dSub').textContent = `${f.date} · ${CLS_NAME[f.cls]} · ${f.actype || 'tipo ?'}${f.wtc ? ' / ' + f.wtc : ''} · Mode S ${f.modes || '—'}`;
  const dur = f.t_last - f.t_first;
  const thr = nearestThr(f.airport, [pts[pts.length - 1].lat, pts[pts.length - 1].lon]);
  const thr0 = nearestThr(f.airport, [pts[0].lat, pts[0].lon]);
  const ref = f.cls === 'dep' ? thr0 : thr;
  const refLL = (THR[f.airport] || THR.LPPT)[ref.rwy];
  const ias = pts.map(p => p.ias).filter(v => v != null);
  const kp = [[f.n, 'plots'], [`${Math.floor(dur / 60)}m${String(Math.round(dur % 60)).padStart(2, '0')}`, 'duração'],
    [`RWY ${ref.rwy}`, f.cls === 'dep' ? 'descolagem' : 'pista provável'],
    [fmt(f.alt_max), 'alt máx ft'], [ias.length ? Math.round(Math.max(...ias)) : '—', 'IAS máx kt'], [ias.length ? Math.round(Math.min(...ias)) : '—', 'IAS mín kt']];
  $('dKpis').innerHTML = kp.map(k => `<div class="kpi"><b>${k[0]}</b><span>${k[1]}</span></div>`).join('');
  const tb = $('dTbl').querySelector('tbody'); tb.innerHTML = '';
  const rows = [];
  for (const p of pts) {
    const d = haversineNm([p.lat, p.lon], refLL);
    rows.push({ d, alt: p.alt });
    tb.insertAdjacentHTML('beforeend', `<tr><td>${p.tod}</td><td>${fmt(p.alt)}</td><td>${p.ias == null ? '—' : Math.round(p.ias)}</td><td>${p.gs == null ? '—' : Math.round(p.gs)}</td><td>${p.roc == null ? '—' : Math.round(p.roc)}</td><td>${d.toFixed(1)} NM</td></tr>`);
  }
  drawProfile(rows, f);
}
function drawProfile(rows, f) {
  const c = $('dChart'), ctx = c.getContext('2d');
  const W = c.width = c.clientWidth * 2, H = c.height = 300; ctx.scale(1, 1);
  ctx.clearRect(0, 0, W, H);
  const valid = rows.filter(r => r.alt != null && r.d <= 40);
  if (valid.length < 2) return;
  const maxD = Math.max(...valid.map(r => r.d)), maxA = Math.max(...valid.map(r => r.alt), 1000);
  const px = 60, py = 20, pw = W - px - 20, ph = H - py - 40;
  ctx.strokeStyle = '#24314d'; ctx.lineWidth = 1; ctx.font = '20px Consolas,monospace'; ctx.fillStyle = '#8a93a6';
  for (let i = 0; i <= 4; i++) {
    const y = py + ph - ph * i / 4; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke();
    ctx.fillText(Math.round(maxA * i / 4 / 100) * 100, 4, y + 6);
  }
  for (let i = 0; i <= 4; i++) { const x = px + pw * i / 4; ctx.fillText((maxD * i / 4).toFixed(0) + ' NM', x - 20, H - 10); }
  // perfil 3° de referência (318 ft/NM)
  ctx.strokeStyle = '#ffd16688'; ctx.setLineDash([8, 8]); ctx.beginPath();
  ctx.moveTo(px, py + ph); ctx.lineTo(px + pw, py + ph - Math.min(ph, ph * (maxD * 318) / maxA)); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = CLS_COLOR[f.cls]; ctx.lineWidth = 3; ctx.beginPath();
  valid.forEach((r, i) => { const x = px + pw * r.d / maxD, y = py + ph - ph * r.alt / maxA; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  ctx.fillStyle = '#8a93a6'; ctx.fillText('Altitude (ft) vs distância à THR — tracejado: 3°', px, 16);
}

/* ------------------------------------------------------------- Import */
window.onImportProgress = (done, total, name) => {
  $('progress').classList.remove('hidden');
  $('progressBar').style.width = total ? (done / total * 100).toFixed(1) + '%' : '100%';
  $('progressTxt').textContent = done ? `A importar ${done} / ${total} — ${name}` : name;
};
window.onImportDone = async r => {
  $('progress').classList.add('hidden');
  if (!r.ok) { toast('Erro na importação: ' + r.error, 'err'); status('Erro na importação', 'err'); return; }
  const d = r.data;
  let msg = d.new === 0 ? `Nada de novo: os ${d.found} ficheiros já estavam importados.`
    : `${d.imported} ficheiro(s) novos importados (${fmt(d.rows)} plots) em ${(d.ms / 1000).toFixed(1)} s.`;
  if (d.errors) msg += `\n${d.errors} com erro:\n` + d.error_list.join('\n');
  toast(msg, d.errors ? 'err' : 'ok');
  await refreshState(); await loadFilters();
  if (d.new > 0 && !state.days.size) { selectLastDay(); applyFilter(); }
};
async function importFolder(useLast) {
  try {
    let folder = null;
    if (!useLast) { folder = await call('choose_folder'); if (!folder) return; }
    const f = await call('import_folder', folder);
    $('progress').classList.remove('hidden'); $('progressBar').style.width = '0%';
    $('progressTxt').textContent = 'A procurar ficheiros CSV em ' + f + ' …';
  } catch (e) { toast(e.message, 'err'); }
}

/* ------------------------------------------------------------- State */
async function refreshState() {
  const s = await call('get_state');
  $('ver').textContent = 'v' + s.version;
  $('dbFiles').textContent = fmt(s.files); $('dbRows').textContent = fmt(s.rows); $('dbFlights').textContent = fmt(s.flights);
  $('dbSize').textContent = `base ${(s.db_bytes / 1048576).toFixed(0)} MB`;
  $('dbSize').title = s.db_path;
  $('btnReimport').disabled = !s.last_folder;
  if (s.last_folder) $('btnReimport').title = 'Procurar ficheiros novos em ' + s.last_folder;
  return s;
}
async function loadFilters() { state.filters = await call('get_filters'); renderFilters(); }
function selectLastDay() {
  const days = state.filters.dates.filter(d => d.airport === state.airport);
  state.days = new Set(days.length ? [days[days.length - 1].date] : []);
  state.blocks = new Set(state.filters.blocks);
  renderDays(); renderBlocks();
}
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'map') setTimeout(() => map.invalidateSize(), 50);
}

/* ------------------------------------------------------------- Boot */
async function boot() {
  initMap();
  try {
    const s = await refreshState();
    await loadFilters();
    const pts = await call('get_points'); state.points = pts;
    const sg = $('selGroup'); sg.innerHTML = '<option value="ALL">Todos os pontos</option>';
    for (const g of Object.keys(pts.groups)) sg.insertAdjacentHTML('beforeend', `<option value="${g}">${g}</option>`);
    drawPoints();
    if (s.files > 0) { selectLastDay(); applyFilter(); }
    else status('Sem dados. Clica "Importar pasta…" e escolhe a pasta com os CSV do CNS.', 'on');
  } catch (e) { status(e.message, 'err'); toast(e.message, 'err'); }
}

document.addEventListener('DOMContentLoaded', () => {
  $('btnImport').onclick = () => importFolder(false);
  $('btnReimport').onclick = () => importFolder(true);
  $('btnNmir').onclick = async () => { try { const n = await call('import_nmir'); if (n != null) { toast(`${fmt(n)} registo(s) NMIR adicionados.`, 'ok'); await refreshState(); applyFilter(); } } catch (e) { toast(e.message, 'err'); } };
  $('btnFolder').onclick = () => call('open_data_folder').catch(e => toast(e.message, 'err'));
  $('btnApply').onclick = applyFilter;
  $('inpCsn').onkeydown = e => { if (e.key === 'Enter') applyFilter(); };
  $('selAirport').onchange = e => { state.airport = e.target.value; state.days.clear(); renderDays(); map.setView(AIRPORT_CENTER[state.airport] || AIRPORT_CENTER.LPPT, 10); };
  $('daysAll').onclick = e => { e.preventDefault(); state.filters.dates.filter(d => d.airport === state.airport).forEach(d => state.days.add(d.date)); renderDays(); };
  $('daysNone').onclick = e => { e.preventDefault(); state.days.clear(); renderDays(); };
  $('daysLast').onclick = e => { e.preventDefault(); selectLastDay(); };
  $('flShowAll').onclick = e => { e.preventDefault(); state.hidden.clear(); renderFlightList(); drawTracks(); };
  $('flHideAll').onclick = e => { e.preventDefault(); state.flights.forEach(f => state.hidden.add(f.flight_id)); renderFlightList(); drawTracks(); };
  $('chkPoints').onchange = drawPoints; $('selGroup').onchange = drawPoints;
  $('chkColorCls').onchange = () => { renderFlightList(); drawTracks(); };
  $('chkTiles').onchange = e => { e.target.checked ? tiles.addTo(map) : map.removeLayer(tiles); };
  $('dClose').onclick = () => selectFlight(state.selected, false);
  $('btnExport').onclick = async () => { try { const p = await call('export_flights_csv', state.airport, [...state.days], [...state.blocks], $('inpCsn').value.trim(), $('selCls').value); if (p) toast('Exportado para ' + p, 'ok'); } catch (e) { toast(e.message, 'err'); } };
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => showTab(t.dataset.tab));
  document.querySelectorAll('#flTable th').forEach(th => th.onclick = () => { const k = th.dataset.k; state.sortAsc = state.sortKey === k ? !state.sortAsc : true; state.sortKey = k; renderTable(); });
  if (api()) boot(); else window.addEventListener('pywebviewready', boot);
});
