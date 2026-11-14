import React from 'react';
import type { RespuestaMision } from '../types/mission';
import { Route, Clock, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';

interface MissionSummaryProps {
  mission: RespuestaMision | null;
  onSelectStation?: (stationId: string) => void;
}

export const MissionSummary: React.FC<MissionSummaryProps> = ({ mission, onSelectStation }) => {
  if (!mission) {
    return (
      <div className="rounded-xl border border-slate-800/80 bg-[#0b111e]/80 p-4 text-center text-slate-500 font-mono text-xs">
        <Route className="h-6 w-6 mx-auto mb-1.5 text-slate-600" />
        No hay misión activa cargada en telemetría.
      </div>
    );
  }

  const { factible, ruta, tramos, omitidas, totales, aristas_afectadas } = mission;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0c121e]/90 p-4 space-y-3.5 shadow-lg">
      {/* Feasibility Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          {factible ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-mono font-bold text-xs bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="h-3.5 w-3.5" /> MISIÓN FACTIBLE
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-red-400 font-mono font-bold text-xs bg-red-950/60 border border-red-500/40 px-2 py-0.5 rounded-full">
              <XCircle className="h-3.5 w-3.5" /> RESTRINGIDA / NO FACTIBLE
            </span>
          )}
          <span className="text-xs font-mono text-slate-400">
            {tramos.length} TRAMOS CALCULADOS
          </span>
        </div>

        {aristas_afectadas && aristas_afectadas.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-950/60 border border-amber-500/50 px-2 py-0.5 rounded">
            <AlertTriangle className="h-3 w-3" /> ALERTA DE POLVO ACTIVA
          </span>
        )}
      </div>

      {/* Waypoint Sequence Trail */}
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold block mb-1.5">
          Secuencia Óptima de Estaciones (TSP / Orientación)
        </span>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          {ruta.map((nodeId, idx) => (
            <React.Fragment key={idx}>
              <button
                onClick={() => onSelectStation?.(nodeId)}
                className={`px-2.5 py-1 rounded-md border font-bold transition-colors ${
                  nodeId === 'HAB'
                    ? 'bg-orange-950/60 border-orange-500/50 text-orange-300 hover:bg-orange-900/60'
                    : 'bg-slate-800/80 border-slate-700 text-cyan-300 hover:border-cyan-400 hover:bg-slate-700'
                }`}
              >
                {nodeId}
              </button>
              {idx < ruta.length - 1 && (
                <ArrowRight className="h-3 w-3 text-slate-600 flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Telemetry Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
        <div className="bg-slate-900/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Clock className="h-3 w-3 text-cyan-400" /> TIEMPO TOTAL
          </span>
          <span className="text-sm font-bold text-white">
            {totales.tiempo_min.toFixed(1)} min
          </span>
          <span className="text-[9px] text-slate-500 block">
            {(totales.tiempo_min / 60).toFixed(2)} h caminata + permanencia
          </span>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Route className="h-3 w-3 text-emerald-400" /> DISTANCIA
          </span>
          <span className="text-sm font-bold text-white">
            {(totales.distancia_m / 1000).toFixed(2)} km
          </span>
          <span className="text-[9px] text-slate-500 block">
            {totales.distancia_m} metros reales
          </span>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Clock className="h-3 w-3 text-amber-400" /> MARGEN SEGURIDAD
          </span>
          <span className={`text-sm font-bold ${totales.margen_min !== null && totales.margen_min < 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {totales.margen_min !== null ? `${totales.margen_min.toFixed(1)} min` : 'Sin tope'}
          </span>
          <span className="text-[9px] text-slate-500 block">
            Remanente de soporte vital
          </span>
        </div>

        <div className="bg-slate-900/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <ShieldAlert className="h-3 w-3 text-purple-400" /> DOSIS RELATIVA
          </span>
          <span className="text-sm font-bold text-purple-300">
            {totales.dosis_rel.toFixed(1)}
          </span>
          <span className="text-[9px] text-slate-500 block">
            Exposición cósmica ajustada
          </span>
        </div>
      </div>

      {/* Omitted Stations Accordion/Callout */}
      {omitidas.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-2.5 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>ESTACIONES DESCARTADAS CON MOTIVO FÍSICO:</span>
          </div>
          <div className="space-y-1">
            {omitidas.map((om, i) => (
              <div key={i} className="text-slate-300 flex items-center justify-between bg-black/40 px-2 py-1 rounded">
                <span className="font-bold text-amber-300">Estación {om.id}:</span>
                <span className="text-slate-400">
                  {om.motivo === 'pendiente' &&
                    `Pendiente mínima requerida ${om.detalle.pendiente_max_deg}° > límite ${om.detalle.limite}°`}
                  {om.motivo === 'tiempo' &&
                    `Excede el tiempo límite de ${om.detalle.tiempo_max_min} min`}
                  {om.motivo === 'alerta' &&
                    `Queda aislada por alerta de polvo en zonas ${om.detalle.zonas?.join(', ')}`}
                  {om.motivo === 'comms' &&
                    `Cobertura insuficiente (${om.detalle.cobertura_com_pct}%)`}
                  {om.motivo === 'no_existe' &&
                    `No registrada en el catálogo geológico`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
