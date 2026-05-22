// ═══════════════════════════════════════════════════════════════
// NAV CSV — LPPT operational data
// ═══════════════════════════════════════════════════════════════

// ── Taxiway coordinate database (LPPT AIP AD 2.24.02, 2022-2023) ──
// Each entry = approximate centroid/intersection [lat, lng]
const LPPT_TWY = {
  // Holding Points / Runway Entry
  'M5': [38.7952,-9.1307], 'N2': [38.7962,-9.1295],
  'U4': [38.7810,-9.1283], 'U5': [38.7822,-9.1298],
  'S4': [38.7858,-9.1318], 'P':  [38.7688,-9.1432],
  // M taxiway series (central connector to RWY 02 via north HP)
  'M4': [38.7912,-9.1325], 'M3': [38.7875,-9.1348],
  'M2': [38.7842,-9.1372], 'M1': [38.7805,-9.1393],
  // A taxiway series (parallel RWY, east side)
  'A1': [38.7712,-9.1385], 'A2': [38.7738,-9.1368],
  'A3': [38.7762,-9.1352], 'A4': [38.7788,-9.1335],
  'A5': [38.7818,-9.1308], 'A6': [38.7842,-9.1295],
  'A7': [38.7870,-9.1288],
  // U series (north area connecting apron 60/70 to runway)
  'U1': [38.7892,-9.1335], 'U2': [38.7862,-9.1352],
  'U3': [38.7838,-9.1362],
  // Q series (central apron connectors)
  'Q1': [38.7788,-9.1398], 'Q2': [38.7808,-9.1387],
  'Q3': [38.7832,-9.1375],
  // T series (Terminal 1 area)
  'T1': [38.7758,-9.1402], 'T2': [38.7772,-9.1397],
  'T3': [38.7788,-9.1390], 'T4': [38.7808,-9.1378],
  // L series (Apron 40/41 connector)
  'L1': [38.7742,-9.1418], 'L2': [38.7762,-9.1405],
  // Z series (Apron 20, THR 02 area)
  'Z1': [38.7698,-9.1442], 'Z2': [38.7710,-9.1438],
  'Z3': [38.7682,-9.1445], 'Z4': [38.7668,-9.1440],
  // W series (Apron 70/80, Terminal area connector)
  'W1': [38.7845,-9.1382], 'W2': [38.7855,-9.1372],
  'W3': [38.7868,-9.1362],
  // G series (Apron 60/70)
  'G1': [38.7878,-9.1360], 'G2': [38.7890,-9.1345],
  // Single taxiways
  'J':  [38.7795,-9.1398], 'E':  [38.7725,-9.1428],
  'F':  [38.7898,-9.1338], 'B':  [38.7798,-9.1402],
  'C':  [38.7818,-9.1393], 'K':  [38.7682,-9.1428],
  'Y':  [38.7772,-9.1382], 'N1': [38.7702,-9.1440],
  // Military apron connectors
  'WD1':[38.7835,-9.1360],
  // Threshold references (used as termination points)
  'THR02':[38.7657,-9.1443], 'THR20':[38.7965,-9.1278],
  'THR17':[38.7862,-9.1372], 'THR35':[38.7650,-9.1316],
};

