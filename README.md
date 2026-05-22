# FlightPlotter V5.2 NAV-safe localhost fixed

Esta versão mantém o mapa base ligado por defeito, o OpenSky bloqueado por defeito e melhora o arranque local.

## Como abrir corretamente

Use sempre:

```text
ABRIR_APP.bat
```

ou abra manualmente:

```text
http://localhost:8000/index.html
```

Evite abrir `index.html` por duplo clique, porque o browser usa `file://` e pode gerar avisos como:

```text
Unsafe attempt to load URL file:///...
'file:' URLs are treated as unique security origins.
```

Esse aviso não indica falha nos dados; é uma restrição de segurança do browser para ficheiros locais.

## Bibliotecas locais

Se a pasta `libs/` estiver vazia, execute uma vez:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\download-libs.ps1
```

## Segurança

- Mapa base externo: ligado por defeito para melhor visualização.
- OpenSky/API externa: desligado por defeito.
- CSV/XLSX: processados localmente no browser.
