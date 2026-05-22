// ═══════════════════════════════════════════════════════════════
// FILE HANDLING
// ═══════════════════════════════════════════════════════════════
function handleFiles(fileList) {
  const all   = [...fileList];
  if(!all.length) return;
  appLog('info', `Upload recebido: ${all.length} ficheiro(s).`);
  const xlsxs = all.filter(f=>f.name.toLowerCase().endsWith('.xlsx'));
  const allCsvs = all.filter(f=>f.name.toLowerCase().endsWith('.csv'));

  // Separate OPDI CSVs, NAV CSVs and radar CSVs
  const opdiCsvs  = allCsvs.filter(f=>/opdi_lppt_\d{8}/i.test(f.name));
  const navCsvs   = allCsvs.filter(f=>/ALL_LPPT/i.test(f.name));
  const radarCsvs = allCsvs.filter(f=>!/opdi_lppt_\d{8}/i.test(f.name)
                                      && !/runways_lppt/i.test(f.name)
                                      && !/ALL_LPPT/i.test(f.name));

  if(xlsxs.length) nmirXlsx = xlsxs.find(f=>/\d{4}/.test(f.name)) || xlsxs[0];
  if(navCsvs.length) navFile = navCsvs[0];
  APP_DIAG.lastFilesSummary = `radar=${radarCsvs.length}; OPDI=${opdiCsvs.length}; NAV=${navCsvs.length}; XLSX/NMIR=${xlsxs.length}`;
  appLog('info', 'Classificação de ficheiros: '+APP_DIAG.lastFilesSummary);

  // Index OPDI files by date key (20260301)
  opdiFiles.clear();
  opdiCsvs.forEach(f=>{
    const m = f.name.match(/opdi_lppt_(\d{8})/i);
    if(m) opdiFiles.set(m[1], f);
  });

  if(!radarCsvs.length) { appLog('warn','Nenhum ficheiro CSV de radar encontrado no upload.'); return alert('Nenhum ficheiro CSV de radar encontrado.'); }

  dayFiles.clear();
  radarCsvs.forEach(f=>{
    const dk = extractDateKey(f.name);
    if(!dayFiles.has(dk)) dayFiles.set(dk,[]);
    dayFiles.get(dk).push(f);
  });

  const days = [...dayFiles.keys()].sort();
  const sel  = document.getElementById('day-sel');
  sel.innerHTML = days.map(d=>`<option value="${esc(d)}">${esc(fmtDateKey(d))}</option>`).join('');
  sel.style.display = days.length>1 ? '' : 'none';
  loadDay(days[0]);
}

// ── Load NMIR independently (after tracker already loaded) ──
async function handleNmirFile(fileList) {
  const f = [...fileList].find(f=>f.name.toLowerCase().endsWith('.xlsx'));
  if(!f) return alert('Seleccione um ficheiro .xlsx do NMIR.');
  if(!dayKey) return alert('Carregue primeiro os dados de tracker.');
  nmirXlsx = f;
  showLD('A carregar NMIR…');
  try {
    await loadNMIR(f, dayKey);
    enrichWithNMIR();
    reclassifyTracks();
    calcStats();
    updVisibleLabels();
    document.getElementById('btn-nmir').classList.add('active');
    document.getElementById('btn-nmir').title = `NMIR: ${f.name}`;
  } catch(e) { console.error(e); alert('Erro ao carregar NMIR: '+e.message); }
  hideLD();
}

// ── Load OPDI independently (after tracker already loaded) ──
async function handleOpdiFiles(fileList) {
  const files = [...fileList].filter(f=>/opdi_lppt_\d{8}/i.test(f.name));
  if(!files.length) return alert('Nenhum ficheiro OPDI válido (opdi_LPPT_YYYYMMDD.csv).');
  if(!dayKey) return alert('Carregue primeiro os dados de tracker.');

  // Index by date key
  files.forEach(f=>{
    const m=f.name.match(/opdi_lppt_(\d{8})/i);
    if(m) opdiFiles.set(m[1], f);
  });

  const opdiKey = fmtDateKey(dayKey).replace(/-/g,'');
  if(!opdiFiles.has(opdiKey)){
    return alert(`Nenhum ficheiro OPDI para o dia ${fmtDateKey(dayKey)}.\nFicheiro esperado: opdi_LPPT_${opdiKey}.csv`);
  }

  showLD('A carregar OPDI…');
  try {
    // Clear previous OPDI data
    opdiTracks.clear();
    clearOpdiMarkers();
    await loadOpdiCsv(opdiFiles.get(opdiKey));
    reclassifyTracks();
    opdiVisible = map.getZoom() >= OPDI_ZOOM;
    if(opdiVisible) renderOpdiLayer(simT);
    document.getElementById('btn-opdi').classList.add('active');
    document.getElementById('btn-opdi').title = `OPDI: ${files[0].name}`;
  } catch(e) { console.error(e); alert('Erro ao carregar OPDI: '+e.message); }
  hideLD();
}

