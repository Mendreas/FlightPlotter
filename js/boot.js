// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════
function showFileProtocolWarning(){
  if(location.protocol !== 'file:') return;
  const bar = document.createElement('div');
  bar.id = 'file-protocol-warning';
  bar.innerHTML = '⚠️ A app foi aberta por <b>file://</b>. Para evitar bloqueios do browser, abra através de <b>ABRIR_APP.bat</b> ou use <b>http://localhost:8000/index.html</b>.';
  document.body.prepend(bar);
}
window.addEventListener('DOMContentLoaded', ()=>{
  showFileProtocolWarning();
  init();
  // Load taxiway/stand geometry from OpenStreetMap asynchronously.
  // The app remains usable immediately; NAV ground routing switches to OSM
  // geometry as soon as the network is available.
  if(typeof loadLpptOsmNetwork === 'function') {
    loadLpptOsmNetwork(false).then(ok => {
      if(ok) appLog?.('info','Rede geométrica OSM LPPT pronta para animação de taxi.');
    });
  }
});
