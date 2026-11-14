// Elevación de la DTM CTX 20 m (USGS SIM 3464) en el navegador.
//
// elevacion([lon, lat]) → metros de Marte bajo un punto (o null mientras carga), leída
// directamente de las teselas Terrarium de web/map/public/dem (dem_tiles.py).

const TAM = 256;
const Z_DATOS = [13, 11]; // detalle en la zona de trabajo; z11 cubre todo el marco
const cache = new Map(); // "z/x/y" → Promise<Float32Array|null>
const listas = new Map(); // "z/x/y" → Float32Array|null (ya resueltas, para lecturas síncronas)

function decodificar(img) {
  const c = document.createElement('canvas');
  c.width = TAM;
  c.height = TAM;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, TAM, TAM).data;
  const d = new Float32Array(TAM * TAM);
  for (let i = 0; i < TAM * TAM; i++) d[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
  return d;
}

/** Tesela de datos reales (z 8–13) decodificada, o null si no existe. */
function cargar(z, x, y) {
  const clave = `${z}/${x}/${y}`;
  if (!cache.has(clave)) {
    cache.set(clave, new Promise((res) => {
      const img = new Image();
      img.onload = () => { const d = decodificar(img); listas.set(clave, d); res(d); };
      img.onerror = () => { listas.set(clave, null); res(null); };
      img.src = `/dem/${clave}.png`;
    }));
  }
  return cache.get(clave);
}

function teselaDe(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  return { tx: Math.floor(x), ty: Math.floor(y), fx: (x % 1) * TAM, fy: (y % 1) * TAM };
}

function bilineal(d, fx, fy) {
  const x0 = Math.min(TAM - 2, Math.max(0, Math.floor(fx - 0.5)));
  const y0 = Math.min(TAM - 2, Math.max(0, Math.floor(fy - 0.5)));
  const ax = Math.min(1, Math.max(0, fx - 0.5 - x0));
  const ay = Math.min(1, Math.max(0, fy - 0.5 - y0));
  const v = (x, y) => d[y * TAM + x];
  return (v(x0, y0) * (1 - ax) + v(x0 + 1, y0) * ax) * (1 - ay) + (v(x0, y0 + 1) * (1 - ax) + v(x0 + 1, y0 + 1) * ax) * ay;
}

/** Elevación en metros de Marte bajo [lon, lat], o null si todavía no hay datos. */
export function elevacion([lon, lat]) {
  for (const z of Z_DATOS) {
    const { tx, ty, fx, fy } = teselaDe(lon, lat, z);
    const clave = `${z}/${tx}/${ty}`;
    const d = listas.get(clave);
    if (d) return bilineal(d, fx, fy);
    if (!cache.has(clave)) cargar(z, tx, ty);
  }
  return null;
}

/** Pide por adelantado las teselas alrededor de un punto. */
export function precargar(p, radio = 1) {
  for (const z of Z_DATOS) {
    const { tx, ty } = teselaDe(p[0], p[1], z);
    for (let dx = -radio; dx <= radio; dx++) for (let dy = -radio; dy <= radio; dy++) cargar(z, tx + dx, ty + dy);
  }
}

/** Espera a que estén decodificadas las teselas alrededor de un punto (radio en teselas z13). */
export async function esperarZona(p, radio = 2) {
  const pendientes = [];
  for (const z of Z_DATOS) {
    const { tx, ty } = teselaDe(p[0], p[1], z);
    const r = z === Z_DATOS[0] ? radio : 1;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) pendientes.push(cargar(z, tx + dx, ty + dy));
  }
  await Promise.all(pendientes);
}
