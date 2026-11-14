// Descarga el mosaico CTX del recorte de Jezero a public/base/ (plan B del spec:
// image source con límites fijos). El servicio OnMars/CTX usa una grilla
// geográfica (GCS Mars 2000, teselas de 512 px), que MapLibre no lee como
// teselas; cada tesela se monta como image source con sus 4 esquinas.
//
// Uso: node scripts/descargar_base.mjs [nivel]   (12 es el máximo con cobertura en Jezero, ~5 m/px)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICIO = 'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile';
const RES0 = 0.3515625; // grados por píxel en el nivel 0
const PX = 512;
// Recorte: estaciones de estaciones.csv con margen (lon 77.401–77.452, lat 18.431–18.462)
const AOI = { lonMin: 77.385, lonMax: 77.47, latMin: 18.42, latMax: 18.475 };

const nivel = Number(process.argv[2] ?? 12);
const grados = (RES0 / 2 ** nivel) * PX;
const col0 = Math.floor((AOI.lonMin + 180) / grados);
const col1 = Math.floor((AOI.lonMax + 180) / grados);
const fila0 = Math.floor((90 - AOI.latMax) / grados);
const fila1 = Math.floor((90 - AOI.latMin) / grados);

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'base');
await fs.mkdir(dir, { recursive: true });

const teselas = [];
for (let fila = fila0; fila <= fila1; fila++) {
  for (let col = col0; col <= col1; col++) {
    const res = await fetch(`${SERVICIO}/${nivel}/${fila}/${col}`);
    if (!res.ok) throw new Error(`tesela ${nivel}/${fila}/${col} → ${res.status}`);
    const tipo = res.headers.get('content-type') ?? '';
    const ext = tipo.includes('png') ? 'png' : 'jpg';
    const archivo = `ctx_${nivel}_${fila}_${col}.${ext}`;
    await fs.writeFile(path.join(dir, archivo), Buffer.from(await res.arrayBuffer()));
    const oeste = -180 + col * grados;
    const norte = 90 - fila * grados;
    teselas.push({
      url: `/base/${archivo}`,
      // MapLibre: [arriba-izq, arriba-der, abajo-der, abajo-izq] en [lon, lat]
      coordinates: [
        [oeste, norte], [oeste + grados, norte],
        [oeste + grados, norte - grados], [oeste, norte - grados],
      ],
    });
    console.log('ok', archivo);
  }
}

await fs.writeFile(path.join(dir, 'teselas.json'), JSON.stringify({
  fuente: 'CTX mosaic (Esri OnMars / Murray Lab, Caltech) · NASA/JPL-Caltech/MSSS',
  servicio: SERVICIO,
  nivel,
  metros_por_pixel: +((RES0 / 2 ** nivel) * (Math.PI / 180) * 3396190).toFixed(2),
  teselas,
}, null, 2));
console.log(`${teselas.length} teselas en public/base/`);
