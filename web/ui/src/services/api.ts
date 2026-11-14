import type { EstacionResumen, EstacionDetalle, RespuestaMision, ChatResponse, PlanBParams } from '../types/mission';
import { MOCK_ESTACIONES, MOCK_MISION_15DEG, MOCK_MISION_20DEG, MOCK_ALERTA_Z2, MOCK_CHAT_FLOW, MOCK_GRAFO } from '../mocks/mockData';
import type { Grafo } from '../types/mission';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

/** Error de la API con el código HTTP y el `detail` de FastAPI (p. ej. 409 "no hay mision para recalcular"). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.status = status;
  }
}

async function errorDe(res: Response): Promise<ApiError> {
  let detalle = '';
  try {
    const body = await res.json();
    detalle = typeof body?.detail === 'string' ? body.detail : JSON.stringify(body?.detail ?? body);
  } catch { /* cuerpo vacío o no JSON */ }
  return new ApiError(res.status, detalle ? `HTTP ${res.status}: ${detalle}` : `HTTP ${res.status}`);
}

class ApiService {
  public useMock: boolean = false;

  constructor() {
    // Por defecto se usa el motor real (FastAPI :8000). El modo prueba se activa a mano desde el HUD.
    const saved = localStorage.getItem('mw_use_mock');
    if (saved !== null) {
      this.useMock = saved === 'true';
    }
  }

  public setUseMock(value: boolean) {
    this.useMock = value;
    localStorage.setItem('mw_use_mock', String(value));
  }

  async getGrafo(): Promise<Grafo> {
    if (this.useMock) return MOCK_GRAFO;
    const res = await fetch(`${API_BASE}/grafo`);
    if (!res.ok) throw await errorDe(res);
    return await res.json();
  }

  async getEstaciones(): Promise<EstacionResumen[]> {
    if (this.useMock) {
      return MOCK_ESTACIONES.map(({ id, nombre, tipo, valor_cientifico, lon, lat }) => ({
        id, nombre, tipo, valor_cientifico, lon, lat
      }));
    }

    try {
      const res = await fetch(`${API_BASE}/estaciones`);
      if (!res.ok) throw await errorDe(res);
      return await res.json();
    } catch (err) {
      console.warn('Backend unavailable, falling back to mock:', err);
      return MOCK_ESTACIONES;
    }
  }

  async getEstacion(id: string): Promise<EstacionDetalle> {
    if (this.useMock) {
      const found = MOCK_ESTACIONES.find(e => e.id === id);
      if (!found) throw new Error(`Estación ${id} no encontrada`);
      return found;
    }

    try {
      const res = await fetch(`${API_BASE}/estaciones/${id}`);
      if (!res.ok) throw await errorDe(res);
      return await res.json();
    } catch (err) {
      console.warn('Backend unavailable, falling back to mock:', err);
      const found = MOCK_ESTACIONES.find(e => e.id === id);
      if (!found) throw new Error(`Estación ${id} no encontrada`);
      return found;
    }
  }

  async postMision(params: PlanBParams): Promise<RespuestaMision> {
    if (this.useMock) {
      // Simulate demo 1 vs demo 2 based on slope
      if (params.pendiente_max >= 20) {
        return MOCK_MISION_20DEG;
      }
      return MOCK_MISION_15DEG;
    }

    const res = await fetch(`${API_BASE}/mision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) throw await errorDe(res);
    return await res.json();
  }

  async postAlerta(zona: string, tipo: 'polvo' | 'comms'): Promise<RespuestaMision> {
    if (this.useMock) {
      // el único ejemplo de alerta en contracts/ es polvo en Z2 sobre la misión de 15°
      void zona; void tipo;
      return MOCK_ALERTA_Z2;
    }

    const res = await fetch(`${API_BASE}/alerta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zona, tipo })
    });
    if (!res.ok) throw await errorDe(res);
    return await res.json();
  }

  async resetAlerta(): Promise<{ ok: boolean }> {
    if (this.useMock) return { ok: true };

    const res = await fetch(`${API_BASE}/reset`, { method: 'POST' });
    if (!res.ok) throw await errorDe(res);
    return await res.json();
  }

  async postChat(mensaje: string, historial: { rol: string; contenido: string }[]): Promise<ChatResponse> {
    if (this.useMock) {
      const lower = mensaje.toLowerCase();
      // Match demo cues
      if (lower.includes('20') || lower.includes('acepto')) {
        return MOCK_CHAT_FLOW.demo2;
      }
      if (lower.includes('polvo') || lower.includes('alerta') || lower.includes('z2')) {
        return MOCK_CHAT_FLOW.demo3;
      }
      return MOCK_CHAT_FLOW.demo1;
    }

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje, historial })
      });
      if (!res.ok) throw await errorDe(res);
      return await res.json();
    } catch (err) {
      // Nunca responder con datos de prueba si el copiloto real falla: el panel avisa y ofrece el plan B.
      throw new Error(`El copiloto no respondió (${err instanceof Error ? err.message : err}). Usa el formulario Plan B.`);
    }
  }
}

export const api = new ApiService();
