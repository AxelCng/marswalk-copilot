/**
 * Nombres en inglés para mostrar los datos del grafo (que vienen en español desde data/ y el motor).
 *
 * La fuente es web/shared/i18n_en.json, generado desde llm/tools.py: así la pantalla y el copiloto
 * llaman igual a cada estación y zona. Se traduce solo lo que se muestra (nombre, tarea, zona);
 * ids, tipos y motivos siguen en español porque son claves del contrato.
 */
import i18n from '../../shared/i18n_en.json';
import type { EstacionDetalle, EstacionResumen, Grafo } from './types/mission';

const sinTildes = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const ESTACIONES = i18n.estaciones as Record<string, string>;
const TAREAS = i18n.tareas as Record<string, string>;
const ZONAS = i18n.zonas as Record<string, string>;
const TIPOS = i18n.tipos as Record<string, string>;

/** Nombre de una zona en inglés (si no está en el diccionario, queda el original). */
export const zonaEn = (nombre: string | undefined | null): string =>
  nombre ? ZONAS[sinTildes(nombre)] ?? nombre : '';

/** Tipo de estación en inglés, solo para mostrar ('ciencia' -> 'science'). */
export const tipoEn = (tipo: string): string => TIPOS[tipo] ?? tipo;

export function estacionEn<T extends EstacionResumen | EstacionDetalle>(e: T): T {
  const out = { ...e, nombre: ESTACIONES[e.id] ?? e.nombre };
  if ('tarea' in e) (out as EstacionDetalle).tarea = TAREAS[e.id] ?? (e as EstacionDetalle).tarea;
  return out;
}

export function grafoEn(g: Grafo): Grafo {
  return {
    ...g,
    nodes: g.nodes.map(estacionEn),
    zonas: g.zonas?.map((z) => ({ ...z, nombre: zonaEn(z.nombre) })),
  };
}
