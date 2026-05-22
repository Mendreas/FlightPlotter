// ═══════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════
function drawSliderTicks() {
  const container = document.getElementById('slider-ticks');
  const sl        = document.getElementById('timeSlider');
  container.innerHTML = '';
  const rangeS = fEnd - fStart;
  if(rangeS <= 0) return;

  // Choose interval: 1h if range <=6h, 2h otherwise
  const intervalS = rangeS <= 6*3600 ? 3600 : 7200;

  // First tick at next whole interval after fStart
  const firstH = Math.ceil(fStart / intervalS) * intervalS;

  for(let t = firstH; t <= fEnd; t += intervalS) {
    const pct = (t - fStart) / rangeS * 100;
    // Clamp so labels don't overflow edges
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
  sl.min=fStart; sl.max=fEnd; sl.value=simT;
  updTimeDsp(simT);
  drawSliderTicks();
  updateMarkers(simT);
  if(typeof renderNavGroundLayer === 'function') renderNavGroundLayer(simT);
}

function refresh() {
  updTimeDsp(simT);
  document.getElementById('timeSlider').value=simT;
  updateMarkers(simT);
  // OPDI/NAV ground display is intentionally limited to the selected aircraft.
  // This avoids cluttering the AD view with every simultaneous ground movement.
  if(selTrk && typeof renderOpdiLayer === 'function') renderOpdiLayer(simT);
  else if(typeof clearOpdiMarkers === 'function') clearOpdiMarkers();
  if(typeof renderNavGroundLayer === 'function') renderNavGroundLayer(simT);
  if(selTrk) updPanel();
}

function updateMarkers(t) {
  let cnt=0;
  for(const [id,tk] of tracks) {
    if(t<fStart||t>fEnd){ removeMarker(id); continue; }

    // During NAV-defined ground movement for the SELECTED aircraft, suppress
    // the airborne/radar marker so handoff to taxi animation is clean.
    if(typeof shouldUseNavGroundForTrack === 'function' && shouldUseNavGroundForTrack(tk, t)){
      removeMarker(id);
      cnt++;
      continue;
    }

    if(t<tk.t0||t>tk.t1){ removeMarker(id); continue; }
    const p = interp(tk,t);
    upsertMarker(id,tk,p, id===selTrk);
    cnt++;
  }
  document.getElementById('acft-count').textContent = `${cnt} aeronave${cnt!==1?'s':''}`;
}

function upsertMarker(id,tk,p,selected) {
  const clr = CLR[tk.type]||CLR.OVR;
  const hdg = Math.round(hdgVel(p.vx,p.vy)/5)*5;
  const st  = mkState.get(id)||{};
  const needIcon = !markers.has(id) || Math.abs((st.hdg||0)-hdg)>4 || selected!==st.sel;

  if(!markers.has(id)) {
    const icon = mkIcon(hdg,clr,selected);
    const m = L.marker([p.lat,p.lng],{icon,zIndexOffset:selected?200:0})
      .addTo(map).on('click',()=>selAircraft(id));
    m.bindTooltip('',{permanent:true,direction:'right',className:'acft-lbl',offset:[16,0]});
    markers.set(id,m);
  } else {
    const m=markers.get(id);
    m.setLatLng([p.lat,p.lng]);
    if(needIcon) {
      m.setIcon(mkIcon(hdg,clr,selected));
      m.options.zIndexOffset = selected?200:0;
    }
  }

  // Always update label so altitude/IAS stay in sync with tracker data
  mkState.set(id,{hdg,sel:selected});
  updLabel(id,tk,p);
}

function removeMarker(id) {
  if(!markers.has(id)) return;
  map.removeLayer(markers.get(id));
  markers.delete(id);
  mkState.delete(id);
}

function mkIcon(hdg,clr,sel) {
  const sz=30;
  const glow = sel?`filter:drop-shadow(0 0 6px ${clr})`:'';
  const sw   = sel?1.5:.5;
  const svg  = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 100 100" style="${glow}">
    <path d="M50 4 L59 36 L96 57 L96 66 L59 53 L56 80 L68 85 L68 93 L50 89 L32 93 L32 85 L44 80 L41 53 L4 66 L4 57 L41 36 Z"
      fill="${clr}" stroke="rgba(0,0,0,.5)" stroke-width="${sw*4}"/>
  </svg>`;
  return L.divIcon({
    html:`<div style="width:${sz}px;height:${sz}px;transform:rotate(${hdg}deg);transform-origin:center">${svg}</div>`,
    className:'',iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]
  });
}

function updLabel(id,tk,p) {
  const m=markers.get(id);
  if(!m||!m.getTooltip()) return;
  const info = osCache.get(tk.modeS)||{};
  const fl   = Math.round(p.alt/100);
  const als  = fl>=18 ? `FL${String(fl).padStart(3,'0')}` : `A${String(fl).padStart(3,'0')}`;
  const adep = tk.adep || (tk.type==='DEP' ? 'LPPT' : info.adep||'?');
  const ades = tk.ades || (tk.type==='ARR' ? 'LPPT' : info.ades||'?');
  const tp   = info.type||'';
  const csn  = tk.csn||tk.modeS||'???';
  m.getTooltip().setContent(
    `<span class="lbl-cs">${esc(csn)}</span>`+
    `<span class="lbl-d">${esc(als)} ${Math.round(safeNum(p.ias))}kt</span>`+
    `<span class="lbl-t">${esc(tp||tk.type)}${tp?' '+esc(adep)+'→'+esc(ades):''}</span>`
  );
}

// ═══════════════════════════════════════════════════════════════
// GROUND DISPLAY OVERRIDES — selected aircraft only
// ═══════════════════════════════════════════════════════════════
(function installSelectedGroundOnlyOverrides(){
  // Keep original OPDI renderer, but prevent it from drawing all ground traffic
  // simply because the map is at AD zoom. With this wrapper, OPDI is shown only
  // for the selected callsign.
  const originalOpdiRenderer = window.renderOpdiLayer;
  if(typeof originalOpdiRenderer === 'function'){
    window.renderOpdiLayer = function selectedOnlyOpdiLayer(t){
      if(!selTrk){
        if(typeof clearOpdiMarkers === 'function') clearOpdiMarkers();
        return;
      }
      const oldVisible = opdiVisible;
      opdiVisible = false; // original renderer will then keep only selected OPDI
      try { originalOpdiRenderer(t); }
      finally { opdiVisible = oldVisible; }
    };
  }

  // Override NAV/OSM ground renderer: draw only the selected aircraft. This keeps
  // the airport readable and lets the user inspect one taxi movement at a time.
  window.renderNavGroundLayer = function selectedOnlyNavGroundLayer(t){
    if(!ensureNavGroundLayers()) return;
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
      const times = navGroundTimes(navR, tk);
      if(times && t >= times.start && t <= times.end){
        const pts = navRouteCoords(tk);
        if(pts.length >= 2){
          const frac = (t - times.start) / (times.end - times.start);
          const pos = interpPath(pts, frac);
          if(pos){
            const clr = navR.mt==='DEPARTURE' ? '#1a88ff' : '#f5a500';
            const key = String(selTrk);
            keep.add(key);

            if(!navGroundLines.has(key)){
              const line = L.polyline(pts.map(p=>[p.lat,p.lng]), {
                color: clr, weight: 3, opacity: .78, dashArray:'7,5', interactive:false
              });
              navGroundLineGroup.addLayer(line);
              navGroundLines.set(key, line);
            }

            const hdgRnd = Math.round(pos.hdg/5)*5;
            const tip = `<span style="font-weight:700;color:${clr}">${esc(tk.csn||'')}</span><br>`+
              `<span style="font-size:9px;color:#aaa">NAV/OSM ${esc(navR.mt==='DEPARTURE'?'taxi-out':'taxi-in')} — ${esc(pos.label||'')}</span>`;

            if(!navGroundMarkers.has(key)){
              const m = L.marker([pos.lat,pos.lng], {
                icon: mkIcon(hdgRnd, clr, true), zIndexOffset: 260, interactive:true
              }).bindTooltip(tip,{className:'acft-lbl',offset:[16,0]});
              navGroundMarkerGroup.addLayer(m);
              m.on('click',()=>selAircraft(selTrk));
              navGroundMarkers.set(key,{marker:m, hdg:hdgRnd, selected:true});
            } else {
              const e = navGroundMarkers.get(key);
              e.marker.setLatLng([pos.lat,pos.lng]);
              if(Math.abs(hdgRnd-e.hdg)>4 || !e.selected){
                e.marker.setIcon(mkIcon(hdgRnd, clr, true));
                e.marker.options.zIndexOffset = 260;
                e.hdg = hdgRnd; e.selected = true;
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

  // Suppress radar marker only for the selected aircraft while it is inside the
  // NAV ground window. OPDI is deliberately NOT allowed to block this decision,
  // because the previous version made some selected aircraft vanish on the runway.
  window.shouldUseNavGroundForTrack = function selectedOnlyShouldUseNavGround(tk, t){
    if(!selTrk || tracks.get(selTrk) !== tk) return false;
    if(!tk?.nav) return false;
    const times = navGroundTimes(tk.nav, tk);
    if(!times || t < times.start || t > times.end) return false;
    const pts = navRouteCoords(tk);
    return pts.length >= 2;
  };
})();
