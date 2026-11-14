/**
 * Las 3 preguntas de la demo, en un solo lugar (chat y Plan B).
 *
 * Con el graph.json real (data/out/) la pendiente que separa la cima del delta (E2) está entre 8° y 12°:
 * a 8° E2 queda omitida por pendiente y a 12° entra (data/HALLAZGO_pendiente_demo.md).
 * El tope es 4 horas: con 3 horas E2 no entra por tiempo con ningún límite.
 */
export const DEMO = {
  estaciones: ['E1', 'M1', 'M2', 'E2'],
  tiempo_max_min: 240,
  modo: 'orientacion' as const,
  pendiente_1: 8,
  pendiente_2: 12,
  zona: 'Z2',
};

/** Opciones del selector de pendiente del Plan B. */
export const PENDIENTES = [DEMO.pendiente_1, DEMO.pendiente_2, 15] as const;

// En inglés: el copiloto responde siempre en inglés (llm/agent.py) y estas frases son las de llm/test_questions.py.
export const FRASES = {
  paso1: `I want to visit the delta front, Séítah, the Three Forks depot and the upper delta, back in under 4 hours, with no slopes over ${DEMO.pendiente_1}°`,
  paso2: `What if I accept up to ${DEMO.pendiente_2}°?`,
  paso3: `Dust alert in zone ${DEMO.zona}`,
};
