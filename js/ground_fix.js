// NAV-only ground plotting from NAV LPPT records.
// The NAV CSV is the source of truth for ground movement; tracker/radar is only airborne overlay.
(function(){
  if(window.__GROUND_FIX_V8__) return;
  window.__GROUND_FIX_V8__ = true;
  console.info('[FlightPlotter] ground_fix.js V8 NAV-record plotting loaded');

  function tsec(v){ const n = hm2s(v); return Number.isFinite(n) ? n : null; }
  function dateStr(){ try { return fmtDateKey(dayKey); } catch(e) { return ''; } }
  function csKey(v){ return String(v||'').trim().toUpperCase(); }

  function standPoint(navR){
    const dep = navR && navR.mt === 'DEPARTURE';
    const st = dep ? navR.standd : navR.standa;
    let p = null;
    try { if(typeof standCoord === 'function') p = standCoord(st, navR.apron); } catch(e) {}
    try { if(!p && typeof gatePos === 'function') p = gatePos(st, navR.apron); } catch(e) {}
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0],p[1]] : null;
  }

  function tokens(navR){
    const txt = navR && navR.mt === 'DEPARTURE' ? navR.taxiOut : navR.taxiIn;
    return typeof parseTaxiTokens === 'function' ? parseTaxiTokens(txt) : [];
  }

  window.navGroundTimes = function(navR){
    if(!navR) return null;
    let s=null, e=null;
    if(navR.mt === 'DEPARTURE'){
      s = tsec(navR.aobt);
      e = tsec(navR.rwyEnt) ?? tsec(navR.atot);
    } else if(navR.mt === 'ARRIVAL'){
      s = tsec(navR.rwyVac) ?? tsec(navR.aldt);
      e = tsec(navR.aibt);
    }
    return Number.isFinite(s) && Number.isFinite(e) && e > s ? {start:s,end:e} : null;
  };
  try { navGroundTimes = window.navGroundTimes; } catch(e) {}

  function routeFromNav(navR){
    const toks = tokens(navR);
    if(!toks.length) return [];
    const st = standPoint(navR);
    try {
      if(typeof buildAirfieldRouteFromTokens === 'function'){
        const start = navR.mt === 'DEPARTURE' ? st : null;
        const end = navR.mt === 'ARRIVAL' ? st : null;
        const p = buildAirfieldRouteFromTokens(toks, start, end);
        if(p && p.length >= 2) return p;
      }
    } catch(e) {}
    return [];
  }

  function findTrackByCallsign(csn){
    const c = csKey(csn);
    for(const [id,tk] of tracks){ if(csKey(tk.csn) === c) return {id:String(id), tk}; }
    return null;
  }

  function selectedCallsign(){
    const tk = selTrk ? tracks.get(selTrk) : null;
    return csKey(tk && tk.csn);
  }

  function navRecordsForCurrentDay(){
    const d = dateStr();
    const out = [];
    if(!d || !navMap || !navMap.size) return out;
    for(const [key,navR] of navMap){
      if(!key.endsWith('|'+d)) continue;
      const csn = key.slice(0, key.length - d.length - 1);
      out.push({key:'NAV|'+key, csn, navR});
    }
    return out;
  }

  function isSelectedNav(csn){ return selectedCallsign() && selectedCallsign() === csKey(csn); }

  // Do not let old track-based NAV ground suppress radar. This NAV layer is separate.
  window.shouldUseNavGroundForTrack = function(){ return false; };

  function drawNavGround(item, t, keep){
    const navR = item.navR;
    const tm = window.navGroundTimes(navR);
    const pts = routeFromNav(navR);
    if(!tm || pts.length < 2) return false;

    const span = Math.max(1, tm.end - tm.start);
    const frac = Math.max(0, Math.min(1, (t - tm.start) / span));
    const pos = interpPath(pts, frac);
    if(!pos) return false;

    const key = item.key;
    const sel = isSelectedNav(item.csn);
    const clr = navR.mt === 'DEPARTURE' ? '#1a88ff' : '#f5a500';
    keep.add(key);

    if(sel && !navGroundLines.has(key)){
      const line = L.polyline(pts.map(p=>[p.lat,p.lng]), {color:clr, weight:3, opacity:.75, dashArray:'7,5', interactive:false});
      navGroundLineGroup.addLayer(line); navGroundLines.set(key,line);
    }

    const hdg = Math.round((pos.hdg||0)/5)*5;
    const label = navR.mt === 'DEPARTURE' ? 'NAV taxi-out' : 'NAV taxi-in';
    const tip = '<span style="font-weight:700;color:'+clr+'">'+esc(item.csn||'')+'</span><br><span style="font-size:9px;color:#aaa">'+label+' — '+esc(pos.label||'')+'</span>';

    if(!navGroundMarkers.has(key)){
      const m = L.marker([pos.lat,pos.lng], {icon:mkIcon(hdg,clr,sel), zIndexOffset:sel?260:120, interactive:true}).bindTooltip(tip,{className:'acft-lbl',offset:[16,0]});
      navGroundMarkerGroup.addLayer(m);
      m.on('click',()=>{ const tr = findTrackByCallsign(item.csn); if(tr) selAircraft(tr.id); });
      navGroundMarkers.set(key,{marker:m,hdg:hdg,selected:sel});
    } else {
      const e = navGroundMarkers.get(key); e.marker.setLatLng([pos.lat,pos.lng]);
      if(Math.abs(hdg-e.hdg)>4 || sel!==e.selected){ e.marker.setIcon(mkIcon(hdg,clr,sel)); e.marker.options.zIndexOffset=sel?260:120; e.hdg=hdg; e.selected=sel; }
      e.marker.getTooltip() && e.marker.getTooltip().setContent(tip);
    }
    return true;
  }

  window.renderNavGroundLayer = function(t){
    if(typeof ensureNavGroundLayers !== 'function' || !ensureNavGroundLayers()) return;
    const keep = new Set();
    const d = dateStr();
    let count = 0;

    for(const item of navRecordsForCurrentDay()){
      const tm = window.navGroundTimes(item.navR);
      if(!tm || t < tm.start || t > tm.end) continue;
      const pts = routeFromNav(item.navR);
      if(pts.length < 2) continue;
      if(drawNavGround(item, t, keep)) count++;
    }

    for(const [k,e] of [...navGroundMarkers]) if(!keep.has(k)){ navGroundMarkerGroup.removeLayer(e.marker); navGroundMarkers.delete(k); }
    for(const [k,l] of [...navGroundLines]) if(!keep.has(k)){ navGroundLineGroup.removeLayer(l); navGroundLines.delete(k); }

    // Optional diagnostic counter in console without spamming every frame.
    if(window.__lastNavGroundDiagT !== Math.floor(t/30)){
      window.__lastNavGroundDiagT = Math.floor(t/30);
      console.debug('[FlightPlotter] NAV ground active', d, s2hms ? s2hms(t) : t, count);
    }
  };
})();
