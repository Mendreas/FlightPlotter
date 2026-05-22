// ═══════════════════════════════════════════════════════════════
// OPDI GROUND TRACKS
// ═══════════════════════════════════════════════════════════════
const OPDI_GROUND_TYPES = new Set([
  'exit-parking_position','entry-parking_position',
  'exit-apron','entry-apron',
  'exit-taxiway','entry-taxiway',
  'exit-deicing_pad','entry-deicing_pad',
  'exit-runway','entry-runway',
  'exit-threshold','entry-threshold',
  'take-off','landing',
  'first_seen','last_seen'
]);
const OPDI_GAP = 600;  // 10 min gap = separate flight segment

async function loadOpdiCsv(file) {
  opdiTracks.clear();
  try {
    appLog('info', `A ler OPDI: ${file.name}`);
    const rows = await new Promise((ok,fail)=>Papa.parse(file,{
      header:true, skipEmptyLines:true, dynamicTyping:false, worker:APP_CFG.papaWorker,
      complete:r=>ok(r.data), error:fail
    }));
    validateRows('OPDI', rows, ['flt_id','type','at_lppt','latitude','longitude','event_time']);

    // ── Only keep genuine ground movement event types ────────────────
    // The OPDI CSV may include airborne events (first-xing-fl50, level-start, etc.)
    // that happen within the airport bounding box. Filter them out here.
    const GROUND_ONLY = new Set([
      'exit-parking_position','entry-parking_position',
      'exit-apron',           'entry-apron',
      'exit-taxiway',         'entry-taxiway',
      'exit-deicing_pad',     'entry-deicing_pad',
      'exit-runway',          'entry-runway',
      'exit-threshold',       'entry-threshold',
      'take-off',             'landing',
    ]);

    // Build raw list per callsign, only genuine ground events at LPPT
    const raw = new Map();
    for(const r of rows) {
      const csn = String(r.flt_id||'').trim().toUpperCase();
      if(!csn) continue;
      const evType = r.type || '';
      // Only keep ground movement event types — not airborne crossing events
      if(!GROUND_ONLY.has(evType)) continue;
      const atLppt = r.at_lppt==='True'||r.at_lppt==='true'||r.at_lppt===true;
      if(!atLppt) continue;
      const lat = parseFloat(r.latitude), lng = parseFloat(r.longitude);
      if(isNaN(lat)||isNaN(lng)) continue;
      const t = opdiTimeToS(r.event_time);
      if(isNaN(t)) continue;
      if(!raw.has(csn)) raw.set(csn,[]);
      raw.get(csn).push({
        t, lat, lng,
        type: evType,
        ref:  r.info_ref||'',
        adep: r.adep||'', ades: r.ades||'',
        typecode: r.typecode||''
      });
    }

    // Split each callsign by time gaps > OPDI_GAP (separate flight segments)
    let uid=0;
    for(const [csn, pts] of raw) {
      pts.sort((a,b)=>a.t-b.t);
      // Deduplicate same time
      const dedup=[pts[0]];
      for(let i=1;i<pts.length;i++)
        if(pts[i].t>dedup[dedup.length-1].t) dedup.push(pts[i]);

      // Split at gaps
      let seg=[dedup[0]];
      for(let i=1;i<dedup.length;i++){
        if(dedup[i].t - seg[seg.length-1].t > OPDI_GAP){
          // Only store segments with at least 2 real GPS events
          if(seg.length >= 2) opdiTracks.set(`${csn}|${uid++}`, {csn, pts:seg});
          seg=[];
        }
        seg.push(dedup[i]);
      }
      if(seg.length >= 2) opdiTracks.set(`${csn}|${uid++}`, {csn, pts:seg});
    }

    // ── Populate stand position cache from actual OPDI parking GPS events ──
    // These are the most accurate stand positions possible
    for(const r of rows) {
      const evType = r.type||'';
      if(evType !== 'exit-parking_position' && evType !== 'entry-parking_position') continue;
      const lat = parseFloat(r.latitude), lng = parseFloat(r.longitude);
      if(isNaN(lat)||isNaN(lng)) continue;
      // info_ref contains the stand number from OSM (e.g., "504", "A7")
      const ref = String(r.info_ref||'').trim();
      const standNum = parseInt(ref);
      if(standNum > 100 && standNum < 900 && !standPosCache.has(String(standNum))) {
        standPosCache.set(String(standNum), [lat, lng]);
      }
    }
    appLog('info', `OPDI: ${standPosCache.size} posições de stand derivadas de eventos parking.`);
    for(const {csn, pts} of opdiTracks.values()) {
      const pt = pts.find(p=>p.typecode||p.adep||p.ades) || pts[0];
      if(!pt) continue;
      for(const tk of tracks.values()) {
        if((tk.csn||'').toUpperCase()===csn) {
          if(!tk.adep && pt.adep) tk.adep = pt.adep;
          if(!tk.ades && pt.ades) tk.ades = pt.ades;
          if(pt.typecode){
            const ex=osCache.get(tk.modeS)||{};
            if(!ex.type) osCache.set(tk.modeS,{...ex,type:pt.typecode});
          }
        }
      }
    }

    // ── Synthetic gate points using NAV data for accurate timing and position ──
    const gateEvtTypes = new Set([
      'exit-parking_position','entry-parking_position','exit-apron','entry-apron'
    ]);
    const dateStr = fmtDateKey(dayKey);

    for(const [, segObj] of opdiTracks) {
      const {csn, pts} = segObj;
      if(!pts.length) continue;

      let opType = '';
      for(const tk of tracks.values())
        if((tk.csn||'').toUpperCase()===csn){ opType=tk.type||''; break; }

      const firstType = pts[0].type;
      const lastType  = pts[pts.length-1].type;

      // Look up NAV record for stand position and accurate timestamps
      const nav  = navMap.get(`${csn}|${dateStr}`);
      const nmir = nmirMap.get(`${csn}|${dateStr}`);

      // DEP: prepend gate point at AOBT using actual stand coordinates
      if(opType==='DEP' && !gateEvtTypes.has(firstType)) {
        // Timing: prefer NAV AOBT, then NMIR ETOT-taxitime, then estimate
        let gateT = pts[0].t - (TAXI_LEAD[firstType] ?? 480);
        if(nav?.aobt) {
          const aobtS = hm2s(nav.aobt);
          // Sanity check: AOBT should be before first OPDI event
          if(aobtS < pts[0].t && aobtS > pts[0].t - 3600)
            gateT = aobtS;
        } else if(nmir?.atot) {
          const leadSecs = TAXI_LEAD[firstType] ?? 480;
          gateT = Math.min(pts[0].t - 60, hm2s(nmir.atot) - leadSecs);
        }
        // Position: actual stand from NAV, fallback to apron centre
        const stand = nav?.standd;
        const apron = nav?.apron;
        const [glat, glng] = gatePos(stand, apron);
        pts.unshift({t:gateT, lat:glat, lng:glng,
                     type:'gate-synthetic',
                     ref: stand ? `Stand ${stand}` : 'apron (estimado)',
                     synthetic:true});
      }

      // ARR: append gate point at AIBT using actual stand coordinates
      if(opType==='ARR' && !gateEvtTypes.has(lastType)) {
        let gateT = pts[pts.length-1].t + (TAXI_TAIL[lastType] ?? 480);
        if(nav?.aibt) {
          const aibtS = hm2s(nav.aibt);
          if(aibtS > pts[pts.length-1].t && aibtS < pts[pts.length-1].t + 3600)
            gateT = aibtS;
        }
        const stand = nav?.standa;
        const apron = nav?.apron;
        const [glat, glng] = gatePos(stand, apron);
        pts.push({t:gateT, lat:glat, lng:glng,
                  type:'gate-synthetic',
                  ref: stand ? `Stand ${stand}` : 'apron (estimado)',
                  synthetic:true});
      }
    }

    appLog('info', `OPDI: ${opdiTracks.size} segmentos de solo para ${raw.size} callsigns.`);

    // Show badge with count
    const badge = document.getElementById('opdi-badge');
    const badgeTxt = document.getElementById('opdi-badge-txt');
    const zoomHint = document.getElementById('opdi-zoom-hint');
    if(opdiTracks.size > 0){
      badge.style.display='flex';
      badgeTxt.textContent = `OPDI: ${opdiTracks.size} movimentos solo`;
      zoomHint.style.display = map.getZoom() >= OPDI_ZOOM ? 'none' : '';
    } else {
      badge.style.display='none';
    }

    // Log example callsigns with ground data to help user verify
    const examples = [...raw.keys()].slice(0,10).join(', ');
    appLog('info', `OPDI callsigns (primeiros 10): ${examples}`);
    appLog('info', `OPDI: prima AD para ver movimentos de solo.`);
  } catch(e) {
    appLog('error','Erro ao carregar OPDI', e.message || String(e));
    throw e;
  }
}

