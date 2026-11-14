import React, { useState } from 'react';
import type { EstacionDetalle, PlanBParams, RespuestaMision } from '../types/mission';
import { api } from '../services/api';
import { ShieldCheck, Mountain, Clock, Sparkles, Send, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

interface PlanBFormProps {
  stations: EstacionDetalle[];
  onMissionCalculated: (res: RespuestaMision) => void;
}

export const PlanBForm: React.FC<PlanBFormProps> = ({ stations, onMissionCalculated }) => {
  const [selectedStations, setSelectedStations] = useState<string[]>(['E1', 'M1', 'M2', 'E2']);
  const [pendienteMax, setPendienteMax] = useState<number>(15);
  const [tiempoMax, setTiempoMax] = useState<number>(180);
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
      onMissionCalculated(result);
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
    <div className="bg-[#0c121e] border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-400" />
          <div>
            <h3 className="font-mono text-sm font-bold text-white tracking-wide uppercase">
              Formulario de Misión — Modo Plan B
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              Cálculo directo por motor de grafos (Bypass LLM)
            </span>
          </div>
        </div>

        <span className="text-[11px] font-mono bg-amber-950/60 border border-amber-500/50 text-amber-400 px-2 py-0.5 rounded">
          RESPALDO DEMO
        </span>
      </div>

      {/* Stations Selection */}
      <div>
        <label className="text-xs font-mono font-semibold uppercase text-slate-300 flex items-center justify-between mb-2">
          <span>Estaciones Candidatas a Visitar</span>
          <span className="text-[11px] text-cyan-400 font-mono">
            {selectedStations.length} seleccionadas
          </span>
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {candidateStations.map((station) => {
            const isChecked = selectedStations.includes(station.id);
            return (
              <button
                key={station.id}
                type="button"
                onClick={() => toggleStation(station.id)}
                className={`flex flex-col text-left p-2.5 rounded-xl border transition-all text-xs font-mono ${isChecked
                    ? 'bg-cyan-950/40 border-cyan-400/80 text-white shadow-sm ring-1 ring-cyan-500/30'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-bold text-sm text-cyan-300">{station.id}</span>
                  {station.valor_cientifico > 0 && (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                      <Sparkles className="h-2.5 w-2.5" /> +{station.valor_cientifico}
                    </span>
                  )}
                </div>
                <span className="text-[11px] truncate text-slate-200">{station.nombre}</span>
                <span className="text-[9px] text-slate-500 mt-1">{station.capas.pendiente_deg}° pendiente</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Slope slider */}
        <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Mountain className="h-4 w-4 text-amber-400" /> Pendiente Máx. Traje
            </span>
            <span className="font-bold text-base text-amber-400">{pendienteMax}°</span>
          </div>

          <input
            type="range"
            min={10}
            max={25}
            step={1}
            value={pendienteMax}
            onChange={(e) => setPendienteMax(Number(e.target.value))}
            className="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <button type="button" onClick={() => setPendienteMax(15)} className="hover:text-amber-400">
              15° (Demo 1)
            </button>
            <button type="button" onClick={() => setPendienteMax(20)} className="hover:text-amber-400">
              20° (Demo 2)
            </button>
            <button type="button" onClick={() => setPendienteMax(25)} className="hover:text-amber-400">
              25° (Máx)
            </button>
          </div>
        </div>

        {/* Time slider */}
        <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Clock className="h-4 w-4 text-cyan-400" /> Tiempo Máximo Límite
            </span>
            <span className="font-bold text-base text-cyan-400">
              {tiempoMax} min ({(tiempoMax / 60).toFixed(1)}h)
            </span>
          </div>

          <input
            type="range"
            min={60}
            max={300}
            step={15}
            value={tiempoMax}
            onChange={(e) => setTiempoMax(Number(e.target.value))}
            className="w-full accent-cyan-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>1 hora</span>
            <span>3 horas (180m)</span>
            <span>5 horas</span>
          </div>
        </div>
      </div>

      {/* Mode selection & action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-400">Algoritmo:</span>
          <button
            type="button"
            onClick={() => setModo('orientacion')}
            className={`px-3 py-1 rounded-lg border transition-colors ${modo === 'orientacion'
                ? 'bg-cyan-950 border-cyan-400 text-cyan-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
          >
            Orientación (Maximizar Ciencia)
          </button>
          <button
            type="button"
            onClick={() => setModo('tsp')}
            className={`px-3 py-1 rounded-lg border transition-colors ${modo === 'tsp'
                ? 'bg-cyan-950 border-cyan-400 text-cyan-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
          >
            TSP Estricto
          </button>
        </div>

        {/* Action triggers */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            title="Quita alertas y reinicia restricciones"
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 font-mono text-xs transition-all cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerAlert}
            disabled={alertaLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 hover:bg-red-900/60 font-mono text-xs font-semibold transition-all cursor-pointer"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Alerta Polvo Z2</span>
          </button>

          <button
            type="button"
            onClick={handleCalculate}
            disabled={loading || selectedStations.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-cyan-950/50 cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>Calcular Misión</span>
          </button>
        </div>
      </div>
    </div>
  );
};
