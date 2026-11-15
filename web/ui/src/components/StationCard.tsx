import React from 'react';
import type { EstacionDetalle, TipoEstacion } from '../types/mission';
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
      return { bg: 'bg-black/75', border: 'border-tipo-ciencia/60', text: 'text-tipo-ciencia', label: 'Science' };
    case 'muestreo':
      return { bg: 'bg-black/75', border: 'border-tipo-muestreo/60', text: 'text-tipo-muestreo', label: 'Sampling' };
    case 'habitat':
      return { bg: 'bg-black/75', border: 'border-tipo-habitat/60', text: 'text-tipo-habitat', label: 'Habitat' };
    case 'rover':
      return { bg: 'bg-black/75', border: 'border-tipo-rover/60', text: 'text-tipo-rover', label: 'Rover' };
    case 'refugio':
      return { bg: 'bg-black/75', border: 'border-tipo-refugio/60', text: 'text-tipo-refugio', label: 'Shelter' };
    case 'comms':
      return { bg: 'bg-black/75', border: 'border-tipo-comms/60', text: 'text-tipo-comms', label: 'Comms' };
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
          imgClassName="opacity-85 group-hover:opacity-100 transition-opacity"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent" />

        {/* Código y tipo de estación sobre la foto */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="font-display text-[13px] font-semibold px-1.5 py-0.5 rounded bg-black/75 text-ink">
            {station.id}
          </span>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${badge.bg} ${badge.border} ${badge.text}`}>
            {badge.label}
          </span>
        </div>

        {/* Valor científico (0–10, supuesto razonado del equipo) */}
        {station.valor_cientifico > 0 && (
          <div className="absolute top-2 right-2 rounded px-1.5 py-0.5 bg-black/75 text-xs text-ink dato-num" title="Science value, 0 to 10">
            Science {station.valor_cientifico}/10
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

        {/* Datos del terreno en la estación */}
        <dl className="mb-0 mt-3 grid grid-cols-3 gap-2 pt-2 border-t border-hud-subtle text-[13px] dato-num">
          <div>
            <dt className="text-[11px] text-ink-mute">Slope</dt>
            <dd className={`m-0 font-medium ${station.capas.pendiente_deg > 15 ? 'text-warning' : 'text-ink'}`}>
              {station.capas.pendiente_deg}°
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] text-ink-mute">Elevation</dt>
            <dd className="m-0 font-medium text-ink truncate">{Math.round(station.capas.elev_m).toLocaleString('en-US')} m</dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-mute">Stay</dt>
            <dd className="m-0 font-medium text-ink">{station.permanencia_min} min</dd>
          </div>
        </dl>
      </div>
    </div>
  );
};
