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
import { grafoEn } from '../i18n';

// En inglés para mostrar (ver src/i18n.ts); ids y claves siguen como en el contrato
export const MOCK_GRAFO = grafoEn(grafo as unknown as Grafo);
export const MOCK_ESTACIONES = MOCK_GRAFO.nodes as EstacionDetalle[];
export const MOCK_MISION_15DEG = mision15 as unknown as RespuestaMision;
export const MOCK_MISION_20DEG = mision20 as unknown as RespuestaMision;
export const MOCK_ALERTA_Z2 = alertaZ2 as unknown as RespuestaMision;

const nombre = (id: string) => MOCK_ESTACIONES.find((e) => e.id === id)?.nombre ?? id;
const recorrido = (m: RespuestaMision) => m.ruta.map(nombre).join(' → ');
const omitida15 = MOCK_MISION_15DEG.omitidas[0];

// Respuestas de ejemplo del copiloto, armadas SOLO con números de los JSON de arriba.
export const MOCK_CHAT_FLOW: Record<'demo1' | 'demo2' | 'demo3', ChatResponse> = {
  demo1: {
    answer:
      `[TEST MODE] Route with a 15° maximum slope: ${recorrido(MOCK_MISION_15DEG)}. ` +
      `Total time ${MOCK_MISION_15DEG.totales.tiempo_min} min (margin ${MOCK_MISION_15DEG.totales.margen_min} min). ` +
      `I skipped ${nombre(omitida15.id)}: its gentlest path is ${omitida15.detalle.pendiente_max_deg}° and you asked for ${omitida15.detalle.limite}°.`,
    calls: [{ tool: 'optimize_mission',
      arguments: { stations: ['E1', 'M1', 'M2', 'E2'], max_time_min: 240, max_slope_deg: 15 }, ok: true }],
    route: MOCK_MISION_15DEG,
  },
  demo2: {
    answer:
      `[TEST MODE] With 20° I add ${nombre('E2')}: ${recorrido(MOCK_MISION_20DEG)}. ` +
      `Total time ${MOCK_MISION_20DEG.totales.tiempo_min} min (margin ${MOCK_MISION_20DEG.totales.margen_min} min).`,
    calls: [{ tool: 'optimize_mission',
      arguments: { stations: ['E1', 'M1', 'M2', 'E2'], max_time_min: 240, max_slope_deg: 20 }, ok: true }],
    // misma forma que llm/agent.py (_comparar), calculada con los JSON de contracts/
    route: {
      ...MOCK_MISION_20DEG,
      comparison_with_previous: {
        previous_time_min: MOCK_MISION_15DEG.totales.tiempo_min,
        new_time_min: MOCK_MISION_20DEG.totales.tiempo_min,
        time_difference_min: Math.round((MOCK_MISION_20DEG.totales.tiempo_min - MOCK_MISION_15DEG.totales.tiempo_min) * 10) / 10,
        stations_added: MOCK_MISION_15DEG.omitidas.map((o) => o.id).filter((id) => MOCK_MISION_20DEG.ruta.includes(id)),
        stations_removed: [],
      },
    },
  },
  demo3: {
    answer:
      `[TEST MODE] Dust alert in Z2. I avoided the legs ${(MOCK_ALERTA_Z2.aristas_afectadas ?? []).join(', ')}. ` +
      `New route: ${recorrido(MOCK_ALERTA_Z2)}, ${MOCK_ALERTA_Z2.totales.tiempo_min} min.`,
    calls: [{ tool: 'reroute_for_alert', arguments: { zone: 'Z2', type: 'dust' }, ok: true }],
    route: MOCK_ALERTA_Z2,
  },
};
