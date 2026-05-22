// Ground continuity override for selected aircraft.
// Loaded after render.js. Keeps selected ARR/DEP visible after/before radar.
(function(){
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
  function routeFallback(tk){
    const navR = tk && tk.nav;
    if(!navR) return [];
    let pts = [];
    try { if(typeof navRouteCoords === 'function') pts = navRouteCoords(tk) || []; } catch(e) { pts = []; }
    if(pts.length >= 2) return pts;
    const first = pnt(tk.pts && tk.pts[0], 'radar start');
    const last = pnt(tk.pts && tk.pts[tk.pts.length-1], 'radar end');
    const stand = standPoint(navR);
    const out = [];
    const tokens = typeof parseTaxiTokens === 'function' ? parseTaxiTokens(navR.mt === 'DEPARTURE' ? navR.taxiOut : navR.taxiIn) : [];
    if(navR.mt === 'DEPARTURE'){
      if(stand) out.push(stand);
      tokens.forEach(tok=>{ try { const c = tokenCoord(tok); if(c) out.push({lat:c[0],lng:c[1],label:tok,kind:'twy'}); } catch(e){} });
      if(first) out.push(first);
    } else {
      if(last) out.push(last);
      tokens.forEach(tok=>{ try { const c = tokenCoord(tok); if(c) out.push({lat:c[0],lng:c[1],label:tok,kind:'twy'}); } catch(e){} });
      if(stand) out.push(stand);
    }
    if(out.length === 1) out.push({lat:out[0].lat,lng:out[0].lng,label:out[0].label,kind:'hold'});
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
    if(!selTrk || tracks.get(selTrk) !== tk || !tk || !tk.nav) return false;
    if(tk.nav.mt === 'ARRIVAL' && Number.isFinite(tk.t1) && t <= tk.t1) return false;
    if(tk.nav.mt === 'DEPARTURE' && Number.isFinite(tk.t0) && t >= tk.t0) return false;
    const tm = window.navGroundTimes(tk.nav, tk);
    return !!(tm && t >= tm.start && t <= tm.end && routeFallback(tk).length >= 2);
  };
  window.renderNavGroundLayer = function(t){
    if(typeof ensureNavGroundLayers !== 'function' || !ensureNavGroundLayers()) return;
    const keep = new Set();
    if(selTrk){
      const tk = tracks.get(selTrk), navR = tk && tk.nav, tm = navR && window.navGroundTimes(navR, tk);
      if(tm && t >= tm.start && t <= tm.end){
        const pts = routeFallback(tk);
        if(pts.length >= 2){
          const pos = interpPath(pts, (t - tm.start) / (tm.end - tm.start));
          if(pos){
            const clr = navR.mt === 'DEPARTURE' ? '#1a88ff' : '#f5a500';
            const key = String(selTrk); keep.add(key);
            if(!navGroundLines.has(key)){
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
    for(const [k,e] of [...navGroundMarkers]) if(!keep.has(k)){ navGroundMarkerGroup.removeLayer(e.marker); navGroundMarkers.delete(k); }
    for(const [k,l] of [...navGroundLines]) if(!keep.has(k)){ navGroundLineGroup.removeLayer(l); navGroundLines.delete(k); }
  };
})();
