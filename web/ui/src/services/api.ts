import type { EstacionResumen, EstacionDetalle, RespuestaMision, ChatResponse, PlanBParams } from '../types/mission';
import { MOCK_ESTACIONES, MOCK_MISION_15DEG, MOCK_MISION_20DEG, MOCK_CHAT_FLOW } from '../mocks/mockData';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

class ApiService {
  public useMock: boolean = true;

  constructor() {
    // Default to true until backend is confirmed alive
    const saved = localStorage.getItem('mw_use_mock');
    if (saved !== null) {
      this.useMock = saved === 'true';
    }
  }

  public setUseMock(value: boolean) {
    this.useMock = value;
    localStorage.setItem('mw_use_mock', String(value));
  }

  async getEstaciones(): Promise<EstacionResumen[]> {
    if (this.useMock) {
      return MOCK_ESTACIONES.map(({ id, nombre, tipo, valor_cientifico, lon, lat }) => ({
        id, nombre, tipo, valor_cientifico, lon, lat
      }));
    }

    try {
      const res = await fetch(`${API_BASE}/estaciones`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async postAlerta(zona: string, tipo: 'polvo' | 'comms'): Promise<RespuestaMision> {
    if (this.useMock) {
      return {
        ...MOCK_MISION_15DEG,
        aristas_afectadas: ["HAB->E1"]
      };
    }

    const res = await fetch(`${API_BASE}/alerta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zona, tipo })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async resetAlerta(): Promise<{ ok: boolean }> {
    if (this.useMock) return { ok: true };

    const res = await fetch(`${API_BASE}/reset`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Chat endpoint failed, fallback:', err);
      return MOCK_CHAT_FLOW.demo1;
    }
  }
}

export const api = new ApiService();
