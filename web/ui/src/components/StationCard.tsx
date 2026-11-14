import React from 'react';
import type { EstacionDetalle, TipoEstacion } from '../types/mission';
import { Mountain, Compass, Sparkles, Clock } from 'lucide-react';
import { FotoEstacionView, UnidadGeo } from './StationParts';

interface StationCardProps {
  station: EstacionDetalle;
  isSelected?: boolean;
  onSelect?: (station: EstacionDetalle) => void;
}

/** Colores por tipo de nodo: los mismos que el mapa de Añe (web/map/src/tokens.js, COLOR_TIPO). */
export const getTipoBadge = (tipo: TipoEstacion) => {
  switch (tipo) {
    case 'ciencia':
      return { bg: 'bg-black/75', border: 'border-tipo-ciencia/60', text: 'text-tipo-ciencia', label: 'SCIENCE' };
    case 'muestreo':
      return { bg: 'bg-black/75', border: 'border-tipo-muestreo/60', text: 'text-tipo-muestreo', label: 'SAMPLING' };
    case 'habitat':
      return { bg: 'bg-black/75', border: 'border-tipo-habitat/60', text: 'text-tipo-habitat', label: 'HABITAT' };
    case 'rover':
      return { bg: 'bg-black/75', border: 'border-tipo-rover/60', text: 'text-tipo-rover', label: 'ROVER' };
    case 'refugio':
      return { bg: 'bg-black/75', border: 'border-tipo-refugio/60', text: 'text-tipo-refugio', label: 'SHELTER' };
    case 'comms':
      return { bg: 'bg-black/75', border: 'border-tipo-comms/60', text: 'text-tipo-comms', label: 'COMMS' };
    default:
      return { bg: 'bg-hud-panel', border: 'border-hud-border', text: 'text-ink-dim', label: tipo };
  }
};

export const StationCard: React.FC<StationCardProps> = ({ station, isSelected, onSelect }) => {
  const badge = getTipoBadge(station.tipo);
  const photo = station.fotos?.[0];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Station card ${station.id}: ${station.nombre}`}
      onClick={() => onSelect?.(station)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(station); } }}
      className={`group relative overflow-hidden rounded border transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'bg-hud-glass border-hud-cyan shadow-glow-focus'
          : 'bg-hud-panel border-hud-border hover:border-hud-cyan/60 hover:bg-hud-glass'
      }`}
    >
      {/* Foto de Perseverance */}
      <div className="relative h-28 w-full overflow-hidden bg-hud-deep">
        <FotoEstacionView
          foto={photo}
          alt={station.nombre}
          className="h-full w-full"
          imgClassName="transition-transform duration-500 group-hover:scale-105 opacity-80 group-hover:opacity-100"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent" />

        {/* Badges on photo */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-black/75 border border-hud-border text-ink shadow-sm">
            {station.id}
          </span>
          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${badge.bg} ${badge.border} ${badge.text}`}>
            {badge.label}
          </span>
        </div>

        {/* Science Score badge */}
        {station.valor_cientifico > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/80 border border-hud-border rounded px-1.5 py-0.5 text-hud-cyan text-[11px] font-mono dato-num">
            <Sparkles className="h-3 w-3" />
            <span title="Science value">+{station.valor_cientifico}</span>
          </div>
        )}

      </div>

      {/* Body details */}
      <div className="p-3">
        <h4 className="m-0 font-display font-medium text-ink text-[15px] leading-5 truncate group-hover:text-hud-cyan transition-colors">
          {station.nombre}
        </h4>
        <div className="mt-1 flex min-w-0">
          <UnidadGeo station={station} compacta />
        </div>
        <p className="mt-1 text-xs text-ink-dim line-clamp-2 leading-relaxed">
          {station.tarea}
        </p>

        {/* Telemetry chips */}
        <div className="mt-3 grid grid-cols-3 gap-1.5 pt-2 border-t border-hud-subtle font-mono text-[11px]">
          <div className="flex flex-col bg-hud-deep/60 rounded px-1.5 py-1">
            <span className="label-caps !text-[9px] flex items-center gap-0.5">
              <Mountain className="h-2.5 w-2.5" /> SLOPE
            </span>
            <span className={`font-semibold ${station.capas.pendiente_deg > 15 ? 'text-warning' : 'text-ink'}`}>
              {station.capas.pendiente_deg}°
            </span>
          </div>

          <div className="flex flex-col bg-hud-deep/60 rounded px-1.5 py-1">
            <span className="label-caps !text-[9px] flex items-center gap-0.5">
              <Compass className="h-2.5 w-2.5" /> ELEV.
            </span>
            <span className="text-ink font-semibold truncate">
              {station.capas.elev_m} m
            </span>
          </div>

          <div className="flex flex-col bg-hud-deep/60 rounded px-1.5 py-1">
            <span className="label-caps !text-[9px] flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" /> TIME
            </span>
            <span className="text-hud-cyan font-semibold">
              {station.permanencia_min}m
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
