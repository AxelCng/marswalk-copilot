# web/map — mapa de la demo (Añe)

React + Vite + MapLibre con el estilo **AeroHUD Jezero** ([design system](https://claude.ai/artifact/TDBvRbN9wBCZ4PCoCyV3Yh)). Dibuja el mosaico CTX de Jezero, la geología del SIM 3464, las estaciones, las aristas, las zonas de alerta, la ruta tramo por tramo y la animación de alerta.

## Correr

```bash
cd web/map
npm install          # si registry.npmjs.org no responde: npm install --registry=https://registry.yarnpkg.com
npm run dev          # http://localhost:5173
```

Si la API de Said está en `http://localhost:8000` la usa (`GET /grafo`, `POST /mision`, `/alerta`, `/reset`, `GET /geologia`). Si no responde, cae sola a `contracts/graph_fake.json` y `contracts/ejemplos/`. Para otra URL: `VITE_API_URL=http://... npm run dev`.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/MarsMap.jsx` | Componente del mapa. Es lo que se integra con `web/ui/`. |
| `src/api.js` | Llamadas a la API, con fallback a los JSON de `contracts/`. |
| `src/geologia.js` | Carga y prepara la capa geológica (modelo estrella SIM 3464). |
| `src/tokens.js` | Colores AeroHUD para MapLibre (no lee variables CSS) y color por tipo de nodo. |
| `src/App.jsx` | Banco de pruebas con las 3 preguntas de la demo (misión a 15°, a 20° y polvo en Z2). |
| `scripts/descargar_base.mjs` | Baja el mosaico CTX del recorte a `public/base/`. |
| `public/base/` | 6 teselas CTX (~5 m/px) y su índice `teselas.json`. |

## Props de `MarsMap` (para Axl)

```jsx
<MarsMap
  grafo={grafo}               // {zonas, nodes, edges} de GET /grafo
  mision={respuesta}          // RespuestaMision de /mision, /ruta, /alerta o /chat.ruta (o null)
  alerta={{ zona: 'Z2', aristas_afectadas: ['HAB->M2'] }}  // o null
  geologia={geo}              // resultado de getGeologia() (o null)
  mostrarGeologia={true}
  onSelectEstacion={(id) => abrirFicha(id)}
/>
```

## Mapa base (plan B ya activo)

El servicio `OnMars/CTX` de Esri usa una grilla geográfica (GCS Mars 2000, teselas de 512 px) que MapLibre no lee como teselas, y además no manda cabeceras CORS. Por eso `scripts/descargar_base.mjs` baja el recorte y cada tesela se monta como `image source` con sus 4 esquinas. En un área de ~5 km la diferencia entre equirectangular y Mercator es despreciable. El nivel 12 (~5 m/px) es el máximo con cobertura en Jezero.

```bash
node scripts/descargar_base.mjs 12
```

## Capa geológica (modelo estrella USGS SIM 3464)

El mapa lee **un GeoJSON aplanado** desde `GET /geologia` o, si no hay API, desde `public/geologia.geojson`. Cada Feature es una fila de `fact_map_feature` con sus dimensiones ya unidas por `*_key`, y la geometría de `geom_wkt` reproyectada de MTM 77.5°E a lon/lat. La conversión desde el `.gdb` le toca a `data/` (Pedro).

| Tabla | Columnas que usa el mapa |
| --- | --- |
| `fact_map_feature` | `feature_key`, `unit_key`, `feature_type_key`, `source_layer`, `area_m2`, `length_m` |
| `dim_geologic_unit` | `unit_symbol` (etiqueta), `unit_name`, `age_prefix`, `color_id` |
| `dim_feature_type` | `feature_type`, `certainty` (contacto aproximado o inferido = punteado), `geometry_type` |
| `dim_spatial_context` | `in_landing_ellipse`, `in_figure_area`, `on_cross_section` (se conservan, aún no se dibujan) |
| `dim_map` | no hace falta en el GeoJSON |

- Polígonos: unidades geológicas, relleno al 35 % debajo de rutas y nodos. Etiqueta `unit_symbol` desde zoom 12.
- Líneas: contactos y rasgos lineales.
- Color: `color_hex` si `data/` lo resuelve desde `color_id`; si no, una paleta tierra fija por unidad.
- Hover: símbolo, nombre, edad y tipo de rasgo.
- Leyenda: las 8 unidades con más área.

Hasta que exista el archivo, el panel dice "Sin capa" y el resto del mapa funciona igual.
