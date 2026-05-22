// ═══════════════════════════════════════════════════════════════
// ANIMATION
// ═══════════════════════════════════════════════════════════════
function togglePlay() { playing ? stopPlay() : startPlay(); }

function startPlay() {
  if(playing) return;
  playing=true; lastTs=null; lastMkUp=0;
  document.getElementById('playbtn').textContent='⏸';
  raf=requestAnimationFrame(loop);
}

function stopPlay() {
  playing=false;
  document.getElementById('playbtn').textContent='▶';
  if(raf){ cancelAnimationFrame(raf); raf=null; }
}

function loop(ts) {
  if(!playing) return;
  if(lastTs!==null) {
    const dtSim = Math.min((ts-lastTs)/1000, .1) * speed;
    simT += dtSim;
    if(simT>=fEnd && speed>0){ simT=fEnd; stopPlay(); }
    if(simT<=fStart && speed<0){ simT=fStart; stopPlay(); }

    if(ts-lastMkUp>50) {   // 20 fps DOM updates
      updateMarkers(simT);
      if(opdiVisible || selTrk) renderOpdiLayer(simT);
      updTimeDsp(simT);
      document.getElementById('timeSlider').value=simT;
      if(selTrk) updPanel();
      if(profileChart){ profileChart.verticalLine=simT; profileChart.update('none'); }
      lastMkUp=ts;
    }
  }
  lastTs=ts;
  if(playing) raf=requestAnimationFrame(loop);
}

function setSpeed(s) {
  speed=s;
  document.querySelectorAll('.sbtn').forEach(b=>b.classList.remove('active'));
  const lbl=SPD_LABELS[String(s)];
  document.querySelectorAll('.sbtn').forEach(b=>{ if(b.textContent===lbl) b.classList.add('active'); });
  if(!playing) startPlay();
}

function ctlJumpStart(){ simT=fStart; stopPlay(); refresh(); }
function ctlJumpEnd()  { simT=fEnd;   stopPlay(); refresh(); }
function ctlStepBack() { simT=Math.max(fStart,simT-60); refresh(); }
function ctlStepFwd()  { simT=Math.min(fEnd,  simT+60); refresh(); }

function applyTimeFilter() {
  fStart=hm2s(document.getElementById('t-start').value);
  fEnd  =hm2s(document.getElementById('t-end').value);
  const sl=document.getElementById('timeSlider');
  sl.min=fStart; sl.max=fEnd;
  if(simT<fStart) simT=fStart;
  if(simT>fEnd)   simT=fEnd;
  drawSliderTicks();
  refresh();
}
