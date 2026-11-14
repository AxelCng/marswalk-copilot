export type TipoEstacion = 'habitat' | 'rover' | 'ciencia' | 'muestreo' | 'refugio' | 'comms';

export interface EstacionResumen {
  id: string;
  nombre: string;
  tipo: TipoEstacion;
  valor_cientifico: number;
  lon: number;
  lat: number;
}

export interface FotoEstacion {
  url: string | null;
  camara: string;
  sol: number;
  credito?: string;
}

export interface CapasEstacion {
  elev_m: number;
  pendiente_deg: number;
  themis_noche: number;
}

export interface EstacionDetalle extends EstacionResumen {
  tarea: string;
  permanencia_min: number;
  unidad_geologica: string;
  zona?: string | null; // null: las zonas de alerta no contienen estaciones
  capas: CapasEstacion;
  fotos: FotoEstacion[];
  /** Solo en la UI: unidad USGS SIM 3464 bajo la estación (services/geologia.ts), si hay capa geológica. */
  unidad_sim?: { simbolo: string; nombre: string; edad: string; color: string };
}

export interface Tramo {
  origen: string;
  destino: string;
  distancia_m: number;
  tiempo_min: number;
  pendiente_max_deg: number;
  cobertura_com_pct: number;
  dosis_rel: number;
  zonas: string[];
  geometria: [number, number][]; // [lon, lat][]
}

export interface Omitida {
  id: string;
  motivo: 'pendiente' | 'tiempo' | 'alerta' | 'comms' | 'no_existe';
  detalle: {
    pendiente_max_deg?: number;
    limite?: number;
    tiempo_max_min?: number;
    zonas?: string[];
    cobertura_com_pct?: number;
    umbral?: number;
  };
}

export interface TotalesMision {
  distancia_m: number;
  tiempo_min: number;
  dosis_rel: number;
  margen_min: number | null;
}

export interface RespuestaMision {
  factible: boolean;
  ruta: string[];
  tramos: Tramo[];
  omitidas: Omitida[];
  totales: TotalesMision;
  aristas_afectadas?: string[];
  /** Agregado por /chat (llm/agent.py) cuando la misión sigue a otra: diferencias calculadas por código. */
  comparison_with_previous?: ComparacionMision | null;
}

export interface ComparacionMision {
  previous_time_min: number;
  new_time_min: number;
  time_difference_min: number;
  stations_added: string[];
  stations_removed: string[];
}

export interface LlamadaHerramienta {
  tool: string;
  arguments: Record<string, any>;
  ok: boolean;
}

export interface ChatResponse {
  answer: string;
  calls: LlamadaHerramienta[];
  route: RespuestaMision | null;
  // Agregados de llm/ (aditivos, ver llm/README.md)
  history?: { role: string; content: string }[];
  seconds?: number;
  unsourced_numbers?: string[];
  /** Si viene, el copiloto no está disponible (Ollama caído, modelo sin descargar): ofrecer el Plan B. */
  error?: string;
}

export interface MensajeHistorial {
  id: string;
  rol: 'usuario' | 'asistente';
  contenido: string;
  timestamp: string;
  llamadas?: LlamadaHerramienta[];
  ruta?: RespuestaMision | null;
  segundos?: number;
  numeros_sin_fuente?: string[];
  /** Mensaje que no se manda como historial a /chat (saludo, avisos y errores de la UI). */
  local?: boolean;
  error?: boolean;
}

export interface PlanBParams {
  estaciones: string[];
  tiempo_max_min: number | null;
  pendiente_max: number;
  modo: 'tsp' | 'orientacion';
  origen: string;
}


/** Grafo completo (GET /grafo o contracts/graph_fake.json). Lo dibuja web/map/src/MarsMap.jsx. */
export interface Grafo {
  meta?: Record<string, unknown>;
  zonas?: { id: string; nombre: string; poligono: [number, number][] }[];
  nodes: EstacionDetalle[];
  edges: (Tramo & { limite_deg: number; energia_rel?: number; sombra_pct?: number })[];
}
