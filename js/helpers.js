// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function interp(tk,t) {
  const pts=tk.pts;
  if(t<=pts[0].t)              return pts[0];
  if(t>=pts[pts.length-1].t)   return pts[pts.length-1];
  let lo=0,hi=pts.length-1;
  while(hi-lo>1){ const m=(lo+hi)>>1; if(pts[m].t<=t)lo=m; else hi=m; }
  const a=(t-pts[lo].t)/(pts[hi].t-pts[lo].t);
  const L=(x,y)=>x+a*(y-x);
  const p0=pts[lo],p1=pts[hi];
  return {lat:L(p0.lat,p1.lat),lng:L(p0.lng,p1.lng),
          alt:L(p0.alt,p1.alt),ias:L(p0.ias,p1.ias),
          mac:L(p0.mac,p1.mac),roc:L(p0.roc,p1.roc),
          vx:p0.vx,vy:p0.vy};
}

function hdgVel(vx,vy) {
  if(vx===0&&vy===0) return 0;
  return ((Math.atan2(vx,vy)*180/Math.PI)+360)%360;
}

function distNM(la1,lo1,la2,lo2) {
  const R=6371000,dLa=(la2-la1)*Math.PI/180,dLo=(lo2-lo1)*Math.PI/180;
  const a=Math.sin(dLa/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(a))/NM;
}

function tod2s(v) {
  if(!v) return NaN;
  const p=String(v).split(':');
  if(p.length<3) return NaN;
  return +p[0]*3600 + +p[1]*60 + parseFloat(p[2]);
}

function s2hms(s) {
  s=Math.max(0,Math.floor(s));
  return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

function s2hm(s){ return s2hms(s).slice(0,5); }
function hm2s(hm){
  // Robust HH:MM / HH:MM:SS parser.
  // Some NAV columns may be empty/null. Returning NaN here prevents the
  // whole loading process from failing when a movement has missing times.
  if(hm === null || hm === undefined || hm === '') return NaN;
  const txt = String(hm).trim();
  if(!txt || txt === '-' || txt.toLowerCase() === 'null' || txt.toLowerCase() === 'undefined') return NaN;
  const p = txt.split(':');
  if(p.length < 2) return NaN;
  const h = parseInt(p[0], 10);
  const m = parseInt(p[1], 10);
  const sec = p.length > 2 ? parseFloat(p[2]) || 0 : 0;
  if(!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h*3600 + m*60 + sec;
}
function updTimeDsp(s){ document.getElementById('timeDsp').textContent=s2hms(s); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function timeDiff(t1, t2) {
  // t1, t2 as 'HH:MM' strings — returns difference in minutes
  if(!t1||!t2) return null;
  const s1=hm2s(t1.slice(0,5)), s2=hm2s(t2.slice(0,5));
  let diff=Math.round((s2-s1)/60);
  if(diff<-120) diff+=1440; // handle midnight crossover
  return diff;
}

function clearAll() {
  appLog('info','A limpar dados do dia anterior.');
  stopPlay();
  for(const m of markers.values()) map.removeLayer(m);
  markers.clear(); mkState.clear(); tracks.clear();
  document.getElementById("btn-tracker")?.classList.remove("active");
  document.getElementById("btn-nmir")?.classList.remove("active");
  document.getElementById("btn-opdi")?.classList.remove("active");
  document.getElementById("btn-nav")?.classList.remove("active");
  navMap.clear();
  if(taxiRouteLayer){map.removeLayer(taxiRouteLayer);taxiRouteLayer=null;}
  document.getElementById("nav-section").style.display="none";
  nmirMap.clear();
  opdiTracks.clear();
  standPosCache.clear();
  clearOpdiMarkers();
  opdiVisible = false;
  document.getElementById('nmir-section').style.display='none';
  selTrk=null; _statsData=null;
  if(profileChart){ profileChart.destroy(); profileChart=null; }
  document.getElementById('pc-empty').textContent='Clique numa aeronave no mapa\nou pesquise pelo callsign';
  document.getElementById('pc-empty').style.display='';
  document.getElementById('profileChart').style.display='none';
  ['ph-csn','ph-route'].forEach(id=>document.getElementById(id).textContent='—');
  document.getElementById('ph-csn').style.color='#29b8ff';
  document.getElementById('ph-type').textContent='Seleccione uma aeronave';
  ['v-alt','v-ias','v-hdg','v-mac','v-roc','v-hex'].forEach(id=>document.getElementById(id).textContent='—');
  document.getElementById('acft-count').textContent='— aeronaves';
  statsCharts.forEach(c=>c.destroy()); statsCharts=[];
  atfmCharts.forEach(c=>c.destroy());  atfmCharts=[];
  opdiTabCharts.forEach(c=>{ try{c.destroy();}catch(_){} }); opdiTabCharts=[];
}

function showLD(m){ document.getElementById('ld-tx').textContent=m; document.getElementById('ld').classList.add('on'); }
function hideLD() { document.getElementById('ld').classList.remove('on'); }
