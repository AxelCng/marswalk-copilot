// Control del astronauta en el visor 3D (independiente del motor de dibujo).
//
// Control:  W/S o ↑/↓ avanzar/retroceder · A/D de costado · Q/E o ←/→ girar
//           arrastrar con el mouse para mirar · Shift para ir ×10
// Piloto:   recorre tramos[].geometria de la misión en su tiempo_min (acelerado).
//
// Velocidad manual: función de marcha de params.yaml (Tobler × factor_traje) con la pendiente
// del terreno a lo largo del rumbo, medida en la DTM. Por encima de theta_max_fisico_deg no se
// avanza (celda bloqueada, igual que en el modelo de costo).

import paramsYaml from '@repo/params.yaml?raw';
import { R_MARTE, CAMARAS, preparar, puntoEn } from './caminata.js';
import { elevacion, precargar } from './elevacion.js';

const num = (clave, defecto) => {
  const m = new RegExp(`^\\s*${clave}:\\s*([-\\d.]+)`, 'm').exec(paramsYaml);
  return m ? Number(m[1]) : defecto;
};
export const MARCHA = {
  a: num('a', 6), b: num('b', 3.5), c: num('c', 0.05),
  factor: num('factor_traje', 0.8),
  thetaMax: num('theta_max_fisico_deg', 30),
};

/** Velocidad de marcha (km/h) para una pendiente en grados, positiva cuesta arriba. */
export function velocidadMarcha(pendienteDeg) {
  if (Math.abs(pendienteDeg) > MARCHA.thetaMax) return 0;
  const t = Math.tan((pendienteDeg * Math.PI) / 180);
  return MARCHA.a * Math.exp(-MARCHA.b * Math.abs(t + MARCHA.c)) * MARCHA.factor;
}

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Punto a d metros (Marte) de p con rumbo r (grados desde el norte). */
export function desplazar([lon, lat], rumbo, d) {
  const dn = d * Math.cos(rad(rumbo));
  const de = d * Math.sin(rad(rumbo));
  return [lon + deg(de / (R_MARTE * Math.cos(rad(lat)))), lat + deg(dn / R_MARTE)];
}

