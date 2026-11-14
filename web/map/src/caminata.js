// Geometría compartida del visor 3D: radio de Marte, cámaras y recorrido de tramos[].geometria.
// El piloto recorre cada tramo en su tiempo_min de la API (tiempo de marcha), acelerado por el
// factor elegido: la distancia y el tiempo mostrados salen del tramo.

export const R_MARTE = 3396190;

// Cámaras: altura sobre el suelo en metros de Marte.
export const CAMARAS = {
  ojos: { nombre: 'Eyes 1.8 m', altura: 1.8 },
  dron: { nombre: 'Drone 40 m', altura: 40 },
  alta: { nombre: 'High 250 m', altura: 250 },
};

const rad = (d) => (d * Math.PI) / 180;

function distancia([lo1, la1], [lo2, la2]) {
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 2 * R_MARTE * Math.asin(Math.sqrt(a));
}

/** Prepara un tramo: puntos y distancias acumuladas sobre la esfera de Marte. */
export function preparar(tramo) {
  const g = tramo.geometria;
  const acum = [0];
  for (let i = 1; i < g.length; i++) acum.push(acum[i - 1] + distancia(g[i - 1], g[i]));
  return { tramo, g, acum, largo: acum[acum.length - 1] };
}

/** Punto a s metros del inicio; más allá del final sigue en la dirección del último segmento. */
export function puntoEn({ g, acum, largo }, s) {
  if (s <= 0) return g[0];
  if (s >= largo) {
    const [a, b] = [g[g.length - 2], g[g.length - 1]];
    const d = acum[acum.length - 1] - acum[acum.length - 2] || 1;
    const f = (s - largo) / d;
    return [b[0] + (b[0] - a[0]) * f, b[1] + (b[1] - a[1]) * f];
  }
  let i = 1;
  while (acum[i] < s) i++;
  const f = (s - acum[i - 1]) / (acum[i] - acum[i - 1] || 1);
  return [g[i - 1][0] + (g[i][0] - g[i - 1][0]) * f, g[i - 1][1] + (g[i][1] - g[i - 1][1]) * f];
}
