# data/ — pipeline de datos (Pedro, L1)

Pipeline geoespacial completo: descargas USGS SIM 3464 → rasters alineados en
MTM 77.5°E → mapa de costo → `graph.json` real.

## Estructura

```
data/
├── README.md
├── HALLAZGO_pendiente_demo.md   # por qué la demo de pendiente no se sostiene
├── requirements.txt
├── pipeline/                    # un módulo por paso
│   ├── crs.py                   # MTM 77.5°E sobre la esfera de Marte
│   ├── rutas.py                 # rutas y capas de entrada
│   ├── parametros.py            # lectura de params.yaml
│   ├── aoi.py                   # 00: ventana de recorte
│   ├── dim_map.py               # 00: metadatos del mapa
│   ├── rasters.py               # 10: recorte + reproyección
│   ├── waypoints.py             # 20: estaciones a MTM
│   ├── geologia.py              # 30: modelo estrella
│   ├── verificar.py             # 40: controles de la malla
│   ├── costo.py                 # 50: mapa de costo
│   ├── aristas.py               # 60: caminos y atributos
│   ├── _relieve.py              # blindaje, sombra, cobertura, zonas
│   ├── graph.py                 # 70: graph.json real
│   └── correr.py                # CLI
├── tests/                       # 37 pruebas
├── raw/sim3464/                 # descargas (gitignored)
└── out/                         # productos
```

## Cómo correrlo

```bash
pip install -r data/requirements.txt
python -m data.pipeline.correr --paso 00   # AOI y dim_map
python -m data.pipeline.correr --paso 10   # rasters
python -m data.pipeline.correr --paso 20   # waypoints
python -m data.pipeline.correr --paso 30   # geología
python -m data.pipeline.correr --paso 40   # verificación
python -m data.pipeline.correr --paso 50   # mapa de costo
python -m data.pipeline.correr --paso 60   # aristas
python -m data.pipeline.correr --paso 70   # graph.json
python -m data.pipeline.correr --paso todo

python -m pytest data/tests -q
python contracts/tools/validar_graph.py data/out/graph.json
python -m engine.check_graph data/out/graph.json
```

## Productos

| Archivo | Contenido |
| --- | --- |
| `out/aoi.json` | Ventana de recorte: bbox MTM y lon/lat, malla, CRS |
| `out/dim_map.json` | Metadatos del mapa: CRS, datum, escala, extensión |
| `out/estaciones_mtm.csv` | Las 8 estaciones en MTM, lon/lat y píxel |
| `out/rasters/*.tif` | 10 capas en la misma malla (gitignored) |
| `out/rasters/malla.json` | Manifiesto de la malla compartida |
| `out/costo.json` | Parámetros y resultado del mapa de costo |
| `out/geologia.geojson` | Capa geológica aplanada en lon/lat (la consume `web/map`) |
| `out/geologia/*.json` | 4 dimensiones + `fact_map_feature` |
| `out/aristas.json` | 168 aristas con todos sus atributos |
| `out/zonas.json` | Zonas de alerta de la demo |
| `out/verificacion.json` | Resultado de los controles |
| **`out/graph.json`** | **El grafo real: 8 nodos, 168 aristas** |

## Resultado actual

**Área y malla**

- AOI de 194 × 141 px a 20 m = **10.94 km²**, anclado a la malla
- Las 10 capas comparten malla exacta, al 100 % de celdas válidas, sin huecos
- Pendiente: media 3.58°, p99 21.8°, **2.57 % de celdas > 15°**
- Desplazamiento por anclaje: máximo 12.98 m (tope teórico 14.14 m)
- Ida y vuelta MTM ↔ lon/lat: peor desvío 6.79e-09°

**Costo y grafo**

- Costo por celda: mediana 0.417 min (min 0.299, max 6.807)
- THEMIS: 28.4 % roca, 39.5 % arena, 32.1 % normal
- 168 aristas: 56 por cada límite (15°, 20°, 25°)
- Ida y vuelta difieren: subir a E2 cuesta 56.19 min, bajar 50.02 min
- `graph.json` valida con **0 avisos** y el motor lo acepta
- Misión de prueba: 229.8 min, alerta Z1 verificada

## Cambios del sábado 14 (tarde), aplicados por Jeicoll

Se regeneró `graph.json` con el pipeline completo (`--paso todo`). Las aristas de 15° y los nodos
quedaron idénticos a la versión anterior, salvo lo que se cambió a propósito:

1. **Límites de pendiente `[8, 12, 15]`** (opción A de `HALLAZGO_pendiente_demo.md`, ya en `params.yaml`).
   8°: 30 aristas, 12°: 42, 15°: 56. A 8° la cima del delta (E2) queda omitida por pendiente
   (camino más suave 9.18°); a 12° entra.
2. **`themis_noche` de los nodos en Kelvin.** Antes se guardaba el DN de 8 bits (49–131), y el contrato
   pide K. Ahora usa la misma calibración que el costo (`costo.dn_a_k`): 179–227 K.
