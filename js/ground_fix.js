// Controlled NAV ground plotting.
// Radar for all. NAV ground for selected flight, plus short runway-transition windows for others.
(function(){
  if(window.__GROUND_FIX_V7__) return;
  window.__GROUND_FIX_V7__ = true;
  console.info('[FlightPlotter] ground_fix.js V7 runway-transition mode loaded');

  const AUTO_TRANSITION_MIN = 6;     // non-selected aircraft: only near runway transition
  const MAX_AUTO_GROUND = 8;         // cap clutter; selected is always allowed

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
    try {
      if(typeof buildAirfieldRouteFromTokens === 'function'){
        const start = navR.mt === 'DEPARTURE' && stand ? [stand.lat, stand.lng] : null;
        const end = navR.mt === 'ARRIVAL' && stand ? [stand.lat, stand.lng] : null;
        const p = buildAirfieldRouteFromTokens(tokens, start, end);
        if(p && p.length >= 2) return p;
      }
    } catch(e) {}
    return [];
  }

  window.navGroundTimes = function(navR, tk){
    if(!navR) return null;
    let s=null, e=null;
    if(navR.mt === 'DEPARTURE'){
      s = tsec(navR.aobt);
      e = tsec(navR.rwyEnt) ?? tsec(navR.atot) ?? (tk && Number.isFinite(tk.t0) ? tk.t0 : null);
    } else if(navR.mt === 'ARRIVAL'){
      s = tsec(navR.rwyVac) ?? tsec(navR.aldt) ?? (tk && Number.isFinite(tk.t1) ? tk.t1 : null);
      e = tsec(navR.aibt);
    }
    if(!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
    return {start:s,end:e};
  };
  try { navGroundTimes = window.navGroundTimes; } catch(e) {}

  function radarActive(tk,t){ return tk && Number.isFinite(tk.t0) && Number.isFinite(tk.t1) && t >= tk.t0 && t <= tk.t1; }

  function isSelected(id){ return String(id) === String(selTrk); }

  function inAutoTransitionWindow(tk,t){
    if(!tk || !tk.nav) return false;
    const tm = window.navGroundTimes(tk.nav, tk);
    if(!tm) return false;
    const w = AUTO_TRANSITION_MIN * 60;
    if(tk.nav.mt === 'DEPARTURE'){
      // Only show non-selected departure close to runway entry / first radar.
      const end = Number.isFinite(tk.t0) ? Math.min(tm.end, tk.t0) : tm.end;
      return t >= Math.max(tm.start, end - w) && t <= end;
    }
    if(tk.nav.mt === 'ARRIVAL'){
      // Only show non-selected arrival just after runway vacating / last radar.
      const start = Number.isFinite(tk.t1) ? Math.max(tm.start, tk.t1) : tm.start;
      return t >= start && t <= Math.min(tm.end, start + w);
    }
    return false;
  }

  function groundActive(id,tk,t){
    if(!tk || !tk.nav) return false;
    const tm = window.navGroundTimes(tk.nav, tk);
    if(!tm || t < tm.start || t > tm.end) return false;
    if(radarActive(tk,t)) return false;
    const pts = routeForTrack(tk);
    if(pts.length < 2) return false;
    if(isSelected(id)) return true;
    return inAutoTransitionWindow(tk,t);
  }

  window.shouldUseNavGroundForTrack = function(tk,t){
    for(const [id, cand] of tracks){
      if(cand === tk) return groundActive(id, tk, t);
    }
    return false;
  };

  function drawGround(key, tk, t, keep){
    const navR = tk.nav;
    const tm = window.navGroundTimes(navR, tk);
    const pts = routeForTrack(tk);
    if(!tm || pts.length < 2) return false;
    const span = Math.max(1, tm.end - tm.start);
    const frac = Math.max(0, Math.min(1, (t - tm.start) / span));
    const pos = interpPath(pts, frac);
    if(!pos) return false;

    const sel = isSelected(key);
    const clr = navR.mt === 'DEPARTURE' ? '#1a88ff' : '#f5a500';
    keep.add(key);

    if(sel && !navGroundLines.has(key)){
      const line = L.polyline(pts.map(p=>[p.lat,p.lng]), {color:clr, weight:3, opacity:.75, dashArray:'7,5', interactive:false});
      navGroundLineGroup.addLayer(line); navGroundLines.set(key,line);
    }

    const hdg = Math.round((pos.hdg||0)/5)*5;
    const tip = '<span style="font-weight:700;color:'+clr+'">'+esc(tk.csn||'')+'</span><br><span style="font-size:9px;color:#aaa">NAV '+(navR.mt==='DEPARTURE'?'taxi-out':'taxi-in')+' — '+esc(pos.label||'')+'</span>';
    if(!navGroundMarkers.has(key)){
      const m = L.marker([pos.lat,pos.lng], {icon:mkIcon(hdg,clr,sel), zIndexOffset:sel?260:110, interactive:true}).bindTooltip(tip,{className:'acft-lbl',offset:[16,0]});
      navGroundMarkerGroup.addLayer(m); m.on('click',()=>selAircraft(key)); navGroundMarkers.set(key,{marker:m,hdg:hdg,selected:sel});
    } else {
      const e = navGroundMarkers.get(key); e.marker.setLatLng([pos.lat,pos.lng]);
      if(Math.abs(hdg-e.hdg)>4 || sel!==e.selected){ e.marker.setIcon(mkIcon(hdg,clr,sel)); e.marker.options.zIndexOffset=sel?260:110; e.hdg=hdg; e.selected=sel; }
      e.marker.getTooltip() && e.marker.getTooltip().setContent(tip);
    }
    return true;
  }

  window.renderNavGroundLayer = function(t){
    if(typeof ensureNavGroundLayers !== 'function' || !ensureNavGroundLayers()) return;
    const keep = new Set();
    const seen = new Set();
    const candidates = [];

    for(const [id, tk] of tracks){
      if(!groundActive(id, tk, t)) continue;
      const cs = callsignOf(tk);
      if(cs && seen.has(cs)) continue;
      if(cs) seen.add(cs);
      candidates.push({id:String(id), tk, selected:isSelected(id)});
    }

    candidates.sort((a,b)=> (b.selected?1:0) - (a.selected?1:0));
    let autoCount = 0;
    for(const c of candidates){
      if(!c.selected){
        if(autoCount >= MAX_AUTO_GROUND) continue;
        autoCount++;
      }
      drawGround(c.id, c.tk, t, keep);
    }

    for(const [k,e] of [...navGroundMarkers]) if(!keep.has(k)){ navGroundMarkerGroup.removeLayer(e.marker); navGroundMarkers.delete(k); }
    for(const [k,l] of [...navGroundLines]) if(!keep.has(k)){ navGroundLineGroup.removeLayer(l); navGroundLines.delete(k); }
  };
})();
