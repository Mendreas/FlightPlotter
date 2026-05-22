// ═══════════════════════════════════════════════════════════════
// AIRCRAFT SELECTION & PANEL
// ═══════════════════════════════════════════════════════════════
function selAircraft(id) {
  const tk = tracks.get(id);
  if(!tk) return;
  selTrk = id;
  updPanel();
  buildProfile(tk);
  refresh();
  if(typeof renderOpdiLayer === 'function') renderOpdiLayer(simT);
}

function updPanel() {
  if(!selTrk) return;
  const tk   = tracks.get(selTrk);
  if(!tk) return;
  const p    = trackPointAt(tk, simT);
  if(!p) return;
  const info = osCache.get(tk.modeS)||{};

  document.getElementById('ph-csn').textContent   = tk.csn||tk.modeS||'—';
  document.getElementById('ph-csn').style.color   = CLR[tk.type];
  document.getElementById('ph-type').textContent  = info.type||tk.nmir?.acftType||'—';
  const adep = tk.adep || (tk.type==='DEP' ? 'LPPT' : info.adep||'?');
  const ades = tk.ades || (tk.type==='ARR' ? 'LPPT' : info.ades||'?');
  document.getElementById('ph-route').textContent = `${adep} → ${ades}  ·  ${tk.type}`;

  const fl  = Math.round(p.alt/100);
  const als = fl>=18 ? `FL${String(fl).padStart(3,'0')}` : `${Math.round(p.alt).toLocaleString()} ft`;
  document.getElementById('v-alt').textContent = als;
  document.getElementById('v-ias').textContent = `${Math.round(p.ias)} kt`;
  document.getElementById('v-hdg').textContent = `${String(Math.round(hdgVel(p.vx,p.vy))).padStart(3,'0')}°`;
  document.getElementById('v-mac').textContent = p.mac ? p.mac.toFixed(3) : '—';
  const rocSign = p.roc>0?'+':'';
  document.getElementById('v-roc').textContent = p.roc ? `${rocSign}${Math.round(p.roc)}` : '—';
  document.getElementById('v-hex').textContent = tk.modeS||'—';

  // NMIR section
  const nr = tk.nmir;
  const nmirSec = document.getElementById('nmir-section');
  nmirSec.style.display = nr ? '' : 'none';
  if(nr) {
    document.getElementById('n-etot').textContent  = nr.etot||'—';
    document.getElementById('n-ctot').textContent  = nr.ctot||'N/A';
    document.getElementById('n-atot').textContent  = nr.atot||'—';
    const dEl  = document.getElementById('n-delay');
    dEl.textContent = nr.delay==null ? '—' : `${nr.delay>0?'+':''}${nr.delay} min`;
    dEl.className   = 'ndi-v ' + (nr.delay==null||nr.delay===0 ? 'delay-ok' : nr.delay<15 ? 'delay-warn' : 'delay-bad');
    const conf = nr.conformance;
    const cEl  = document.getElementById('n-conf');
    cEl.textContent = conf==='Within'?'✔ Within':conf==='Outside'?'✘ Outside':conf||'—';
    cEl.style.color = conf==='Within'?'#18a060':conf==='Outside'?'#cc2020':'#4a7090';
    document.getElementById('n-ftype').textContent = nr.flttyp==='S'?'Scheduled':nr.flttyp==='N'?'Non-sched':nr.flttyp||'—';
    document.getElementById('nmir-reg').textContent = nr.regulation ? `Regulação: ${nr.regulation}` : '';
  }

  // NAV section
  const navR = tk.nav;
  const navSec = document.getElementById("nav-section");
  navSec.style.display = navR ? "" : "none";
  if(navR) {
    const stand = navR.mt==="DEPARTURE" ? navR.standd : navR.standa;
    document.getElementById("nv-stand").textContent  = stand||"—";
    const bt = navR.mt==="DEPARTURE" ? navR.aobt : navR.aibt;
    document.getElementById("nv-bt").textContent     = bt||"—";
    document.getElementById("nv-hp").textContent     = navR.hp||"—";
    const txoDur = navR.mt==="DEPARTURE"&&navR.aobt&&navR.atot ? timeDiff(navR.aobt,navR.atot)+" min" : "—";
    const txiDur = navR.mt==="ARRIVAL"&&navR.aldt&&navR.aibt   ? timeDiff(navR.aldt,navR.aibt)+" min" : "—";
    document.getElementById("nv-txo").textContent    = txoDur;
    document.getElementById("nv-txi").textContent    = txiDur;
    document.getElementById("nv-sid").textContent    = navR.sid||navR.star||"—";
    const route = navR.mt==="DEPARTURE" ? navR.taxiOut : navR.taxiIn;
    document.getElementById("nv-route").textContent  = route||"—";
    const spdSec = document.getElementById("nav-spd");
    if(navR.mt==="ARRIVAL"&&(navR.spd10nm||navR.spd6nm||navR.spd5nm||navR.spd4nm)){
      spdSec.style.display="";
      const pts=[{lbl:"10NM",spd:navR.spd10nm,alt:navR.alt10nm},{lbl:"9NM",spd:navR.spd9nm,alt:navR.alt9nm},{lbl:"6NM",spd:navR.spd6nm,alt:navR.alt6nm},{lbl:"5NM",spd:navR.spd5nm,alt:navR.alt5nm},{lbl:"4NM",spd:navR.spd4nm,alt:navR.alt4nm}];
      document.getElementById("nav-spd-grid").innerHTML=pts.map(pt=>`<div class="nav-spd-pt"><div class="nav-spd-nm">${esc(pt.lbl)}</div><div class="nav-spd-v">${pt.spd!=null?esc(pt.spd):"—"}</div><div class="nav-spd-a">${pt.alt!=null?"A"+String(Math.round(safeNum(pt.alt)/100)).padStart(3,"0"):"—"}</div></div>`).join("");
    }else{spdSec.style.display="none";}
    if(map.getZoom()>=OPDI_ZOOM) renderTaxiRoute(tk); else clearTaxiRoute();
  } else { clearTaxiRoute(); }
  if(profileChart){ profileChart.verticalLine=simT; profileChart.update('none'); }
}