async function loadNavCsv(file) {
  navMap.clear();
  try {
    const text = await file.text();
    const lines = text.split('\n');
    const hdr   = lines[0].split(';').map(h=>h.trim());
    validateHeader('NAV', hdr, ['MT','DATE','CALLSIGN']);
    const col   = {};
    hdr.forEach((h,i)=>col[h]=i);

    for(let i=1;i<lines.length;i++){
      const parts = lines[i].split(';');
      if(parts.length<5) continue;
      const mt   = parts[col['MT']]?.trim();
      const date = parts[col['DATE']]?.trim().slice(0,10); // YYYY-MM-DD
      const csn  = parts[col['CALLSIGN']]?.trim().toUpperCase();
      if(!csn || !date || !mt) continue;

      const fmtT = v => {
        const s = (v||'').trim();
        if(!s||s==='nan') return null;
        // Format: 2026-03-01 14:22:33
        const m = s.match(/\d{2}:\d{2}/);
        return m ? m[0] : null;
      };
      const fmtF = v => { const n=parseFloat(v); return isNaN(n)?null:Math.round(n); };

      const rec = {
        mt, date,
        acType:   parts[col['AC_TYPE']]?.trim()||null,
        rwy:      parts[col['RWY']]?.trim()||null,
        standd:   parts[col['STANDD']]?.trim()||null,
        standa:   parts[col['STANDA']]?.trim()||null,
        apron:    parts[col['APRON']]?.trim()||null,
        taxiOut:  parts[col['TAXI_OUT']]?.trim()||null,
        taxiIn:   parts[col['TAXI_IN']]?.trim()||null,
        hp:       parts[col['HP']]?.trim()||null,
        sid:      parts[col['SID']]?.trim()||null,
        star:     parts[col['STAR']]?.trim()||null,
        afix:     parts[col['AFIX']]?.trim()||null,
        ades:     parts[col['ADES']]?.trim()||null,
        adep:     parts[col['ADEP']]?.trim()||null,
        aobt:     fmtT(parts[col['AOBT']]),
        atot:     fmtT(parts[col['ATOT']]),
        aldt:     fmtT(parts[col['ALDT']]),
        aibt:     fmtT(parts[col['AIBT']]),
        ctot:     fmtT(parts[col['CTOT']]),
        hpTime:   fmtT(parts[col['HP_TIME']]),
        rwyEnt:   fmtT(parts[col['RWY_ENT']]),
        rwyVac:   fmtT(parts[col['RWY_VAC']]),
        atfmDelay:fmtF(parts[col['ATFM_DELAY']]),
        regulation:parts[col['REGULATION_NAME']]?.trim()||null,
        wtc:       parts[col['ICAO_WTC']]?.trim()||null,
        // Approach speed points (ARR only)
        spd10nm: fmtF(parts[col['SPD@10_NM']]),
        alt10nm: fmtF(parts[col['ALT@10_NM']]),
        spd9nm:  fmtF(parts[col['SPD@9_NM']]),
        alt9nm:  fmtF(parts[col['ALT@9_NM']]),
        spd6nm:  fmtF(parts[col['SPD@6_NM']]),
        alt6nm:  fmtF(parts[col['ALT@6_NM']]),
        spd5nm:  fmtF(parts[col['SPD@5_NM']]),
        alt5nm:  fmtF(parts[col['ALT@5_NM']]),
        spd4nm:  fmtF(parts[col['SPD@4_NM']]),
        alt4nm:  fmtF(parts[col['ALT@4_NM']]),
        // Ground speed points
        spdPassp: fmtF(parts[col['SPD@PASSP']]),
        spdRwyVac:fmtF(parts[col['SPD@RWY_VAC']]),
        spdPass35:fmtF(parts[col['SPD@PASS35_RWY']]),
      };
      navMap.set(`${csn}|${date}`, rec);
    }
    appLog('info', `NAV: ${navMap.size} movimentos carregados.`);
  } catch(e) { appLog('error','Erro ao carregar NAV', e.message || String(e)); throw e; }
}

function enrichWithNav() {
  const dateStr = fmtDateKey(dayKey);
  for(const tk of tracks.values()) {
    const csn = (tk.csn||'').toUpperCase();
    if(!csn) continue;
    const rec = navMap.get(`${csn}|${dateStr}`);
    if(!rec) continue;
    tk.nav = rec;
    // Authoritative ADEP/ADES from operational data
    if(rec.mt==='DEPARTURE' && rec.ades) tk.ades = rec.ades;
    if(rec.mt==='DEPARTURE') tk.adep = 'LPPT';
    if(rec.mt==='ARRIVAL'   && rec.adep) tk.adep = rec.adep;
    if(rec.mt==='ARRIVAL')    tk.ades = 'LPPT';
    // Aircraft type
    if(rec.acType) {
      const ex = osCache.get(tk.modeS)||{};
      if(!ex.type) osCache.set(tk.modeS,{...ex,type:rec.acType});
    }
  }
  updVisibleLabels();
}

