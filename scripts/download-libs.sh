#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

download(){
  url="$1"; out="$2"
  mkdir -p "$(dirname "$ROOT/$out")"
  echo "A descarregar $url -> $out"
  curl -L "$url" -o "$ROOT/$out"
}

download "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" "libs/leaflet/leaflet.css"
download "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" "libs/leaflet/leaflet.js"
download "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" "libs/chartjs/chart.umd.min.js"
download "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js" "libs/papaparse/papaparse.min.js"
download "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" "libs/xlsx/xlsx.full.min.js"
download "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" "libs/html2canvas/html2canvas.min.js"

echo "Concluído. Pode abrir index.html sem CDNs externas."
