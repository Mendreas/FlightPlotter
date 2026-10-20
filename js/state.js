// ── STATE ────────────────────────────────────────────────────────
let map, profileChart;
const tracks      = new Map();
const markers     = new Map();
const mkState     = new Map();
const osCache     = new Map();
const dayFiles    = new Map();
const nmirMap     = new Map();
const navMap      = new Map();   // 'CALLSIGN|YYYY-MM-DD' → NAV record
let   navFile     = null;        // the loaded NAV CSV File object
let   taxiRouteLayer = null;     // current taxi route polyline on map
const PT_MONTHS   = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

// OPDI ground tracks
const opdiTracks  = new Map();   // key → {csn, pts}
// LayerGroups are created after map init — declared here, assigned in init()
let opdiMarkerGroup = null;  // L.layerGroup for aircraft icons
let opdiLineGroup   = null;  // L.layerGroup for polylines
const opdiMarkers = new Map();   // key → {marker, hdg}
const opdiLines   = new Map();   // key → {lines[]}
let   opdiVisible = false;

let nmirXlsx   = null;
let opdiFiles  = new Map();   // dateKey → File  (opdi_LPPT_YYYYMMDD.csv)
let dayKey     = null;
let simT     = 0;
let playing  = false;
let speed    = 1;
let lastTs   = null;
let raf      = null;
let selTrk   = null;
let tMin     = 0;
let tMax     = 86400;
let fStart   = 0;
let fEnd     = 86400;
let lastMkUp = 0;
let statsCharts = [];
let atfmCharts  = [];
let opdiTabCharts=[];
let _statsData  = null;