function opdiTimeToS(ts) {
  if(!ts) return NaN;
  const t = String(ts).trim();
  const timePart = t.includes(' ') ? t.split(' ')[1] : t;
  const p = timePart.split(':');
  if(p.length<2) return NaN;
  return +p[0]*3600 + +p[1]*60 + (parseFloat(p[2])||0);
}

function opdiInterpPos(pts, t) {
  if(!pts||pts.length===0) return null;
  if(t<=pts[0].t) return pts[0];
  if(t>=pts[pts.length-1].t) return pts[pts.length-1];
  let lo=0, hi=pts.length-1;
  while(hi-lo>1){ const m=(lo+hi)>>1; if(pts[m].t<=t)lo=m; else hi=m; }
  const a=(t-pts[lo].t)/(pts[hi].t-pts[lo].t);
  return {
    lat: pts[lo].lat + a*(pts[hi].lat-pts[lo].lat),
    lng: pts[lo].lng + a*(pts[hi].lng-pts[lo].lng),
    type: pts[lo].type, ref: pts[lo].ref
  };
}

function renderOpdiLayer(t) {
  const CLR_GND = {DEP:'#1a88ff', ARR:'#f5a500', OVR:'#a060c0', '':'#606060'};

  const selCsn = selTrk && tracks.has(selTrk)
    ? (tracks.get(selTrk).csn||'').toUpperCase() : '';

  const opdiMarkerShown = new Set();

  for(const [key, seg] of opdiTracks) {
    const {csn, pts} = seg;
    if(!pts.length) continue;
    const tStart = pts[0].t, tEnd = pts[pts.length-1].t;

    // Selected aircraft's OPDI is always visible regardless of zoom
    const isSelected = csn === selCsn;
    if(!opdiVisible && !isSelected) continue;

    // Active window: show polyline 2 min before first event, remove 2 min after last
    const isActive  = t >= tStart - 120 && t <= tEnd + 120;
    const inWindow  = t >= tStart - 30  && t <= tEnd + 30;  // marker only when very close

    // Resolve colour — search radar tracks for this callsign
    let opType = '';
    for(const tk of tracks.values()){
      if((tk.csn||'').toUpperCase() === csn){ opType = tk.type||''; break; }
    }
    const clr = opType==='DEP' ? CLR_GND.DEP
              : opType==='ARR' ? CLR_GND.ARR
              : opType==='OVR' ? CLR_GND.OVR : CLR_GND[''];

    // ── Polyline: create once, toggle opacity by time window ──────
    if(!opdiLines.has(key)){
      const gndPts = pts.filter(p => OPDI_GROUND_TYPES.has(p.type) || p.synthetic);
      const lines  = [];
      if(gndPts.length >= 2){
        // Build sub-segments (break where consecutive points > 1.5 NM apart)
        let cur = [gndPts[0]];
        for(let i=1; i<gndPts.length; i++){
          const d = distNM(gndPts[i-1].lat, gndPts[i-1].lng, gndPts[i].lat, gndPts[i].lng);
          if(d > 1.5){ if(cur.length>=2) flushSeg(cur, lines, clr); cur=[]; }
          cur.push(gndPts[i]);
        }
        if(cur.length>=2) flushSeg(cur, lines, clr);
      }
      // Start hidden — opacity controlled by time window below
      lines.forEach(l => { opdiLineGroup.addLayer(l); l.setStyle({opacity:0}); });
      opdiLines.set(key, {lines, lastClr:clr});
    }

    // Update colour and opacity
    const entry = opdiLines.get(key);
    const targetOpacity = isActive ? 1 : 0;
    if(entry.lastClr !== clr || entry.lastOpacity !== targetOpacity){
      entry.lines.forEach(l => {
        const isSynth = l.options._synthetic;
        l.setStyle({
          color:   clr,
          opacity: isActive ? (isSynth ? 0.35 : 0.55) : 0
        });
      });
      entry.lastClr     = clr;
      entry.lastOpacity = targetOpacity;
    }

    // Don't show OPDI marker when radar or NAV ground already shows this aircraft
    let radarHasData = false;
    for(const tk of tracks.values()){
      if((tk.csn||'').toUpperCase()===csn && t>=tk.t0 && t<=tk.t1){
        radarHasData = true; break;
      }
    }
    const navGroundActive = typeof callsignUsesNavGroundAt === 'function'
      && callsignUsesNavGroundAt(csn, t);

    if(!inWindow || (radarHasData && !isSelected) || (navGroundActive && !isSelected) || (opdiMarkerShown.has(csn) && !isSelected)){
      if(opdiMarkers.has(key)){
        const e=opdiMarkers.get(key);
        opdiMarkerGroup.removeLayer(e.marker||e);
        opdiMarkers.delete(key);
      }
      continue;
    }

    const pos = opdiInterpPos(pts, t);
    if(!pos) continue;

    opdiMarkerShown.add(csn);

    // Heading: direction to next known point
    let hdg=0;
    for(let i=1;i<pts.length;i++){
      if(pts[i].t>=t){
        const dlat=pts[i].lat-pts[i-1].lat, dlng=pts[i].lng-pts[i-1].lng;
        if(Math.abs(dlat)+Math.abs(dlng)>0.00005)
          hdg=((Math.atan2(dlng,dlat)*180/Math.PI)+360)%360;
        break;
      }
    }
    const hdgRnd = Math.round(hdg/5)*5;

    const tip = `<span style="font-weight:700;color:${clr}">${esc(csn)}</span><br>`+
      `<span style="font-size:9px;color:#aaa">${pos.synthetic?'⚠ estimado — ':''}`+
      `${esc(pos.type||'')}${pos.ref?' ('+esc(pos.ref)+')':''}</span>`;

    if(!opdiMarkers.has(key)){
      const m = L.marker([pos.lat,pos.lng],{
        icon: mkIcon(hdgRnd,clr,false),
        zIndexOffset:50, interactive:true
      }).bindTooltip(tip,{className:'acft-lbl',offset:[16,0]});opdiMarkerGroup.addLayer(m);
      m.on('click',()=>{
        const id = findTrackAtTime(csn, simT);
        if(id) selAircraft(id);
      });
      opdiMarkers.set(key,{marker:m, hdg:hdgRnd});
    } else {
      const e=opdiMarkers.get(key);
      e.marker.setLatLng([pos.lat,pos.lng]);
      if(Math.abs(hdgRnd-e.hdg)>4){ e.marker.setIcon(mkIcon(hdgRnd,clr,false)); e.hdg=hdgRnd; }
      e.marker.getTooltip()?.setContent(tip);
    }
  }
}

function flushSeg(pts, out, clr) {
  const hasSynth = pts.some(p=>p.synthetic);
  const line = L.polyline(pts.map(p=>[p.lat,p.lng]), {
    color: clr,
    weight:    hasSynth ? 1.5 : 2,
    opacity:   hasSynth ? 0.35 : 0.55,
    dashArray: hasSynth ? '3,9' : '4,5',
    interactive: false
  });
  line.options._synthetic = hasSynth;
  out.push(line);
}

function clearOpdiMarkers() {
  // LayerGroups clear everything in one call — bulletproof
  if(opdiMarkerGroup) opdiMarkerGroup.clearLayers();
  if(opdiLineGroup)   opdiLineGroup.clearLayers();
  opdiMarkers.clear();
  opdiLines.clear();
}
