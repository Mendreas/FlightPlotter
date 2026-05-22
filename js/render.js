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
  updateMarkers(simT);

  if(opdiVisible || selTrk) {
    if(typeof renderOpdiLayer === 'function') renderOpdiLayer(simT);
  } else if(typeof clearOpdiMarkers === 'function') {
    clearOpdiMarkers();
  }

  if(typeof renderNavGroundLayer === 'function') renderNavGroundLayer(simT);
  if(selTrk) updPanel();
}

function updateMarkers(t) {
  let cnt = 0;
  for(const [id, tk] of tracks) {
    if(t < fStart || t > fEnd) { removeMarker(id); continue; }

    // Only suppress the radar marker for the selected aircraft AFTER radar has
    // ended for arrivals, or BEFORE radar starts for departures. Never suppress
    // live radar while the track still has a valid point.
    if(typeof shouldUseNavGroundForTrack === 'function' && shouldUseNavGroundForTrack(tk, t)) {
      removeMarker(id);
      cnt++;
      continue;
    }

    let p = null;
    if(t >= tk.t0 && t <= tk.t1) {
      p = interp(tk, t);
    } else if(typeof navGroundTimes === 'function' && tk.nav) {
      const gw = navGroundTimes(tk.nav, tk);
      if(gw && t >= gw.start && t <= gw.end) {
        // Keep icon visible on runway/taxi if NAV/OPDI ground has not taken over yet.
        if(tk.nav.mt === 'ARRIVAL' && t > tk.t1) p = interp(tk, tk.t1);
        else if(tk.nav.mt === 'DEPARTURE' && t < tk.t0) p = interp(tk, tk.t0);
      }
    }
    if(!p) { removeMarker(id); continue; }
    upsertMarker(id, tk, p, id === selTrk);
    cnt++;
  }
  document.getElementById('acft-count').textContent = `${cnt} aeronave${cnt!==1?'s':''}`;
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
    html:`<div style="width:${sz}px;height:${sz}px;transform:rotate(${hdg}deg);transform-origin:center">${svg}</div>`,
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
  function finiteTime(v){
    const n = hm2s(v);
    return Number.isFinite(n) ? n : null;
  }

  // Replacement for navGroundTimes():
  // ARR: keep radar until the last radar point, then taxi to stand.
  // DEP: taxi from stand until the first radar point, then keep radar.
  window.navGroundTimes = function selectedGroundTimes(navR, tk=null){
    if(!navR) return null;
    let start = null;
    let end = null;

    if(navR.mt === 'ARRIVAL'){
      const trackEnd = tk && Number.isFinite(tk.t1) ? tk.t1 : null;
      const vac = finiteTime(navR.rwyVac);
      const aldt = finiteTime(navR.aldt);
      const aibt = finiteTime(navR.aibt);

      // Do NOT start at ALDT while there is still radar in final/runway.
      start = trackEnd ?? vac ?? aldt;
      end = aibt ?? (start != null ? start + 8*60 : null);
    } else if(navR.mt === 'DEPARTURE'){
      const trackStart = tk && Number.isFinite(tk.t0) ? tk.t0 : null;
      const aobt = finiteTime(navR.aobt);
      const ent = finiteTime(navR.rwyEnt);
      const atot = finiteTime(navR.atot);

      start = aobt ?? (trackStart != null ? trackStart - 12*60 : null);
      // End before/at first radar point. Never extend taxi animation into live radar.
      end = trackStart ?? ent ?? atot ?? (start != null ? start + 12*60 : null);
    }

    if(!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return {start, end};
  };
  // Also replace the plain global binding used by non-module scripts.
  try { navGroundTimes = window.navGroundTimes; } catch(e) {}

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

  window.renderNavGroundLayer = function selectedOnlyNavGroundLayer(t){
    if(typeof ensureNavGroundLayers !== 'function' || !ensureNavGroundLayers()) return;
    const keep = new Set();

    if(!selTrk){
      for(const [key,e] of [...navGroundMarkers]){
        navGroundMarkerGroup.removeLayer(e.marker);
        navGroundMarkers.delete(key);
      }
      for(const [key,line] of [...navGroundLines]){
        navGroundLineGroup.removeLayer(line);
        navGroundLines.delete(key);
      }
      return;
    }

    const tk = tracks.get(selTrk);
    const navR = tk?.nav;
    if(navR){
      const times = window.navGroundTimes(navR, tk);
      if(times && t >= times.start && t <= times.end){
        const pts = navRouteCoords(tk);
        if(pts.length >= 2){
          const frac = (t - times.start) / (times.end - times.start);
          const pos = interpPath(pts, frac);
          if(pos){
            const clr = navR.mt === 'DEPARTURE' ? '#1a88ff' : '#f5a500';
            const key = String(selTrk);
            keep.add(key);

            if(!navGroundLines.has(key)){
              const line = L.polyline(pts.map(p => [p.lat, p.lng]), {
                color: clr, weight: 3, opacity: .78, dashArray:'7,5', interactive:false
              });
              navGroundLineGroup.addLayer(line);
              navGroundLines.set(key, line);
            }

            const hdgRnd = Math.round(pos.hdg / 5) * 5;
            const tip = `<span style="font-weight:700;color:${clr}">${esc(tk.csn||'')}</span><br>`+
              `<span style="font-size:9px;color:#aaa">NAV/OSM ${esc(navR.mt==='DEPARTURE'?'taxi-out':'taxi-in')} — ${esc(pos.label||'')}</span>`;

            if(!navGroundMarkers.has(key)){
              const m = L.marker([pos.lat, pos.lng], {
                icon: mkIcon(hdgRnd, clr, true), zIndexOffset: 260, interactive:true
              }).bindTooltip(tip, {className:'acft-lbl', offset:[16,0]});
              navGroundMarkerGroup.addLayer(m);
              m.on('click', () => selAircraft(selTrk));
              navGroundMarkers.set(key, {marker:m, hdg:hdgRnd, selected:true});
            } else {
              const e = navGroundMarkers.get(key);
              e.marker.setLatLng([pos.lat, pos.lng]);
              if(Math.abs(hdgRnd - e.hdg) > 4 || !e.selected){
                e.marker.setIcon(mkIcon(hdgRnd, clr, true));
                e.marker.options.zIndexOffset = 260;
                e.hdg = hdgRnd;
                e.selected = true;
              }
              e.marker.getTooltip()?.setContent(tip);
            }
          }
        }
      }
    }

    for(const [key,e] of [...navGroundMarkers]){
      if(!keep.has(key)){
        navGroundMarkerGroup.removeLayer(e.marker);
        navGroundMarkers.delete(key);
      }
    }
    for(const [key,line] of [...navGroundLines]){
      if(!keep.has(key)){
        navGroundLineGroup.removeLayer(line);
        navGroundLines.delete(key);
      }
    }
  };

  window.shouldUseNavGroundForTrack = function selectedOnlyShouldUseNavGround(tk, t){
    if(!selTrk || tracks.get(selTrk) !== tk) return false;
    if(!tk?.nav) return false;

    // Critical handoff guards: never replace an existing radar point.
    if(tk.nav.mt === 'ARRIVAL' && Number.isFinite(tk.t1) && t <= tk.t1) return false;
    if(tk.nav.mt === 'DEPARTURE' && Number.isFinite(tk.t0) && t >= tk.t0) return false;

    const times = window.navGroundTimes(tk.nav, tk);
    if(!times || t < times.start || t > times.end) return false;
    const pts = navRouteCoords(tk);
    return pts.length >= 2;
  };
})();
