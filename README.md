# Flight Plotter v2

Análise de trajetórias radar (CSV do CNS) para os aeroportos LPPT, LPPR, LPFR e LPMA.
Reescrita da antiga app HTML (FlightTracker) com um objetivo: **ler os dados muito mais depressa.**

## Como funciona

```
CSV do CNS ──(importa 1 vez)──►  base DuckDB local  ──(SQL, ms)──►  mapa / tabela / análises
```

* **Importar** (botão *Importar pasta…*): escolhe-se a pasta com os CSV (subpastas incluídas).
  Cada ficheiro é lido uma única vez e guardado tipado (números, tempos) na base
  `flightplotter.duckdb`. Ficheiros já importados são ignorados; alterados são substituídos.
* **Consultar**: dias, blocos horários, callsign e classe (chegada / partida / sobrevoo) são
  consultas SQL sobre a base — milissegundos, mesmo com meses de dados.
* **Movimentos**: um callsign no mesmo dia é separado em movimentos distintos quando há um
  intervalo sem plots superior a 300 s. Classificação pela variação de altitude (±500 ft).
* **NMIR**: a base já inclui 46 060 registos callsign→tipo de aeronave; novos Excel NMIR
  importam-se pelo botão *NMIR…*.

A base fica em `%LOCALAPPDATA%\FlightPlotter\` (botão 🗄 abre a pasta).

## Correr em desenvolvimento (Windows)

1. Instalar Python 3.11 ou superior (marcar *Add Python to PATH*).
2. Na pasta do projeto: `python -m pip install -r requirements.txt`
3. `python app.py`

## Gerar o executável

* Localmente: duplo clique em `build_windows.bat` → `dist\FlightPlotter.exe`
* Automático: cada *push* para `main` gera o `.exe` no GitHub Actions
  (separador *Actions* → último run → *Artifacts* → `FlightPlotter-windows`).

## Dados de teste

```
python tools/gerar_csv_teste.py csv_teste 30 40
```
cria 30 dias × 6 blocos de CSV sintéticos em `csv_teste/` para experimentar sem dados reais.

## Estrutura

```
app.py              janela (pywebview) + API chamada pelo JavaScript
core/db.py          DuckDB: importação, tabela de movimentos, consultas
core/filenames.py   interpretação dos nomes LPPT_260415_04-08.csv / LPFR_2026-03-01_00-04.csv
ui/                 interface (HTML/CSS/JS) com Leaflet local
data/               pontos AIP, grupos de pontos, NMIR inicial
tools/              utilitários (gerador de CSV de teste)
```

## Formato dos CSV

Separador `;` ou `,`, cabeçalho na 1ª linha. Colunas reconhecidas (maiúsculas/minúsculas indiferente):
`CSN` (callsign), `TOD` (hh:mm:ss), `LATITUDE`/`LAT`, `LONGITUDE`/`LON`, `MODEC` ou `BAROH`
(altitude; valores < 600 são FL ×100), `TAS`, `IAR`/`IAS`, `ROC`, `GSPA`, `MODES`, `MODEA`, `TRKNR`.
A data e o bloco vêm do nome do ficheiro (ou da pasta); o bloco é confirmado pela hora mínima dos dados.
