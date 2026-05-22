// ═══════════════════════════════════════════════════════════════
// OPDI TAB
// ═══════════════════════════════════════════════════════════════
let _opdiFilter = '';

function renderOpdiTab() {
  opdiTabCharts.forEach(c=>{ try{c.destroy();}catch(_){} });
  opdiTabCharts = [];
  ['oc-types','oc-hourly'].forEach(id=>{
    const old=document.getElementById(id); if(!old) return;
    const fresh=document.createElement('canvas'); fresh.id=id;
    old.parentNode.replaceChild(fresh,old);
  });

  const hasData = opdiTracks.size > 0;
  document.getElementById('opdi-no-data').style.display  = hasData?'none':'';
  document.getElementById('opdi-content').style.display  = hasData?'flex':'none';
  if(!hasData) return;

  // Flatten all events with flight info
  const allEvts = [];
  for(const [,seg] of opdiTracks){
    const {csn,pts} = seg;
    let opType='';
    for(const tk of tracks.values()) if((tk.csn||'').toUpperCase()===csn){opType=tk.type||'';break;}
    for(const p of pts){
      if(p.synthetic) continue;
      allEvts.push({csn, type:p.type, time:s2hms(p.t), ref:p.ref||'', opType,
                    lat:p.lat.toFixed(5), lng:p.lng.toFixed(5)});
    }
  }

  // Chart 1: events by type
  const typeCounts = {};
  allEvts.forEach(e=>{ typeCounts[e.type]=(typeCounts[e.type]||0)+1; });
  const typeLabels = Object.keys(typeCounts).sort((a,b)=>typeCounts[b]-typeCounts[a]);
  const typeData   = typeLabels.map(k=>typeCounts[k]);
  const c1 = new Chart(document.getElementById('oc-types'),{type:'bar',
    data:{labels:typeLabels.map(l=>l.replace('entry-','→').replace('exit-','←')),
          datasets:[{label:'Eventos',data:typeData,
            backgroundColor:'rgba(20,102,176,.35)',borderColor:'rgba(20,102,176,.7)',borderWidth:1}]},
    options:{responsive:true,indexAxis:'y',
      onClick:(_,els)=>{
        if(!els.length) return;
        const lbl=typeLabels[els[0].index];
        const rows=allEvts.filter(e=>e.type===lbl);
        showModal(`Eventos: ${lbl} (${rows.length})`, rows,
          [{key:'csn',label:'Callsign'},{key:'opType',label:'Tipo'},{key:'time',label:'Hora'},
           {key:'ref',label:'Ref'},{key:'lat',label:'Lat'},{key:'lng',label:'Lng'}]);
      },
      plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#8090a8'},grid:{color:'rgba(0,0,0,.04)'}},
              y:{ticks:{color:'#5a7090',font:{size:9}},grid:{display:false}}}}});
  opdiTabCharts.push(c1);

  // Chart 2: movements by hour
  const hourCounts = new Array(24).fill(0);
  // count unique flight+hour combinations
  const seen = new Set();
  allEvts.forEach(e=>{
    const h=parseInt(e.time.split(':')[0],10);
    const k=`${e.csn}|${h}`;
    if(!seen.has(k)){ seen.add(k); hourCounts[h]++; }
  });
  const c2 = new Chart(document.getElementById('oc-hourly'),{type:'bar',
    data:{labels:Array.from({length:24},(_,i)=>String(i).padStart(2,'0')+'h'),
          datasets:[{label:'Movimentos',data:hourCounts,
            backgroundColor:'rgba(245,165,0,.35)',borderColor:'rgba(245,165,0,.7)',borderWidth:1}]},
    options:{responsive:true,
      onClick:(_,els)=>{
        if(!els.length) return;
        const h=els[0].index;
        const rows=[...new Map(allEvts.filter(e=>parseInt(e.time.split(':')[0],10)===h)
          .map(e=>[e.csn,e])).values()];
        showModal(`Movimentos às ${String(h).padStart(2,'0')}h (${rows.length} voos)`, rows,
          [{key:'csn',label:'Callsign'},{key:'opType',label:'Tipo'},
           {key:'time',label:'1º Evento'},{key:'type',label:'Evento'}]);
      },
      plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#8090a8',font:{size:9}}},
              y:{ticks:{color:'#8090a8'},grid:{color:'rgba(0,0,0,.04)'}}}
    }});
  opdiTabCharts.push(c2);

  // Pre-fill search from topbar if there's a callsign already searched
  const topbarVal = (document.getElementById('srchIn')?.value||'').trim().toUpperCase();
  const searchEl  = document.getElementById('opdi-search');
  if(topbarVal && searchEl) {
    searchEl.value = topbarVal;
    _opdiFilter = topbarVal;
  } else {
    _opdiFilter = (searchEl?.value||'').trim().toUpperCase();
  }

  // Table
  window._opdiAllEvts = allEvts;
  renderOpdiTable(_opdiFilter ? allEvts.filter(e=>
    e.csn.includes(_opdiFilter)||e.type.toUpperCase().includes(_opdiFilter)
  ) : allEvts);
}

function filterOpdiTable(q) {
  _opdiFilter = q.toUpperCase();
  const rows = (window._opdiAllEvts||[]).filter(e=>
    !_opdiFilter || e.csn.includes(_opdiFilter) || e.type.toUpperCase().includes(_opdiFilter)
  );
  renderOpdiTable(rows);
}

function renderOpdiTable(rows) {
  const cols = [
    {key:'csn',label:'Callsign'},{key:'opType',label:'Op.'},{key:'time',label:'Hora UTC'},
    {key:'type',label:'Evento'},{key:'ref',label:'Ref'},
    {key:'lat',label:'Lat'},{key:'lng',label:'Lng'}
  ];
  document.getElementById('opdi-thead').innerHTML = cols.map(c=>`<th>${esc(c.label)}</th>`).join('');
  document.getElementById('opdi-tbody').innerHTML = rows.slice(0,APP_CFG.maxTableRows).map(r=>{
    const clr = r.opType==='DEP'?'#1a88ff':r.opType==='ARR'?'#c8a000':'#888';
    return `<tr data-csn="${esc(r.csn)}" onclick="jumpToCallsign(this.dataset.csn)" style="cursor:pointer">
      <td style="font-weight:700;color:${clr}">${esc(r.csn)}</td>
      <td><span style="color:${clr}">${esc(r.opType||'—')}</span></td>
      <td style="font-family:Consolas">${esc(r.time)}</td>
      <td style="font-size:10px;color:#4a7090">${esc(r.type)}</td>
      <td style="font-size:10px">${esc(r.ref)}</td>
      <td style="font-size:10px;color:#8090a8">${esc(r.lat)}</td>
      <td style="font-size:10px;color:#8090a8">${esc(r.lng)}</td>
    </tr>`;
  }).join('');
  if(rows.length>APP_CFG.maxTableRows){
    document.getElementById('opdi-tbody').innerHTML +=
      `<tr><td colspan="7" style="text-align:center;color:#8090a8;padding:8px">
        … mais ${safeNum(rows.length)-APP_CFG.maxTableRows} eventos (filtra por callsign para ver todos)
      </td></tr>`;
  }
}

function clearOpdiSearch() {
  const el = document.getElementById('opdi-search');
  if(el) el.value='';
  _opdiFilter='';
  renderOpdiTable(window._opdiAllEvts||[]);
}
