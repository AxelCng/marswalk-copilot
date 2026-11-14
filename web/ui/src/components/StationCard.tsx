import React from 'react';
import type { EstacionDetalle, TipoEstacion } from '../types/mission';
import { Mountain, Compass, Camera, Sparkles, Clock } from 'lucide-react';

interface StationCardProps {
  station: EstacionDetalle;
  isSelected?: boolean;
  onSelect?: (station: EstacionDetalle) => void;
}

/** Colores por tipo de nodo: los mismos que el mapa de Añe (web/map/src/tokens.js, COLOR_TIPO). */
export const getTipoBadge = (tipo: TipoEstacion) => {
  switch (tipo) {
    case 'ciencia':
      return { bg: 'bg-black/75', border: 'border-tipo-ciencia/60', text: 'text-tipo-ciencia', label: 'CIENCIA' };
    case 'muestreo':
      return { bg: 'bg-black/75', border: 'border-tipo-muestreo/60', text: 'text-tipo-muestreo', label: 'MUESTREO' };
    case 'habitat':
      return { bg: 'bg-black/75', border: 'border-tipo-habitat/60', text: 'text-tipo-habitat', label: 'HÁBITAT' };
    case 'rover':
      return { bg: 'bg-black/75', border: 'border-tipo-rover/60', text: 'text-tipo-rover', label: 'ROVER' };
    case 'refugio':
      return { bg: 'bg-black/75', border: 'border-tipo-refugio/60', text: 'text-tipo-refugio', label: 'REFUGIO' };
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
      onClick={() => onSelect?.(station)}
      className={`group relative overflow-hidden rounded border transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'bg-hud-glass border-hud-cyan shadow-glow-focus'
          : 'bg-hud-panel border-hud-border hover:border-hud-cyan/60 hover:bg-hud-glass'
      }`}
    >
      {/* Top photo / radar header */}
      <div className="relative h-28 w-full overflow-hidden bg-hud-deep">
        {photo?.url ? (
          <img
            src={photo.url}
            alt={station.nombre}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-80 group-hover:opacity-100"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-hud-panel to-hud-deep p-2 text-center text-ink-mute">
            <Camera className="h-6 w-6 text-ink-mute mb-1" />
            <span className="text-[10px] font-mono tracking-widest text-ink-dim">NAVCAM SOL {photo?.sol ?? 0}</span>
            <span className="text-[9px] text-ink-mute">IMAGEN SIMULADA</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-hud-panel via-transparent to-black/50" />

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
            <span title="Valor científico">+{station.valor_cientifico}</span>
          </div>
        )}

        {/* Geological Unit */}
        <div className="absolute bottom-1.5 left-2 right-2 truncate text-[10px] text-ink-dim font-mono">
          {station.unidad_geologica}
        </div>
      </div>

      {/* Body details */}
      <div className="p-3">
        <h4 className="m-0 font-display font-medium text-ink text-[15px] leading-5 truncate group-hover:text-hud-cyan transition-colors">
          {station.nombre}
        </h4>
        <p className="mt-1 text-xs text-ink-dim line-clamp-2 leading-relaxed">
          {station.tarea}
        </p>

        {/* Telemetry chips */}
        <div className="mt-3 grid grid-cols-3 gap-1.5 pt-2 border-t border-hud-subtle font-mono text-[11px]">
          <div className="flex flex-col bg-hud-deep/60 rounded px-1.5 py-1">
            <span className="label-caps !text-[9px] flex items-center gap-0.5">
              <Mountain className="h-2.5 w-2.5" /> PEND.
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
              <Clock className="h-2.5 w-2.5" /> TIEMPO
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