// ── Taxi route visualisation — selected aircraft route ────────
function renderTaxiRoute(tk) {
  clearTaxiRoute();
  if(!tk) return;

  // Do not draw the synthetic NAV planned-route line. With only taxiway names
  // (U4 U3 U2...), the line between centroid points can look like a strange
  // zig-zag over the airport. If OPDI has real GPS ground events, show that
  // real route; otherwise keep the map clean and only animate the aircraft.
  const pts = [];
  for(const [,seg] of opdiTracks) {
    if(seg.csn !== (tk.csn||'').toUpperCase()) continue;
    for(const p of seg.pts) {
      if(!p.synthetic && p.lat && p.lng) pts.push([p.lat, p.lng]);
    }
    if(pts.length) break;
  }

  if(pts.length < 2) return;
  const clr = tk.type==='DEP' ? '#1a88ff' : '#f5a500';
  taxiRouteLayer = L.polyline(pts, {
    color:clr, weight:3, opacity:.80,
    dashArray:'7,5', interactive:false
  }).addTo(map);
}

function clearTaxiRoute() {
  if(taxiRouteLayer){ map.removeLayer(taxiRouteLayer); taxiRouteLayer=null; }
}

function standCoord(standNum, apron) {
  // Approximate stand positions based on apron number
  // Stand ranges per apron from AIP charts
  const apronNum = parseInt(apron)||0;
  const standN   = parseInt(standNum)||0;
  const apronCenters = {
    10:[38.7770,-9.1382], 11:[38.7750,-9.1378], 12:[38.7790,-9.1375],
    14:[38.7760,-9.1398], 20:[38.7710,-9.1440], 22:[38.7720,-9.1432],
    30:[38.7745,-9.1425], 40:[38.7760,-9.1415], 41:[38.7775,-9.1405],
    42:[38.7788,-9.1395], 50:[38.7800,-9.1390], 60:[38.7825,-9.1378],
    70:[38.7872,-9.1368], 80:[38.7892,-9.1352],
  };
  // Use small offsets per stand within apron
  const base = apronCenters[apronNum];
  if(!base) return null;
  // Spread stands ~15m apart within apron
  const offset = ((standN % 10) - 5) * 0.000135;
  return [base[0] + offset * 0.5, base[1] + offset * 0.3];
}


// ═══════════════════════════════════════════════════════════════
// NAV GROUND MOVEMENT ANIMATION
// Uses NAV LPPT operational fields to animate aircraft on taxiways when
// radar data is not available: ARR from RWY_VAC/ALDT to AIBT, DEP from
// AOBT to RWY_ENT/ATOT. Taxiway geometry comes from LPPT_TWY above.
// ═══════════════════════════════════════════════════════════════
let navGroundMarkerGroup = null;
let navGroundLineGroup   = null;
const navGroundMarkers   = new Map(); // key: track id -> {marker, hdg}
const navGroundLines     = new Map(); // key: track id -> polyline

function ensureNavGroundLayers(){
  if(!map) return false;
  if(!navGroundLineGroup)   navGroundLineGroup   = L.layerGroup().addTo(map);
  if(!navGroundMarkerGroup) navGroundMarkerGroup = L.layerGroup().addTo(map);
  return true;
}

function parseTaxiTokens(route){
  if(!route) return [];
  return String(route).toUpperCase()
    .replace(/[→>]/g,' ')
    .split(/[^A-Z0-9]+/)
    .map(x=>x.trim())
    .filter(Boolean);
}

