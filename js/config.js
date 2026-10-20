// ═══════════════════════════════════════════════════════════════
// FLIGHT PLOTTER — CONFIGURAÇÃO CENTRAL
// Versão modular NAV-safe. Edita este ficheiro para adaptar a app.
// ═══════════════════════════════════════════════════════════════

const APP_CONFIG = {
  version: '5.5 OSM taxi-network',

  airport: {
    icao: 'LPPT',
    name: 'Lisboa / Humberto Delgado',
    centre: [38.7813, -9.1359],
    runways: {
      '02': {lat:38.766389, lng:-9.145000, hdg:25},   // 38°45'59"N 009°08'42"W
      '20': {lat:38.792222, lng:-9.130000, hdg:205},  // 38°47'32"N 009°07'48"W
      '17': {lat:38.786201, lng:-9.137210, hdg:168},
      '35': {lat:38.764999, lng:-9.131600, hdg:348}
    }
  },

  security: {
    // Por defeito, a aplicação não chama OpenSky nem outras APIs externas.
    allowExternalEnrichment: false,

    // Mapa base ativo por defeito.
    // Nota: isto usa tiles externos Carto/OSM, mas NÃO ativa OpenSky/API externa.
    allowExternalMapTiles: true
  },

  parsing: {
    // Em file:// os browsers podem bloquear Web Workers; fica ativo apenas via http/https.
    papaWorker: (typeof location !== 'undefined' && location.protocol !== 'file:'),
    maxTableRows: 500
  },

  map: {
    initialZoom: 9,
    opdiZoom: 14,
    tileLayerUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileLayerOptions: { subdomains:'abc', maxZoom:19 }
  },

  units: {
    NM: 1852
  },

  colours: {
    ARR:'#FFD700',
    DEP:'#4499FF',
    OVR:'#FF69B4'
  }
};


// Compatibilidade com o código legado da V4.x
const LPPT   = APP_CONFIG.airport.centre;
const NM     = APP_CONFIG.units.NM;
const CLR    = APP_CONFIG.colours;
const SPD_LABELS = {'-8':'◀8×','-4':'◀4×','-2':'◀2×','1':'1×','2':'2×','4':'4×','8':'8×'};
const RWY    = APP_CONFIG.airport.runways;
const THR20  = [RWY['20'].lat, RWY['20'].lng];
const THR02  = [RWY['02'].lat, RWY['02'].lng];
const OPDI_ZOOM = APP_CONFIG.map.opdiZoom;

// APP_CFG é mantido para evitar alterar todas as referências antigas.
const APP_CFG = {
  get version(){ return APP_CONFIG.version; },
  get allowExternalEnrichment(){ return APP_CONFIG.security.allowExternalEnrichment; },
  set allowExternalEnrichment(v){ APP_CONFIG.security.allowExternalEnrichment = !!v; },
  get papaWorker(){ return APP_CONFIG.parsing.papaWorker; },
  set papaWorker(v){ APP_CONFIG.parsing.papaWorker = !!v; },
  get maxTableRows(){ return APP_CONFIG.parsing.maxTableRows; },
  set maxTableRows(v){ APP_CONFIG.parsing.maxTableRows = Number(v)||500; }
};

function esc(v) {
  return String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}
function jsStr(v) {
  return String(v ?? '')
    .replaceAll('\\','\\\\')
    .replaceAll("'","\\'")
    .replaceAll('\n',' ')
    .replaceAll('\r',' ');
}
function safeNum(v, d=0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function updateExternalButton(){
  const btn = document.getElementById('btn-external');
  if(!btn) return;
  btn.textContent = APP_CFG.allowExternalEnrichment ? '🌐 Externo ON' : '🌐 Externo OFF';
  btn.classList.toggle('safe-on', APP_CFG.allowExternalEnrichment);
  btn.classList.toggle('safe-off', !APP_CFG.allowExternalEnrichment);
  btn.title = APP_CFG.allowExternalEnrichment
    ? 'ON: permite enriquecimento via OpenSky/API externa'
    : 'OFF: bloqueia chamadas à OpenSky/API externa';
}

let _baseTileLayer = null;
function updateBaseMapButton(){
  const btn = document.getElementById('btn-basemap');
  if(!btn) return;
  const on = !!APP_CONFIG.security.allowExternalMapTiles;
  btn.textContent = on ? '🗺 Base ON' : '🗺 Base OFF';
  btn.classList.toggle('safe-on', on);
  btn.classList.toggle('safe-off', !on);
  btn.title = on
    ? 'ON: carrega mapa base externo Carto/OSM'
    : 'OFF: bloqueia mapa base externo; mantém apenas fundo neutro, rings e tracks';
}
function enableExternalBaseMap(){
  if(!map || _baseTileLayer || !APP_CONFIG.map.tileLayerUrl) return;
  _baseTileLayer = L.tileLayer(APP_CONFIG.map.tileLayerUrl, APP_CONFIG.map.tileLayerOptions || {});
  _baseTileLayer.addTo(map);
  try { _baseTileLayer.bringToBack(); } catch(e) {}
  appLog?.('info', 'Mapa base externo ativado por defeito.');
}
function disableExternalBaseMap(){
  if(map && _baseTileLayer){
    map.removeLayer(_baseTileLayer);
    _baseTileLayer = null;
    appLog?.('info', 'Mapa base externo desligado.');
  }
}
function toggleBaseMapTiles(){
  APP_CONFIG.security.allowExternalMapTiles = !APP_CONFIG.security.allowExternalMapTiles;
  if(APP_CONFIG.security.allowExternalMapTiles) enableExternalBaseMap();
  else disableExternalBaseMap();
  updateBaseMapButton();
}

function toggleExternalEnrichment(){
  APP_CFG.allowExternalEnrichment = !APP_CFG.allowExternalEnrichment;
  updateExternalButton();
  if(APP_CFG.allowExternalEnrichment && dayKey) fetchAllOS(dayKey);
}
function assertRequiredLibraries(){
  const missing = [];
  if(typeof L === 'undefined') missing.push('Leaflet');
  if(typeof Chart === 'undefined') missing.push('Chart.js');
  if(typeof Papa === 'undefined') missing.push('PapaParse');
  if(typeof XLSX === 'undefined') missing.push('XLSX');
  if(typeof html2canvas === 'undefined') missing.push('html2canvas');
  if(missing.length) {
    const msg = 'Bibliotecas locais em falta: '+missing.join(', ')+'. Coloque os ficheiros em /libs ou execute scripts/download-libs.ps1 num PC com internet.';
    alert(msg);
    throw new Error(msg);
  }
}
