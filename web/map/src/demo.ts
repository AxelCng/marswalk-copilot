/** Página de prueba del mapa: las 3 preguntas de la demo, con archivos de contracts/ o con la API en vivo. */
import { crearMapa } from './mapa';
import type { Grafo, Mision } from './mapa';
import grafoFake from '../../../contracts/graph_fake.json';
import mision15 from '../../../contracts/ejemplos/post_mision.demo1_mision_15deg.response.json';
import mision20 from '../../../contracts/ejemplos/post_mision.demo2_mision_20deg.response.json';
import alertaZ2 from '../../../contracts/ejemplos/post_alerta.response.json';

const API = 'http://localhost:8000';
const estado = document.getElementById('estado')!;
const vivo = document.getElementById('vivo') as HTMLInputElement;
const mapa = crearMapa(document.getElementById('mapa')!, {
  onClickEstacion: (id) => { estado.textContent = `clic en ${id}`; },
});

async function post<T>(ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(API + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  if (!r.ok) throw new Error(`${ruta}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

const pedido = (pendiente: number) => ({ estaciones: ['E1', 'M1', 'M2', 'E2'], tiempo_max_min: 240, pendiente_max: pendiente, modo: 'orientacion' });

async function cargar(): Promise<void> {
  if (vivo.checked) {
    const r = await fetch(`${API}/grafo`);
    mapa.cargarGrafo(await r.json() as Grafo);
    estado.textContent = 'datos: API en vivo';
  } else {
    mapa.cargarGrafo(grafoFake as unknown as Grafo);
    estado.textContent = 'datos: contracts/';
  }
  mapa.limpiar();
}

const acciones: Record<string, () => Promise<void>> = {
  async m15() {
    if (vivo.checked) await post('/reset');
    mapa.mostrarMision(vivo.checked ? await post<Mision>('/mision', pedido(15)) : mision15 as unknown as Mision);
  },
  async m20() {
    mapa.mostrarMision(vivo.checked ? await post<Mision>('/mision', pedido(20)) : mision20 as unknown as Mision);
  },
  async alerta() {
    if (!vivo.checked) { mapa.mostrarMision(mision15 as unknown as Mision); }
    else { await post('/reset'); mapa.mostrarMision(await post<Mision>('/mision', pedido(15))); }
    const r = vivo.checked ? await post<Mision>('/alerta', { zona: 'Z2', tipo: 'polvo' }) : alertaZ2 as unknown as Mision;
    setTimeout(() => mapa.mostrarAlerta(r, 'Z2'), 700);
  },
  async limpiar() {
    if (vivo.checked) await post('/reset');
    mapa.limpiar();
  },
};

document.querySelectorAll<HTMLButtonElement>('button[data-accion]').forEach((b) => {
  b.addEventListener('click', () => {
    acciones[b.dataset.accion!]().catch((e: Error) => { estado.textContent = `error: ${e.message}`; });
  });
});
vivo.addEventListener('change', () => { cargar().catch((e: Error) => { estado.textContent = `error: ${e.message} (¿está corriendo el motor?)`; }); });

// Atajos por URL para probar rápido: ?vivo=1&accion=m15 | m20 | alerta
const params = new URLSearchParams(location.search);
vivo.checked = params.get('vivo') === '1';
cargar()
  .then(() => { const a = params.get('accion'); if (a && acciones[a]) return acciones[a](); })
  .catch((e: Error) => { estado.textContent = `error: ${e.message}`; });
