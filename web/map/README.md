# web/map — mapa de la misión (Añe)

Mapa MapLibre con el mosaico HiRISE real de Jezero, las 8 estaciones, las aristas, la ruta resaltada y la animación de alerta.

## Correr la página de prueba

```powershell
cd web/map
npm install
npm run dev          # http://localhost:5174
```

- Sin el motor: usa los archivos de `contracts/` (grafo falso y ejemplos de la demo).
- Con el motor de Said corriendo en :8000: marca **API en vivo**.
- Atajos por URL: `?accion=m15`, `?accion=m20`, `?accion=alerta` (agrega `&vivo=1` para usar la API).

## Archivos

| Archivo | Qué es |
| --- | --- |
| `src/mapa.ts` | **El mapa.** Módulo sin React: `crearMapa(div)` → `cargarGrafo`, `mostrarMision`, `mostrarAlerta`, `limpiar` |
| `src/demo.ts` | Página de prueba con las 3 preguntas de la demo |
| `src/assets/jezero_hirise.jpg` | Mapa base (ver abajo) |

La pantalla de Axl (`web/ui`) usa este mismo módulo a través de `web/ui/src/components/MapaMision.tsx`. **Si cambias `mapa.ts`, el cambio aparece en las dos.** Por eso `web/ui` necesita que `web/map` tenga hecho `npm install`.

## Qué dibuja

| Capa | De dónde sale | Cómo se ve |
| --- | --- | --- |
| Estaciones | `nodes` del grafo | Punto con color por tipo y etiqueta; número de orden si está en la ruta; tachada si fue omitida |
| Aristas | `edges` (la versión de 25°, un trazo por par) | Líneas finas grises |
| Zonas | `zonas` | Rectángulos amarillos punteados; la zona en alerta, roja y latiendo |
| Ruta | `tramos[].geometria` | Línea cian con "hormigas" que avanzan |
| Tramos evitados | `aristas_afectadas` de `/alerta` | Línea roja punteada |

## Mapa base: de dónde sale

**Mosaico HiRISE de Jezero, 25 cm/píxel, controlado** (`JEZ_hirise_soc_006_orthoMosaic_25cm`), servido por [NASA Mars Trek](https://trek.nasa.gov/mars/). Se bajaron las 160 teselas de zoom 15 que cubren el área de las estaciones, se unieron y se redujeron a 2400 × 1500 px (790 KB).

- **Límites:** 77.3822–77.4701 °E, 18.4241–18.4790 °N (en `LIMITES_IMAGEN`, dentro de `mapa.ts`).
- **Por qué una imagen y no teselas en vivo:** es el plan B del spec ("ortoimagen recortada como fuente de imagen"). Además, la demo funciona **sin internet**.
- **Proyección:** las teselas están en lon/lat (equirectangular) y MapLibre dibuja en Web Mercator. En un área de 5 km la diferencia es menor a un píxel.
- **Crédito:** NASA/JPL-Caltech/University of Arizona (HiRISE), vía NASA Mars Trek. Aparece en el mapa.

## Pendiente para Añe

- [ ] Revisar colores y etiquetas con el equipo.
- [ ] Animar la ruta nodo por nodo (domingo, según el cronograma).
- [ ] Cuando llegue el `graph.json` real de Pedro, nada cambia: el mapa lee `GET /grafo`.
