// NAV ground plotting using graph-resolved taxiway routes only.
// If a route cannot be resolved on the LPPT taxi graph, no synthetic target is drawn.
(function(){
  if(window.__GROUND_FIX_V11__) return;
  window.__GROUND_FIX_V11__ = true;
  console.info('[FlightPlotter] ground_fix.js V11 graph-only NAV ground loaded');

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

  function navWindow(navR){
    let s=null,e=null;
    if(navR.mt === 'DEPARTURE'){
      s = tsec(navR.aobt);
      e = tsec(navR.rwyEnt) ?? tsec(navR.atot);
    } else if(navR.mt === 'ARRIVAL'){
      s = tsec(navR.rwyVac) ?? tsec(navR.aldt);
      e = tsec(navR.aibt);
    }
    return Number.isFinite(s) && Number.isFinite(e) && e > s ? {start:s,end:e} : null;
  }

  function graphRoute(navR){
    const toks = tokens(navR);
    if(!toks.length || typeof buildAirfieldRouteFromTokens !== 'function') return [];
    const st = standCoordArr(navR);
    const start = navR.mt === 'DEPARTURE' ? st : null;
    const end = navR.mt === 'ARRIVAL' ? st : null;
    try {
      const r = buildAirfieldRouteFromTokens(toks, start, end);
      return Array.isArray(r) && r.length >= 2 ? r : [];
    } catch(e){
      console.warn('[FlightPlotter] graph route failed', navR.mt, toks.join(' '), e);
      return [];
    }
  }

  function interpolateRoute(route, navR, t){
    const w = navWindow(navR);
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
  function findTrack(csn){ const c=csKey(csn); for(const [id,tk] of tracks){ if(csKey(tk.csn)===c) return String(id); } return null; }

  function navActiveForCallsign(csn,t){
    const d = dateStr();
    const rec = navMap.get(csKey(csn)+'|'+d);
    if(!rec) return false;
    const r = graphRoute(rec);
    return !!interpolateRoute(r, rec, t);
  }

  window.shouldUseNavGroundForTrack = function(tk,t){
    return !!(tk && navActiveForCallsign(tk.csn,t));
  };

  window.renderNavGroundLayer = function(t){
    if(typeof ensureNavGroundLayers !== 'function' || !ensureNavGroundLayers()) return;
    const keep = new Set();
    const selC = selectedCsn();
    let count = 0;

    for(const item of currentNavRecords()){
      const route = graphRoute(item.navR);
      const pos = interpolateRoute(route, item.navR, t);
      if(!pos) continue;
      const key = item.key;
      const sel = selC && selC === csKey(item.csn);
      const clr = item.navR.mt === 'DEPARTURE' ? '#1a88ff' : '#f5a500';
      keep.add(key); count++;
      const hdg = Math.round((pos.hdg||0)/5)*5;
      const tip = '<span style="font-weight:700;color:'+clr+'">'+esc(item.csn||'')+'</span><br><span style="font-size:9px;color:#aaa">NAV graph '+(item.navR.mt==='DEPARTURE'?'DEP':'ARR')+' — '+esc(pos.label||'')+'</span>';
      if(!navGroundMarkers.has(key)){
        const m = L.marker([pos.lat,pos.lng], {icon:mkIcon(hdg,clr,sel), zIndexOffset:sel?260:120, interactive:true}).bindTooltip(tip,{className:'acft-lbl',offset:[16,0]});
        navGroundMarkerGroup.addLayer(m);
        m.on('click',()=>{ const id=findTrack(item.csn); if(id) selAircraft(id); });
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
