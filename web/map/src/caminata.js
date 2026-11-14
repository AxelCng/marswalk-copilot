// Modo caminata 3D: la cámara recorre tramos[].geometria a la altura de los ojos de un
// astronauta, sobre el terreno de la DTM CTX 20 m (USGS SIM 3464).
//
// Escala: MapLibre mide en metros terrestres. Un grado de Marte mide 3396190/6378137 de lo que
// mide en la Tierra, así que el terreno lleva exageración K = 6378137/3396190 (~1,88) para que
// la proporción vertical sea la real, y las alturas de la cámara se multiplican por K.
//
// Velocidad: cada tramo se recorre en su tiempo_min de la API (tiempo de marcha), acelerado por
// el factor elegido. Nada se inventa: la distancia y el tiempo mostrados salen del tramo.

export const R_MARTE = 3396190;
export const K_ESCALA = 6378137 / R_MARTE;
const PITCH_MAX = 85;

// Cámaras: altura sobre el suelo (m de Marte) e inclinación. El punto al que se mira queda
// adelante sobre la ruta, a altura · tan(pitch), así la vista no pasa del máximo de MapLibre.
export const CAMARAS = {
  ojos: { nombre: 'Ojos 1,8 m', altura: 1.8, pitch: 85 },
  dron: { nombre: 'Dron 40 m', altura: 40, pitch: 78 },
  alta: { nombre: 'Alta 250 m', altura: 250, pitch: 68 },
};

const rad = (d) => (d * Math.PI) / 180;

function distancia([lo1, la1], [lo2, la2]) {
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 2 * R_MARTE * Math.asin(Math.sqrt(a));
}

/** Prepara un tramo: puntos y distancias acumuladas sobre la esfera de Marte. */
function preparar(tramo) {
  const g = tramo.geometria;
  const acum = [0];
  for (let i = 1; i < g.length; i++) acum.push(acum[i - 1] + distancia(g[i - 1], g[i]));
  return { tramo, g, acum, largo: acum[acum.length - 1] };
}

/** Punto a s metros del inicio; más allá del final sigue en la dirección del último segmento. */
function puntoEn({ g, acum, largo }, s) {
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

/**
 * Inicia la caminata. Devuelve un control {play, pausa, velocidad, irA, destruir}.
 * onProgreso({idx, frac, enMarcha, terminado}) se llama ~10 veces por segundo.
 */
export function iniciarCaminata(map, tramos, { velocidad = 60, camara: cam0 = 'ojos', onProgreso } = {}) {
  const prep = tramos.map(preparar);
  let idx = 0;
  let s = 0;
  let enMarcha = true;
  let vel = velocidad;
  let cam = CAMARAS[cam0] ?? CAMARAS.ojos;
  let raf = 0;
  let tAnterior = performance.now();
  let tAviso = 0;
  let altAnterior = null;

  const altSuelo = (p) => {
    const rel = map.queryTerrainElevation(p);
    if (rel == null) return altAnterior;
    return rel + (map.transform.elevation ?? 0);
  };

  const avisar = (forzar = false) => {
    const ahora = performance.now();
    if (!forzar && ahora - tAviso < 100) return;
    tAviso = ahora;
    const p = prep[idx];
    onProgreso?.({ idx, frac: p.largo ? Math.min(1, s / p.largo) : 1, enMarcha, terminado: idx === prep.length - 1 && s >= p.largo });
  };

  const camara = () => {
    const p = prep[idx];
    const desde = puntoEn(p, s);
    const mirar = Math.max(5, cam.altura * Math.tan((cam.pitch * Math.PI) / 180));
    const hacia = puntoEn(p, s + mirar);
    const aDesde = altSuelo(desde);
    const aHacia = altSuelo(hacia);
    if (aDesde == null) return; // el terreno todavía no cargó
    altAnterior = aDesde;
    const ojos = aDesde + cam.altura * K_ESCALA;
    const opc = map.calculateCameraOptionsFromTo(
      { lng: desde[0], lat: desde[1] }, ojos,
      { lng: hacia[0], lat: hacia[1] }, aHacia ?? aDesde,
    );
    opc.pitch = Math.min(PITCH_MAX, cam.pitch, opc.pitch);
    map.jumpTo(opc);
  };

  const cuadro = (t) => {
    const dt = Math.min(0.1, (t - tAnterior) / 1000);
    tAnterior = t;
    const p = prep[idx];
    if (enMarcha) {
      const segundos = (p.tramo.tiempo_min ?? 1) * 60;
      s += (p.largo / segundos) * vel * dt;
      if (s >= p.largo) {
        if (idx < prep.length - 1) {
          idx += 1;
          s = 0;
        } else {
          s = p.largo;
          enMarcha = false;
        }
        avisar(true);
      }
    }
    camara();
    avisar();
    raf = requestAnimationFrame(cuadro);
  };

  map.setMaxPitch(PITCH_MAX);
  map.setMaxZoom(24);
  raf = requestAnimationFrame(cuadro);
  avisar(true);

  return {
    play() { enMarcha = true; if (idx === prep.length - 1 && s >= prep[idx].largo) { idx = 0; s = 0; } avisar(true); },
    pausa() { enMarcha = false; avisar(true); },
    velocidad(v) { vel = v; },
    camara(c) { cam = CAMARAS[c] ?? cam; },
    irA(i) { idx = Math.max(0, Math.min(prep.length - 1, i)); s = 0; avisar(true); },
    destruir() {
      cancelAnimationFrame(raf);
      map.setMaxZoom(22);
      map.setMaxPitch(60);
    },
  };
}
