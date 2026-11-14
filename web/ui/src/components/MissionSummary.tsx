import React from 'react';
import type { RespuestaMision } from '../types/mission';
import { Route, Clock, ShieldAlert, AlertTriangle, ArrowRight } from 'lucide-react';

interface MissionSummaryProps {
  mission: RespuestaMision | null;
  onSelectStation?: (stationId: string) => void;
}

export const MissionSummary: React.FC<MissionSummaryProps> = ({ mission, onSelectStation }) => {
  if (!mission) {
    return (
      <div className="panel p-4 text-center text-ink-mute font-mono text-xs">
        <Route className="h-6 w-6 mx-auto mb-1.5 text-ink-mute" />
        No hay misión activa cargada en telemetría.
      </div>
    );
  }

  const { factible, ruta, tramos, omitidas, totales, aristas_afectadas } = mission;

  return (
    <div className="panel p-4 space-y-3.5">
      {/* Feasibility Header */}
      <div className="flex items-center justify-between border-b border-hud-subtle pb-2.5">
        <div className="flex items-center gap-2">
          {factible ? (
            <span className="chip nominal">Misión factible</span>
          ) : (
            <span className="chip critical">No factible</span>
          )}
          <span className="label-caps">{tramos.length} tramos</span>
        </div>

        {aristas_afectadas && aristas_afectadas.length > 0 && (
          <span className="chip critical">Alerta de polvo activa</span>
        )}
      </div>

      {/* Waypoint Sequence Trail */}
      <div>
        <span className="label-caps block mb-1.5">
          Secuencia óptima de estaciones
        </span>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          {ruta.map((nodeId, idx) => (
            <React.Fragment key={idx}>
              <button
                onClick={() => onSelectStation?.(nodeId)}
                className={`px-2.5 py-1 rounded border font-bold transition-colors ${
                  nodeId === 'HAB'
                    ? 'bg-rust/10 border-rust/50 text-rust hover:bg-rust/10'
                    : 'bg-hud-glass/80 border-hud-border text-hud-cyan hover:border-hud-cyan hover:bg-hud-glass'
                }`}
              >
                {nodeId}
              </button>
              {idx < ruta.length - 1 && (
                <ArrowRight className="h-3 w-3 text-ink-mute flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Telemetry Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
        <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
          <span className="label-caps flex items-center gap-1">
            <Clock className="h-3 w-3 text-hud-cyan" /> TIEMPO TOTAL
          </span>
          <span className="block text-lg font-semibold text-ink dato-num">
            {totales.tiempo_min.toFixed(1)} min
          </span>
          <span className="text-[9px] text-ink-mute block">
            {(totales.tiempo_min / 60).toFixed(2)} h caminata + permanencia
          </span>
        </div>

        <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
          <span className="label-caps flex items-center gap-1">
            <Route className="h-3 w-3 text-nominal" /> DISTANCIA
          </span>
          <span className="block text-lg font-semibold text-ink dato-num">
            {(totales.distancia_m / 1000).toFixed(2)} km
          </span>
          <span className="text-[9px] text-ink-mute block">
            {totales.distancia_m} metros reales
          </span>
        </div>

        <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
          <span className="label-caps flex items-center gap-1">
            <Clock className="h-3 w-3 text-warning" /> MARGEN SEGURIDAD
          </span>
          <span className={`block text-lg font-semibold dato-num ${totales.margen_min !== null && totales.margen_min < 10 ? 'text-warning' : 'text-nominal'}`}>
            {totales.margen_min !== null ? `${totales.margen_min.toFixed(1)} min` : 'Sin tope'}
          </span>
          <span className="text-[9px] text-ink-mute block">
            Remanente de soporte vital
          </span>
        </div>

        <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
          <span className="label-caps flex items-center gap-1">
            <ShieldAlert className="h-3 w-3 text-rust" /> DOSIS RELATIVA
          </span>
          <span className="block text-lg font-semibold text-ink dato-num">
            {totales.dosis_rel.toFixed(1)}
          </span>
          <span className="text-[9px] text-ink-mute block">
            Exposición cósmica ajustada
          </span>
        </div>
      </div>

      {/* Omitted Stations Accordion/Callout */}
      {omitidas.length > 0 && (
        <div className="rounded border border-warning/40 bg-warning/10 p-2.5 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-warning font-semibold mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="label-caps text-warning">Estaciones omitidas y motivo</span>
          </div>
          <div className="space-y-1">
            {omitidas.map((om, i) => (
              <div key={i} className="text-ink-dim flex items-center justify-between bg-hud-deep/60 px-2 py-1 rounded">
                <span className="font-bold text-warning">Estación {om.id}:</span>
                <span className="text-ink-dim">
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
