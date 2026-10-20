// ═══════════════════════════════════════════════════════════════
// OPENSKY API  (background enrichment — best-effort)
// ═══════════════════════════════════════════════════════════════
async function fetchAllOS(dk) {
  if(!APP_CFG.allowExternalEnrichment) {
    appLog('info','Enriquecimento externo bloqueado por defeito (NAV-safe).');
    return;
  }
  const ds    = fmtDateKey(dk);
  const begin = Math.floor(new Date(ds+'T00:00:00Z').getTime()/1000);
  const end   = begin+86400;
  const modes = [...new Set([...tracks.values()].map(t=>t.modeS).filter(s=>s&&s.length>=4))];
  appLog('warn', `Modo externo ON: a consultar OpenSky para até ${Math.min(modes.length,80)} aeronaves.`);
  let n=0;
  for(const ms of modes) {
    if(osCache.has(ms)) continue;
    fetchOneOS(ms,begin,end).then(()=>{ updVisibleLabels(); }).catch(()=>{});
    n++;
    await sleep(n%4===0?400:100);
    if(n>80) break;
  }
}

async function fetchOneOS(ms,begin,end) {
  const info={};
  try {
    const r1=await fetch(`https://opensky-network.org/api/metadata/aircraft/icao/${ms}`,{signal:AbortSignal.timeout(5000)});
    if(r1.ok){ const d=await r1.json(); info.type=d.typecode||d.model||null; }
  } catch(_){}
  try {
    const r2=await fetch(`https://opensky-network.org/api/flights/aircraft?icao24=${ms}&begin=${begin}&end=${end}`,{signal:AbortSignal.timeout(5000)});
    if(r2.ok){ const d=await r2.json(); if(d&&d.length){ info.adep=d[0].estDepartureAirport||null; info.ades=d[0].estArrivalAirport||null; } }
  } catch(_){}
  osCache.set(ms,info);
  // Update panel if this is the selected aircraft
  if(selTrk){
    const st=tracks.get(selTrk);
    if(st&&st.modeS===ms){
      // Apply route info directly to matching tracks, not via shared osCache
      for(const tk of tracks.values()){
        if(tk.modeS!==ms) continue;
        if(!tk.adep && info.adep) tk.adep=info.adep;
        if(!tk.ades && info.ades) tk.ades=info.ades;
      }
      updPanel();
    }
  }
}

function updVisibleLabels() {
  for(const [id,tk] of tracks) {
    if(!markers.has(id)) continue;
    const p=interp(tk,simT);
    updLabel(id,tk,p);
  }
}
