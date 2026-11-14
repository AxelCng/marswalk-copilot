# data/ — pipeline de datos (Pedro, L1)

Pipeline geoespacial: descargas USGS SIM 3464 → rasters recortados y
reproyectados a MTM 77.5°E → `graph.json` real.

El producto de esta etapa **no es el grafo**: son los rasters alineados y los
waypoints en metros que la etapa siguiente (mapa de costo y aristas) necesita.

## Estructura

```
data/
├── README.md
├── requirements.txt
├── pipeline/                    # un módulo por paso
│   ├── crs.py                   # MTM 77.5°E sobre la esfera de Marte
│   ├── rutas.py                 # rutas del proyecto y capas de entrada
│   ├── aoi.py                   # paso 00: ventana de recorte
│   ├── dim_map.py               # paso 00: metadatos del mapa
│   ├── rasters.py               # paso 10: recorte + reproyección
│   ├── waypoints.py             # paso 20: estaciones a MTM
│   ├── geologia.py              # paso 30: modelo estrella
│   ├── verificar.py             # paso 40: controles
│   └── correr.py                # CLI
├── tests/test_pipeline.py       # 20 pruebas
├── raw/sim3464/                 # descargas (gitignored)
└── out/                         # productos
```

## Cómo correrlo

```bash
pip install -r data/requirements.txt

python -m data.pipeline.correr --paso 00     # AOI y dim_map
python -m data.pipeline.correr --paso 10     # rasters
python -m data.pipeline.correr --paso 20     # waypoints
python -m data.pipeline.correr --paso 30     # geología
python -m data.pipeline.correr --paso 40     # verificación
python -m data.pipeline.correr --paso todo

python -m pytest data/tests -q
```

## Productos

| Archivo | Contenido |
| --- | --- |
| `out/aoi.json` | Ventana de recorte: bbox MTM y lon/lat, malla, CRS |
| `out/dim_map.json` | Metadatos del mapa: CRS, datum, escala, extensión |
| `out/estaciones_mtm.csv` | Las 8 estaciones en MTM, en lon/lat y en píxel |
| `out/rasters/*.tif` | 8 capas en la misma malla (gitignored) |
| `out/rasters/malla.json` | Manifiesto de la malla compartida |
| `out/geologia.geojson` | Capa geológica aplanada en lon/lat (la consume `web/map`) |
| `out/geologia/*.json` | 4 dimensiones + `fact_map_feature` |
| `out/verificacion.json` | Resultado de los controles |
| `out/graph.json` | Grafo real (etapa siguiente) |

## Resultado actual

- **AOI**: 194 × 141 px a 20 m = 3.88 × 2.82 km = **10.94 km²**
- **MTM**: `x −6060…−2180`, `y 1092000…1094820`, `crs_name = MTM 77.5E`,
  `datum = Mars_2000_(Sphere)`
- **8 capas comparten malla exacta**, 100 % de celdas válidas, 0 huecos interiores
- **Pendiente** (derivada de la DTM): media 3.58°, p99 21.8°, **2.57 % > 15°**
- **Desplazamiento** por anclar a la celda: máximo 12.98 m (tope teórico 14.14 m)
- **Ida y vuelta** MTM ↔ lon/lat: peor desvío 6.79e-09°
- **Geología**: 23 rasgos en el AOI (de 4 808 en el mapa completo), 14 unidades,
  10 tipos, 2 contextos espaciales

## Capas de entrada y por qué cada una

| Capa | Fuente | CRS de origen | Por qué |
| --- | --- | --- | --- |
| `dtm` | CTX estéreo J03 20 m | Equirectangular | Elevación y pendiente; es la base del costo |
| `orto` | CTX J03 6 m | Equirectangular | Mapa base de detalle |
| `orto_mosaico` | Mosaico CTX Caltech 5 m | MTM | Alternativa ya en MTM |
| `themis_dia` | THEMIS día 100 m | MTM | Complemento térmico |
| `themis_noche` | THEMIS noche 100 m | MTM | Proxy roca (caliente) vs arena (fría) |
| `hrsc` | HRSC 75 m | MTM | Contraste de elevación |
| `hrsc_sombra` | Hillshade HRSC | MTM | Relieve para el mapa |
| `pendiente` | Derivada de `dtm` | — | Lo que consume el motor |

**El DTM crítico no estaba en MTM.** El spec dice que los rasters del SIM 3464
vienen en MTM, pero el DTM CTX estéreo de 20 m está en Equirectangular, con
píxel anisótropo (19.16 m en x, 20.20 m en y). Reproyectarlo es el paso central
de esta tarea, no un detalle.

## Dos cosas que el modelo estrella no dice y hay que saber

1. **`unit_code` no es clave única.** Los enteros `unit` 5 y 11 se repiten con
   símbolos distintos. La UK real es `unit_symbol` → 14 unidades, no 16.
2. **`dim_map` no sale de `MapBoundary`.** Esa capa tiene `LON_MIN`, `LON_MAX`,
   `LAT_MIN`, `LAT_MAX`, pero en `NULL`. Los valores salen del XML FGDC; el
   `crs_name` y el `datum`, del `.prj`.

Además, en `GeoContacts` el campo `TYPE` describe la **certeza** del contacto
(`certain` / `approximate` / `boundary`), no el tipo de rasgo.

## Pendiente conocido: sesgo vertical

El DTM queda **de +7 a +22 m por encima** de `elev_m` en `estaciones.csv`. No es
un error de alineación —las estaciones caen en la celda correcta y el
desplazamiento está verificado— sino una diferencia de datum vertical.

Al escribir `capas.elev_m` del grafo hay que elegir **una** fuente: el DTM o el
CSV. Mezclarlas en el mismo cálculo de pendiente sí sería un error.

## Descargas

No van a git (`data/raw/` está ignorado). Hacen falta para correr el pipeline:

1. Zip del mapa geológico USGS SIM 3464 (~350 MB): DTM CTX, THEMIS día/noche,
   geodatabase y metadatos
2. `M20_waypoints.json` de Perseverance (ya resumido en `estaciones.csv`)
