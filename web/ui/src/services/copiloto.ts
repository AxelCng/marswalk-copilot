/**
 * Conversación con el copiloto, compartida por la consola (ChatPanel) y el visor del astronauta.
 *
 * Vive fuera de los componentes para que las dos vistas lean el mismo historial, y se sincroniza
 * entre ventanas (visor abierto aparte con ?vista=visor) por el canal de eva.ts: cada cambio manda
 * una foto entera de la conversación con un número de versión, y una ventana solo adopta fotos más
 * nuevas que la suya. La ventana donde se hace la pregunta es la que llama a /chat.
 */
import { useSyncExternalStore } from 'react';
import type { MensajeHistorial } from '../types/mission';
import { api } from './api';
import { eva } from './eva';
import { DEMO } from '../demo';

export interface EstadoCopiloto {
  mensajes: MensajeHistorial[];
  cargando: boolean;
  /** Date.now() al empezar la pregunta en curso; null sin pregunta. */
  desde: number | null;
  version: number;
}

export const SALUDO =
  `Where do you want to walk? Tell me the stations, how much time you have and the steepest slope you'll accept. ` +
  `For example: "the delta front and Séítah, back in 3 hours, no slopes over ${DEMO.pendiente_2}°".`;

const NO_RESPONDE =
  "The copilot isn't reachable right now. Mission Planner plans the same walk with the route engine directly.";

// Hora local de quien usa la consola (antes se mostraba un "SOL 415" inventado).
export const hora = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const saludo = (): MensajeHistorial => ({
  id: `init-${Date.now()}`,
  rol: 'asistente',
  contenido: SALUDO,
  timestamp: '',
  local: true,
});

let estado: EstadoCopiloto = { mensajes: [saludo()], cargando: false, desde: null, version: 0 };
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((fn) => fn());

/** Cambio hecho en esta ventana: sube la versión y lo comparte con las demás. */
function cambiar(parcial: Partial<Omit<EstadoCopiloto, 'version'>>) {
  estado = { ...estado, ...parcial, version: estado.version + 1 };
  avisar();
  eva.publicarChat(estado);
}

// Otra ventana cambió la conversación: se adopta solo si es más nueva.
eva.alChat((e) => {
  if (e.version <= estado.version) return;
  estado = e;
  avisar();
});
// Una ventana recién abierta pide la conversación; una que solo tiene el saludo no contesta.
eva.alPedidoChat(() => { if (estado.version > 0) eva.publicarChat(estado); });
eva.pedirChat();

// Si esta ventana se cierra con una pregunta en curso, las demás quedarían esperando para siempre
// ("Thinking…" y sin poder preguntar): se avisa que la pregunta se cortó.
let preguntandoAqui = false;
window.addEventListener('pagehide', () => {
  if (!preguntandoAqui) return;
  preguntandoAqui = false;
  cambiar({
    mensajes: [...estado.mensajes, {
      id: `err-${Date.now()}`, rol: 'asistente', timestamp: hora(), error: true, local: true,
      contenido: 'The window that asked this question was closed before the answer arrived. Ask again.',
    }],
    cargando: false,
    desde: null,
  });
});

async function preguntar(texto: string): Promise<void> {
  const text = texto.trim();
  if (!text || estado.cargando) return;

  // Solo la conversación real: un historial vacío hace que /chat empiece de cero.
  const historial = estado.mensajes
    .filter((m) => !m.local)
    .map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.contenido }));

  cambiar({
    mensajes: [...estado.mensajes, { id: `user-${Date.now()}`, rol: 'usuario', contenido: text, timestamp: hora() }],
    cargando: true,
    desde: Date.now(),
  });
  preguntandoAqui = true;

  let respuesta: MensajeHistorial;
  try {
    const res = await api.postChat(text, historial);
    respuesta = {
      id: `bot-${Date.now()}`,
      rol: 'asistente',
      contenido: res.answer,
      timestamp: hora(),
      llamadas: res.calls,
      ruta: res.route,
      segundos: res.seconds,
      numeros_sin_fuente: res.unsourced_numbers,
      // Con error, /chat igual responde 200: el mensaje no entra al historial y se ofrece el Plan B.
      error: Boolean(res.error),
      local: Boolean(res.error),
    };
  } catch (err) {
    console.error(err);
    respuesta = { id: `err-${Date.now()}`, rol: 'asistente', contenido: NO_RESPONDE, timestamp: hora(), error: true, local: true };
  }
  if (!preguntandoAqui) return; // la ventana ya se estaba cerrando y avisó
  preguntandoAqui = false;
  cambiar({ mensajes: [...estado.mensajes, respuesta], cargando: false, desde: null });
}

function reiniciar() {
  if (estado.cargando) return;
  cambiar({ mensajes: [saludo()] });
}

export const copiloto = {
  estado: () => estado,
  suscribir: (fn: () => void) => { oyentes.add(fn); return () => { oyentes.delete(fn); }; },
  preguntar,
  reiniciar,
};

export function useCopiloto(): EstadoCopiloto {
  return useSyncExternalStore(copiloto.suscribir, copiloto.estado);
}
