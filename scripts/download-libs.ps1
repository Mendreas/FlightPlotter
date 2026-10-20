$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$items = @(
  @{ Url="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; Out="libs/leaflet/leaflet.css" },
  @{ Url="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; Out="libs/leaflet/leaflet.js" },
  @{ Url="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"; Out="libs/chartjs/chart.umd.min.js" },
  @{ Url="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"; Out="libs/papaparse/papaparse.min.js" },
  @{ Url="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; Out="libs/xlsx/xlsx.full.min.js" },
  @{ Url="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"; Out="libs/html2canvas/html2canvas.min.js" }
)

foreach($item in $items){
  $target = Join-Path $root $item.Out
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  Write-Host "A descarregar $($item.Url) -> $($item.Out)"
  Invoke-WebRequest -Uri $item.Url -OutFile $target
}

Write-Host "Concluído. Pode abrir index.html sem CDNs externas."