function tokenCoord(token){
  if(!token) return null;
  const t = String(token).toUpperCase().trim();
  if(LPPT_TWY[t]) return LPPT_TWY[t];
  // Common normalisations: RWY20/THR20, RWY 20, HP prefixes etc.
  const n = t.replace(/^RWY/,'THR').replace(/^HP/,'');
  if(LPPT_TWY[n]) return LPPT_TWY[n];
  return null;
}

function runwayCoord(navR){
  const r = String(navR?.rwy || '').replace(/[^0-9]/g,'');
  if(r && LPPT_TWY['THR'+r]) return LPPT_TWY['THR'+r];
  if(r && RWY?.[r]) return [RWY[r].lat, RWY[r].lng];
  return null;
}

function validS(v){
  const n = hm2s(v);
  return isFinite(n) ? n : null;
}

function firstTrackPoint(tk){
  const p = tk?.pts?.[0];
  return p ? {lat:p.lat, lng:p.lng, label:'radar start', kind:'radar'} : null;
}

function lastTrackPoint(tk){
  const p = tk?.pts?.[tk.pts.length-1];
  return p ? {lat:p.lat, lng:p.lng, label:'radar end', kind:'radar'} : null;
}

function navGroundTimes(navR, tk=null){
  if(!navR) return null;
  let start = null, end = null;

  if(navR.mt === 'ARRIVAL'){
    const aibt = validS(navR.aibt);
    const aldt = validS(navR.aldt);
    const vac  = validS(navR.rwyVac);
    const trackEnd = tk?.type === 'ARR' && isFinite(tk.t1) ? tk.t1 : null;

    // Start as soon as the airborne/radar track has reached the runway, not only
    // at RWY_VAC. This avoids the aircraft vanishing on the runway between
    // touchdown and taxiway exit.
    const candidates = [aldt, trackEnd, vac].filter(v => v!=null);
    start = candidates.length ? Math.min(...candidates) : null;
    end = aibt;
    if(end==null && start!=null) end = start + 8*60;
  } else if(navR.mt === 'DEPARTURE'){
    const aobt = validS(navR.aobt);
    const ent  = validS(navR.rwyEnt);
    const atot = validS(navR.atot);
    const trackStart = tk?.type === 'DEP' && isFinite(tk.t0) ? tk.t0 : null;

    start = aobt;
    // End at the later of runway-entry/takeoff/radar-start so the aircraft
    // continues to the correct runway entry instead of appearing mid-runway.
    const candidates = [ent, atot, trackStart].filter(v => v!=null);
    end = candidates.length ? Math.max(...candidates) : null;
    if(start==null && end!=null) start = end - 12*60;
    if(end==null && start!=null) end = start + 12*60;
  }

  if(!isFinite(start) || !isFinite(end) || end <= start) return null;
  return {start, end};
}

