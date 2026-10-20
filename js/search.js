// ═══════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════
function doSearch(q) {
  const drop=document.getElementById('srchDrop');
  if(!q||q.length<2){ drop.style.display='none'; return; }
  const ql=q.toUpperCase();
  const hits=[];
  for(const tk of tracks.values()){
    if((tk.csn||'').toUpperCase().includes(ql)) hits.push(tk);
    if(hits.length>=12) break;
  }
  if(!hits.length){ drop.style.display='none'; return; }
  drop.innerHTML=hits.map(tk=>{
    const info=osCache.get(tk.modeS)||{};
    return `<div class="sr-item" onclick="jumpToTrack(${safeNum(tk.id)})">
      <span class="sr-csn">${esc(tk.csn||tk.modeS)}</span>
      <span class="sr-typ">${esc(info.type||tk.type)}</span>
      <span class="sr-tm">${esc(s2hm(tk.t0))}–${esc(s2hm(tk.t1))}</span>
    </div>`;
  }).join('');
  drop.style.display='block';
}

function jumpToTrack(id) {
  const tk=tracks.get(id);
  if(!tk) return;
  document.getElementById('srchDrop').style.display='none';
  document.getElementById('srchIn').value=tk.csn||tk.id;
  simT=tk.t0;
  refresh();
  selAircraft(id);
  const p=interp(tk,tk.t0);
  map.panTo([p.lat,p.lng]);
}
