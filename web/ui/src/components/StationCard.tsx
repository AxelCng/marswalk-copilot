import React from 'react';
import type { EstacionDetalle, TipoEstacion } from '../types/mission';
import { Mountain, Compass, Camera, Sparkles, Clock } from 'lucide-react';

interface StationCardProps {
  station: EstacionDetalle;
  isSelected?: boolean;
  onSelect?: (station: EstacionDetalle) => void;
}

export const getTipoBadge = (tipo: TipoEstacion) => {
  switch (tipo) {
    case 'ciencia':
      return { bg: 'bg-emerald-950/80', border: 'border-emerald-500/60', text: 'text-emerald-400', label: 'CIENCIA' };
    case 'muestreo':
      return { bg: 'bg-cyan-950/80', border: 'border-cyan-500/60', text: 'text-cyan-400', label: 'MUESTREO' };
    case 'habitat':
      return { bg: 'bg-orange-950/80', border: 'border-orange-500/60', text: 'text-orange-400', label: 'HÁBITAT' };
    case 'rover':
      return { bg: 'bg-amber-950/80', border: 'border-amber-500/60', text: 'text-amber-400', label: 'ROVER' };
    case 'refugio':
      return { bg: 'bg-purple-950/80', border: 'border-purple-500/60', text: 'text-purple-400', label: 'REFUGIO' };
    case 'comms':
      return { bg: 'bg-blue-950/80', border: 'border-blue-500/60', text: 'text-blue-400', label: 'COMMS' };
    default:
      return { bg: 'bg-slate-900', border: 'border-slate-700', text: 'text-slate-400', label: tipo };
  }
};

export const StationCard: React.FC<StationCardProps> = ({ station, isSelected, onSelect }) => {
  const badge = getTipoBadge(station.tipo);
  const photo = station.fotos?.[0];

  return (
    <div
      onClick={() => onSelect?.(station)}
      className={`group relative overflow-hidden rounded-xl border transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'bg-slate-900/90 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)] ring-1 ring-cyan-400'
          : 'bg-[#0b111e]/80 border-slate-800/80 hover:border-slate-700 hover:bg-[#0f172a]'
      }`}
    >
      {/* Top photo / radar header */}
      <div className="relative h-28 w-full overflow-hidden bg-slate-950">
        {photo?.url ? (
          <img
            src={photo.url}
            alt={station.nombre}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-80 group-hover:opacity-100"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 p-2 text-center text-slate-500">
            <Camera className="h-6 w-6 text-slate-600 mb-1" />
            <span className="text-[10px] font-mono tracking-widest text-slate-400">NAVCAM SOL {photo?.sol ?? 0}</span>
            <span className="text-[9px] text-slate-600">IMAGEN SIMULADA</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b111e] via-transparent to-black/40" />

        {/* Badges on photo */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-black/75 border border-white/20 text-white shadow-sm">
            {station.id}
          </span>
          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${badge.bg} ${badge.border} ${badge.text}`}>
            {badge.label}
          </span>
        </div>

        {/* Science Score badge */}
        {station.valor_cientifico > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/80 border border-emerald-500/40 rounded px-1.5 py-0.5 text-emerald-400 text-[11px] font-mono">
            <Sparkles className="h-3 w-3" />
            <span>+{station.valor_cientifico} CIENCIA</span>
          </div>
        )}

        {/* Geological Unit */}
        <div className="absolute bottom-1.5 left-2 right-2 truncate text-[10px] text-slate-300 font-mono">
          {station.unidad_geologica}
        </div>
      </div>

      {/* Body details */}
      <div className="p-3">
        <h4 className="font-semibold text-slate-100 text-sm tracking-tight truncate group-hover:text-cyan-300 transition-colors">
          {station.nombre}
        </h4>
        <p className="mt-1 text-xs text-slate-400 line-clamp-2 leading-relaxed">
          {station.tarea}
        </p>

        {/* Telemetry chips */}
        <div className="mt-3 grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-800/80 font-mono text-[11px]">
          <div className="flex flex-col bg-slate-900/60 rounded px-1.5 py-1">
            <span className="text-[9px] text-slate-500 flex items-center gap-0.5">
              <Mountain className="h-2.5 w-2.5" /> PEND.
            </span>
            <span className={`font-semibold ${station.capas.pendiente_deg > 15 ? 'text-amber-400' : 'text-slate-200'}`}>
              {station.capas.pendiente_deg}°
            </span>
          </div>

          <div className="flex flex-col bg-slate-900/60 rounded px-1.5 py-1">
            <span className="text-[9px] text-slate-500 flex items-center gap-0.5">
              <Compass className="h-2.5 w-2.5" /> ELEV.
            </span>
            <span className="text-slate-200 font-semibold truncate">
              {station.capas.elev_m} m
            </span>
          </div>

          <div className="flex flex-col bg-slate-900/60 rounded px-1.5 py-1">
            <span className="text-[9px] text-slate-500 flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" /> TIEMPO
            </span>
            <span className="text-cyan-400 font-semibold">
              {station.permanencia_min}m
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