function navRouteCoords(tk){
  const navR = tk?.nav;
  if(!navR) return [];

  const isDep = navR.mt === 'DEPARTURE';
  const route = isDep ? navR.taxiOut : navR.taxiIn;
  const tokens = parseTaxiTokens(route);
  const routePts = [];

  for(const tok of tokens){
    const c = tokenCoord(tok);
    if(c) routePts.push({lat:c[0], lng:c[1], label:tok, kind:'twy'});
  }

  const stand = isDep ? navR.standd : navR.standa;
  const standP = standCoord(stand, navR.apron) || gatePos(stand, navR.apron);
  const hpP = tokenCoord(navR.hp);
  const rwyP = runwayCoord(navR);

  const pts = [];
  if(isDep){
    if(standP) pts.push({lat:standP[0], lng:standP[1], label:stand?`Stand ${stand}`:'Stand', kind:'stand'});
    pts.push(...routePts);
    if(hpP && !sameCoordLast(pts, hpP)) pts.push({lat:hpP[0], lng:hpP[1], label:navR.hp, kind:'hp'});

    // Use the first radar point as the final transition if available. It gives
    // a smoother handoff to the real track than a rough runway threshold point.
    const fp = firstTrackPoint(tk);
    if(fp && !sameCoordLast(pts, [fp.lat, fp.lng])) pts.push(fp);
    else if(rwyP && !sameCoordLast(pts, rwyP)) pts.push({lat:rwyP[0], lng:rwyP[1], label:'RWY '+(navR.rwy||''), kind:'rwy'});
  } else {
    // ARR: start from the last real radar point if possible. This preserves the
    // visible aircraft at touchdown/rollout and then moves it towards TAXI_IN.
    const lp = lastTrackPoint(tk);
    if(lp) pts.push(lp);
    else if(rwyP) pts.push({lat:rwyP[0], lng:rwyP[1], label:'RWY '+(navR.rwy||''), kind:'rwy'});
    pts.push(...routePts);
    if(standP) pts.push({lat:standP[0], lng:standP[1], label:stand?`Stand ${stand}`:'Stand', kind:'stand'});
  }
  return dedupCoords(pts);
}

function sameCoordLast(pts, c){
  if(!pts.length || !c) return false;
  const p = pts[pts.length-1];
  return Math.abs(p.lat-c[0]) < 1e-6 && Math.abs(p.lng-c[1]) < 1e-6;
}

function dedupCoords(pts){
  const out=[];
  for(const p of pts){
    if(!p || !isFinite(p.lat) || !isFinite(p.lng)) continue;
    const last = out[out.length-1];
    if(last && Math.abs(last.lat-p.lat)<1e-6 && Math.abs(last.lng-p.lng)<1e-6) continue;
    out.push(p);
  }
  return out;
}

function pathLengths(pts){
  const seg=[0]; let total=0;
  for(let i=1;i<pts.length;i++){
    total += Math.max(0.001, distNM(pts[i-1].lat, pts[i-1].lng, pts[i].lat, pts[i].lng));
    seg.push(total);
  }
  return {seg,total};
}

function interpPath(pts, frac){
  if(!pts.length) return null;
  if(pts.length===1) return {lat:pts[0].lat,lng:pts[0].lng,hdg:0,label:pts[0].label};
  frac = Math.max(0, Math.min(1, frac));
  const {seg,total} = pathLengths(pts);
  const d = frac * total;
  let i=1;
  while(i<seg.length-1 && seg[i] < d) i++;
  const d0=seg[i-1], d1=seg[i];
  const a = d1>d0 ? (d-d0)/(d1-d0) : 0;
  const p0=pts[i-1], p1=pts[i];
  const lat = p0.lat + a*(p1.lat-p0.lat);
  const lng = p0.lng + a*(p1.lng-p0.lng);
  const hdg = ((Math.atan2(p1.lng-p0.lng, p1.lat-p0.lat)*180/Math.PI)+360)%360;
  return {lat,lng,hdg,label:p1.label||p0.label||''};
}

function radarHasTrackAt(tk, t){
  return tk && t >= tk.t0 && t <= tk.t1;
}

function hasActiveOpdiGround(csn, t){
  csn = String(csn||'').toUpperCase();
  if(!csn) return false;
  for(const [,seg] of opdiTracks){
    if(seg.csn !== csn || !seg.pts?.length) continue;
    const a = seg.pts[0].t, b = seg.pts[seg.pts.length-1].t;
    if(t >= a-30 && t <= b+30) return true;
  }
  return false;
}

