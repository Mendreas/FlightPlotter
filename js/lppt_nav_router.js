// LPPT NAV taxiway graph router.
// Builds a lightweight graph from the OSM airfield network and resolves NAV taxi routes
// as connected geometry instead of taxiway centroids.
(function(){
  if(window.__LPPT_NAV_ROUTER__) return;
  window.__LPPT_NAV_ROUTER__ = true;
  console.info('[FlightPlotter] lppt_nav_router.js loaded');

  const ROUTER = {
    built:false,
    nodes:new Map(),
    edges:[],
    refs:new Map()
  };

  function norm(v){
    return String(v||'').toUpperCase().trim()
      .replace(/^TWY\s+/,'')
      .replace(/^TAXIWAY\s+/,'')
      .replace(/\s+/g,'');
  }

  function getOsmNetwork(){
    try {
      if(typeof LPPT_OSM_NETWORK !== 'undefined') return LPPT_OSM_NETWORK;
    } catch(e) {}
    return window.LPPT_OSM_NETWORK || null;
  }

  function keyOf(lat,lng){ return Math.round(lat*100000)+'|'+Math.round(lng*100000); }

  function dNM(a,b){
    if(!a || !b) return Infinity;
    return distNM(a.lat,a.lng,b.lat,b.lng);
  }

  function getNode(lat,lng,label){
    const k = keyOf(lat,lng);
    let n = ROUTER.nodes.get(k);
    if(!n){ n = {id:k, lat, lng, label:label||'', adj:[]}; ROUTER.nodes.set(k,n); }
    return n;
  }

  function addEdge(a,b,ref){
    if(!a || !b || a.id === b.id) return;
    const r = norm(ref);
    const w = dNM(a,b);
    const e1 = {from:a.id,to:b.id,w,ref:r};
    const e2 = {from:b.id,to:a.id,w,ref:r};
    a.adj.push(e1); b.adj.push(e2);
    ROUTER.edges.push(e1,e2);
    if(r){
      if(!ROUTER.refs.has(r)) ROUTER.refs.set(r,new Set());
      ROUTER.refs.get(r).add(a.id); ROUTER.refs.get(r).add(b.id);
    }
  }

  function itemRefs(item){
    const out = [];
    if(Array.isArray(item.refs)) out.push(...item.refs);
    const tags = item.tags || {};
    [tags.ref, tags.name, tags.designation, tags['ref:icao']].filter(Boolean).forEach(x=>{
      String(x).split(/[;,/|\s]+/).forEach(y=>out.push(y));
    });
    return [...new Set(out.map(norm).filter(Boolean))];
  }

  function buildGraph(){
    ROUTER.nodes.clear(); ROUTER.edges.length = 0; ROUTER.refs.clear();
    const net = getOsmNetwork();
    if(!net || !net.loaded || !Array.isArray(net.taxiways)){
      console.warn('[FlightPlotter] LPPT taxi graph not built: OSM network unavailable');
      return false;
    }
    for(const item of net.taxiways){
      const coords = item.coords || [];
      if(coords.length < 2) continue;
      const refs = itemRefs(item);
      const ref = refs[0] || '';
      for(let i=1;i<coords.length;i++){
        const a = coords[i-1], b = coords[i];
        if(!a || !b) continue;
        addEdge(getNode(a[0],a[1],ref), getNode(b[0],b[1],ref), ref);
      }
    }
    ROUTER.built = ROUTER.nodes.size > 0;
    console.info('[FlightPlotter] LPPT taxi graph built', ROUTER.nodes.size, 'nodes', ROUTER.edges.length, 'directed edges', ROUTER.refs.size, 'refs', [...ROUTER.refs.keys()].slice(0,30).join(','));
    return ROUTER.built;
  }

  function ensureGraph(){ return ROUTER.built || buildGraph(); }

  function nearestNodeToCoord(coord){
    if(!coord) return null;
    const p = Array.isArray(coord) ? {lat:coord[0],lng:coord[1]} : {lat:coord.lat,lng:coord.lng};
    let best=null, bd=Infinity;
    for(const n of ROUTER.nodes.values()){
      const d = dNM(p,n);
      if(d < bd){ bd=d; best=n; }
    }
    return best;
  }

  function nearestNodeForRef(ref, near){
    const r = norm(ref);
    const ids = ROUTER.refs.get(r);
    if(!ids || !ids.size) return null;
    let best=null, bd=Infinity;
    for(const id of ids){
      const n = ROUTER.nodes.get(id);
      if(!n) continue;
      const d = near ? dNM(near,n) : 0;
      if(d < bd){ bd=d; best=n; }
    }
    return best;
  }

  function dijkstra(startId,endId,allowedRefs=null){
    if(!startId || !endId) return null;
    if(startId === endId) return [startId];
    const allowed = allowedRefs ? new Set([...allowedRefs].map(norm)) : null;
    const dist = new Map([[startId,0]]), prev = new Map(), done = new Set();
    for(let guard=0; guard<5000; guard++){
      let u=null, best=Infinity;
      for(const [id,val] of dist){ if(!done.has(id) && val<best){ best=val; u=id; } }
      if(!u) break;
      if(u === endId) break;
      done.add(u);
      const node = ROUTER.nodes.get(u);
      if(!node) continue;
      for(const e of node.adj){
        if(allowed && e.ref && !allowed.has(e.ref)) continue;
        const nd = best + e.w;
        if(nd < (dist.get(e.to) ?? Infinity)){ dist.set(e.to,nd); prev.set(e.to,u); }
      }
    }
    if(!dist.has(endId)) return null;
    const path=[]; let cur=endId;
    while(cur){ path.push(cur); if(cur===startId) break; cur=prev.get(cur); }
    path.reverse();
    return path[0]===startId ? path : null;
  }

  function nodesToPoints(ids,label){
    const out=[];
    for(const id of ids||[]){ const n = ROUTER.nodes.get(id); if(n) out.push({lat:n.lat,lng:n.lng,label:label||n.label||'',kind:'graph'}); }
    return out;
  }

  function appendDedup(out, pts){
    for(const p of pts||[]){
      const last = out[out.length-1];
      if(last && Math.abs(last.lat-p.lat)<1e-7 && Math.abs(last.lng-p.lng)<1e-7) continue;
      out.push(p);
    }
  }

  window.buildLpptTaxiRouteGraph = function(tokens,startCoord=null,endCoord=null){
    if(!ensureGraph()) return null;
    const toks = (tokens||[]).map(norm).filter(Boolean);
    if(!toks.length) return null;
    const out=[];
    let current = startCoord ? nearestNodeToCoord(startCoord) : nearestNodeForRef(toks[0], null);
    if(!current) return null;
    if(startCoord) out.push({lat:startCoord[0],lng:startCoord[1],label:'start',kind:'start'});

    for(let i=0;i<toks.length;i++){
      const tok = toks[i];
      const nextTok = toks[i+1];
      let target = nextTok ? nearestNodeForRef(nextTok, current) : (endCoord ? nearestNodeToCoord(endCoord) : nearestNodeForRef(tok, current));
      if(!target) continue;
      const allowed = new Set([tok]); if(nextTok) allowed.add(nextTok);
      let path = dijkstra(current.id, target.id, allowed);
      if(!path) path = dijkstra(current.id, target.id, null);
      if(path){ appendDedup(out, nodesToPoints(path,tok)); current = target; }
    }
    if(endCoord) appendDedup(out,[{lat:endCoord[0],lng:endCoord[1],label:'end',kind:'end'}]);
    return out.length >= 2 ? out : null;
  };

  window.buildAirfieldRouteFromTokens = function(tokens,startCoord=null,endCoord=null){
    return window.buildLpptTaxiRouteGraph(tokens,startCoord,endCoord);
  };

  window.lpptTaxiRouterSummary = function(){
    return {built:ROUTER.built,nodes:ROUTER.nodes.size,edges:ROUTER.edges.length,refs:[...ROUTER.refs.keys()]};
  };
})();
