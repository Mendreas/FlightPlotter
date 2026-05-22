// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════
function exportData(fmt) {
  if(!selTrk) return alert('Seleccione primeiro uma aeronave.');
  const tk   = tracks.get(selTrk);
  const info = osCache.get(tk.modeS)||{};
  const adepD = info.adep||(tk.type==='DEP'?'LPPT':'');
  const adesD = info.ades||(tk.type==='ARR'?'LPPT':'');
  const rows = tk.pts.map(p=>({
    Callsign:    tk.csn,
    Time_UTC:    s2hms(p.t),
    Latitude:    p.lat.toFixed(6),
    Longitude:   p.lng.toFixed(6),
    Altitude_ft: Math.round(p.alt),
    FL:          Math.round(p.alt/100),
    IAS_kt:      Math.round(p.ias),
    Mach:        p.mac?p.mac.toFixed(3):'',
    ROC_fpm:     Math.round(p.roc),
    Heading_deg: Math.round(hdgVel(p.vx,p.vy)),
    ADEP:        adepD,
    ADES:        adesD,
    AcftType:    info.type||'',
    OpType:      tk.type
  }));
  const fname=`${tk.csn||tk.id}_${dayKey}`;
  if(fmt==='csv'){
    dlBlob(new Blob([Papa.unparse(rows)],{type:'text/csv'}),fname+'.csv');
  } else {
    const ws=XLSX.utils.json_to_sheet(rows);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,(tk.csn||'Track').slice(0,31));
    XLSX.writeFile(wb,fname+'.xlsx');
  }
}

function dlBlob(blob,name) {
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}

// ═══════════════════════════════════════════════════════════════
// SCREENSHOT
// ═══════════════════════════════════════════════════════════════
async function takeScreenshot() {
  const btn=document.querySelector('[onclick="takeScreenshot()"]');
  btn.textContent='⏳';
  try {
    const el=document.getElementById('map-view');
    const c=await html2canvas(el,{useCORS:true,backgroundColor:'#edf1f7',scale:1.5,logging:false});
    const a=document.createElement('a');
    a.href=c.toDataURL('image/png');
    a.download=`FlightPlotter_${s2hms(simT).replace(/:/g,'')}.png`;
    a.click();
  } catch(e){ alert('Erro ao capturar: '+e.message); }
  btn.textContent='📷';
}
