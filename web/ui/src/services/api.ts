import type { EstacionResumen, EstacionDetalle, RespuestaMision, ChatResponse, PlanBParams } from '../types/mission';
import { estacionEn, grafoEn } from '../i18n';
import { MOCK_ESTACIONES, MOCK_MISION_15DEG, MOCK_MISION_20DEG, MOCK_ALERTA_Z2, MOCK_CHAT_FLOW, MOCK_GRAFO } from '../mocks/mockData';
import type { Grafo } from '../types/mission';

import { DEMO } from '../demo';

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
    return grafoEn(await res.json());
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
      return (await res.json() as EstacionResumen[]).map(estacionEn);
    } catch (err) {
      console.warn('Backend unavailable, falling back to mock:', err);
      return MOCK_ESTACIONES;
    }
  }

  async getEstacion(id: string): Promise<EstacionDetalle> {
    if (this.useMock) {
      const found = MOCK_ESTACIONES.find(e => e.id === id);
      if (!found) throw new Error(`Station ${id} not found`);
      return found;
    }

    try {
      const res = await fetch(`${API_BASE}/estaciones/${id}`);
      if (!res.ok) throw await errorDe(res);
      return estacionEn(await res.json() as EstacionDetalle);
    } catch (err) {
      console.warn('Backend unavailable, falling back to mock:', err);
      const found = MOCK_ESTACIONES.find(e => e.id === id);
      if (!found) throw new Error(`Station ${id} not found`);
      return found;
    }
  }

  async postMision(params: PlanBParams): Promise<RespuestaMision> {
    if (this.useMock) {
      // Simulate demo 1 vs demo 2 based on slope
      // paso 2 de la demo (12°) → ejemplo de 20° de contracts/; paso 1 (8°) → ejemplo de 15°
      if (params.pendiente_max >= DEMO.pendiente_2) {
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

  /** Carga el modelo del copiloto en la GPU para que la primera pregunta no espere (~2.5 min en frío). */
  async precalentarChat(): Promise<{ model: string; seconds?: number; error?: string } | null> {
    if (this.useMock) return null;
    try {
      const res = await fetch(`${API_BASE}/chat/warmup`, { method: 'POST' });
      return res.ok ? await res.json() : null;
    } catch {
      return null; // sin motor o sin /chat: el chat ya avisa y ofrece el Plan B
    }
  }

  async postChat(mensaje: string, historial: { role: string; content: string }[]): Promise<ChatResponse> {
    if (this.useMock) {
      const lower = mensaje.toLowerCase();
      // Match demo cues
      if (lower.includes(String(DEMO.pendiente_2)) || lower.includes('acepto') || lower.includes('accept')) {
        return MOCK_CHAT_FLOW.demo2;
      }
      if (lower.includes('polvo') || lower.includes('dust') || lower.includes('alert') || lower.includes('z2')) {
        return MOCK_CHAT_FLOW.demo3;
      }
      return MOCK_CHAT_FLOW.demo1;
    }

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: mensaje, history: historial })
      });
      if (!res.ok) throw await errorDe(res);
      return await res.json();
    } catch (err) {
      // Nunca responder con datos de prueba si el copiloto real falla: el panel avisa y ofrece el plan B.
      throw new Error(`The copilot did not respond (${err instanceof Error ? err.message : err}). Use the Plan B form.`);
    }
  }
}

export const api = new ApiService();
