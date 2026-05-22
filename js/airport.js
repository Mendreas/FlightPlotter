// ── LPPT Stand/Apron positions ────────────────────────────────
// Populated from OPDI parking events (actual GPS) + fallback apron centres
const standPosCache = new Map();  // 'STAND_NUM' → [lat,lng] from OPDI events

// Apron centres — corrected westward to actual apron positions
// (not on runway — runway lon at 38.780N ≈ -9.137W; stands are 400-800m further west)
const APRON_CENTRES = {
  '10':[38.7750,-9.1480],'11':[38.7782,-9.1485],'12':[38.7830,-9.1440],
  '14':[38.7680,-9.1510],'20':[38.7705,-9.1510],'22':[38.7740,-9.1490],
  '30':[38.7752,-9.1480],'40':[38.7760,-9.1465],'41':[38.7768,-9.1448],
  '42':[38.7785,-9.1432],'50':[38.7802,-9.1420],'60':[38.7842,-9.1400],
  '70':[38.7875,-9.1380],'80':[38.7920,-9.1342],
};

function gatePos(standNum, apron) {
  // 1. Best: actual GPS from OPDI parking events
  const s = String(parseInt(standNum)||0);
  if(standPosCache.has(s)) return standPosCache.get(s);
  // 2. Good: apron centre
  const a = String(parseInt(apron)||0);
  if(APRON_CENTRES[a]) return APRON_CENTRES[a];
  // 3. Fallback: rough T1 area
  return [38.7790, -9.1430];
}

// Estimated taxi time (seconds) from gate to runway by first known event type
// Used to back-calculate a synthetic gate time
const TAXI_LEAD = {
  'exit-parking_position': 0,   // already have gate
  'exit-apron': 120,
  'entry-taxiway': 240,
  'exit-taxiway': 360,
  'entry-runway': 600,
  'entry-threshold': 720,
  'take-off': 840,
  'landing': 0,                 // ARR: use tail estimate instead
  'exit-threshold': 120,
  'exit-runway': 240,
  'entry-taxiway_arr': 360,
  'entry-parking_position': 0
};
// Estimated time (seconds) AFTER last known event to reach gate (for ARR)
const TAXI_TAIL = {
  'exit-runway': 480,
  'exit-threshold': 600,
  'landing': 720,
  'entry-taxiway': 300,
  'exit-taxiway': 180,
  'entry-apron': 60,
  'entry-parking_position': 0
};
