# Bibliotecas locais necessárias

Esta versão está preparada para uso interno/offline, por isso o `index.html` carrega as bibliotecas a partir da pasta `libs/`, e não de CDNs externas.

Colocar estes ficheiros:

- `libs/leaflet/leaflet.css`
- `libs/leaflet/leaflet.js`
- `libs/chartjs/chart.umd.min.js`
- `libs/papaparse/papaparse.min.js`
- `libs/xlsx/xlsx.full.min.js`
- `libs/html2canvas/html2canvas.min.js`

Pode executar `scripts/download-libs.ps1` num computador com internet para descarregar automaticamente as versões usadas pela aplicação original.
Depois, a pasta completa pode ser copiada para ambiente interno.