3. **Zonas de alerta sin estaciones adentro** (`_relieve.zonas_de_alerta`). Las cajas anteriores
   encerraban estaciones, y la alerta las dejaba aisladas (con Z4 no se llegaba a ninguna). Las nuevas
   están sobre corredores entre estaciones y desvían la ruta sin aislar a nadie. Por eso los nodos
   ya no tienen `zona`. Con la misión de 12°:

   | Zona | Evita | Costo |
   | --- | --- | --- |
   | Z1 Entrada al delta | HAB->M2 | +6.6 min |
   | Z2 Campo de dunas (la de la demo) | HAB->M2, E1->M1 | +30.3 min |
   | Z3 Borde norte de Séítah | E1->M1 | +17.1 min |
   | Z4 Corredor del hábitat | M1->HAB | +8.0 min |

4. `requirements.txt`: se agregó `scikit-image` (lo usa el paso 60) y `pyyaml`.
5. `tests/test_costo_grafo.py`: la prueba de ida ≠ vuelta usaba la versión de 20°, que ya no existe;
   ahora usa el límite más alto.

Verificado: 37 pruebas de `data/`, 67 del motor, `validar_graph.py` OK y `engine.check_graph` OK.

## Capas de entrada

| Capa | Fuente | CRS de origen | Uso |
| --- | --- | --- | --- |
| `dtm` | CTX estéreo J03 20 m | Equirectangular | Elevación y pendiente |
| `orto` | CTX J03 6 m | Equirectangular | Mapa base |
| `orto_mosaico` | Mosaico CTX Caltech 5 m | MTM | Alternativa en MTM |
| `themis_dia` | THEMIS día 100 m | MTM | Complemento térmico |
| `themis_noche` | THEMIS noche 100 m | MTM | Proxy roca vs arena |
| `hrsc` | HRSC 75 m | MTM | Contraste de elevación |
| `hrsc_sombra` | Hillshade HRSC | MTM | Relieve |
| `pendiente` | Derivada del DTM | — | Consumo del motor |
| `costo` | Derivada (Tobler × traje × terreno) | — | Camino mínimo |
| `f_terreno` | Derivada de THEMIS | — | Factor de suelo |

## Decisiones que hay que conocer

**1. El DTM crítico no está en MTM.** El spec dice que los rasters del SIM 3464
vienen en MTM, pero el DTM CTX estéreo de 20 m está en Equirectangular, con píxel
anisótropo (19.16 × 20.20 m). Reproyectarlo es el paso central.

**2. pyproj aborta entre cuerpos celestes.** Con un CRS terrestre falla con
*"ellipsoid do not belong to the same celestial body"*. Los CRS de Marte se
construyen explícitos con `+R=3396190`.

**3. THEMIS viene en DN, no en Kelvin.** El mosaico se distribuye en 8 bits sin
tabla de calibración, pero `params.yaml` fija los umbrales en K. La calibración
DN→K (150–300 K) está declarada en `costo.py` y reproduce los 205–230 K del
grafo falso.

**4. `route_through_array` no distingue subir de bajar.** El costo de una celda
depende solo de su pendiente, sin signo, así que A→B y B→A daban el mismo
tiempo. El trazado se decide con el costo simétrico y el tiempo se evalúa
después con el desnivel **con signo** de cada paso.

**5. `unit_code` no es clave única.** Los enteros `unit` 5 y 11 se repiten con
símbolos distintos. La UK real es `unit_symbol` (14 unidades).

**6. `dim_map` no sale de `MapBoundary`.** Sus `LON_MIN/LON_MAX/LAT_MIN/LAT_MAX`
están en `NULL`. Los valores salen del XML FGDC; el CRS y el datum del `.prj`.

**7. En `GeoContacts` el `TYPE` es la certeza**, no el tipo de rasgo.

## Dos pendientes que necesitan decisión

**Sesgo vertical.** El DTM queda de +7 a +22 m por encima de `elev_m` en
`estaciones.csv`. Es diferencia de datum, no de alineación. `graph.json` usa el
**DTM** (constante `ELEV_CORREGIDA` en `graph.py`), para que la elevación y la
pendiente vengan del mismo raster.

**La demo de pendiente no se sostiene.** A 15° se llega a E2, así que
"¿y si acepto 20°?" no cambia nada. Ver
[`HALLAZGO_pendiente_demo.md`](HALLAZGO_pendiente_demo.md): incluye los límites
mínimos medidos y cuatro opciones, con recomendación.

## Descargas

No van a git (`data/raw/` está ignorado):

1. Zip del mapa geológico USGS SIM 3464 (~350 MB): DTM CTX, THEMIS día/noche,
   geodatabase, metadatos y sistemas de coordenadas
2. `M20_waypoints.json` de Perseverance (ya resumido en `estaciones.csv`)
