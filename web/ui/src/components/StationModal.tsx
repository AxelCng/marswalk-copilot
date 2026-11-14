import React from 'react';
import type { EstacionDetalle } from '../types/mission';
import { getTipoBadge } from './StationCard';
import { X, MapPin, Mountain, Thermometer, Clock, Sparkles, Camera } from 'lucide-react';

interface StationModalProps {
  station: EstacionDetalle | null;
  onClose: () => void;
}

export const StationModal: React.FC<StationModalProps> = ({ station, onClose }) => {
  if (!station) return null;

  const badge = getTipoBadge(station.tipo);
  const photo = station.fotos?.[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-[#0d131f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-sm font-bold px-2.5 py-0.5 rounded bg-black/80 border border-slate-600 text-white">
              {station.id}
            </span>
            <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded border ${badge.bg} ${badge.border} ${badge.text}`}>
              {badge.label}
            </span>
            <span className="text-xs font-mono text-slate-400">ZONA {station.zona}</span>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Station photo */}
        <div className="relative h-56 w-full bg-slate-950 overflow-hidden">
          {photo?.url ? (
            <img
              src={photo.url}
              alt={station.nombre}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-slate-500">
              <Camera className="h-10 w-10 text-slate-700 mb-2" />
              <span className="font-mono text-xs text-slate-400">MASTCAM-Z / NAVCAM</span>
              <span className="text-xs text-slate-600">Simulación del Sol {photo?.sol ?? 0}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d131f] via-transparent to-transparent" />
          
          <div className="absolute bottom-3 left-5 right-5 flex items-end justify-between">
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight drop-shadow-md">
                {station.nombre}
              </h3>
              <p className="text-xs font-mono text-cyan-300 drop-shadow-sm">
                {station.unidad_geologica}
              </p>
            </div>
            {station.valor_cientifico > 0 && (
              <div className="flex items-center gap-1.5 bg-black/80 border border-emerald-500/50 rounded-lg px-2.5 py-1 text-emerald-400 text-xs font-mono font-bold">
                <Sparkles className="h-3.5 w-3.5" />
                VALOR CIENCIA: {station.valor_cientifico}/10
              </div>
            )}
          </div>
        </div>

        {/* Content & Specs */}
        <div className="p-5 space-y-4">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
              Misión y Tarea Asignada
            </span>
            <p className="mt-1 text-sm text-slate-200 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800">
              {station.tarea}
            </p>
          </div>

          {/* Environmental data */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
            <div className="bg-slate-900/70 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Mountain className="h-3 w-3" /> PENDIENTE LOCAL
              </span>
              <span className={`text-base font-bold ${station.capas.pendiente_deg > 15 ? 'text-amber-400' : 'text-slate-100'}`}>
                {station.capas.pendiente_deg}°
              </span>
              <span className="text-[9px] text-slate-500 block">Inclinación del rover (waypoint)</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> ELEVACIÓN
              </span>
              <span className="text-base font-bold text-slate-100">
                {station.capas.elev_m} m
              </span>
              <span className="text-[9px] text-slate-500 block">Sobre el geoide (waypoint)</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Thermometer className="h-3 w-3" /> THEMIS NOCHE
              </span>
              <span className="text-base font-bold text-cyan-400">
                {station.capas.themis_noche} K
              </span>
              <span className="text-[9px] text-slate-500 block">Temp. de brillo (provisional)</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Clock className="h-3 w-3" /> PERMANENCIA
              </span>
              <span className="text-base font-bold text-emerald-400">
                {station.permanencia_min} min
              </span>
              <span className="text-[9px] text-slate-500 block">Tiempo en sitio</span>
            </div>
          </div>

          {/* Coordinates footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-500">
            <span>LON/LAT: {station.lon.toFixed(4)}° E, {station.lat.toFixed(4)}° N</span>
            <span>{photo ? `FOTO: ${photo.camara} · SOL ${photo.sol} · ${photo.credito ?? 'NASA/JPL-Caltech'}` : 'SIN FOTO'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
