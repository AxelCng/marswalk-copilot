import React from 'react';
import type { RespuestaMision } from '../types/mission';
import { AlertTriangle, ChevronRight } from 'lucide-react';

interface MissionSummaryProps {
  mission: RespuestaMision | null;
  onSelectStation?: (stationId: string) => void;
}

const miles = (n: number) => Math.round(n).toLocaleString('en-US');

/** Motivo de una estación omitida, en una frase (los valores vienen tal cual del motor). */
function motivo(om: RespuestaMision['omitidas'][number]): string {
  const d = om.detalle;
  switch (om.motivo) {
    case 'pendiente': return `The gentlest path climbs ${d.pendiente_max_deg}°; your limit is ${d.limite}°.`;
    case 'tiempo': return `Doesn't fit in ${d.tiempo_max_min} min.`;
    case 'alerta': return `Cut off by the dust alert in ${d.zonas?.join(', ')}.`;
    case 'comms': return `No path keeps enough radio coverage (${d.cobertura_com_pct}%).`;
    case 'no_existe': return 'Not a known station.';
    default: return String(om.motivo);
  }
}

export const MissionSummary: React.FC<MissionSummaryProps> = ({ mission, onSelectStation }) => {
  if (!mission) {
    return (
      <div className="panel px-4 py-5 text-[13px] leading-5 text-ink-mute">
        No plan yet. Ask the copilot for a walk, or pick stations in the mission form.
      </div>
    );
  }

  const { factible, ruta, tramos, omitidas, totales, aristas_afectadas } = mission;
  const margenBajo = totales.margen_min !== null && totales.margen_min < 10;

  // Cifras del plan: cada una con su unidad y una aclaración honesta de qué es
  const cifras = [
    { etiqueta: 'Total time', valor: totales.tiempo_min.toFixed(1), unidad: 'min', nota: 'Walking plus time at stops' },
    { etiqueta: 'Distance', valor: (totales.distancia_m / 1000).toFixed(2), unidad: 'km', nota: `${miles(totales.distancia_m)} m on foot` },
    {
      etiqueta: 'Margin',
      valor: totales.margen_min !== null ? totales.margen_min.toFixed(1) : '—',
      unidad: totales.margen_min !== null ? 'min' : '',
      nota: totales.margen_min !== null ? 'Left before your time limit' : 'No time limit set',
      tono: margenBajo ? 'text-warning' : 'text-ink',
    },
    { etiqueta: 'Radiation', valor: totales.dosis_rel.toFixed(1), unidad: '', nota: 'Relative index, a model estimate' },
  ];

  return (
    <div className="panel">
      {/* Estado */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5">
        <span className={`chip ${factible ? 'nominal' : 'critical'}`}>{factible ? 'Feasible' : 'Not feasible'}</span>
        <span className="text-xs text-ink-mute dato-num">{tramos.length} {tramos.length === 1 ? 'leg' : 'legs'}</span>
        {aristas_afectadas && aristas_afectadas.length > 0 && (
          <span className="chip critical ml-auto">Rerouted around dust</span>
        )}
      </div>

      {/* Orden de paradas: es una secuencia real, así que se lee como recorrido */}
      <ol className="flex flex-wrap items-center gap-y-1.5 m-0 px-4 pt-3 list-none text-[13px]" aria-label="Stops in order">
        {ruta.map((nodeId, idx) => (
          <li key={idx} className="flex items-center">
            <button
              onClick={() => onSelectStation?.(nodeId)}
              title={`Open ${nodeId}`}
              className={`px-2 py-0.5 rounded font-display font-semibold transition-colors ${
                nodeId === 'HAB'
                  ? 'text-rust hover:bg-rust/10'
                  : 'text-ink hover:bg-hud-glass'
              }`}
            >
              {nodeId}
            </button>
            {idx < ruta.length - 1 && <ChevronRight aria-hidden className="h-3.5 w-3.5 text-ink-mute" />}
          </li>
        ))}
      </ol>

      {/* Cifras: una fila con divisores en vez de cuatro tarjetas iguales */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 m-0 mt-3.5 border-t border-hud-subtle">
        {cifras.map((c, i) => (
          <div
            key={c.etiqueta}
            className={`px-4 py-3 ${i % 2 === 1 ? 'border-l border-hud-subtle' : ''} ${i >= 2 ? 'border-t sm:border-t-0 border-hud-subtle' : ''} ${i === 2 ? 'sm:border-l' : ''}`}
          >
            <dt className="text-xs text-ink-mute">{c.etiqueta}</dt>
            <dd className={`m-0 mt-0.5 font-display text-xl font-semibold dato-num ${c.tono ?? 'text-ink'}`}>
              {c.valor}{c.unidad && <span className="ml-1 text-sm font-medium text-ink-dim">{c.unidad}</span>}
            </dd>
            <dd className="m-0 text-[11px] leading-4 text-ink-mute">{c.nota}</dd>
          </div>
        ))}
      </dl>

      {/* Estaciones omitidas y por qué */}
      {omitidas.length > 0 && (
        <div className="border-t border-hud-subtle px-4 py-3">
          <p className="m-0 mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-warning">
            <AlertTriangle className="h-4 w-4" /> Left out of this plan
          </p>
          <ul className="m-0 p-0 list-none space-y-1 text-[13px] leading-5">
            {omitidas.map((om, i) => (
              <li key={i} className="text-ink-dim">
                <button onClick={() => onSelectStation?.(om.id)} className="font-display font-semibold text-ink hover:underline">
                  {om.id}
                </button>{' '}
                {motivo(om)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
