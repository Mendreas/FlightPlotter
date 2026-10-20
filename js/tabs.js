// ═══════════════════════════════════════════════════════════════
// TABS & ZOOM
// ═══════════════════════════════════════════════════════════════
function switchTab(t) {
  const views = ['map','stats','atfm','opdi'];
  document.getElementById('map-view').style.display        = t==='map'  ?'flex':'none';
  document.getElementById('stats-view').style.display      = t==='stats'?'flex':'none';
  document.getElementById('atfm-view').style.display       = t==='atfm' ?'flex':'none';
  document.getElementById('opdi-view').style.display       = t==='opdi' ?'flex':'none';
  document.getElementById('controls-bar').style.display    = t==='map'  ?'flex':'none';
  views.forEach(v=>{ const el=document.getElementById('tab-'+v); if(el) el.classList.toggle('active',v===t); });
  if(t==='stats') renderStats();
  else if(t==='atfm') renderATFM();
  else if(t==='opdi') renderOpdiTab();
  else setTimeout(()=>map.invalidateSize(),0);
}

function renderATFM() {
  atfmCharts.forEach(c=>{ try{c.destroy();}catch(_){} });
  atfmCharts = [];

  // Reset canvases to avoid Chart.js "canvas already in use" error
  ['ac-hourly','ac-dist','ac-regs'].forEach(id=>{
    const old = document.getElementById(id);
    if(!old) return;
    const fresh = document.createElement('canvas');
    fresh.id = id;
    old.parentNode.replaceChild(fresh, old);
  });

  const hasNMIR = nmirMap.size > 0;
  document.getElementById('atfm-no-data').style.display   = hasNMIR ? 'none' : '';
  document.getElementById('atfm-content').style.display   = hasNMIR ? '' : 'none';
  if(!hasNMIR) return;

  // Build dataset from nmirMap entries that match the loaded day
  const dateStr = fmtDateKey(dayKey);
  const flights = [];
  for(const [key, rec] of nmirMap) {
    const [csn, date] = key.split('|');
    if(date !== dateStr) continue;
    flights.push({csn, ...rec});
  }
  if(!flights.length) {
    document.getElementById('atfm-no-data').textContent = 'Sem dados NMIR para o dia seleccionado.';
    document.getElementById('atfm-no-data').style.display = '';
    document.getElementById('atfm-content').style.display = 'none';
    return;
  }

  const delayed   = flights.filter(f=>f.delay!=null && f.delay>0);
  const regulated = flights.filter(f=>f.ctot && f.ctot!=='N/A' && f.ctot!=='');
  const totalMin  = delayed.reduce((s,f)=>s+(f.delay||0), 0);
  const outside   = flights.filter(f=>f.conformance==='Outside');

  // ── Cards ───────────────────────────────────────────────────────
  const cards = [
    {label:'Total Partidas NMIR', val: flights.length,              color:'#1466b0'},
    {label:'Voos Regulados (CTOT)', val: regulated.length,          color:'#d08000'},
    {label:'Total Minutos ATFM',   val: totalMin+' min',            color:'#cc2020'},
    {label:'Atraso Médio (reg.)',   val: regulated.length ? Math.round(totalMin/regulated.length)+' min':'—', color:'#8040c0'},
    {label:'Maior Atraso',         val: delayed.length ? Math.max(...delayed.map(f=>f.delay))+' min':'—',    color:'#cc2020'},
    {label:'Fora de Conformidade', val: outside.length,             color:'#d06000'},
  ];
  document.getElementById('atfm-cards').innerHTML = cards.map(c=>
    `<div class="st-card"><h3>${esc(c.label)}</h3><div class="st-num" style="color:${c.color};font-size:26px">${esc(c.val)}</div></div>`
  ).join('');

  const copts = (xl,yl) => ({
    responsive:true,
    plugins:{legend:{labels:{color:'#5a7090',font:{size:10}}}},
    scales:{
      x:{ticks:{color:'#8090a8'},grid:{color:'rgba(0,0,0,.05)'},
         title:{display:true,text:xl,color:'#8090a8',font:{size:10}}},
      y:{ticks:{color:'#8090a8'},grid:{color:'rgba(0,0,0,.05)'},
         title:{display:true,text:yl,color:'#8090a8',font:{size:10}}}
    }
  });

  // ── Chart 1: avg ATFM delay by departure hour ───────────────────
  const hDelay = Array.from({length:24},()=>({sum:0,cnt:0}));
  for(const f of flights) {
    if(!f.etot) continue;
    const h = parseInt(f.etot.split(':')[0], 10);
    if(h>=0 && h<24) { hDelay[h].sum+=(f.delay||0); hDelay[h].cnt++; }
  }
  const hLabels = Array.from({length:24},(_,i)=>String(i).padStart(2,'0')+'h');
  const hData   = hDelay.map(x=>x.cnt>0?Math.round(x.sum/x.cnt):0);
  atfmCharts.push(new Chart(document.getElementById('ac-hourly'),{type:'bar',
    data:{labels:hLabels, datasets:[{
      label:'Atraso médio (min)', data:hData,
      backgroundColor: hData.map(v=>v>=15?'rgba(200,30,30,.5)':v>0?'rgba(200,140,0,.45)':'rgba(41,100,200,.22)'),
      borderColor:     hData.map(v=>v>=15?'rgba(200,30,30,.8)':v>0?'rgba(200,140,0,.7)':'rgba(41,100,200,.5)'),
      borderWidth:1}]},
    options:{...copts('Hora ETOT','Atraso médio (min)'),
      onClick:(_,els)=>{
        if(!els.length) return;
        const h=els[0].index;
        const rows=flights.filter(f=>{
          if(!f.etot) return false;
          return parseInt(f.etot.split(':')[0],10)===h;
        }).map(f=>({csn:f.csn,acftType:f.acftType||'—',ades:f.ades||'—',
          etot:f.etot||'—',ctot:f.ctot||'—',atot:f.atot||'—',
          delay:f.delay??'—',regulation:f.regulation||'—'}));
        showModal(`Atraso ATFM às ${hLabels[h]} — ${rows.length} voos`, rows,
          [{key:'csn',label:'Callsign',type:'str'},{key:'acftType',label:'Tipo',type:'str'},
           {key:'ades',label:'ADES',type:'str'},{key:'etot',label:'ETOT',type:'str'},
           {key:'ctot',label:'CTOT',type:'str'},{key:'atot',label:'ATOT',type:'str'},
           {key:'delay',label:'Atraso',type:'num'},{key:'regulation',label:'Regulação',type:'str'}]);
      }}}));

  // ── Chart 2: delay distribution buckets ─────────────────────────
  const buckets = [[0,0,'Sem atraso'],[1,9,'1–9 min'],[10,14,'10–14 min'],[15,29,'15–29 min'],[30,59,'30–59 min'],[60,999,'≥60 min']];
  const bCounts = buckets.map(([lo,hi])=>flights.filter(f=>{
    const d=f.delay||0; return d>=lo && d<=hi;
  }).length);
  atfmCharts.push(new Chart(document.getElementById('ac-dist'),{type:'doughnut',
    data:{labels:buckets.map(b=>b[2]),
          datasets:[{data:bCounts,
            backgroundColor:['#2ecc71','#3498db','#f39c12','#e67e22','#e74c3c','#8e44ad'],
            borderColor:'#edf1f7',borderWidth:2}]},
    options:{plugins:{legend:{labels:{color:'#4a6080',font:{size:11}}}},
      onClick:(_,els)=>{
        if(!els.length) return;
        const [lo,hi,lbl]=buckets[els[0].index];
        const rows=flights.filter(f=>{ const d=f.delay||0; return d>=lo&&d<=hi; })
          .map(f=>({csn:f.csn,acftType:f.acftType||'—',ades:f.ades||'—',
            etot:f.etot||'—',ctot:f.ctot||'—',atot:f.atot||'—',
            delay:f.delay??0,conformance:f.conformance||'—',regulation:f.regulation||'—'}));
        showModal(`Atraso ${lbl} — ${rows.length} voos`, rows,
          [{key:'csn',label:'Callsign',type:'str'},{key:'acftType',label:'Tipo',type:'str'},
           {key:'ades',label:'ADES',type:'str'},{key:'etot',label:'ETOT',type:'str'},
           {key:'ctot',label:'CTOT',type:'str'},{key:'atot',label:'ATOT',type:'str'},
           {key:'delay',label:'Atraso',type:'num'},{key:'conformance',label:'Conformidade',type:'str'},
           {key:'regulation',label:'Regulação',type:'str'}]);
      }}}));

  // ── Chart 3: top 10 regulations ─────────────────────────────────
  const regMap = new Map();
  for(const f of delayed) {
    if(!f.regulation) continue;
    regMap.set(f.regulation, (regMap.get(f.regulation)||0)+(f.delay||0));
  }
  const regSorted = [...regMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  atfmCharts.push(new Chart(document.getElementById('ac-regs'),{type:'bar',
    data:{labels:regSorted.map(r=>r[0]),
          datasets:[{label:'Total minutos', data:regSorted.map(r=>r[1]),
            backgroundColor:'rgba(180,30,30,.4)',borderColor:'rgba(180,30,30,.7)',borderWidth:1}]},
    options:{...copts('Regulação','Minutos totais'),indexAxis:'y',
      onClick:(_,els)=>{
        if(!els.length) return;
        const reg=regSorted[els[0].index][0];
        const rows=delayed.filter(f=>f.regulation===reg)
          .map(f=>({csn:f.csn,acftType:f.acftType||'—',ades:f.ades||'—',
            etot:f.etot||'—',ctot:f.ctot||'—',atot:f.atot||'—',
            delay:f.delay??'—',conformance:f.conformance||'—'}));
        showModal(`Regulação ${reg} — ${rows.length} voos`, rows,
          [{key:'csn',label:'Callsign',type:'str'},{key:'acftType',label:'Tipo',type:'str'},
           {key:'ades',label:'ADES',type:'str'},{key:'etot',label:'ETOT',type:'str'},
           {key:'ctot',label:'CTOT',type:'str'},{key:'atot',label:'ATOT',type:'str'},
           {key:'delay',label:'Atraso',type:'num'},{key:'conformance',label:'Conformidade',type:'str'}]);
      }}}));

  // ── Table ────────────────────────────────────────────────────────
  // Store flight data globally for re-sorting
  window._atfmFlights = [...flights].filter(f=>f.delay!=null && f.delay>0);
  window._atfmSort    = {col:'delay', dir:-1};  // default: delay descending

  const cols = [
    {key:'csn',         label:'Callsign',      type:'str'},
    {key:'acftType',    label:'Tipo',          type:'str'},
    {key:'ades',        label:'ADES',          type:'str'},
    {key:'etot',        label:'ETOT',          type:'str'},
    {key:'ctot',        label:'CTOT',          type:'str'},
    {key:'atot',        label:'ATOT',          type:'str'},
    {key:'delay',       label:'Atraso',        type:'num'},
    {key:'conformance', label:'Conformidade',  type:'str'},
    {key:'regulation',  label:'Regulação',     type:'str'},
  ];
  window._atfmCols = cols;

  document.getElementById('atfm-thead').innerHTML = cols.map(c=>
    `<th data-col="${esc(c.key)}" style="cursor:pointer;user-select:none;padding:6px 10px;border-bottom:2px solid #c8d8ec;font-weight:600;white-space:nowrap" onclick="atfmSortBy('${jsStr(c.key)}')">
      ${esc(c.label)} <span id="atfm-sort-${esc(c.key)}" style="font-size:9px;color:#aac0d8">⇕</span>
    </th>`
  ).join('');

  // Mark initial sort column
  document.getElementById('atfm-sort-delay').textContent='↓';

  renderATFMTable();
}

function atfmSortBy(col) {
  const s = window._atfmSort;
  if(s.col===col) s.dir *= -1;
  else { s.col=col; s.dir=1; }
  // Reset all indicators
  (window._atfmCols||[]).forEach(c=>{
    const el=document.getElementById('atfm-sort-'+c.key);
    if(el) el.textContent='⇕';
  });
  const ind=document.getElementById('atfm-sort-'+col);
  if(ind) ind.textContent = s.dir===1?'↑':'↓';
  renderATFMTable();
}

function renderATFMTable() {
  const {col,dir} = window._atfmSort||{col:'delay',dir:-1};
  const colDef = (window._atfmCols||[]).find(c=>c.key===col)||{type:'str'};
  const rows = [...(window._atfmFlights||[])].sort((a,b)=>{
    let va=a[col]??'', vb=b[col]??'';
    if(colDef.type==='num'){ va=Number(va)||0; vb=Number(vb)||0; return dir*(va-vb); }
    return dir*String(va).localeCompare(String(vb));
  });
  document.getElementById('atfm-tbody').innerHTML = rows.map(f=>{
    const d=f.delay||0;
    const chip=`<span class="delay-chip ${d===0?'delay-ok':d<15?'delay-warn':'delay-bad'}">${d>0?'+':''}${d} min</span>`;
    const conf=f.conformance==='Within'?'<span style="color:#18a060">✔ Within</span>':
               f.conformance==='Outside'?'<span style="color:#cc2020">✘ Outside</span>':esc(f.conformance||'—');
    return `<tr data-csn="${esc(f.csn)}" onclick="jumpToCallsign(this.dataset.csn)" style="cursor:pointer">
      <td style="font-weight:700;color:#1466b0">${esc(f.csn)}</td>
      <td>${esc(f.acftType||'—')}</td>
      <td>${esc(f.ades||'—')}</td>
      <td style="font-family:Consolas">${esc(f.etot||'—')}</td>
      <td style="font-family:Consolas">${esc(f.ctot||'—')}</td>
      <td style="font-family:Consolas">${esc(f.atot||'—')}</td>
      <td>${chip}</td>
      <td>${conf}</td>
      <td style="font-size:10px;color:#4a7090">${esc(f.regulation||'—')}</td>
    </tr>`;
  }).join('');
}

function setMapMode(mode) {
  document.getElementById('btn-app')?.classList.toggle('active', mode==='APP');
  document.getElementById('btn-ad') ?.classList.toggle('active', mode==='AD');
  // Clear active after manual zoom (zoomend listener resets)
  window._mapMode = mode;
}

function zoomAPP(){
  map.setView(LPPT,10);  // ~30NM view
  setMapMode('APP');
  if(opdiVisible){ opdiVisible=false; clearOpdiMarkers(); }
  const zh=document.getElementById('opdi-zoom-hint');
  if(zh && opdiTracks.size>0) zh.style.display='';
  document.getElementById('opdi-count').style.display='none';
}

function zoomAD(){
  map.setView(LPPT,14);
  setMapMode('AD');
  if(!opdiVisible && opdiTracks.size>0){
    opdiVisible=true;
    renderOpdiLayer(simT);
  }
  const zh=document.getElementById('opdi-zoom-hint');
  if(zh) zh.style.display='none';
  // Redraw taxi route if aircraft selected
  if(selTrk && tracks.has(selTrk)) renderTaxiRoute(tracks.get(selTrk));
  // Show OPDI count on map
  const oc=document.getElementById('opdi-count');
  if(opdiTracks.size>0){
    oc.textContent=`🛬 ${opdiTracks.size} movimentos OPDI carregados`;
    oc.style.display='';
    setTimeout(()=>{ oc.style.display='none'; },4000);
  }
}
