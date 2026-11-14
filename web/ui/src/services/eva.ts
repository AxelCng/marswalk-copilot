/**
 * Canal de la EVA en vivo entre ventanas de la misma app (BroadcastChannel).
 *
 *   visor  → consola : 'estado'  posición, rumbo y tramo del astronauta (~10 por segundo)
 *   consola → visor  : 'mision'  la misión activa (y la previa a una alerta), para que una ventana
 *                                de visor abierta aparte (?vista=visor) muestre la misma ruta
 *   consola → visor  : 'ir'      mover al astronauta a un punto (clic en el mapa del tablero)
 *   visor  → consola : 'pedir'   pedir la misión al abrir la ventana del visor
 *
 * Funciona entre ventanas o pestañas del mismo origen (misma URL base). Para monitorear desde
 * otra computadora haría falta un relé en el servidor (WebSocket), que no está implementado.
 */
import type { RespuestaMision } from '../types/mission';

export interface EstadoAstronauta {
  pos: [number, number];
  rumbo: number;
  elev_m: number | null;
  pendiente_deg: number;
  velocidad_kmh: number;
  tramo: number | null;
  piloto: boolean;
}

export interface MisionCompartida {
  mision: RespuestaMision | null;
  misionPrevia: RespuestaMision | null;
  zonaAlerta: string | null;
  ejemplo: boolean;
}

type Mensaje =
  | { tipo: 'estado'; estado: EstadoAstronauta | null }
  | { tipo: 'mision'; datos: MisionCompartida }
  | { tipo: 'ir'; pos: [number, number] }
  | { tipo: 'pedir' };

const canal: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('marswalk-eva') : null;

const enviar = (m: Mensaje) => canal?.postMessage(m);

function escuchar<T extends Mensaje['tipo']>(tipo: T, fn: (m: Extract<Mensaje, { tipo: T }>) => void): () => void {
  if (!canal) return () => {};
  const h = (e: MessageEvent<Mensaje>) => { if (e.data?.tipo === tipo) fn(e.data as Extract<Mensaje, { tipo: T }>); };
  canal.addEventListener('message', h);
  return () => canal.removeEventListener('message', h);
}

export const eva = {
  disponible: !!canal,
  publicarEstado: (estado: EstadoAstronauta | null) => enviar({ tipo: 'estado', estado }),
  alEstado: (fn: (e: EstadoAstronauta | null) => void) => escuchar('estado', (m) => fn(m.estado)),
  publicarMision: (datos: MisionCompartida) => enviar({ tipo: 'mision', datos }),
  alMision: (fn: (d: MisionCompartida) => void) => escuchar('mision', (m) => fn(m.datos)),
  pedirMision: () => enviar({ tipo: 'pedir' }),
  alPedido: (fn: () => void) => escuchar('pedir', () => fn()),
  ir: (pos: [number, number]) => enviar({ tipo: 'ir', pos }),
  alIr: (fn: (pos: [number, number]) => void) => escuchar('ir', (m) => fn(m.pos)),
};