// ── Load NAV independently ──────────────────────────────────
async function handleNavFile(file) {
  if(!file) return;
  if(!dayKey) return alert('Carregue primeiro os dados de tracker.');
  navFile = file;
  showLD('A carregar dados NAV…');
  try {
    await loadNavCsv(file);
    reclassifyTracks();
    enrichWithNav();
    updVisibleLabels();
    document.getElementById('btn-nav')?.classList.add('active');
    document.getElementById('btn-nav').title = `NAV: ${navMap.size} movimentos`;
  } catch(e) { console.error(e); alert('Erro ao carregar NAV: '+e.message); }
  hideLD();
}

function extractDateKey(name) {
  const m = name.match(/_(\d{6})_/) || name.match(/_(\d{8})_/);
  return m ? m[1] : 'dia';
}

function fmtDateKey(k) {
  if(k.length===6) return `20${k.slice(0,2)}-${k.slice(2,4)}-${k.slice(4,6)}`;
  if(k.length===8) return `${k.slice(0,4)}-${k.slice(4,6)}-${k.slice(6,8)}`;
  return k;
}

async function loadDay(dk) {
  dayKey = dk;
  showLD('A carregar CSVs…');
  clearAll();

  try {
    const rows = await parseFiles(dayFiles.get(dk)||[]);
    validateRows('Tracker/radar', rows, ['trkNr','tod','latitude','longitude']);
    buildTracks(rows);
    appLog('info', `Tracks construídas: ${tracks.size}. Intervalo ${s2hms(tMin)} – ${s2hms(tMax)}.`);
    applyTimeFilter();
    renderDay();
    // Mark tracker button as loaded
    const btnTracker = document.getElementById('btn-tracker');
    if(btnTracker){ btnTracker.classList.add('active'); btnTracker.title=`Tracker: ${tracks.size} tracks`; }
    if(nmirXlsx) {
      showLD('A carregar dados NMIR…');
      await loadNMIR(nmirXlsx, dk);
      enrichWithNMIR();
      document.getElementById('btn-nmir')?.classList.add('active');
    }
    if(navFile) {
      showLD('A carregar dados NAV…');
      await loadNavCsv(navFile);
      enrichWithNav();
      document.getElementById('btn-nav')?.classList.add('active');
    }
    // Load OPDI ground data for this day
    const opdiKey = fmtDateKey(dk).replace(/-/g,'');
    if(opdiFiles.has(opdiKey)) {
      showLD('A carregar dados OPDI…');
      await loadOpdiCsv(opdiFiles.get(opdiKey));
      opdiVisible = map.getZoom() >= OPDI_ZOOM;
      if(opdiVisible) renderOpdiLayer(simT);
      document.getElementById('btn-opdi')?.classList.add('active');
    }
    // Reclassify using ADEP/ADES from NMIR/OPDI (overrides geometric guess)
    reclassifyTracks();
    if(navMap.size) enrichWithNav();
    calcStats();  // recalc stats with correct types
    if(APP_CFG.allowExternalEnrichment) fetchAllOS(dk);
    else appLog('info','Enriquecimento OpenSky não executado: modo externo OFF.');
    refresh();
  } catch(e) {
    console.error(e);
    alert('Erro ao carregar: '+e.message);
  }
  hideLD();
}

async function parseFiles(files) {
  const all = [];
  for(const f of files) {
    appLog('info', `A ler tracker: ${f.name}`);
    const r = await new Promise((ok,fail)=>Papa.parse(f,{
      header:true,skipEmptyLines:true,dynamicTyping:true,worker:APP_CFG.papaWorker,
      complete:r=>ok(r.data),error:fail
    }));
    appLog('info', `Tracker lido: ${f.name} — ${r.length} linhas.`);
    all.push(...r);
  }
  return all;
}
