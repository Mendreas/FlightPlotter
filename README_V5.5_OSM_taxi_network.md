# FlightPlotter V5.5 — OSM taxi-network

Esta versão adiciona uma primeira rede geométrica de circulação no solo baseada no OpenStreetMap/Overpass.

## Objetivo

A animação NAV de solo deixa de ligar diretamente pontos/centroides e passa a tentar seguir a geometria real dos taxiways publicados no OpenStreetMap, usando as sequências do ficheiro NAV LPPT, por exemplo:

`A2 M1 M2 M3 M4 M5`

## Ficheiros novos/alterados

- `js/lppt_airfield_network.js` — descarrega/indexa a rede OSM LPPT via Overpass e guarda em `localStorage`.
- `js/nav.js` — usa a rede OSM para construir rotas de taxi quando disponível; mantém fallback aproximado.
- `js/boot.js` — arranca o carregamento assíncrono da rede OSM.
- `index.html` e `index_TESTE_CDN.html` — incluem o novo ficheiro JS antes de `nav.js`.
- `js/config.js` — versão atualizada para `5.5 OSM taxi-network`.

## Notas importantes

1. A rede OSM é carregada no browser através da API Overpass.
2. Depois de carregada, fica em cache local por 30 dias.
3. Se Overpass estiver indisponível, a app continua a funcionar com o fallback aproximado.
4. A qualidade depende da completude dos dados OSM para LPPT.
5. Para uma qualidade equivalente a CCPM/Eurocontrol será necessário validar/corrigir a rede, stands e ligações runway/taxiway com dados oficiais ou revisão manual.

## GitHub

Substituir/adicionar estes ficheiros no repositório:

- `index.html`
- `index_TESTE_CDN.html` se existir
- `js/config.js`
- `js/boot.js`
- `js/nav.js`
- `js/lppt_airfield_network.js` novo

