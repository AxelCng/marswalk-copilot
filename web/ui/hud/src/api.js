// Acceso a datos del visor HUD.
// Si la API de Said responde (VITE_API_URL, por defecto http://localhost:8000), se usa.
// Si no, se cae a contracts/graph_fake.json y contracts/ejemplos/, que tienen la forma exacta.
// Ninguna cifra que muestra el HUD se inventa: todo sale de estas respuestas.

import grafoFake from '@contracts/graph_fake.json';
import reqMision from '@contracts/ejemplos/post_mision.demo1_mision_15deg.request.json';
import resMision from '@contracts/ejemplos/post_mision.demo1_mision_15deg.response.json';
import reqAlerta from '@contracts/ejemplos/post_alerta.request.json';
import resAlerta from '@contracts/ejemplos/post_alerta.response.json';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

/** La alerta de demo: polvo en Z2. */
export const ALERTA_DEMO = reqAlerta;

async function http(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

/** Nodos completos (con fotos) y zonas. {nodos, zonas, fuente} */
export async function cargarGrafo() {
  try {
    const lista = await http('GET', '/estaciones');
    const nodos = await Promise.all(lista.map((e) => http('GET', `/estaciones/${e.id}`)));
    let zonas = grafoFake.zonas;
    try {
      zonas = (await http('GET', '/grafo')).zonas ?? zonas;
    } catch {
      /* zonas del grafo falso */
    }
    return { nodos, zonas, fuente: 'api' };
  } catch {
    return { nodos: grafoFake.nodes, zonas: grafoFake.zonas, fuente: 'ejemplo' };
  }
}

/** Misión de demo 1 (15°). {mision, request, fuente} */
export async function cargarMision() {
  try {
    return { mision: await http('POST', '/mision', reqMision), request: reqMision, fuente: 'api' };
  } catch {
    return { mision: resMision, request: reqMision, fuente: 'ejemplo' };
  }
}

/** Dispara la alerta de demo. Si la misión vino de los ejemplos, no se mezcla con la API. */
export async function dispararAlerta(fuente) {
  if (fuente === 'api') {
    try {
      return { mision: await http('POST', '/alerta', reqAlerta), fuente: 'api' };
    } catch {
      /* cae al ejemplo */
    }
  }
  return { mision: resAlerta, fuente: 'ejemplo' };
}

/** Quita las alertas y vuelve a pedir la misión. */
export async function resetear(fuente) {
  if (fuente === 'api') {
    try {
      await http('POST', '/reset');
    } catch {
      /* igual se recarga */
    }
  }
  return cargarMision();
}