export function rumboEntre([lo1, la1], [lo2, la2]) {
  const y = Math.sin(rad(lo2 - lo1)) * Math.cos(rad(la2));
  const x = Math.cos(rad(la1)) * Math.sin(rad(la2)) - Math.sin(rad(la1)) * Math.cos(rad(la2)) * Math.cos(rad(lo2 - lo1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const TECLAS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);
const GIRO_DEG_S = 70;

/**
 * Inicia el control. elemento: donde se arrastra para mirar. onCuadro(estado) se llama en
 * cada cuadro (para dibujar); onEstado(estado) ~12 veces por segundo (para la interfaz).
 */
export function iniciarVisor({ elemento, pos, rumbo = 0, camara = 'ojos', limites, onCuadro, onEstado }) {
  let p = pos;
  let r = rumbo;
  let mirada = 5; // grados hacia abajo (negativo = hacia arriba)
  let cam = CAMARAS[camara] ?? CAMARAS.ojos;
  let piloto = null;
  let raf = 0;
  let tAnt = performance.now();
  let tAviso = 0;
  const teclas = new Set();

  const pendienteRumbo = () => {
    const e1 = elevacion(desplazar(p, r, 10));
    const e0 = elevacion(desplazar(p, r, -10));
    return e1 == null || e0 == null ? 0 : deg(Math.atan((e1 - e0) / 20));
  };
  const dentro = (q) => !limites || (q[0] > limites[0] && q[0] < limites[2] && q[1] > limites[1] && q[1] < limites[3]);

  const esCampo = (el) => el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
  const abajo = (e) => {
    const k = e.key.toLowerCase();
    if (!TECLAS.has(k) || esCampo(document.activeElement)) return;
    e.preventDefault();
    teclas.add(k);
    if (k !== 'shift') piloto = null; // tomar el control corta el piloto
  };
  const arriba = (e) => teclas.delete(e.key.toLowerCase());
  const perder = () => teclas.clear();
  window.addEventListener('keydown', abajo);
  window.addEventListener('keyup', arriba);
  window.addEventListener('blur', perder);

  let arrastre = null;
  const pd = (e) => { arrastre = { x: e.clientX, y: e.clientY }; elemento.setPointerCapture?.(e.pointerId); };
  const pm = (e) => {
    if (!arrastre) return;
    r = (r + (e.clientX - arrastre.x) * 0.25 + 360) % 360;
    mirada = Math.max(-35, Math.min(60, mirada + (e.clientY - arrastre.y) * 0.2));
    arrastre = { x: e.clientX, y: e.clientY };
  };
  const pu = () => { arrastre = null; };
  elemento.addEventListener('pointerdown', pd);
  window.addEventListener('pointermove', pm);
  window.addEventListener('pointerup', pu);

  const cuadro = (t) => {
    const dt = Math.min(0.1, (t - tAnt) / 1000);
    tAnt = t;
    precargar(p);
    let velKmh = 0;
    const pend = pendienteRumbo();

    if (piloto) {
      const pr = piloto.prep[piloto.idx];
      const seg = (pr.tramo.tiempo_min ?? 1) * 60;
      if (piloto.enMarcha) {
        piloto.s += (pr.largo / seg) * piloto.vel * dt;
        velKmh = (pr.largo / seg) * 3.6;
        if (piloto.s >= pr.largo) {
          if (piloto.idx < piloto.prep.length - 1) { piloto.idx += 1; piloto.s = 0; } else { piloto.s = pr.largo; piloto.enMarcha = false; }
        }
      }
      const pa = piloto.prep[piloto.idx];
      p = puntoEn(pa, piloto.s);
      r = rumboEntre(p, puntoEn(pa, piloto.s + 8));
    } else {
      const giro = (teclas.has('e') || teclas.has('arrowright') ? 1 : 0) - (teclas.has('q') || teclas.has('arrowleft') ? 1 : 0);
      r = (r + giro * GIRO_DEG_S * dt + 360) % 360;
      const ade = (teclas.has('w') || teclas.has('arrowup') ? 1 : 0) - (teclas.has('s') || teclas.has('arrowdown') ? 1 : 0);
      const lado = (teclas.has('d') ? 1 : 0) - (teclas.has('a') ? 1 : 0);
      if (ade || lado) {
        const mult = teclas.has('shift') ? 10 : 1; // Shift: marcha acelerada ×10
        const ang = r + deg(Math.atan2(lado, ade)); // dirección del movimiento
        const pendMov = ade > 0 ? pend : ade < 0 ? -pend : 0; // la pendiente en el sentido de la marcha
        velKmh = velocidadMarcha(pendMov) * mult;
        const nuevo = desplazar(p, ang, (velKmh / 3.6) * dt);
        if (dentro(nuevo)) p = nuevo;
      }
    }

    const estado = {
      pos: p, rumbo: r, mirada, altura: cam.altura,
      elev_m: elevacion(p),
      pendiente_deg: pend,
      velocidad_kmh: velKmh,
      bloqueado: Math.abs(pend) > MARCHA.thetaMax,
      piloto: piloto && { idx: piloto.idx, frac: piloto.prep[piloto.idx].largo ? piloto.s / piloto.prep[piloto.idx].largo : 1, enMarcha: piloto.enMarcha },
    };
    onCuadro?.(estado);
    if (t - tAviso > 80) { tAviso = t; onEstado?.(estado); }
    raf = requestAnimationFrame(cuadro);
  };
  raf = requestAnimationFrame(cuadro);

  return {
    camara(c) { cam = CAMARAS[c] ?? cam; },
    teletransportar(q, nuevoRumbo) { piloto = null; if (dentro(q)) p = q; if (nuevoRumbo != null) r = nuevoRumbo; },
    seguirRuta(tramos, vel = 60) {
      if (tramos?.length) piloto = { prep: tramos.map(preparar), idx: 0, s: 0, vel, enMarcha: true };
    },
    pilotoVel(v) { if (piloto) piloto.vel = v; },
    pilotoPausa(enMarcha) { if (piloto) piloto.enMarcha = enMarcha; },
    pilotoTramo(i) { if (piloto) { piloto.idx = Math.max(0, Math.min(piloto.prep.length - 1, i)); piloto.s = 0; piloto.enMarcha = true; } },
    destruir() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', abajo);
      window.removeEventListener('keyup', arriba);
      window.removeEventListener('blur', perder);
      elemento.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
    },
  };
}
