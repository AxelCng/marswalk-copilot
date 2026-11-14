// Procedencia de cada estación: estaciones.csv de la raíz del repo
// (justificado en estaciones_fuentes.md). Cada campo lleva su tipo de dato:
//   NASA       → sale tal cual de un archivo oficial (waypoints M20, Raw Images)
//   VERIFICADO → inferido de los datos y confirmado con una fuente publicada
//   SUPUESTO   → decisión del equipo para la simulación
// El mapa lo usa para mostrar de dónde sale cada número de la ficha.

import csv from '@repo/estaciones.csv?raw';

/** CSV con comillas dobles (RFC 4180 mínimo). */
function parseCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((x) => x !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x !== '')) filas.push(fila);
  const [cab, ...resto] = filas;
  return resto.map((f) => Object.fromEntries(cab.map((k, i) => [k.trim(), f[i]?.trim() ?? ''])));
}

const num = (v) => (v === '' || v == null ? null : Number(v));

/** Separa "VERIFICADO: texto" en {estado, texto}. */
function verificacion(v) {
  const m = /^([A-ZÁÉÍÓÚ]+):\s*(.*)$/s.exec(v ?? '');
  return m ? { estado: m[1], texto: m[2] } : { estado: null, texto: v ?? '' };
}

export const PROCEDENCIA = Object.fromEntries(
  parseCsv(csv).map((r) => [
    r.id,
    {
      id: r.id,
      elev_m: num(r.elev_m),
      waypoint_sol: num(r.waypoint_sol),
      inclinacion_rover_max_deg: num(r.inclinacion_rover_max_deg),
      foto: r.foto_url ? { url: r.foto_url, camara: r.foto_camara, sol: num(r.foto_sol), credito: 'NASA/JPL-Caltech' } : null,
      verificacion: verificacion(r.verificacion),
      fuente: r.fuente_principal || null,
      // Roles de apoyo: la misión tripulada es ficticia (estaciones_fuentes.md).
      rol_supuesto: ['habitat', 'rover', 'refugio', 'comms'].includes(r.tipo),
    },
  ]),
);

/** Dominio legible de una URL de fuente. */
export const dominio = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};
