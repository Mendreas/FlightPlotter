// Ground continuity override for the selected aircraft only.
// Loaded after render.js. Avoids clutter and prevents radar/ground duplicate for the same callsign.
(function(){
  if(window.__GROUND_FIX_V4__) return;
  window.__GROUND_FIX_V4__ = true;
  console.info('[FlightPlotter] ground_fix.js V4 selected-only loaded');

  function tsec(v){ const n = hm2s(v); return Number.isFinite(n) ? n : null; }
  function pnt(p,label){ return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? {lat:p.lat,lng:p.lng,label:label||'',kind:'radar'} : null; }
  function sameCallsign(a,b){ return String(a||'').trim().toUpperCase() === String(b||'').trim().toUpperCase(); }

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

  function duplicatePoint(p, label){ return p ? {lat:p.lat, lng:p.lng, label:label || p.label || 'hold', kind:'hold'} : null; }

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

  function selectedTrack(){ return selTrk ? tracks.get(selTrk) : null; }
  function selectedGroundActive(t){
    const tk = selectedTrack();
    if(!tk || !tk.nav) return false;
    if(tk.nav.mt === 'ARRIVAL' && Number.isFinite(tk.t1) && t <= tk.t1) return false;
    if(tk.nav.mt === 'DEPARTURE' && Number.isFinite(tk.t0) && t >= tk.t0) return false;
    const tm = window.navGroundTimes(tk.nav, tk);
    return !!(tm && t >= tm.start && t <= tm.end && routeForTrack(tk).length >= 2);
  }

  window.shouldUseNavGroundForTrack = function(tk,t){
    const sel = selectedTrack();
    if(!sel || !tk) return false;
    if(!selectedGroundActive(t)) return false;
    // Suppress the actual selected radar marker and any duplicated radar segment
    // that has the same callsign, avoiding simultaneous runway + taxi display.
    return tk === sel || sameCallsign(tk.csn, sel.csn);
  };

  window.renderNavGroundLayer = function(t){
    if(typeof ensureNavGroundLayers !== 'function' || !ensureNavGroundLayers()) return;
    const keep = new Set();
    const tk = selectedTrack();
    const navR = tk && tk.nav;
    if(tk && navR){
      const tm = window.navGroundTimes(navR, tk);
      if(tm && t >= tm.start && t <= tm.end){
        if(!(navR.mt === 'ARRIVAL' && Number.isFinite(tk.t1) && t <= tk.t1) && !(navR.mt === 'DEPARTURE' && Number.isFinite(tk.t0) && t >= tk.t0)){
          const pts = routeForTrack(tk);
          if(pts.length >= 2){
            const span = Math.max(1, tm.end - tm.start);
            const frac = Math.max(0, Math.min(1, (t - tm.start) / span));
            const pos = interpPath(pts, frac);
            if(pos){
              const clr = navR.mt === 'DEPARTURE' ? '#1a88ff' : '#f5a500';
              const key = String(selTrk); keep.add(key);
              if(!navGroundLines.has(key) && !(pts.length === 2 && pts[0].lat === pts[1].lat && pts[0].lng === pts[1].lng)){
                const line = L.polyline(pts.map(p=>[p.lat,p.lng]), {color:clr, weight:3, opacity:.75, dashArray:'7,5', interactive:false});
                navGroundLineGroup.addLayer(line); navGroundLines.set(key,line);
              }
              const hdg = Math.round((pos.hdg||0)/5)*5;
              const tip = '<span style="font-weight:700;color:'+clr+'">'+esc(tk.csn||'')+'</span><br><span style="font-size:9px;color:#aaa">NAV ground — '+esc(pos.label||'')+'</span>';
              if(!navGroundMarkers.has(key)){
                const m = L.marker([pos.lat,pos.lng], {icon:mkIcon(hdg,clr,true), zIndexOffset:260, interactive:true}).bindTooltip(tip,{className:'acft-lbl',offset:[16,0]});
                navGroundMarkerGroup.addLayer(m); m.on('click',()=>selAircraft(selTrk)); navGroundMarkers.set(key,{marker:m,hdg:hdg,selected:true});
              } else {
                const e = navGroundMarkers.get(key); e.marker.setLatLng([pos.lat,pos.lng]);
                if(Math.abs(hdg-e.hdg)>4 || !e.selected){ e.marker.setIcon(mkIcon(hdg,clr,true)); e.marker.options.zIndexOffset=260; e.hdg=hdg; e.selected=true; }
                e.marker.getTooltip() && e.marker.getTooltip().setContent(tip);
              }
            }
          }
        }
      }
    }
    for(const [k,e] of [...navGroundMarkers]) if(!keep.has(k)){ navGroundMarkerGroup.removeLayer(e.marker); navGroundMarkers.delete(k); }
    for(const [k,l] of [...navGroundLines]) if(!keep.has(k)){ navGroundLineGroup.removeLayer(l); navGroundLines.delete(k); }
  };
})();
