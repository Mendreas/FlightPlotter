// ═══════════════════════════════════════════════════════════════
// COMBINED EXPORT (Tracker + NMIR + OPDI)
// ═══════════════════════════════════════════════════════════════
function toggleExportMenu() {
  const m = document.getElementById('export-menu');
  m.style.display = m.style.display==='none' ? '' : 'none';
}
// Close export menu when clicking outside
document.addEventListener('click', e=>{
  const wrap = document.getElementById('export-wrap');
  if(wrap && !wrap.contains(e.target))
    document.getElementById('export-menu').style.display='none';
});

function exportCombined(fmt) {
  document.getElementById('export-menu').style.display='none';
  if(!tracks.size) return alert('Sem dados de tracker carregados.');

  const dateStr = fmtDateKey(dayKey);
  const rows = [];

  for(const tk of tracks.values()) {
    const csn     = tk.csn||'';
    const nmirRec = nmirMap.get(`${csn.toUpperCase()}|${dateStr}`) || {};
    const info    = osCache.get(tk.modeS)||{};
    const acftType= info.type || nmirRec.acftType || '';
    const adep    = tk.adep || (tk.type==='DEP'?'LPPT':'');
    const ades    = tk.ades || (tk.type==='ARR'?'LPPT':'');

    // Find OPDI events for this callsign
    const opdiEvts = [];
    for(const [,seg] of opdiTracks) {
      if(seg.csn===csn.toUpperCase()) {
        seg.pts.filter(p=>!p.synthetic).forEach(p=>opdiEvts.push(p));
      }
    }

    // One row per radar point
    for(const p of tk.pts) {
      const fl = Math.round(p.alt/100);
      rows.push({
        Date:          dateStr,
        Callsign:      csn,
        OpType:        tk.type,
        AcftType:      acftType,
        ADEP:          adep,
        ADES:          ades,
        ICAO24:        tk.modeS||'',
        Time_UTC:      s2hms(p.t),
        Latitude:      +p.lat.toFixed(6),
        Longitude:     +p.lng.toFixed(6),
        Altitude_ft:   Math.round(p.alt),
        FL:            fl,
        IAS_kt:        Math.round(p.ias),
        Mach:          p.mac ? +p.mac.toFixed(3) : '',
        ROC_fpm:       Math.round(p.roc),
        Heading_deg:   Math.round(hdgVel(p.vx,p.vy)),
        // NMIR fields
        NMIR_ETOT:     nmirRec.etot||'',
        NMIR_CTOT:     nmirRec.ctot||'',
        NMIR_ATOT:     nmirRec.atot||'',
        NMIR_Delay_min:nmirRec.delay!=null?nmirRec.delay:'',
        NMIR_Regulation:nmirRec.regulation||'',
        NMIR_Conformance:nmirRec.conformance||'',
        NMIR_FlightType: nmirRec.flttyp||''
      });
    }

    // Append OPDI ground events as extra rows (no radar data)
    for(const p of opdiEvts) {
      rows.push({
        Date:        dateStr,
        Callsign:    csn,
        OpType:      tk.type,
        AcftType:    acftType,
        ADEP:        adep,
        ADES:        ades,
        ICAO24:      tk.modeS||'',
        Time_UTC:    s2hms(p.t),
        Latitude:    +p.lat.toFixed(6),
        Longitude:   +p.lng.toFixed(6),
        Altitude_ft: '',
        FL:          '',
        IAS_kt:      '',
        Mach:        '',
        ROC_fpm:     '',
        Heading_deg: '',
        NMIR_ETOT:   nmirRec.etot||'',
        NMIR_CTOT:   nmirRec.ctot||'',
        NMIR_ATOT:   nmirRec.atot||'',
        NMIR_Delay_min: nmirRec.delay!=null?nmirRec.delay:'',
        NMIR_Regulation: nmirRec.regulation||'',
        NMIR_Conformance: nmirRec.conformance||'',
        NMIR_FlightType: nmirRec.flttyp||'',
        OPDI_EventType: p.type,
        OPDI_Ref:       p.ref||''
      });
    }
  }

  if(!rows.length) return alert('Sem dados para exportar.');

  const fname = `FlightPlotter_${dateStr.replace(/-/g,'')}`;
  if(fmt==='csv') {
    dlBlob(new Blob([Papa.unparse(rows)],{type:'text/csv;charset=utf-8'}), fname+'.csv');
  } else {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'FlightData');
    // Summary sheet
    const sumRows = [];
    const dateStr2 = fmtDateKey(dayKey);
    for(const tk of tracks.values()){
      const csn2=tk.csn||'';
      const nr=nmirMap.get(`${csn2.toUpperCase()}|${dateStr2}`)||{};
      const info2=osCache.get(tk.modeS)||{};
      sumRows.push({
        Callsign:csn2, OpType:tk.type,
        AcftType:info2.type||nr.acftType||'',
        ADEP:tk.adep||(tk.type==='DEP'?'LPPT':''),
        ADES:tk.ades||(tk.type==='ARR'?'LPPT':''),
        Start_UTC:s2hm(tk.t0), End_UTC:s2hm(tk.t1),
        MaxAlt_ft:Math.max(...tk.pts.map(p=>Math.round(p.alt))),
        MaxIAS_kt:Math.max(...tk.pts.map(p=>Math.round(p.ias))),
        NMIR_ETOT:nr.etot||'', NMIR_CTOT:nr.ctot||'', NMIR_ATOT:nr.atot||'',
        NMIR_Delay:nr.delay!=null?nr.delay:'',
        NMIR_Regulation:nr.regulation||'', NMIR_Conformance:nr.conformance||''
      });
    }
    const ws2=XLSX.utils.json_to_sheet(sumRows);
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumo');
    XLSX.writeFile(wb, fname+'.xlsx');
  }
}

