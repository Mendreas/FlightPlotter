// Strict NAV ground plotting.
// NAV LPPT defines the ground window. No invented fallback times.
(function(){
  if(window.__GROUND_FIX_V6__) return;
  window.__GROUND_FIX_V6__ = true;
  console.info('[FlightPlotter] ground_fix.js V6 strict NAV event times loaded');

  function tsec(v){ const n = hm2s(v); return Number.isFinite(n) ? n : null; }
  function callsignOf(tk){ return String((tk && tk.csn) || '').trim().toUpperCase(); }

  function standPoint(navR){
    const dep = navR && navR.mt === 'DEPARTURE';
    const st = dep ? navR.standd : navR.standa;
    let p = null;
    try { if(typeof standCoord === 'function') p = standCoord(st, navR.apron); } catch(e) {}
    try { if(!p && typeof gatePos === 'function') p = gatePos(st, navR.apron); } catch(e) {}
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? {lat:p[0],lng:p[1],label:st ? 'Stand '+st : 'Stand',kind:'stand'} : null;
  }

  function parseRoute(navR){
    const txt = navR && navR.mt === 'DEPARTURE' ? navR.taxiOut : navR.taxiIn;
    return typeof parseTaxiTokens === 'function' ? parseTaxiTokens(txt) : [];
  }

  function routeForTrack(tk){
    const navR = tk && tk.nav;
    if(!navR) return [];
    const tokens = parseRoute(navR);
    if(!tokens.length) return [];
    const stand = standPoint(navR);

    // Use OSM geometry if available. This is the only acceptable multi-aircraft route.
    try {
      if(typeof buildAirfieldRouteFromTokens === 'function'){
        if(navR.mt === 'DEPARTURE'){
          const p = buildAirfieldRouteFromTokens(tokens, stand ? [stand.lat, stand.lng] : null, null);
          if(p && p.length >= 2) return p;
        } else if(navR.mt === 'ARRIVAL'){
          const p = buildAirfieldRouteFromTokens(tokens, null, stand ? [stand.lat, stand.lng] : null);
          if(p && p.length >= 2) return p;
        }
      }
    } catch(e) {}

    // Conservative fallback: if OSM route cannot be resolved, do not draw a moving target.
    // This prevents the previous false cluster of aircraft based on taxiway centroids.
    return [];
  }

  window.navGroundTimes = function(navR, tk){
    if(!navR) return null;
    let s=null, e=null;

    if(navR.mt === 'DEPARTURE'){
      // Strict NAV: from off-block to runway entry/takeoff.
      s = tsec(navR.aobt);
      e = tsec(navR.rwyEnt) ?? tsec(navR.atot);
    } else if(navR.mt === 'ARRIVAL'){
      // Strict NAV: from landing/runway-vacated to in-block.
      s = tsec(navR.rwyVac) ?? tsec(navR.aldt);
      e = tsec(navR.aibt);
    }

    if(!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
    return {start:s,end:e};
  };
  try { navGroundTimes = window.navGroundTimes; } catch(e) {}

  function radarActive(tk,t){ return tk && Number.isFinite(tk.t0) && Number.isFinite(tk.t1) && t >= tk.t0 && t <= tk.t1; }

  function groundActive(tk,t){
    if(!tk || !tk.nav) return false;
    const tm = window.navGroundTimes(tk.nav, tk);
    if(!tm || t < tm.start || t > tm.end) return false;
    // Real radar wins if it overlaps the NAV ground window.
    if(radarActive(tk,t)) return false;
    return routeForTrack(tk).length >= 2;
  }

  window.shouldUseNavGroundForTrack = function(tk,t){ return groundActive(tk,t); };

  function drawGround(key, tk, t, keep){
    const navR = tk.nav;
    const tm = window.navGroundTimes(navR, tk);
    const pts = routeForTrack(tk);
    if(!tm || pts.length < 2) return;

    const span = Math.max(1, tm.end - tm.start);
    const frac = Math.max(0, Math.min(1, (t - tm.start) / span));
    const pos = interpPath(pts, frac);
    if(!pos) return;

    const isSel = key === String(selTrk);
    const clr = navR.mt === 'DEPARTURE' ? '#1a88ff' : '#f5a500';
    keep.add(key);

    if(isSel && !navGroundLines.has(key)){
      const line = L.polyline(pts.map(p=>[p.lat,p.lng]), {color:clr, weight:3, opacity:.75, dashArray:'7,5', interactive:false});
      navGroundLineGroup.addLayer(line); navGroundLines.set(key,line);
    }

    const hdg = Math.round((pos.hdg||0)/5)*5;
    const tip = '<span style="font-weight:700;color:'+clr+'">'+esc(tk.csn||'')+'</span><br><span style="font-size:9px;color:#aaa">NAV '+(navR.mt==='DEPARTURE'?'taxi-out':'taxi-in')+' — '+esc(pos.label||'')+'</span>';

    if(!navGroundMarkers.has(key)){
      const m = L.marker([pos.lat,pos.lng], {icon:mkIcon(hdg,clr,isSel), zIndexOffset:isSel?260:120, interactive:true}).bindTooltip(tip,{className:'acft-lbl',offset:[16,0]});
      navGroundMarkerGroup.addLayer(m); m.on('click',()=>selAircraft(key)); navGroundMarkers.set(key,{marker:m,hdg:hdg,selected:isSel});
    } else {
      const e = navGroundMarkers.get(key); e.marker.setLatLng([pos.lat,pos.lng]);
      if(Math.abs(hdg-e.hdg)>4 || isSel!==e.selected){ e.marker.setIcon(mkIcon(hdg,clr,isSel)); e.marker.options.zIndexOffset=isSel?260:120; e.hdg=hdg; e.selected=isSel; }
      e.marker.getTooltip() && e.marker.getTooltip().setContent(tip);
    }
  }

  window.renderNavGroundLayer = function(t){
    if(typeof ensureNavGroundLayers !== 'function' || !ensureNavGroundLayers()) return;
    const keep = new Set();
    const seen = new Set();

    for(const [id, tk] of tracks){
      if(!groundActive(tk,t)) continue;
      const cs = callsignOf(tk);
      if(cs && seen.has(cs)) continue;
      if(cs) seen.add(cs);
      drawGround(String(id), tk, t, keep);
    }

    for(const [k,e] of [...navGroundMarkers]) if(!keep.has(k)){ navGroundMarkerGroup.removeLayer(e.marker); navGroundMarkers.delete(k); }
    for(const [k,l] of [...navGroundLines]) if(!keep.has(k)){ navGroundLineGroup.removeLayer(l); navGroundLines.delete(k); }
  };
})();
