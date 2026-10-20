// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function init() {
  installGlobalErrorHandlers();
  assertRequiredLibraries();
  updateExternalButton();
  updateBaseMapButton();
  appLog('info', 'Aplicação iniciada em modo NAV-safe.');
  map = L.map('map', {center:LPPT, zoom:APP_CONFIG.map.initialZoom, zoomControl:true, attributionControl:false});

  if(APP_CONFIG.security.allowExternalMapTiles && APP_CONFIG.map.tileLayerUrl) {
    enableExternalBaseMap();
  } else {
    appLog('info', 'Mapa base externo bloqueado por defeito. A vista usa fundo neutro/local.');
  }

  // OPDI layer groups — makes clearing bulletproof
  opdiMarkerGroup = L.layerGroup().addTo(map);
  opdiLineGroup   = L.layerGroup().addTo(map);

  // Range rings
  [[30,'#5090c0'],[10,'#1a72cc']].forEach(([nm,clr]) =>
    L.circle(LPPT, {radius:nm*NM, color:clr, weight:nm===10?1.5:1, opacity:nm===10?.5:.3,
      dashArray:nm===10?'5,7':'2,10', fill:false, interactive:false}).addTo(map));

  // LPPT centre point — small dot only, no marker icon
  L.circleMarker(LPPT, {radius:4, color:'#1466b0', fillColor:'#1466b0',
    fillOpacity:.7, weight:1, interactive:false}).addTo(map);

  // File inputs
  document.getElementById('fi-folder').addEventListener('change', e=>handleFiles(e.target.files));
  document.getElementById('fi-files').addEventListener('change',  e=>handleFiles(e.target.files));
  document.getElementById('fi-nmir').addEventListener('change',   e=>handleNmirFile(e.target.files));
  document.getElementById('fi-opdi').addEventListener('change',   e=>handleOpdiFiles(e.target.files));
  document.getElementById('fi-nav').addEventListener('change',    e=>handleNavFile(e.target.files[0]));

  // OPDI ground layer visibility driven by zoom level
  map.on('zoomend', ()=>{
    const z = map.getZoom();
    const shouldShow = z >= OPDI_ZOOM;
    if(shouldShow !== opdiVisible) {
      opdiVisible = shouldShow;
      if(opdiVisible) renderOpdiLayer(simT);
      else clearOpdiMarkers();
    }
    // Clear APP/AD active state if user zoomed manually
    const mode = window._mapMode;
    if(mode==='APP' && z>=OPDI_ZOOM)  setMapMode('');
    if(mode==='AD'  && z<OPDI_ZOOM)   setMapMode('');
  });

  // Slider
  const sl = document.getElementById('timeSlider');
  sl.addEventListener('pointerdown',()=>{ if(playing) stopPlay(); });
  sl.addEventListener('input', e=>{ simT=+e.target.value; refresh(); });

  // Close search on outside click
  document.addEventListener('click', e=>{
    if(!document.getElementById('srch-wrap').contains(e.target))
      document.getElementById('srchDrop').style.display='none';
    if(e.target?.id === 'diag-modal') closeDiagnostics();
  });
}
