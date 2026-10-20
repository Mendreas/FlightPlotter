# FlightPlotter V5.3 — NAV ground taxi animation

Esta versão acrescenta representação de movimento no solo a partir dos dados NAV LPPT.

## Alterações principais

- Remove o overlay local de pistas/cabeceiras/etiqueta LPPT.
- Mantém o mapa base como referência principal.
- Usa `TAXI_IN` / `TAXI_OUT`, `AOBT`, `ATOT`, `ALDT`, `AIBT`, `RWY_ENT`, `RWY_VAC`, `HP`, `RWY`, `STANDD` e `STANDA` do ficheiro NAV LPPT para animar movimentos de solo.
- Para chegadas: quando a track radar termina, a aeronave continua em taxi-in desde a saída de pista até ao stand.
- Para partidas: antes da track radar começar, a aeronave aparece desde o stand até à entrada/cabeceira da pista.
- Se existir OPDI ativo no mesmo período, a representação OPDI tem prioridade sobre o movimento NAV sintético.
- A rota selecionada passa a ser desenhada preferencialmente a partir dos taxiways NAV.

## Ficheiros principais alterados

- `js/nav.js`
- `js/render.js`
- `js/opdi.js`
- `js/map.js`

## Limitação importante

A animação segue uma base de coordenadas aproximadas dos taxiways (`LPPT_TWY`). Para fidelidade igual à aplicação Eurocontrol, o próximo passo seria trocar essa tabela por uma rede completa de geometria aeroportuária: nós, segmentos, direção, restrições e rotas por RWY/stand.