function jumpToCallsign(csn) {
  for(const tk of tracks.values()){
    if((tk.csn||'').toUpperCase()===csn.toUpperCase()){
      switchTab('map');
      simT=tk.t0; refresh(); selAircraft(tk.id);
      const p=interp(tk,tk.t0); map.panTo([p.lat,p.lng]);
      return;
    }
  }
}
function calcStats() {
  const all = [...tracks.values()];
  const arr = all.filter(t=>t.type==='ARR');
  const dep = all.filter(t=>t.type==='DEP');
  const ovr = all.filter(t=>t.type==='OVR');

  document.getElementById('s-total').textContent = all.length;
  document.getElementById('s-arr').textContent   = arr.length;
  document.getElementById('s-dep').textContent   = dep.length;
  document.getElementById('s-ovr').textContent   = ovr.length;

  const hc=new Array(24).fill(0);
  all.forEach(t=>hc[Math.floor(t.t0/3600)%24]++);
  const ph=hc.indexOf(Math.max(...hc));
  document.getElementById('s-peak').textContent  = `${String(ph).padStart(2,'0')}:00`;
  document.getElementById('s-peak-n').textContent= `${hc[ph]} voos`;

  let sum=0,cnt=0;
  all.forEach(t=>t.pts.forEach(p=>{ if(p.alt<3000&&p.ias>50){sum+=p.ias;cnt++;} }));
  document.getElementById('s-ias').textContent = cnt>0?`${Math.round(sum/cnt)} kt`:'—';

  _statsData={all,arr,dep,ovr,hc,ph};
}

