// Ground continuity override for all NAV flights.
// Loaded after render.js. Keeps ARR/DEP visible after/before radar.
(function(){
  if(window.__GROUND_FIX_V3__) return;
  window.__GROUND_FIX_V3__ = true;
  console.info('[FlightPlotter] ground_fix.js V3 all-ground-continuity loaded');

  function tsec(v){ const n = hm2s(v); return Number.isFinite(n) ? n : null; }
  function pnt(p,label){ return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? {lat:p.lat,lng:p.lng,label:label||'',kind:'radar'} : null; }

  function standPoint(navR){
    const dep = navR && navR.mt === 'DEPARTURE';
    const st = dep ? navR.standd : navR.standa;
    let p = null;
    try { if(typeof standCoord === 'function') p = standCoord(st, navR.apron); } catch(e) {}
    try { if(!p && typeof gatePos === 'function') p = gatePos(st, navR.apron); } catch(e) {}
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? {lat:p[0],lng:p[1],label:st ? 'Stand '+st : 'Stand',kind:'stand'} : null;
  }

  function addTaxiTokens(out, txt){
    const tokens = typeof parseTaxiTokens === 'function' ? parseTaxiTokens(txt) : [];
    tokens.forEach(tok=>{
      try {
        const c = tokenCoord(tok);
        if(c && Number.isFinite(c[0]) && Number.isFinite(c[1])) out.push({lat:c[0],lng:c[1],label:tok,kind:'twy'});
      } catch(e) {}
    });
  }

  function duplicatePoint(p, label){
    return p ? {lat:p.lat, lng:p.lng, label:label || p.label || 'hold', kind:'hold'} : null;
  }

  function routeForTrack(tk){
    const navR = tk && tk.nav;
    if(!navR) return [];

    let pts = [];
    try { if(typeof navRouteCoords === 'function') pts = navRouteCoords(tk) || []; } catch(e) { pts = []; }
    if(pts.length >= 2) return pts;

    const first = pnt(tk.pts && tk.pts[0], 'first radar');
    const last = pnt(tk.pts && tk.pts[tk.pts.length-1], 'last radar');
    const stand = standPoint(navR);
    const out = [];

    if(navR.mt === 'DEPARTURE'){
      if(stand) out.push(stand);
      addTaxiTokens(out, navR.taxiOut);
      if(first) out.push(first);
      if(out.length === 0 && first) out.push(first, duplicatePoint(first, 'first radar hold'));
      if(out.length === 1) out.push(duplicatePoint(out[0], 'hold'));
    } else if(navR.mt === 'ARRIVAL'){
      if(last) out.push(last);
      addTaxiTokens(out, navR.taxiIn);
      if(stand) out.push(stand);
      if(out.length === 0 && last) out.push(last, duplicatePoint(last, 'last radar hold'));
      if(out.length === 1) out.push(duplicatePoint(out[0], 'hold'));
    }

    try { return typeof dedupCoords === 'function' ? dedupCoords(out) : out; } catch(e) { return out; }
  }

  window.navGroundTimes = function(navR, tk){
    if(!navR) return null;
    let s=null, e=null;
    if(navR.mt === 'ARRIVAL'){
      s = tk && Number.isFinite(tk.t1) ? tk.t1 : (tsec(navR.rwyVac) ?? tsec(navR.aldt));
      e = tsec(navR.aibt) ?? (s != null ? s + 8*60 : null);
    } else if(navR.mt === 'DEPARTURE'){
      s = tsec(navR.aobt) ?? (tk && Number.isFinite(tk.t0) ? tk.t0 - 12*60 : null);
      e = tk && Number.isFinite(tk.t0) ? tk.t0 : (tsec(navR.rwyEnt) ?? tsec(navR.atot) ?? (s != null ? s + 12*60 : null));
    }
    return Number.isFinite(s) && Number.isFinite(e) && e > s ? {start:s,end:e} : null;
  };
  try { navGroundTimes = window.navGroundTimes; } catch(e) {}

  window.shouldUseNavGroundForTrack = function(tk,t){
    if(!tk || !tk.nav) return false;
    // Never replace real radar while it exists.
    if(tk.nav.mt === 'ARRIVAL' && Number.isFinite(tk.t1) && t <= tk.t1) return false;
    if(tk.nav.mt === 'DEPARTURE' && Number.isFinite(tk.t0) && t >= tk.t0) return false;
    const tm = window.navGroundTimes(tk.nav, tk);
    return !!(tm && t >= tm.start && t <= tm.end && routeForTrack(tk).length >= 2);
  };

  function drawGroundMarker(key, tk, navR, pts, t, tm){
    const span = Math.max(1, tm.end - tm.start);
    const frac = Math.max(0, Math.min(1, (t - tm.start) / span));
    const pos = interpPath(pts, frac);
    if(!pos) return false;

    const isSel = key === String(selTrk);
    const clr = navR.mt === 'DEPARTURE' ? '#1a88ff' : '#f5a500';

    if(isSel && !navGroundLines.has(key) && !(pts.length === 2 && pts[0].lat === pts[1].lat && pts[0].lng === pts[1].lng)){
      const line = L.polyline(pts.map(p=>[p.lat,p.lng]), {color:clr, weight:3, opacity:.75, dashArray:'7,5', interactive:false});
      navGroundLineGroup.addLayer(line); navGroundLines.set(key,line);
    }

    const hdg = Math.round((pos.hdg||0)/5)*5;
    const tip = '<span style="font-weight:700;color:'+clr+'">'+esc(tk.csn||'')+'</span><br><span style="font-size:9px;color:#aaa">NAV ground — '+esc(pos.label||'')+'</span>';

    if(!navGroundMarkers.has(key)){
      const m = L.marker([pos.lat,pos.lng], {icon:mkIcon(hdg,clr,isSel), zIndexOffset:isSel?260:120, interactive:true}).bindTooltip(tip,{className:'acft-lbl',offset:[16,0]});
      navGroundMarkerGroup.addLayer(m); m.on('click',()=>selAircraft(key)); navGroundMarkers.set(key,{marker:m,hdg:hdg,selected:isSel});
    } else {
      const e = navGroundMarkers.get(key); e.marker.setLatLng([pos.lat,pos.lng]);
      if(Math.abs(hdg-e.hdg)>4 || isSel!==e.selected){ e.marker.setIcon(mkIcon(hdg,clr,isSel)); e.marker.options.zIndexOffset=isSel?260:120; e.hdg=hdg; e.selected=isSel; }
      e.marker.getTooltip() && e.marker.getTooltip().setContent(tip);
    }
    return true;
  }

  window.renderNavGroundLayer = function(t){
    if(typeof ensureNavGroundLayers !== 'function' || !ensureNavGroundLayers()) return;
    const keep = new Set();

    for(const [id, tk] of tracks){
      const navR = tk && tk.nav;
      if(!navR) continue;
      const tm = window.navGroundTimes(navR, tk);
      if(!tm || t < tm.start || t > tm.end) continue;
      // Do not draw synthetic ground where radar is still active.
      if(navR.mt === 'ARRIVAL' && Number.isFinite(tk.t1) && t <= tk.t1) continue;
      if(navR.mt === 'DEPARTURE' && Number.isFinite(tk.t0) && t >= tk.t0) continue;
      const pts = routeForTrack(tk);
      if(pts.length < 2) continue;
      const key = String(id);
      if(drawGroundMarker(key, tk, navR, pts, t, tm)) keep.add(key);
    }

    for(const [k,e] of [...navGroundMarkers]) if(!keep.has(k)){ navGroundMarkerGroup.removeLayer(e.marker); navGroundMarkers.delete(k); }
    for(const [k,l] of [...navGroundLines]) if(!keep.has(k)){ navGroundLineGroup.removeLayer(l); navGroundLines.delete(k); }
  };
})();
