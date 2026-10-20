# FlightPlotter V5.4 — NAV ground handoff

Correção da V5.3:

- O marcador radar é suprimido durante a fase de solo definida pelo NAV, evitando que a aeronave desapareça na pista ou salte para meio da pista.
- Chegadas: a animação NAV começa no último ponto radar/ALDT/RWY_VAC e segue até ao stand/AIBT.
- Partidas: a animação NAV começa no stand/AOBT e segue até à primeira posição radar/RWY_ENT/ATOT.
- A linha tracejada estranha baseada em centroides NAV foi removida. Só é desenhada rota quando há OPDI GPS real.
- OPDI mantém prioridade quando existir movimento de solo real para o callsign.

Nota: esta versão melhora o handoff e a continuidade visual. Para precisão ao nível CCPM/Eurocontrol é necessária uma rede geométrica completa dos taxiways com nós, arcos e regras de circulação.
