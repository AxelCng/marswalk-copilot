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
  zona: string;
  capas: CapasEstacion;
  fotos: FotoEstacion[];
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
}

export interface LlamadaHerramienta {
  herramienta: string;
  argumentos: Record<string, any>;
  ok: boolean;
}

export interface ChatResponse {
  respuesta: string;
  llamadas: LlamadaHerramienta[];
  ruta: RespuestaMision | null;
}

export interface MensajeHistorial {
  id: string;
  rol: 'usuario' | 'asistente';
  contenido: string;
  timestamp: string;
  llamadas?: LlamadaHerramienta[];
  ruta?: RespuestaMision | null;
}

export interface PlanBParams {
  estaciones: string[];
  tiempo_max_min: number | null;
  pendiente_max: number;
  modo: 'tsp' | 'orientacion';
  origen: string;
}

