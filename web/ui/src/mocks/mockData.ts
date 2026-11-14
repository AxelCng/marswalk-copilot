/**
 * Datos de prueba = los archivos oficiales de contracts/.
 * No se escriben números a mano: si cambian las estaciones o el grafo, se regenera
 * contracts/ (python contracts/tools/generar_graph_fake.py) y esto se actualiza solo.
 */
import grafo from '../../../../contracts/graph_fake.json';
import mision15 from '../../../../contracts/ejemplos/post_mision.demo1_mision_15deg.response.json';
import mision20 from '../../../../contracts/ejemplos/post_mision.demo2_mision_20deg.response.json';
import alertaZ2 from '../../../../contracts/ejemplos/post_alerta.response.json';
import type { ChatResponse, EstacionDetalle, RespuestaMision } from '../types/mission';
import type { Grafo } from '../types/mission';

export const MOCK_GRAFO = grafo as unknown as Grafo;
export const MOCK_ESTACIONES = grafo.nodes as unknown as EstacionDetalle[];
export const MOCK_MISION_15DEG = mision15 as unknown as RespuestaMision;
export const MOCK_MISION_20DEG = mision20 as unknown as RespuestaMision;
export const MOCK_ALERTA_Z2 = alertaZ2 as unknown as RespuestaMision;

const nombre = (id: string) => MOCK_ESTACIONES.find((e) => e.id === id)?.nombre ?? id;
const recorrido = (m: RespuestaMision) => m.ruta.map(nombre).join(' → ');
const omitida15 = MOCK_MISION_15DEG.omitidas[0];

// Respuestas de ejemplo del copiloto, armadas SOLO con números de los JSON de arriba.
export const MOCK_CHAT_FLOW: Record<'demo1' | 'demo2' | 'demo3', ChatResponse> = {
  demo1: {
    respuesta:
      `[MODO PRUEBA] Ruta con pendiente máxima de 15°: ${recorrido(MOCK_MISION_15DEG)}. ` +
      `Tiempo total ${MOCK_MISION_15DEG.totales.tiempo_min} min (margen ${MOCK_MISION_15DEG.totales.margen_min} min). ` +
      `Omití ${nombre(omitida15.id)} porque su camino más suave tiene ${omitida15.detalle.pendiente_max_deg}° y pediste ${omitida15.detalle.limite}°.`,
    llamadas: [{ herramienta: 'optimizar_mision',
      argumentos: { estaciones: ['E1', 'M1', 'M2', 'E2'], tiempo_max_min: 240, pendiente_max: 15 }, ok: true }],
    ruta: MOCK_MISION_15DEG,
  },
  demo2: {
    respuesta:
      `[MODO PRUEBA] Con 20° entra ${nombre('E2')}: ${recorrido(MOCK_MISION_20DEG)}. ` +
      `Tiempo total ${MOCK_MISION_20DEG.totales.tiempo_min} min (margen ${MOCK_MISION_20DEG.totales.margen_min} min).`,
    llamadas: [{ herramienta: 'optimizar_mision',
      argumentos: { estaciones: ['E1', 'M1', 'M2', 'E2'], tiempo_max_min: 240, pendiente_max: 20 }, ok: true }],
    ruta: MOCK_MISION_20DEG,
  },
  demo3: {
    respuesta:
      `[MODO PRUEBA] Alerta de polvo en Z2. Evité los tramos ${(MOCK_ALERTA_Z2.aristas_afectadas ?? []).join(', ')}. ` +
      `Nueva ruta: ${recorrido(MOCK_ALERTA_Z2)}, ${MOCK_ALERTA_Z2.totales.tiempo_min} min.`,
    llamadas: [{ herramienta: 'recalcular_por_alerta', argumentos: { zona: 'Z2', tipo: 'polvo' }, ok: true }],
    ruta: MOCK_ALERTA_Z2,
  },
};
