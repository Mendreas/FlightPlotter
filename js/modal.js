// ═══════════════════════════════════════════════════════════════
// MODAL (with sortable columns)
// ═══════════════════════════════════════════════════════════════
let _modalData = {rows:[], cols:[], sort:{col:null,dir:1}};

function showModal(title, rows, cols) {
  _modalData = {rows:[...rows], cols, sort:{col:null,dir:1}};
  document.getElementById('chart-modal-title').textContent = `${title}`;
  renderModalTable();
  document.getElementById('chart-modal').classList.add('on');
}

function renderModalTable() {
  const {rows, cols, sort} = _modalData;
  const sorted = [...rows].sort((a,b)=>{
    if(!sort.col) return 0;
    const cd = cols.find(c=>c.key===sort.col);
    let va=a[sort.col]??'', vb=b[sort.col]??'';
    if(cd?.type==='num'||(!isNaN(parseFloat(va))&&!isNaN(parseFloat(vb)))){
      va=parseFloat(va)||0; vb=parseFloat(vb)||0; return sort.dir*(va-vb);
    }
    return sort.dir*String(va).localeCompare(String(vb));
  });

  const thead = cols.map(c=>{
    const active = sort.col===c.key;
    const arrow  = active ? (sort.dir===1?'↑':'↓') : '⇕';
    const aclr   = active ? '#1466b0' : '#aac0d8';
    return `<th onclick="modalSortBy('${jsStr(c.key)}')" style="cursor:pointer;user-select:none;white-space:nowrap">
      ${esc(c.label)} <span style="font-size:9px;color:${aclr}">${arrow}</span></th>`;
  }).join('');

  const tbody = sorted.map(r=>
    `<tr>${cols.map(c=>`<td>${esc(r[c.key]??'—')}</td>`).join('')}</tr>`
  ).join('');

  document.getElementById('chart-modal-body').innerHTML =
    `<div style="font-size:11px;color:#8090a8;margin-bottom:6px">${safeNum(rows.length)} registos — clique no cabeçalho para ordenar</div>`+
    `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

function modalSortBy(col) {
  const s = _modalData.sort;
  if(s.col===col) s.dir*=-1;
  else { s.col=col; s.dir=1; }
  renderModalTable();
}

function closeModal() { document.getElementById('chart-modal').classList.remove('on'); }
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });
