import React, { useState } from 'react';
import type { EstacionDetalle, PlanBParams, RespuestaMision } from '../types/mission';
import { api } from '../services/api';
import { ShieldCheck, Send, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

interface PlanBFormProps {
  stations: EstacionDetalle[];
  onMissionCalculated: (res: RespuestaMision) => void;
  /** Si viene, la alerta se muestra como alerta (zona roja + tramos evitados) en el mapa. */
  onAlertaCalculada?: (res: RespuestaMision, zona: string) => void;
}

const PENDIENTES = [15, 20, 25] as const;

export const PlanBForm: React.FC<PlanBFormProps> = ({ stations, onMissionCalculated, onAlertaCalculada }) => {
  const [selectedStations, setSelectedStations] = useState<string[]>(['E1', 'M1', 'M2', 'E2']);
  const [pendienteMax, setPendienteMax] = useState<number>(15);
  const [tiempoMax, setTiempoMax] = useState<number>(240); // tope de la demo (params.yaml: tiempo_max_min_default)
  const [modo, setModo] = useState<'orientacion' | 'tsp'>('orientacion');
  const [loading, setLoading] = useState<boolean>(false);
  const [alertaLoading, setAlertaLoading] = useState<boolean>(false);

  const toggleStation = (id: string) => {
    setSelectedStations((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const params: PlanBParams = {
        estaciones: selectedStations,
        tiempo_max_min: tiempoMax,
        pendiente_max: pendienteMax,
        modo,
        origen: 'HAB'
      };

      const result = await api.postMision(params);
      onMissionCalculated(result);
    } catch (err) {
      console.error('Error calculando ruta plan B:', err);
      alert('Error calculando ruta. Revisa la consola o asegúrate de que el backend esté arriba.');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerAlert = async () => {
    setAlertaLoading(true);
    try {
      const result = await api.postAlerta('Z2', 'polvo');
      if (onAlertaCalculada) onAlertaCalculada(result, 'Z2');
      else onMissionCalculated(result);
    } catch (err) {
      console.error(err);
    } finally {
      setAlertaLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      await api.resetAlerta();
      handleCalculate();
    } catch (err) {
      console.error(err);
    }
  };

  const candidateStations = stations.filter((s) => s.id !== 'HAB');

  return (
    <div className="panel p-4 flex flex-col gap-4">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-hud-cyan" />
          <div>
            <h3 className="m-0 font-display text-base font-semibold text-ink">Plan B · Misión manual</h3>
            <span className="label-caps">Cálculo directo por el motor de grafos, sin LLM</span>
          </div>
        </div>
        <span className="chip warning">Respaldo demo</span>
      </div>

      {/* Estaciones */}
      <section className="bloque">
        <div className="flex items-center justify-between">
          <h4 className="label-caps m-0">Estaciones a visitar</h4>
          <span className="font-mono text-[11px] text-hud-cyan">{selectedStations.length} seleccionadas</span>
        </div>

        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 border-0 m-0 p-0">
          {candidateStations.map((station) => {
            const isChecked = selectedStations.includes(station.id);
            return (
              <label
                key={station.id}
                className={`grid grid-cols-[14px_8px_2.25rem_minmax(0,1fr)_auto] items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-hud-cyan/5 ${isChecked ? 'text-ink' : 'text-ink-dim'}`}
              >
                <input type="checkbox" checked={isChecked} onChange={() => toggleStation(station.id)} className="h-3.5 w-3.5 m-0" />
                <i className="h-2 w-2 rounded-full" style={{ background: `var(--tipo-${station.tipo})` }} aria-hidden />
                <b className="font-mono text-xs font-semibold">{station.id}</b>
                <span className="text-xs truncate">{station.nombre}</span>
                <span className="font-mono text-[10px] text-ink-mute dato-num">
                  {station.valor_cientifico > 0 ? `+${station.valor_cientifico}` : ''} · {station.capas.pendiente_deg}°
                </span>
              </label>
            );
          })}
        </fieldset>
      </section>

      {/* Restricciones */}
      <section className="bloque">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="label-caps">Pendiente máxima del traje</span>
            <div className="segmentado">
              {PENDIENTES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPendienteMax(p)}
                  className={pendienteMax === p ? 'activo' : ''}
                  aria-pressed={pendienteMax === p}
                >
                  {p}°
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="label-caps">Tiempo máximo</span>
            <span className="flex items-center bg-hud-glass/90 border border-hud-border rounded focus-within:border-hud-cyan">
              <input
                type="number"
                min={30}
                max={480}
                step={15}
                value={tiempoMax}
                onChange={(e) => setTiempoMax(Number(e.target.value))}
                className="flex-1 min-w-0 px-2 py-1 bg-transparent border-0 outline-none text-ink font-mono text-sm dato-num"
              />
              <span className="pr-2 font-mono text-[11px] text-ink-mute">min · {(tiempoMax / 60).toFixed(1)} h</span>
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="label-caps">Algoritmo</span>
          <div className="segmentado">
            <button type="button" onClick={() => setModo('orientacion')} className={modo === 'orientacion' ? 'activo' : ''} aria-pressed={modo === 'orientacion'}>
              Orientación · máx. ciencia
            </button>
            <button type="button" onClick={() => setModo('tsp')} className={modo === 'tsp' ? 'activo' : ''} aria-pressed={modo === 'tsp'}>
              TSP · todas
            </button>
          </div>
        </div>
      </section>

      {/* Acciones */}
      <section className="bloque">
        <button
          type="button"
          onClick={handleCalculate}
          disabled={loading || selectedStations.length === 0}
          className="btn primario w-full"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Calcular ruta óptima
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={handleTriggerAlert} disabled={alertaLoading} className="btn alerta">
            <AlertTriangle className="h-3.5 w-3.5" /> Alerta polvo Z2
          </button>
          <button type="button" onClick={handleReset} title="Quita alertas y recalcula" className="btn">
            <RefreshCw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </section>
    </div>
  );
};
