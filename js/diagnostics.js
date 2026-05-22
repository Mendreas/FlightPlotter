const APP_DIAG = { log: [], errorsInstalled:false, lastFilesSummary:null };

function appLog(level, msg, detail=null) {
  const ts = new Date().toLocaleTimeString('pt-PT', {hour12:false});
  const item = {ts, level, msg:String(msg||''), detail};
  APP_DIAG.log.push(item);
  if(APP_DIAG.log.length > 250) APP_DIAG.log.shift();
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[FlightPlotter ${level}] ${item.msg}`, detail ?? '');
  if(document.getElementById('diag-modal')?.classList.contains('on')) renderDiagnostics();
}

function installGlobalErrorHandlers() {
  if(APP_DIAG.errorsInstalled) return;
  APP_DIAG.errorsInstalled = true;
  window.addEventListener('error', e => appLog('error', e.message || 'Erro JavaScript', {source:e.filename, line:e.lineno, col:e.colno}));
  window.addEventListener('unhandledrejection', e => appLog('error', 'Erro assíncrono não tratado', String(e.reason?.message || e.reason || '')));
}

function getColumnsFromRows(rows){
  if(!rows || !rows.length) return [];
  const cols = new Set();
  for(let i=0; i<Math.min(rows.length,25); i++) Object.keys(rows[i]||{}).forEach(k=>cols.add(k));
  return [...cols];
}
function validateRows(label, rows, required){
  if(!rows || !rows.length) throw new Error(`${label}: ficheiro sem linhas úteis.`);
  const cols = getColumnsFromRows(rows);
  const missing = required.filter(c=>!cols.includes(c));
  if(missing.length) {
    throw new Error(`${label}: faltam colunas obrigatórias: ${missing.join(', ')}. Colunas detetadas: ${cols.slice(0,35).join(', ')}`);
  }
  appLog('info', `${label}: ${rows.length} linhas lidas; colunas essenciais OK.`);
  return true;
}
function validateHeader(label, headers, required){
  const missing = required.filter(c=>!headers.includes(c));
  if(missing.length) throw new Error(`${label}: faltam colunas obrigatórias: ${missing.join(', ')}.`);
  appLog('info', `${label}: cabeçalho validado (${headers.length} colunas).`);
}
function diagClass(level){ return level==='error'?'diag-error':level==='warn'?'diag-warn':'diag-ok'; }
function diagRow(k,v){ return `<div class="diag-row"><div class="diag-k">${esc(k)}</div><div class="diag-v">${esc(v)}</div></div>`; }
function renderDiagnostics(){
  const body = document.getElementById('diag-body');
  if(!body) return;
  const days = [...dayFiles.keys()].sort();
  const opdiKeys = [...opdiFiles.keys()].sort();
  const logTxt = APP_DIAG.log.slice(-80).map(x=>`[${x.ts}] ${x.level.toUpperCase()} — ${x.msg}${x.detail?`\n  ${typeof x.detail==='string'?x.detail:JSON.stringify(x.detail)}`:''}`).join('\n');
  body.innerHTML = `
    <div class="diag-grid">
      <div class="diag-card"><h4>Tracks radar</h4><div class="diag-num">${safeNum(tracks.size)}</div></div>
      <div class="diag-card"><h4>NMIR</h4><div class="diag-num">${safeNum(nmirMap.size)}</div></div>
      <div class="diag-card"><h4>NAV</h4><div class="diag-num">${safeNum(navMap.size)}</div></div>
      <div class="diag-card"><h4>OPDI solo</h4><div class="diag-num">${safeNum(opdiTracks.size)}</div></div>
      <div class="diag-card"><h4>Stands OPDI</h4><div class="diag-num">${safeNum(standPosCache.size)}</div></div>
      <div class="diag-card"><h4>OpenSky cache</h4><div class="diag-num">${safeNum(osCache.size)}</div></div>
    </div>
    <div class="diag-list">
      ${diagRow('Versão', APP_CFG.version)}
      ${diagRow('Dia ativo', dayKey ? fmtDateKey(dayKey) : '—')}
      ${diagRow('Intervalo', `${s2hms(tMin||0)} – ${s2hms(tMax||0)}`)}
      ${diagRow('Filtro horário', `${s2hms(fStart||0)} – ${s2hms(fEnd||0)}`)}
      ${diagRow('Modo externo', APP_CFG.allowExternalEnrichment ? 'ON — permite chamadas à OpenSky' : 'OFF — bloqueado por defeito')}
      ${diagRow('Worker PapaParse', APP_CFG.papaWorker ? 'Ativo' : 'Inativo')}
      ${diagRow('Limite tabelas', APP_CFG.maxTableRows)}
      ${diagRow('Dias tracker', days.length ? days.map(fmtDateKey).join(', ') : '—')}
      ${diagRow('NMIR ficheiro', nmirXlsx?.name || '—')}
      ${diagRow('NAV ficheiro', navFile?.name || '—')}
      ${diagRow('OPDI datas', opdiKeys.length ? opdiKeys.join(', ') : '—')}
      ${diagRow('Resumo último upload', APP_DIAG.lastFilesSummary || '—')}
    </div>
    <div style="font-weight:700;color:#1466b0;margin:10px 0 6px">Registo recente</div>
    <div class="diag-log">${esc(logTxt || 'Sem registos ainda.')}</div>`;
}
function openDiagnostics(){ renderDiagnostics(); document.getElementById('diag-modal')?.classList.add('on'); }
function closeDiagnostics(){ document.getElementById('diag-modal')?.classList.remove('on'); }
async function copyDiagnostics(){
  renderDiagnostics();
  const text = APP_DIAG.log.map(x=>`[${x.ts}] ${x.level.toUpperCase()} — ${x.msg}`).join('\n');
  try { await navigator.clipboard.writeText(text); appLog('info','Diagnóstico copiado para a área de transferência.'); }
  catch(_) { alert(text || 'Sem diagnóstico para copiar.'); }
}

