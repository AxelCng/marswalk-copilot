# data/ — pipeline de datos (Pedro, L1)

**Entrega:** `data/out/graph.json` real, sábado 22:00. Misma forma que [`contracts/graph_fake.json`](../contracts/graph_fake.json); reglas en [`contracts/README.md`](../contracts/README.md).

## Descargas (no se suben a git: van en `data/raw/`)

1. Zip del mapa geológico USGS SIM 3464: DTM CTX 20 m, THEMIS día/noche y shapefile de unidades (~350 MB)
2. Mapa de pendientes de Jezero de USGS (42 MB): atajo si la DTM da problemas
3. `M20_waypoints.json` de Perseverance

## Pasos

1. Recorte del área (fondo del cráter cerca del aterrizaje + frente del delta) y reproyección. Rasters en MTM 77.5°E, esfera de 3 396 190 m; waypoints lon/lat → `pyproj`.
2. Mapa de costo por celda con los parámetros de [`params.yaml`](../params.yaml): `c = Δx / v(θ) · f_terreno`, bloqueada si θ > límite.
3. Aristas con `skimage.graph.route_through_array(costo, inicio, fin, fully_connected=True, geometric=True)`, **3 veces** (límites 15°, 20° y 25°) y en los 2 sentidos.
4. Atributos de cada arista: ver la sección "Atributos de cada arista" del spec.
5. **Geometría y nodos en lon/lat grados** al escribir `graph.json`.
6. Antes de entregar: `python contracts/tools/validar_graph.py data/out/graph.json`

**Corte 14:00:** si los rasters no se alinean, el costo usa solo el mapa de pendientes USGS.
