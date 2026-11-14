# MarsWalk Copilot — Modo HUD (`web/ui/hud/`)

Visor de casco en primera persona para seguir la EVA tramo por tramo. Basado en el mockup
"MarsWalk EVA – Visor HUD Proyección Óptica Realista" y en los tokens del design system AeroHUD Jezero
(copiados de `web/map/src/styles.css` y `web/map/src/tokens.js`).

```bash
cd web/ui/hud
npm install        # si registry.npmjs.org no responde: --registry=https://registry.yarnpkg.com
npm run dev        # http://localhost:5174
```

## Qué muestra y de dónde sale cada dato

| Elemento | Dato | Fuente |
| --- | --- | --- |
| Foto de fondo | Navcam de la estación destino del tramo | `fotos[0].url` del nodo (`/estaciones/{id}` o `graph_fake.json`). Si es `null` o no carga: fondo `hud-bg-deep` con aviso |
| Cinta de rumbo | Marca cian = rumbo a la próxima estación | Calculado con el primer y último `[lon, lat]` de `tramos[i].geometria` |
| Objetivo fijado | id, nombre, distancia, pendiente, marcha, rumbo | `tramos[i]` + nodo destino |
| Retícula central | Escalera de pitch (escala del visor) y marca `PEND` | `tramos[i].pendiente_max_deg` |
| Arriba a la izquierda | Tramo N de M, tiempo total, margen, distancia, ruta, omitidas | `RespuestaMision.totales`, `ruta`, `omitidas` |
| Abajo a la izquierda | Franja roja de alerta | Request de `/alerta` (`zona`, `tipo`) + `aristas_afectadas` y nuevos `totales` |
| Abajo a la derecha | Minimapa táctico en SVG | `tramos[].geometria`; con alerta, polígono de la zona y tramos evitados de la misión anterior |

Los datos del traje (O2, presión, pulso) **no** vienen de la API y no se muestran.

## Datos

- Con la API corriendo (`VITE_API_URL`, por defecto `http://localhost:8000`): `POST /mision` con el
  request de demo 1 (15°), `POST /alerta {zona: Z2, tipo: polvo}`, `POST /reset`.
- Sin API: `contracts/ejemplos/post_mision.demo1_mision_15deg.response.json` y `post_alerta.response.json`.
  El chip del panel dice **API** o **Ejemplo**.

## Controles

- `◀ Anterior` / `Siguiente ▶` (o flechas ← →): recorrer tramos.
- `Alerta polvo Z2` / `Quitar alerta`: la API recalcula la misión entera desde el origen, por eso se vuelve al tramo 1.
- Arrastrar la escena gira la vista; la marca del objetivo se mueve en la cinta y `Centrar` vuelve a fijarlo.
