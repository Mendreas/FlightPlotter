// NAV ground plotting using graph-resolved taxiway routes only.
// Ground windows are anchored to radar track boundaries (tk.t0 / tk.t1) so the
// icon stays visible from stand through climb, and from descent through stand.
(function(){
  if(window.__GROUND_FIX_V13__) return;
  window.__GROUND_FIX_V13__ = true;
  console.info('[FlightPlotter] ground_fix.js V13 radar-ground handoff loaded');

  function clean(v){ return String(v ?? '').trim(); }
  function csKey(v){ return clean(v).toUpperCase(); }
  function dateStr(){ try { return fmtDateKey(dayKey); } catch(e) { return ''; } }
  function tsec(v){ const n = hm2s(v); return Number.isFinite(n) ? n : null; }
  function colVal(parts,col,name){ const i = col[name]; return i == null ? '' : parts[i]; }
  function fmtTime(v){ const s = clean(v); if(!s || s === 'nan') return null; const m = s.match(/\d{2}:\d{2}(?::\d{2})?/); return m ? m[0] : null; }
  function fmtNum(v){ const n = parseFloat(String(v ?? '').replace(',','.')); return isNaN(n) ? null : Math.round(n); }

  window.loadNavCsv = async function(file){
    navMap.clear();
    try{
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      const hdr = lines[0].split(';').map(h=>h.trim());
      validateHeader('NAV', hdr, ['MT','DATE','CALLSIGN']);
      const col = {}; hdr.forEach((h,i)=>col[h]=i);
      for(let i=1;i<lines.length;i++){
        if(!lines[i]) continue;
        const parts = lines[i].split(';');
        if(parts.length < 5) continue;
        const mt = clean(colVal(parts,col,'MT'));
        const date = clean(colVal(parts,col,'DATE')).slice(0,10);
        const csn = csKey(colVal(parts,col,'CALLSIGN'));
        if(!csn || !date || !mt) continue;
        const eventTimes = {};
        for(const h of hdr){ const tv = fmtTime(colVal(parts,col,h)); if(tv) eventTimes[h] = tv; }
        navMap.set(`${csn}|${date}`, {
          mt, date, eventTimes,
          acType: clean(colVal(parts,col,'AC_TYPE')) || null,
          rwy: clean(colVal(parts,col,'RWY')) || null,
          standd: clean(colVal(parts,col,'STANDD')) || null,
          standa: clean(colVal(parts,col,'STANDA')) || null,
          apron: clean(colVal(parts,col,'APRON')) || null,
          taxiOut: clean(colVal(parts,col,'TAXI_OUT')) || null,
          taxiIn: clean(colVal(parts,col,'TAXI_IN')) || null,
          hp: clean(colVal(parts,col,'HP')) || null,
          sid: clean(colVal(parts,col,'SID')) || null,
          star: clean(colVal(parts,col,'STAR')) || null,
          afix: clean(colVal(parts,col,'AFIX')) || null,
          ades: clean(colVal(parts,col,'ADES')) || null,
          adep: clean(colVal(parts,col,'ADEP')) || null,
          aobt: fmtTime(colVal(parts,col,'AOBT')),
          txo: fmtTime(colVal(parts,col,'TXO')),
          atot: fmtTime(colVal(parts,col,'ATOT')),
          aldt: fmtTime(colVal(parts,col,'ALDT')),
          aibt: fmtTime(colVal(parts,col,'AIBT')),
          ctot: fmtTime(colVal(parts,col,'CTOT')),
          hpTime: fmtTime(colVal(parts,col,'HP_TIME')),
          rwyEnt: fmtTime(colVal(parts,col,'RWY_ENT')),
          rwyVac: fmtTime(colVal(parts,col,'RWY_VAC')),
          lup: fmtTime(colVal(parts,col,'LUP')),
          rlt: fmtTime(colVal(parts,col,'RLT')),
          passp: fmtTime(colVal(parts,col,'PASSP')),
          passu4: fmtTime(colVal(parts,col,'PASSU4')),
          u4CrossA6: fmtTime(colVal(parts,col,'U4_cross_A6')),
          pass35Rwy: fmtTime(colVal(parts,col,'PASS35_RWY')),
          tangentU5: fmtTime(colVal(parts,col,'TANGENT_U5')),
          tangentH1: fmtTime(colVal(parts,col,'TANGENT_H1')),
          tangentH2: fmtTime(colVal(parts,col,'TANGENT_H2')),
          tangentH3: fmtTime(colVal(parts,col,'TANGENT_H3')),
          tangentH4: fmtTime(colVal(parts,col,'TANGENT_H4')),
          atfmDelay: fmtNum(colVal(parts,col,'ATFM_DELAY')),
          regulation: clean(colVal(parts,col,'REGULATION_NAME')) || null,
          wtc: clean(colVal(parts,col,'ICAO_WTC')) || null,
          spd10nm: fmtNum(colVal(parts,col,'SPD@10_NM')), alt10nm: fmtNum(colVal(parts,col,'ALT@10_NM')),
          spd9nm: fmtNum(colVal(parts,col,'SPD@9_NM')), alt9nm: fmtNum(colVal(parts,col,'ALT@9_NM')),
          spd6nm: fmtNum(colVal(parts,col,'SPD@6_NM')), alt6nm: fmtNum(colVal(parts,col,'ALT@6_NM')),
          spd5nm: fmtNum(colVal(parts,col,'SPD@5_NM')), alt5nm: fmtNum(colVal(parts,col,'ALT@5_NM')),
          spd4nm: fmtNum(colVal(parts,col,'SPD@4_NM')), alt4nm: fmtNum(colVal(parts,col,'ALT@4_NM')),
          spdPassp: fmtNum(colVal(parts,col,'SPD@PASSP')),
          spdRwyVac: fmtNum(colVal(parts,col,'SPD@RWY_VAC')),
          spdPass35: fmtNum(colVal(parts,col,'SPD@PASS35_RWY'))
        });
      }
      appLog('info', `NAV: ${navMap.size} movimentos carregados.`);
    }catch(e){ appLog('error','Erro ao carregar NAV', e.message || String(e)); throw e; }
  };
  try { loadNavCsv = window.loadNavCsv; } catch(e) {}

  function standCoordArr(navR){
    const st = navR.mt === 'DEPARTURE' ? navR.standd : navR.standa;
    let p = null;
    try { if(typeof standCoord === 'function') p = standCoord(st, navR.apron); } catch(e) {}
    try { if(!p && typeof gatePos === 'function') p = gatePos(st, navR.apron); } catch(e) {}
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null;
  }

  function tokens(navR){
    const txt = navR.mt === 'DEPARTURE' ? navR.taxiOut : navR.taxiIn;
    return typeof parseTaxiTokens === 'function' ? parseTaxiTokens(txt) : [];
  }

  function findTrackObj(csn, t=simT){
    return findTrackObjAtTime(csn, t);
  }

  function navRecForTrack(tk){
    if(tk?.nav) return tk.nav;
    const d = dateStr();
    if(!d || !tk?.csn) return null;
    return navMap.get(csKey(tk.csn)+'|'+d) || null;
  }

  // ARR: radar until tk.t1, then taxi to stand (AIBT).
  // DEP: taxi from stand (AOBT) until first radar point tk.t0.
  function navGroundTimes(navR, tk=null){
    if(!navR) return null;
    let start = null, end = null;

    if(navR.mt === 'ARRIVAL'){
      const trackEnd = tk && Number.isFinite(tk.t1) ? tk.t1 : null;
      const vac = tsec(navR.rwyVac);
      const aldt = tsec(navR.aldt);
      const aibt = tsec(navR.aibt);
      start = trackEnd ?? vac ?? aldt;
      end = aibt ?? (start != null ? start + 8*60 : null);
    } else if(navR.mt === 'DEPARTURE'){
      const trackStart = tk && Number.isFinite(tk.t0) ? tk.t0 : null;
      const aobt = tsec(navR.aobt);
      const ent = tsec(navR.rwyEnt);
      const atot = tsec(navR.atot);
      start = aobt ?? (trackStart != null ? trackStart - 12*60 : null);
      end = trackStart ?? ent ?? atot ?? (start != null ? start + 12*60 : null);
    }

    return Number.isFinite(start) && Number.isFinite(end) && end > start
      ? {start, end} : null;
  }
  window.navGroundTimes = navGroundTimes;
  try { navGroundTimes = window.navGroundTimes; } catch(e) {}

  function graphRoute(navR, tk=null){
    const toks = tokens(navR);
    if(!toks.length || typeof buildAirfieldRouteFromTokens !== 'function') return routeFallback(navR, tk);
    const st = standCoordArr(navR);
    try {
      let r = [];
      if(navR.mt === 'DEPARTURE'){
        const fp = tk?.pts?.[0];
        let endCoord = fp ? [fp.lat, fp.lng] : null;
        if(!endCoord && typeof tokenCoord === 'function') endCoord = tokenCoord(navR.hp);
        if(!endCoord && typeof runwayCoord === 'function') endCoord = runwayCoord(navR);
        r = buildAirfieldRouteFromTokens(toks, st, endCoord);
      } else {
        const lp = tk?.pts?.length ? tk.pts[tk.pts.length - 1] : null;
        let startCoord = lp ? [lp.lat, lp.lng] : null;
        if(!startCoord && typeof runwayCoord === 'function') startCoord = runwayCoord(navR);
        r = buildAirfieldRouteFromTokens(toks, startCoord, st);
      }
      if(Array.isArray(r) && r.length >= 2) return r;
    } catch(e){
      console.warn('[FlightPlotter] graph route failed', navR.mt, toks.join(' '), e);
    }
    return routeFallback(navR, tk);
  }

  function routeFallback(navR, tk){
    if(tk && typeof navRouteCoords === 'function'){
      const r = navRouteCoords(tk);
      if(Array.isArray(r) && r.length >= 2) return r;
    }
    return [];
  }

  function interpolateRoute(route, navR, t, tk=null){
    const w = navGroundTimes(navR, tk);
    if(!w || t < w.start || t > w.end || route.length < 2) return null;
    const frac = Math.max(0, Math.min(1, (t-w.start)/Math.max(1,w.end-w.start)));
    return interpPath(route, frac);
  }

  function currentNavRecords(){
    const d = dateStr();
    const out=[];
    if(!d) return out;
    for(const [key,navR] of navMap){
      if(key.endsWith('|'+d)){
        const csn = key.slice(0, key.length-d.length-1);
        out.push({key:'NAV|'+key, csn, navR});
      }
    }
    return out;
  }

  function selectedCsn(){ const tk = selTrk ? tracks.get(selTrk) : null; return csKey(tk && tk.csn); }
  function findTrack(csn, t=simT){ return findTrackAtTime(csn, t); }

  window.shouldUseNavGroundForTrack = function(tk,t){
    if(!tk) return false;
    const navR = navRecForTrack(tk);
    if(!navR) return false;

    // Never replace a live radar point — ground fills the gaps only.
    if(navR.mt === 'ARRIVAL' && Number.isFinite(tk.t1) && t <= tk.t1) return false;
    if(navR.mt === 'DEPARTURE' && Number.isFinite(tk.t0) && t >= tk.t0) return false;

    const times = navGroundTimes(navR, tk);
    if(!times || t < times.start || t > times.end) return false;
    const route = graphRoute(navR, tk);
    return route.length >= 2 && !!interpolateRoute(route, navR, t, tk);
  };

  window.renderNavGroundLayer = function(t){
    if(typeof ensureNavGroundLayers !== 'function' || !ensureNavGroundLayers()) return;
    const keep = new Set();
    let count = 0;

    for(const item of currentNavRecords()){
      const tk = findTrackObj(item.csn);
      // Radar takes priority while the track still has live points.
      if(tk){
        if(item.navR.mt === 'ARRIVAL' && Number.isFinite(tk.t1) && t <= tk.t1) continue;
        if(item.navR.mt === 'DEPARTURE' && Number.isFinite(tk.t0) && t >= tk.t0) continue;
      }
      const route = graphRoute(item.navR, tk);
      const pos = interpolateRoute(route, item.navR, t, tk);
      if(!pos) continue;
      const key = item.key;
      const activeId = findTrack(item.csn, t);
      const sel = selTrk && activeId && String(selTrk) === activeId;
      const clr = item.navR.mt === 'DEPARTURE' ? '#1a88ff' : '#f5a500';
      keep.add(key); count++;
      const hdg = Math.round((pos.hdg||0)/5)*5;
      const tip = '<span style="font-weight:700;color:'+clr+'">'+esc(item.csn||'')+'</span><br><span style="font-size:9px;color:#aaa">NAV graph '+(item.navR.mt==='DEPARTURE'?'DEP':'ARR')+' — '+esc(pos.label||'')+'</span>';
      if(!navGroundMarkers.has(key)){
        const m = L.marker([pos.lat,pos.lng], {icon:mkIcon(hdg,clr,sel), zIndexOffset:sel?260:120, interactive:true}).bindTooltip(tip,{className:'acft-lbl',offset:[16,0]});
        navGroundMarkerGroup.addLayer(m);
        m.on('click',()=>{ const id=findTrack(item.csn, simT); if(id) selAircraft(id); });
        navGroundMarkers.set(key,{marker:m,hdg,selected:sel});
      } else {
        const e = navGroundMarkers.get(key); e.marker.setLatLng([pos.lat,pos.lng]);
        if(Math.abs(hdg-e.hdg)>4 || sel!==e.selected){ e.marker.setIcon(mkIcon(hdg,clr,sel)); e.marker.options.zIndexOffset=sel?260:120; e.hdg=hdg; e.selected=sel; }
        e.marker.getTooltip() && e.marker.getTooltip().setContent(tip);
      }
    }

    for(const [k,e] of [...navGroundMarkers]) if(!keep.has(k)){ navGroundMarkerGroup.removeLayer(e.marker); navGroundMarkers.delete(k); }
    for(const [k,l] of [...navGroundLines]) if(!keep.has(k)){ navGroundLineGroup.removeLayer(l); navGroundLines.delete(k); }

    if(window.__lastNavGroundDiagT !== Math.floor(t/30)){
      window.__lastNavGroundDiagT = Math.floor(t/30);
      console.debug('[FlightPlotter] NAV graph-ground active', dateStr(), count);
    }
  };
})();