function renderNavGroundLayer(t){
  if(!ensureNavGroundLayers()) return;
  const keep = new Set();
  const zOk = map.getZoom() >= OPDI_ZOOM;

  for(const [id, tk] of tracks){
    const navR = tk.nav;
    if(!navR) continue;
    const times = navGroundTimes(navR, tk);
    if(!times || t < times.start || t > times.end) continue;

    // Show all ground aircraft in AD zoom. Always show the selected one.
    const selected = id === selTrk;
    if(!zOk && !selected) continue;

    // In ground phase, NAV synthetic animation intentionally takes priority over
    // radar points below/near the runway. The radar marker is suppressed in
    // updateMarkers() by shouldUseNavGroundForTrack().

    // If an actual OPDI marker is active, prefer OPDI over synthetic NAV.
    if(hasActiveOpdiGround(tk.csn, t)) continue;

    const pts = navRouteCoords(tk);
    if(pts.length < 2) continue;

    const frac = (t - times.start) / (times.end - times.start);
    const pos = interpPath(pts, frac);
    if(!pos) continue;

    const clr = navR.mt==='DEPARTURE' ? '#1a88ff' : '#f5a500';
    const key = String(id);
    keep.add(key);

    // Route line, lightly visible for selected aircraft only.
    if(selected && !navGroundLines.has(key)){
      const line = L.polyline(pts.map(p=>[p.lat,p.lng]), {
        color: clr, weight: 3, opacity: .78, dashArray:'7,5', interactive:false
      });
      navGroundLineGroup.addLayer(line);
      navGroundLines.set(key, line);
    } else if(!selected && navGroundLines.has(key)){
      navGroundLineGroup.removeLayer(navGroundLines.get(key));
      navGroundLines.delete(key);
    }

    const hdgRnd = Math.round(pos.hdg/5)*5;
    const tip = `<span style="font-weight:700;color:${clr}">${esc(tk.csn||'')}</span><br>`+
      `<span style="font-size:9px;color:#aaa">NAV ${esc(navR.mt==='DEPARTURE'?'taxi-out':'taxi-in')} — ${esc(pos.label||'')}</span>`;

    if(!navGroundMarkers.has(key)){
      const m = L.marker([pos.lat,pos.lng], {
        icon: mkIcon(hdgRnd, clr, selected), zIndexOffset: selected?220:60, interactive:true
      }).bindTooltip(tip,{className:'acft-lbl',offset:[16,0]});
      navGroundMarkerGroup.addLayer(m);
      m.on('click',()=>selAircraft(id));
      navGroundMarkers.set(key,{marker:m, hdg:hdgRnd, selected});
    } else {
      const e = navGroundMarkers.get(key);
      e.marker.setLatLng([pos.lat,pos.lng]);
      if(Math.abs(hdgRnd-e.hdg)>4 || selected!==e.selected){
        e.marker.setIcon(mkIcon(hdgRnd, clr, selected));
        e.marker.options.zIndexOffset = selected?220:60;
        e.hdg = hdgRnd; e.selected = selected;
      }
      e.marker.getTooltip()?.setContent(tip);
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
}


function shouldUseNavGroundForTrack(tk, t){
  if(!tk?.nav) return false;
  if(hasActiveOpdiGround(tk.csn, t)) return false;
  const times = navGroundTimes(tk.nav, tk);
  if(!times || t < times.start || t > times.end) return false;
  const pts = navRouteCoords(tk);
  return pts.length >= 2;
}

function clearNavGroundLayer(){
  if(navGroundMarkerGroup) navGroundMarkerGroup.clearLayers();
  if(navGroundLineGroup) navGroundLineGroup.clearLayers();
  navGroundMarkers.clear();
  navGroundLines.clear();
}


async function loadNMIR(file, dk) {
  nmirMap.clear();
  try {
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, {type:'array', cellDates:true});

    // Build date string from dayKey e.g. '260301' → '2026-03-01'
    const dateStr = fmtDateKey(dk);         // e.g. '2026-03-01'
    const [yyyy, mm] = dateStr.split('-');
    const monthIdx   = parseInt(mm,10) - 1; // 0-based
    const monthPT    = PT_MONTHS[monthIdx];
    const sheetName  = wb.SheetNames.find(n=>{
      const up = n.toUpperCase();
      return up.includes(monthPT) && up.includes(yyyy);
    });

    if(!sheetName) throw new Error('Folha NMIR não encontrada para '+dateStr+'. Folhas disponíveis: '+wb.SheetNames.join(', '));

    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {defval:''});

    for(const r of rows) {
      const csn  = String(r['Aircraft ID']||'').trim().toUpperCase();
      if(!csn) continue;

      // Determine flight date from LOBT or ATOT
      let flightDate = dateStr; // default to loaded day
      const lobt = r['LOBT'];
      if(lobt instanceof Date) {
        const d = lobt;
        flightDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } else if(typeof lobt==='string' && lobt.includes('-')) {
        flightDate = lobt.slice(0,10);
      }

      const key = `${csn}|${flightDate}`;
      const fmtT = v => {
        if(!v) return null;
        if(v instanceof Date) return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`;
        if(typeof v==='string') return v.slice(11,16)||null;
        return null;
      };

      const delayRaw = r['ATFM Delay'];
      const delay    = delayRaw===''||delayRaw==null ? null : Number(String(delayRaw).replace(',','.'));

      nmirMap.set(key, {
        acftType: String(r['Aircraft Type']||'').trim(),
        ades:     String(r['ADES']||'').trim(),
        etot:     fmtT(r['ETOT']),
        ctot:     fmtT(r['CTOT']),
        atot:     fmtT(r['ATOT']),
        delay,
        regulation: String(r['MP Regulation']||'').trim(),
        conformance: String(r['Departure Conformance']||'').trim(),
        flttyp: String(r['FLTTYP']||'').trim()
      });
    }
    appLog('info', `NMIR: carregados ${nmirMap.size} voos da folha "${sheetName}".`);
  } catch(e) {
    appLog('error','Erro ao ler NMIR xlsx', e.message || String(e));
    throw e;
  }
}

function enrichWithNMIR() {
  const dateStr = fmtDateKey(dayKey);
  for(const tk of tracks.values()) {
    const csn = (tk.csn||'').toUpperCase();
    if(!csn) continue;
    const rec = nmirMap.get(`${csn}|${dateStr}`);
    if(!rec) continue;
    // NMIR only has LPPT departures — apply regardless of current geometric type
    // reclassifyTracks() will fix the type afterwards
    tk.nmir = rec;
    tk.ades = rec.ades || null;
    tk.adep = 'LPPT';
    const existing = osCache.get(tk.modeS)||{};
    if(rec.acftType && !existing.type)
      osCache.set(tk.modeS, {...existing, type: rec.acftType});
  }
  updVisibleLabels();
}

function reclassifyTracks() {
  // Rule: if we know ADEP/ADES, use them to classify definitively.
  // LPPT in ADES → ARR; LPPT in ADEP → DEP; neither → OVR.
  // Fallback to geometric classification when ADEP/ADES unknown.
  let changed = 0;
  for(const tk of tracks.values()) {
    const adep = (tk.adep||'').toUpperCase();
    const ades = (tk.ades||'').toUpperCase();
    let newType = tk.type;

    if(adep === 'LPPT' && ades !== 'LPPT') newType = 'DEP';
    else if(ades === 'LPPT' && adep !== 'LPPT') newType = 'ARR';
    else if(adep === 'LPPT' && ades === 'LPPT') {
      // LPPT–LPPT: keep geometric
    } else if(adep && ades && adep !== 'LPPT' && ades !== 'LPPT') {
      newType = 'OVR';
    }
    // If ADEP/ADES unknown, keep geometric classification

    if(newType !== tk.type) {
      tk.type = newType;
      changed++;
    }
  }
  if(changed > 0) {
    console.log(`Reclassified ${changed} tracks using ADEP/ADES`);
    updVisibleLabels();
    updateMarkers(simT);
  }
}

function buildTracks(rows) {
  // ── Step 1: group raw points by trkNr ───────────────────
  const raw = new Map();

  for(const r of rows) {
    const origId = r.trkNr;
    if(origId==null || !r.latitude || !r.longitude) continue;
    // Reject (0,0) ghost points
    if(r.latitude===0 && r.longitude===0) continue;
    if(!raw.has(origId)) raw.set(origId,{
      origId,
      csn:  String(r.csn||'').trim(),
      modeS:String(r.modeS||'').toLowerCase().trim(),
      pts:[]
    });
    const t = tod2s(r.tod);
    if(isNaN(t)) continue;
    raw.get(origId).pts.push({
      t, lat:r.latitude, lng:r.longitude,
      alt:(r.baroH||0)*100,
      ias:r.iar||0, mac:r.mac||0,
      roc:r.roc||0, vx:r.vx||0, vy:r.vy||0
    });
  }

  // ── Step 2: sort, deduplicate, then SPLIT at gaps > 5 min ─
  // The same trkNr is reused across CSV file boundaries, so a
  // single trkNr bucket may contain two completely different flights.
  // Splitting at gaps > 300 s separates them cleanly.
  const GAP = 300;   // seconds — safe threshold between flights
  let mn=Infinity, mx=-Infinity;
  let uid=0;         // unique sequential ID for each final track

  for(const [,tk] of raw) {
    // sort by time
    tk.pts.sort((a,b)=>a.t-b.t);

    // deduplicate timestamps
    const dedup=[tk.pts[0]];
    for(let i=1;i<tk.pts.length;i++)
      if(tk.pts[i].t > dedup[dedup.length-1].t) dedup.push(tk.pts[i]);

    // split into segments wherever consecutive gap > GAP
    const segs=[];
    let seg=[dedup[0]];
    for(let i=1;i<dedup.length;i++){
      if(dedup[i].t - seg[seg.length-1].t > GAP){
        if(seg.length>=2) segs.push(seg);
        seg=[];
      }
      seg.push(dedup[i]);
    }
    if(seg.length>=2) segs.push(seg);

    // register each segment as an independent track
    for(const pts of segs){
      // Filter ground/false tracks: any real flight exceeds 2000 ft at some point.
      // Ground traffic at LPPT (~374 ft elevation) stays below ~700 ft.
      let maxAlt = 0;
      for(const p of pts) if(p.alt > maxAlt) maxAlt = p.alt;
      if(maxAlt < 2000) continue;

      const id = uid++;
      const finalTk = { id, csn:tk.csn, modeS:tk.modeS, pts };
      finalTk.t0   = pts[0].t;
      finalTk.t1   = pts[pts.length-1].t;
      finalTk.type = classifyTrack(finalTk);
      mn = Math.min(mn, finalTk.t0);
      mx = Math.max(mx, finalTk.t1);
      tracks.set(id, finalTk);
    }
  }

  tMin   = isFinite(mn)?mn:0;
  tMax   = isFinite(mx)?mx:86400;
  simT   = tMin;
  fStart = tMin;
  fEnd   = tMax;
  document.getElementById('t-start').value = s2hm(tMin);
  document.getElementById('t-end').value   = s2hm(tMax);
}

function classifyTrack(tk) {
  const pts    = tk.pts;
  const minAlt = Math.min(...pts.map(p=>p.alt));
  const d0 = distNM(pts[0].lat,              pts[0].lng,              LPPT[0],LPPT[1]);
  const d1 = distNM(pts[pts.length-1].lat,   pts[pts.length-1].lng,   LPPT[0],LPPT[1]);
  if(minAlt < 4000) {
    if(d1<d0 && d1<15) return 'ARR';
    if(d0<d1 && d0<15) return 'DEP';
    return d1<15 ? 'ARR' : 'DEP';
  }
  return 'OVR';
}
