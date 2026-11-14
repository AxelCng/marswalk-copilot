// Acceso a datos del mapa.
// Si la API de Said responde (VITE_API_URL, por defecto http://localhost:8000), se usa.
// Si no, se cae a contracts/graph_fake.json y contracts/ejemplos/, que tienen la forma exacta.

import grafoFake from '@contracts/graph_fake.json';
import demo1 from '@contracts/ejemplos/post_mision.demo1_mision_15deg.response.json';
import demo2 from '@contracts/ejemplos/post_mision.demo2_mision_20deg.response.json';
import alertaZ2 from '@contracts/ejemplos/post_alerta.response.json';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

async function http(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

/** Grafo filtrado a un límite de pendiente. Devuelve {meta, zonas, nodes, edges, fuente}. */
export async function getGrafo(pendienteMax = 15) {
  try {
    const g = await http('GET', `/grafo?pendiente_max=${pendienteMax}`);
    return { ...g, fuente: 'api' };
  } catch {
    return {
      ...grafoFake,
      // el grafo de ejemplo trae versiones 15/20/25: se usa la más grande que no supere lo pedido
      edges: (() => {
        const vers = [...new Set(grafoFake.edges.map((e) => e.limite_deg))].sort((p, q) => p - q);
        const v = [...vers].reverse().find((l) => l <= pendienteMax) ?? vers[0];
        return grafoFake.edges.filter((e) => e.limite_deg === v && e.pendiente_max_deg <= pendienteMax);
      })(),
      fuente: 'fake',
    };
  }
}

/** Ejemplos fijos de RespuestaMision, para trabajar sin API. */
export const ejemplos = { demo1, demo2, alertaZ2 };

export async function postMision(body) {
  return http('POST', '/mision', body);
}

export async function postAlerta(zona, tipo = 'polvo') {
  return http('POST', '/alerta', { zona, tipo });
}

export async function postReset() {
  return http('POST', '/reset');
}