function renderStats() {
  statsCharts.forEach(c=>c.destroy()); statsCharts=[];
  if(!_statsData) return;
  const {all,arr,dep,ovr,hc,ph}=_statsData;

  const copts=(xl,yl)=>({
    responsive:true,
    plugins:{legend:{labels:{color:'#5a7090',font:{size:10}}}},
    scales:{
      x:{ticks:{color:'#8090a8'},grid:{color:'rgba(0,0,0,.05)'},
         title:{display:true,text:xl,color:'#8090a8',font:{size:10}}},
      y:{ticks:{color:'#8090a8'},grid:{color:'rgba(0,0,0,.05)'},
         title:{display:true,text:yl,color:'#8090a8',font:{size:10}}}
    }
  });

  // Hourly
  const hLabels = Array.from({length:24},(_,i)=>String(i).padStart(2,'0')+'h');
  statsCharts.push(new Chart(document.getElementById('sc-hourly').getContext('2d'),{type:'bar',
    data:{labels:hLabels,
          datasets:[{label:'Voos',data:hc,
            backgroundColor:hc.map((_,i)=>i===ph?'rgba(41,184,255,.75)':'rgba(41,184,255,.22)'),
            borderColor:'rgba(41,184,255,.6)',borderWidth:1}]},
    options:{...copts('Hora UTC','Nº voos'),
      onClick:(_,els)=>{
        if(!els.length) return;
        const h=els[0].index;
        const rows=all.filter(t=>Math.floor(t.t0/3600)%24===h).map(t=>({
          csn:t.csn,type:t.type,inicio:s2hm(t.t0),fim:s2hm(t.t1)
        }));
        showModal(`Voos às ${hLabels[h]} (${rows.length})`,rows,
          [{key:'csn',label:'Callsign'},{key:'type',label:'Op.'},
           {key:'inicio',label:'Início'},{key:'fim',label:'Fim'}]);
      }}}));

  // Pie
  statsCharts.push(new Chart(document.getElementById('sc-pie').getContext('2d'),{type:'doughnut',
    data:{labels:['ARR','DEP','Sobrevoo'],
          datasets:[{data:[arr.length,dep.length,ovr.length],
            backgroundColor:[CLR.ARR,CLR.DEP,CLR.OVR],
            borderColor:'#edf1f7',borderWidth:2}]},
    options:{plugins:{legend:{labels:{color:'#4a6080'}}},
      onClick:(_,els)=>{
        if(!els.length) return;
        const types=['ARR','DEP','OVR'];
        const tList=[arr,dep,ovr][els[0].index];
        const rows=tList.map(t=>({csn:t.csn,inicio:s2hm(t.t0),fim:s2hm(t.t1)}));
        showModal(`${types[els[0].index]} — ${rows.length} voos`,rows,
          [{key:'csn',label:'Callsign'},{key:'inicio',label:'Início'},{key:'fim',label:'Fim'}]);
      }}}));

  // IAS by alt band
  const bands=[[0,1000],[1000,2000],[2000,3000],[3000,5000],[5000,8000],[8000,99999]];
  const blabs=['0–1k','1k–2k','2k–3k','3k–5k','5k–8k','>8k'];
  const bdata=bands.map(([lo,hi])=>{
    let s2=0,c=0;
    all.forEach(t=>t.pts.forEach(p=>{ if(p.alt>=lo&&p.alt<hi&&p.ias>50){s2+=p.ias;c++;} }));
    return c>0?Math.round(s2/c):0;
  });
  statsCharts.push(new Chart(document.getElementById('sc-iasalt').getContext('2d'),{type:'bar',
    data:{labels:blabs,datasets:[{label:'IAS média (kt)',data:bdata,
      backgroundColor:'rgba(0,136,204,.3)',borderColor:'#0088cc',borderWidth:1}]},
    options:{...copts('Altitude (ft)','IAS média (kt)'),
      onClick:(_,els)=>{
        if(!els.length) return;
        const [lo,hi]=bands[els[0].index];
        const rows=[];
        all.forEach(t=>t.pts.forEach(p=>{
          if(p.alt>=lo&&p.alt<hi&&p.ias>50)
            rows.push({csn:t.csn,time:s2hms(p.t),
              alt:Math.round(p.alt),ias:Math.round(p.ias)});
        }));
        showModal(`IAS na banda ${blabs[els[0].index]}ft (${rows.length} pontos)`,
          rows.slice(0,300),
          [{key:'csn',label:'Callsign'},{key:'time',label:'Hora'},
           {key:'alt',label:'Alt ft'},{key:'ias',label:'IAS kt'}]);
      }}}));
}
