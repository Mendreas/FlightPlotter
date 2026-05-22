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

  // Airport layout overlay — improves LPPT readability even on pale basemaps
  addAirportLayoutOverlay();

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


// ═══════════════════════════════════════════════════════════════
// AIRPORT LAYOUT OVERLAY
// Improves the visual readability of LPPT at AD zoom levels.
// This is local vector drawing and does not depend on map tile detail.
// ═══════════════════════════════════════════════════════════════
let airportLayoutGroup = null;

function addAirportLayoutOverlay(){
  if(!map || airportLayoutGroup) return;
  airportLayoutGroup = L.layerGroup().addTo(map);

  const rwyPairs = [
    {a:'02', b:'20', name:'RWY 02/20', color:'#20384f'},
    {a:'17', b:'35', name:'RWY 17/35', color:'#50657a'}
  ];

  rwyPairs.forEach(r => {
    const A = RWY[r.a], B = RWY[r.b];
    if(!A || !B) return;
    const pts = [[A.lat,A.lng],[B.lat,B.lng]];

    // White base makes the runway stand out over any basemap.
    L.polyline(pts, {
      color:'#ffffff', weight:20, opacity:0.92, interactive:false,
      lineCap:'butt', pane:'overlayPane'
    }).addTo(airportLayoutGroup);

    // Dark centre body.
    L.polyline(pts, {
      color:r.color, weight:12, opacity:0.68, interactive:false,
      lineCap:'butt', pane:'overlayPane'
    }).addTo(airportLayoutGroup);

    // Dashed centreline.
    L.polyline(pts, {
      color:'#ffffff', weight:2, opacity:0.85, dashArray:'9,10',
      interactive:false, lineCap:'butt', pane:'overlayPane'
    }).addTo(airportLayoutGroup);

    // Runway threshold labels.
    addRwyLabel(r.a, [A.lat,A.lng]);
    addRwyLabel(r.b, [B.lat,B.lng]);
  });

  // Approach centreline extensions for main runway 02/20.
  addApproachExtension('02', 205, '#1466b0');
  addApproachExtension('20', 25,  '#1466b0');

  // Airport reference point label.
  const aptIcon = L.divIcon({
    className:'airport-layout-label airport-id-label',
    html:`<div>${esc(APP_CONFIG.airport.icao)}</div>`,
    iconSize:[52,20], iconAnchor:[26,26]
  });
  L.marker(LPPT, {icon:aptIcon, interactive:false, zIndexOffset:20}).addTo(airportLayoutGroup);

  appLog?.('info','Overlay local do layout do aeroporto ativado.');
}

function addRwyLabel(name, latlng){
  const icon = L.divIcon({
    className:'airport-layout-label runway-label',
    html:`<div>${esc(name)}</div>`,
    iconSize:[32,18], iconAnchor:[16,9]
  });
  L.marker(latlng, {icon, interactive:false, zIndexOffset:30}).addTo(airportLayoutGroup);
}

function addApproachExtension(rwyName, outboundBearing, color){
  const r = RWY[rwyName];
  if(!r) return;
  const start = [r.lat, r.lng];
  const end = destPoint(start[0], start[1], outboundBearing, 4.0);
  L.polyline([start, end], {
    color, weight:2, opacity:0.42, dashArray:'8,12',
    interactive:false, pane:'overlayPane'
  }).addTo(airportLayoutGroup);
}

function destPoint(lat, lng, bearingDeg, distNm){
  const R = 6371000;
  const d = distNm * NM;
  const brng = bearingDeg * Math.PI/180;
  const φ1 = lat * Math.PI/180;
  const λ1 = lng * Math.PI/180;
  const δ = d / R;
  const sinφ2 = Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(brng);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(brng)*Math.sin(δ)*Math.cos(φ1);
  const x = Math.cos(δ)-Math.sin(φ1)*Math.sin(φ2);
  const λ2 = λ1 + Math.atan2(y,x);
  return [φ2*180/Math.PI, ((λ2*180/Math.PI + 540) % 360) - 180];
}
