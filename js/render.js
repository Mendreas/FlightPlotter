// ═══════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════
function drawSliderTicks() {
  const container = document.getElementById('slider-ticks');
  container.innerHTML = '';
  const rangeS = fEnd - fStart;
  if(rangeS <= 0) return;

  const intervalS = rangeS <= 6*3600 ? 3600 : 7200;
  const firstH = Math.ceil(fStart / intervalS) * intervalS;

  for(let t = firstH; t <= fEnd; t += intervalS) {
    const pct = (t - fStart) / rangeS * 100;
    if(pct < 1 || pct > 99) continue;
    const span = document.createElement('span');
    span.className = 'sl-tick';
    span.style.left = pct + '%';
    span.textContent = s2hm(t);
    container.appendChild(span);
  }
}

function renderDay() {
  const sl = document.getElementById('timeSlider');
  sl.min = fStart;
  sl.max = fEnd;
  sl.value = simT;
  updTimeDsp(simT);
  drawSliderTicks();
  updateMarkers(simT);
  if(typeof renderNavGroundLayer === 'function') renderNavGroundLayer(simT);
}

function refresh() {
  updTimeDsp(simT);
  document.getElementById('timeSlider').value = simT;

  if(typeof clearDynamicMapLayers === 'function') clearDynamicMapLayers();
  else for(const id of [...markers.keys()]) removeMarker(id);

  updateMarkers(simT);

  if(opdiVisible || selTrk) {
    if(typeof renderOpdiLayer === 'function') renderOpdiLayer(simT);
  } else if(typeof clearOpdiMarkers === 'function') {
    clearOpdiMarkers();
  }

  if(typeof renderNavGroundLayer === 'function') renderNavGroundLayer(simT);

  if(selTrk){
    const tk = trackById(selTrk);
    if(!tk || !trackActiveAt(tk, simT)) clearSelectionPanel();
    else updPanel();
  }

  const cnt = typeof countVisibleAt === 'function' ? countVisibleAt(simT) : 0;
  document.getElementById('acft-count').textContent = `${cnt} aeronave${cnt!==1?'s':''}`;
}

function updateMarkers(t) {
  for(const [id, tk] of tracks) {
    if(t < fStart || t > fEnd || !trackActiveAt(tk, t)) { removeMarker(id); continue; }

    const canonical = findTrackAtTime(trackCallsignKey(tk.csn), t);
    if(canonical !== String(id)) { removeMarker(id); continue; }

    if(typeof shouldUseNavGroundForTrack === 'function' && shouldUseNavGroundForTrack(tk, t)) {
      removeMarker(id);
      continue;
    }

    const p = trackPointAt(tk, t);
    if(!p) { removeMarker(id); continue; }
    if(tk.type === 'OVR' && !nearLppt(p.lat, p.lng)) { removeMarker(id); continue; }

    upsertMarker(id, tk, p, id === selTrk);
  }
}

function upsertMarker(id, tk, p, selected) {
  const clr = CLR[tk.type] || CLR.OVR;
  const hdg = Math.round(hdgVel(p.vx, p.vy) / 5) * 5;
  const st = mkState.get(id) || {};
  const needIcon = !markers.has(id) || Math.abs((st.hdg || 0) - hdg) > 4 || selected !== st.sel;

  if(!markers.has(id)) {
    const icon = mkIcon(hdg, clr, selected);
    const m = L.marker([p.lat, p.lng], {icon, zIndexOffset:selected ? 200 : 0})
      .addTo(map).on('click', () => selAircraft(id));
    m.bindTooltip('', {permanent:true, direction:'right', className:'acft-lbl', offset:[16,0]});
    markers.set(id, m);
  } else {
    const m = markers.get(id);
    m.setLatLng([p.lat, p.lng]);
    if(needIcon) {
      m.setIcon(mkIcon(hdg, clr, selected));
      m.options.zIndexOffset = selected ? 200 : 0;
    }
  }

  mkState.set(id, {hdg, sel:selected});
  updLabel(id, tk, p);
}

function removeMarker(id) {
  if(!markers.has(id)) return;
  map.removeLayer(markers.get(id));
  markers.delete(id);
  mkState.delete(id);
}

function mkIcon(hdg, clr, sel) {
  const sz = 30;
  const glow = sel ? `filter:drop-shadow(0 0 6px ${clr})` : '';
  const sw = sel ? 1.5 : .5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 100 100" style="${glow}">
    <path d="M50 4 L59 36 L96 57 L96 66 L59 53 L56 80 L68 85 L68 93 L50 89 L32 93 L32 85 L44 80 L41 53 L4 66 L4 57 L41 36 Z"
      fill="${clr}" stroke="rgba(0,0,0,.5)" stroke-width="${sw*4}"/>
  </svg>`;
  return L.divIcon({
    html:`<div style="width:${sz}px;height:${sz}px;transform:rotate(${hdg}deg);transform-origin:center;cursor:pointer">${svg}</div>`,
    className:'', iconSize:[sz,sz], iconAnchor:[sz/2,sz/2]
  });
}

function updLabel(id, tk, p) {
  const m = markers.get(id);
  if(!m || !m.getTooltip()) return;
  const info = osCache.get(tk.modeS) || {};
  const fl = Math.round(p.alt / 100);
  const als = fl >= 18 ? `FL${String(fl).padStart(3,'0')}` : `A${String(fl).padStart(3,'0')}`;
  const adep = tk.adep || (tk.type === 'DEP' ? 'LPPT' : info.adep || '?');
  const ades = tk.ades || (tk.type === 'ARR' ? 'LPPT' : info.ades || '?');
  const tp = info.type || '';
  const csn = tk.csn || tk.modeS || '???';
  m.getTooltip().setContent(
    `<span class="lbl-cs">${esc(csn)}</span>`+
    `<span class="lbl-d">${esc(als)} ${Math.round(safeNum(p.ias))}kt</span>`+
    `<span class="lbl-t">${esc(tp||tk.type)}${tp?' '+esc(adep)+'→'+esc(ades):''}</span>`
  );
}

// ═══════════════════════════════════════════════════════════════
// SELECTED-AIRCRAFT GROUND HANDOFF
// ═══════════════════════════════════════════════════════════════
(function installSelectedGroundHandoff(){
  const originalOpdiRenderer = window.renderOpdiLayer;
  if(typeof originalOpdiRenderer === 'function'){
    window.renderOpdiLayer = function opdiLayerWithSelection(t){
      if(!selTrk && !opdiVisible){
        if(typeof clearOpdiMarkers === 'function') clearOpdiMarkers();
        return;
      }
      const oldVisible = opdiVisible;
      if(selTrk) opdiVisible = false;
      try { originalOpdiRenderer(t); }
      finally { opdiVisible = oldVisible; }
    };
  }
})();
