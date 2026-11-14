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
        className="relative w-full max-w-xl overflow-hidden rounded border border-hud-border bg-hud-panel shadow-glow-focus"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-hud-border px-5 py-3.5 bg-hud-panel/80">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-sm font-bold px-2.5 py-0.5 rounded bg-black/80 border border-hud-border text-ink">
              {station.id}
            </span>
            <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded border ${badge.bg} ${badge.border} ${badge.text}`}>
              {badge.label}
            </span>
            <span className="text-xs font-mono text-ink-dim">ZONA {station.zona}</span>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 text-ink-dim hover:bg-hud-glass hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Station photo */}
        <div className="relative h-56 w-full bg-hud-deep overflow-hidden">
          {photo?.url ? (
            <img
              src={photo.url}
              alt={station.nombre}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-ink-mute">
              <Camera className="h-10 w-10 text-ink-mute mb-2" />
              <span className="font-mono text-xs text-ink-dim">MASTCAM-Z / NAVCAM</span>
              <span className="text-xs text-ink-mute">Simulación del Sol {photo?.sol ?? 0}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-hud-panel via-transparent to-transparent" />
          
          <div className="absolute bottom-3 left-5 right-5 flex items-end justify-between">
            <div>
              <h3 className="m-0 font-display text-xl font-semibold text-ink drop-shadow-md">
                {station.nombre}
              </h3>
              <p className="text-xs font-mono text-hud-cyan drop-shadow-sm">
                {station.unidad_geologica}
              </p>
            </div>
            {station.valor_cientifico > 0 && (
              <div className="flex items-center gap-1.5 bg-black/80 border border-hud-border rounded px-2.5 py-1 text-hud-cyan text-xs font-mono font-bold dato-num">
                <Sparkles className="h-3.5 w-3.5" />
                VALOR CIENCIA: {station.valor_cientifico}/10
              </div>
            )}
          </div>
        </div>

        {/* Content & Specs */}
        <div className="p-5 space-y-4">
          <div>
            <span className="label-caps">
              Misión y Tarea Asignada
            </span>
            <p className="mt-1 text-sm text-ink leading-relaxed bg-hud-panel/60 p-3 rounded border border-hud-border">
              {station.tarea}
            </p>
          </div>

          {/* Environmental data */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
            <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
              <span className="label-caps flex items-center gap-1">
                <Mountain className="h-3 w-3" /> PENDIENTE LOCAL
              </span>
              <span className={`block text-base font-semibold dato-num ${station.capas.pendiente_deg > 15 ? 'text-warning' : 'text-ink'}`}>
                {station.capas.pendiente_deg}°
              </span>
              <span className="text-[9px] text-ink-mute block">Inclinación del rover (waypoint)</span>
            </div>

            <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
              <span className="label-caps flex items-center gap-1">
                <MapPin className="h-3 w-3" /> ELEVACIÓN
              </span>
              <span className="block text-base font-semibold dato-num text-ink">
                {station.capas.elev_m} m
              </span>
              <span className="text-[9px] text-ink-mute block">Sobre el geoide (waypoint)</span>
            </div>

            <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
              <span className="label-caps flex items-center gap-1">
                <Thermometer className="h-3 w-3" /> THEMIS NOCHE
              </span>
              <span className="block text-base font-semibold dato-num text-hud-cyan">
                {station.capas.themis_noche} K
              </span>
              <span className="text-[9px] text-ink-mute block">Temp. de brillo (provisional)</span>
            </div>

            <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
              <span className="label-caps flex items-center gap-1">
                <Clock className="h-3 w-3" /> PERMANENCIA
              </span>
              <span className="block text-base font-semibold dato-num text-nominal">
                {station.permanencia_min} min
              </span>
              <span className="text-[9px] text-ink-mute block">Tiempo en sitio</span>
            </div>
          </div>

          {/* Coordinates footer */}
          <div className="flex items-center justify-between pt-2 border-t border-hud-subtle text-[11px] font-mono text-ink-mute">
            <span>LON/LAT: {station.lon.toFixed(4)}° E, {station.lat.toFixed(4)}° N</span>
            <span>{photo ? `FOTO: ${photo.camara} · SOL ${photo.sol} · ${photo.credito ?? 'NASA/JPL-Caltech'}` : 'SIN FOTO'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
