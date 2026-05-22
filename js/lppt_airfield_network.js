// ═══════════════════════════════════════════════════════════════
// LPPT AIRFIELD NETWORK — OpenStreetMap / Overpass
// Builds a navigable taxiway geometry database from OSM aeroway ways.
// Used by NAV ground animation to follow taxiways instead of centroid lines.
// ═══════════════════════════════════════════════════════════════

const LPPT_OSM_NETWORK = {
  loaded:false,
  loading:false,
  source:'none',
  error:null,
  fetchedAt:null,
  ways:[],
  taxiways:[],
  runways:[],
  parking:[],
  holding:[],
  byRef:new Map(),
  stands:new Map()
};

const LPPT_OSM_CFG = {
  bbox: { south:38.755, west:-9.162, north:38.806, east:-9.120 },
  cacheKey:'flightplotter_lppt_osm_airfield_network_v1',
  cacheMaxAgeDays:30,
  endpoints:[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter'
  ]
};

function airfieldOsmQuery(){
  const b = LPPT_OSM_CFG.bbox;
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:35];\n(\n`+
    `  way["aeroway"~"taxiway|taxilane|runway|parking_position"](${bbox});\n`+
    `  node["aeroway"~"parking_position|holding_position"](${bbox});\n`+
    `);\nout geom tags;`;
}

function normaliseTwyRef(v){
  return String(v||'').toUpperCase().trim()
    .replace(/^TWY\s+/,'')
    .replace(/^TAXIWAY\s+/,'')
    .replace(/\s+/g,'');
}

function refTokensFromTags(tags={}){
  const raw = [tags.ref, tags.name, tags['ref:icao'], tags.designation]
    .filter(Boolean).join(' ');
  return String(raw).toUpperCase()
    .replace(/TWY|TAXIWAY|RUNWAY|RWY/g,' ')
    .split(/[;,/|\s]+/)
    .map(normaliseTwyRef)
    .filter(Boolean);
}

function coordsFromElement(el){
  if(el.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)){
    return [[el.lat, el.lon]];
  }
  if(Array.isArray(el.geometry)){
    return el.geometry
      .filter(g => Number.isFinite(g.lat) && Number.isFinite(g.lon))
      .map(g => [g.lat, g.lon]);
  }
  return [];
}

function midpoint(coords){
  if(!coords?.length) return null;
  let lat=0,lng=0;
  coords.forEach(c=>{ lat+=c[0]; lng+=c[1]; });
  return [lat/coords.length, lng/coords.length];
}

function bboxCentre(coords){
  if(!coords?.length) return null;
  let minLat=Infinity,maxLat=-Infinity,minLng=Infinity,maxLng=-Infinity;
  for(const [lat,lng] of coords){
    minLat=Math.min(minLat,lat); maxLat=Math.max(maxLat,lat);
    minLng=Math.min(minLng,lng); maxLng=Math.max(maxLng,lng);
  }
  return [(minLat+maxLat)/2, (minLng+maxLng)/2];
}

function distCoord(a,b){
  if(!a||!b) return Infinity;
  return distNM(a[0],a[1],b[0],b[1]);
}

function indexAirfieldNetwork(elements){
  LPPT_OSM_NETWORK.loaded=false;
  LPPT_OSM_NETWORK.error=null;
  LPPT_OSM_NETWORK.ways=[];
  LPPT_OSM_NETWORK.taxiways=[];
  LPPT_OSM_NETWORK.runways=[];
  LPPT_OSM_NETWORK.parking=[];
  LPPT_OSM_NETWORK.holding=[];
  LPPT_OSM_NETWORK.byRef=new Map();
  LPPT_OSM_NETWORK.stands=new Map();

  for(const el of elements||[]){
    const tags = el.tags || {};
    const aeroway = tags.aeroway || '';
    const coords = coordsFromElement(el);
    if(!coords.length) continue;
    const refs = refTokensFromTags(tags);
    const item = {
      id:`${el.type}/${el.id}`,
      type:el.type,
      aeroway,
      refs,
      tags,
      coords,
      centre: midpoint(coords) || bboxCentre(coords)
    };

    if(el.type === 'way') LPPT_OSM_NETWORK.ways.push(item);
    if(aeroway === 'taxiway' || aeroway === 'taxilane') LPPT_OSM_NETWORK.taxiways.push(item);
    if(aeroway === 'runway') LPPT_OSM_NETWORK.runways.push(item);
    if(aeroway === 'holding_position') LPPT_OSM_NETWORK.holding.push(item);
    if(aeroway === 'parking_position'){
      LPPT_OSM_NETWORK.parking.push(item);
      // stand refs are often purely numeric; use both ref and name tokens.
      for(const r of refs){
        if(/^\d{1,4}[A-Z]?$/.test(r) && !LPPT_OSM_NETWORK.stands.has(r)){
          LPPT_OSM_NETWORK.stands.set(r, item.centre || coords[0]);
        }
      }
    }

    for(const r of refs){
      if(!LPPT_OSM_NETWORK.byRef.has(r)) LPPT_OSM_NETWORK.byRef.set(r, []);
      LPPT_OSM_NETWORK.byRef.get(r).push(item);
    }
  }

  LPPT_OSM_NETWORK.loaded=true;
  LPPT_OSM_NETWORK.fetchedAt=new Date().toISOString();
  appLog?.('info', `Rede OSM LPPT indexada: ${LPPT_OSM_NETWORK.taxiways.length} taxiways/taxilanes, ${LPPT_OSM_NETWORK.runways.length} pistas, ${LPPT_OSM_NETWORK.stands.size} stands.`);
}

function readCachedAirfieldNetwork(){
  try{
    const raw = localStorage.getItem(LPPT_OSM_CFG.cacheKey);
    if(!raw) return false;
    const cached = JSON.parse(raw);
    if(!cached?.elements || !cached?.ts) return false;
    const ageDays = (Date.now() - cached.ts) / 86400000;
    if(ageDays > LPPT_OSM_CFG.cacheMaxAgeDays) return false;
    indexAirfieldNetwork(cached.elements);
    LPPT_OSM_NETWORK.source='localStorage';
    appLog?.('info', `Rede OSM LPPT carregada da cache local (${ageDays.toFixed(1)} dias).`);
    return true;
  }catch(e){
    appLog?.('warn','Cache OSM LPPT inválida', e.message || String(e));
    return false;
  }
}

function cacheAirfieldNetwork(elements){
  try{
    localStorage.setItem(LPPT_OSM_CFG.cacheKey, JSON.stringify({ts:Date.now(), elements}));
  }catch(e){
    appLog?.('warn','Não foi possível gravar cache OSM LPPT', e.message || String(e));
  }
}

async function loadLpptOsmNetwork(force=false){
  if(LPPT_OSM_NETWORK.loading) return false;
  if(!force && LPPT_OSM_NETWORK.loaded) return true;
  if(!force && readCachedAirfieldNetwork()) return true;

  LPPT_OSM_NETWORK.loading=true;
  const query = airfieldOsmQuery();
  for(const endpoint of LPPT_OSM_CFG.endpoints){
    try{
      appLog?.('info', `A carregar rede OSM LPPT via Overpass: ${endpoint}`);
      const res = await fetch(endpoint, {
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:'data='+encodeURIComponent(query)
      });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const elements = json.elements || [];
      if(!elements.length) throw new Error('Overpass devolveu 0 elementos');
      indexAirfieldNetwork(elements);
      cacheAirfieldNetwork(elements);
      LPPT_OSM_NETWORK.source=endpoint;
      LPPT_OSM_NETWORK.loading=false;
      if(typeof refresh === 'function') refresh();
      return true;
    }catch(e){
      LPPT_OSM_NETWORK.error = e.message || String(e);
      appLog?.('warn', `Falha ao carregar rede OSM LPPT em ${endpoint}`, LPPT_OSM_NETWORK.error);
    }
  }
  LPPT_OSM_NETWORK.loading=false;
  appLog?.('warn','Rede OSM LPPT indisponível; a app usará fallback aproximado.');
  return false;
}

function airfieldStandCoord(standNum){
  const s0 = String(standNum||'').trim().toUpperCase();
  if(!s0) return null;
  const candidates = [s0, String(parseInt(s0)||'')].filter(Boolean);
  for(const s of candidates){
    if(LPPT_OSM_NETWORK.stands.has(s)) return LPPT_OSM_NETWORK.stands.get(s);
  }
  return null;
}

function getAirfieldWayCandidates(token){
  const t = normaliseTwyRef(token);
  if(!t || !LPPT_OSM_NETWORK.loaded) return [];
  let c = LPPT_OSM_NETWORK.byRef.get(t) || [];
  // Prefer taxiway/taxilane ways over nodes/parking.
  c = c.filter(x => (x.aeroway === 'taxiway' || x.aeroway === 'taxilane') && x.coords.length >= 2);
  if(c.length) return c;

  // Fallback for refs stored as composite text, e.g. "M1;M2" or names.
  const out=[];
  for(const item of LPPT_OSM_NETWORK.taxiways){
    if(item.refs.includes(t)) out.push(item);
  }
  return out;
}

function orientCoords(coords, previousPoint){
  if(!coords?.length) return [];
  if(!previousPoint || coords.length < 2) return coords.slice();
  const dStart = distCoord(previousPoint, coords[0]);
  const dEnd   = distCoord(previousPoint, coords[coords.length-1]);
  return dEnd < dStart ? coords.slice().reverse() : coords.slice();
}

function chooseWayForToken(token, previousPoint){
  const candidates = getAirfieldWayCandidates(token);
  if(!candidates.length) return null;
  if(!previousPoint) return candidates[0];
  let best=null, bestD=Infinity;
  for(const c of candidates){
    const d = Math.min(distCoord(previousPoint, c.coords[0]), distCoord(previousPoint, c.coords[c.coords.length-1]));
    if(d < bestD){ bestD=d; best=c; }
  }
  return best;
}

function appendCoordsPath(out, coords, label, kind='twy'){
  for(const c of coords){
    if(!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const last = out[out.length-1];
    if(last && Math.abs(last.lat-c[0]) < 1e-7 && Math.abs(last.lng-c[1]) < 1e-7) continue;
    out.push({lat:c[0], lng:c[1], label, kind});
  }
}

function buildOsmPolylineRouteFromTokens(tokens, startCoord=null, endCoord=null){
  if(!LPPT_OSM_NETWORK.loaded || !Array.isArray(tokens) || !tokens.length) return null;
  const out=[];
  let prev = startCoord || null;
  if(startCoord) out.push({lat:startCoord[0], lng:startCoord[1], label:'start', kind:'start'});

  let used=0;
  for(const tok of tokens){
    const way = chooseWayForToken(tok, prev);
    if(!way) continue;
    const coords = orientCoords(way.coords, prev);
    appendCoordsPath(out, coords, tok, 'twy');
    prev = coords[coords.length-1];
    used++;
  }

  if(endCoord) appendCoordsPath(out, [endCoord], 'end', 'end');
  if(used === 0 || out.length < 2) return null;
  return out;
}

// Legacy name used across the app — may be replaced by the graph router wrapper.
function buildAirfieldRouteFromTokens(tokens, startCoord=null, endCoord=null){
  return buildOsmPolylineRouteFromTokens(tokens, startCoord, endCoord);
}

function osmNetworkSummary(){
  return {
    loaded: LPPT_OSM_NETWORK.loaded,
    loading: LPPT_OSM_NETWORK.loading,
    source: LPPT_OSM_NETWORK.source,
    taxiways: LPPT_OSM_NETWORK.taxiways.length,
    runways: LPPT_OSM_NETWORK.runways.length,
    stands: LPPT_OSM_NETWORK.stands.size,
    error: LPPT_OSM_NETWORK.error
  };
}
