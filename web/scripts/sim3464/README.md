# Importador USGS SIM 3464 (Jezero / Nili Planum)

Convierte la base del mapa geológico **USGS SIM 3464** (Sun y Stack, 2020, [doi:10.3133/sim3464](https://doi.org/10.3133/sim3464))
al modelo estrella de [`modelo_estrella.sql`](modelo_estrella.sql) ([DER](modelo_estrella_DER.mmd)) y a los archivos que leen las dos interfaces.

```bash
pip install pyogrio rasterio pyproj shapely numpy
python web/scripts/sim3464/importar_sim3464.py "C:/ruta/a/sim3464_database"
```

`sim3464_database` es la carpeta con `modelo_estrella.sql` y `sim3464_JezeroNili_FINAL/` (Nili.gdb + Rasters). No se sube a git (~490 MB).

## Salidas

| Archivo | Qué es | Lo usa |
| --- | --- | --- |
| `out/sim3464_estrella.sqlite` | Modelo estrella completo: 5 169 filas en `fact_map_feature` (geometría WKT en MTM 77.5°E). ~90 MB, fuera de git | consultas, `engine/` si lo necesita |
| `web/map/public/geologia.geojson` | `fact_map_feature` aplanado (dimensiones unidas), recortado a 77.33–77.53°E, 18.38–18.51°N, simplificado a 4 m, en lon/lat | capa Geología del mapa |
| `web/shared/sim3464/geologia_ruta.geojson` | Solo unidades, recorte de la ruta, simplificado a 12 m | minimapa del HUD |
| `web/shared/sim3464/estaciones_capas.json` | Por estación de `estaciones.csv`: unidad, rasgos de superficie, elevación DTM CTX 20 m, pendiente (Horn 3×3), elevación HRSC 75 m, THEMIS IR día/noche | ficha del mapa y objetivo del HUD |

## Notas de honestidad

- THEMIS en esta base es un mosaico de **brillo de 8 bits (DN 0–255)**, no temperatura ni inercia térmica: las interfaces lo muestran como "DN relativo".
- La pendiente es la de una celda de 20 m alrededor de la estación, no la del tramo. Las pendientes de las aristas siguen saliendo del grafo (hoy `graph_fake.json`).
- Los colores de las unidades en las interfaces son tonos propios, no la simbología oficial del SIM 3464 (`.lyr` binario).
- Anomalía de origen conservada: un polígono con `unit = 5` y símbolo `Nue` (fila 15 de `dim_geologic_unit`).
