import React, { useEffect, useState } from 'react';
import type { EstacionDetalle } from '../types/mission';
import { getTipoBadge } from './StationCard';
import { FotoEstacionView, UnidadGeo, nombreCamara } from './StationParts';
import { X, MapPin, Mountain, Thermometer, Clock, Sparkles } from 'lucide-react';

interface StationModalProps {
  station: EstacionDetalle | null;
  onClose: () => void;
}

export const StationModal: React.FC<StationModalProps> = ({ station, onClose }) => {
  const [fotoIdx, setFotoIdx] = useState(0);

  // Al abrir otra estación se vuelve a la primera foto
  useEffect(() => { setFotoIdx(0); }, [station?.id]);

  // Esc cierra la ficha
  useEffect(() => {
    if (!station) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [station, onClose]);

  if (!station) return null;

  const badge = getTipoBadge(station.tipo);
  const fotos = station.fotos ?? [];
  const photo = fotos[Math.min(fotoIdx, Math.max(fotos.length - 1, 0))];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Station card ${station.id}`}
        className="relative w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded border border-hud-border bg-hud-panel shadow-glow-focus"
        style={{ boxShadow: `inset 0 2px 0 var(--tipo-${station.tipo}), var(--glow-focus)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-hud-border px-5 py-3 bg-hud-panel/80">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-sm font-bold px-2.5 py-0.5 rounded bg-black/80 border border-hud-border text-ink">
              {station.id}
            </span>
            <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded border ${badge.bg} ${badge.border} ${badge.text}`}>
              {badge.label}
            </span>
            {station.zona && <span className="label-caps">Zone {station.zona}</span>}
            {station.valor_cientifico > 0 && (
              <span className="flex items-center gap-1 text-hud-cyan text-xs font-mono font-bold dato-num" title="Science value">
                <Sparkles className="h-3.5 w-3.5" /> {station.valor_cientifico}/10
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            aria-label="Close card"
            className="rounded p-1 text-ink-dim hover:bg-hud-glass hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Foto */}
        <div className="relative h-56 w-full">
          <FotoEstacionView key={`${station.id}-${fotoIdx}`} foto={photo} alt={station.nombre} className="h-full w-full" grande />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-hud-panel via-transparent to-transparent" />

          <h3 className="absolute bottom-3 left-5 right-40 m-0 font-display text-xl font-semibold text-ink drop-shadow-md">
            {station.nombre}
          </h3>
        </div>

        {fotos.length > 1 && (
          <div className="segmentado mx-5 mt-3" aria-label="Station photos">
            {fotos.map((f, i) => (
              <button key={i} type="button" onClick={() => setFotoIdx(i)} className={i === fotoIdx ? 'activo' : ''}>
                {nombreCamara(f.camara)} · sol {f.sol}
              </button>
            ))}
          </div>
        )}

        <div className="p-5 space-y-4">
          {/* Geología */}
          <div className="bloque">
            <span className="label-caps">Geologic unit · USGS SIM 3464</span>
            <div className="flex min-w-0"><UnidadGeo station={station} /></div>
          </div>

          {/* Tarea */}
          <div className="bloque">
            <span className="label-caps">Assigned task</span>
            <p className="m-0 text-sm text-ink leading-relaxed bg-hud-deep/60 p-3 rounded border border-hud-border">
              {station.tarea}
            </p>
          </div>

          {/* Capas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
            <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
              <span className="label-caps flex items-center gap-1">
                <Mountain className="h-3 w-3" /> Slope
              </span>
              <span className={`block text-base font-semibold dato-num ${station.capas.pendiente_deg > 15 ? 'text-warning' : 'text-ink'}`}>
                {station.capas.pendiente_deg}°
              </span>
              <span className="text-[9px] text-ink-mute block">Local, at the station</span>
            </div>

            <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
              <span className="label-caps flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Elevation
              </span>
              <span className="block text-base font-semibold dato-num text-ink">
                {station.capas.elev_m} m
              </span>
              <span className="text-[9px] text-ink-mute block">Station height</span>
            </div>

            <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
              <span className="label-caps flex items-center gap-1">
                <Thermometer className="h-3 w-3" /> THEMIS night
              </span>
              <span className="block text-base font-semibold dato-num text-hud-cyan">
                {station.capas.themis_noche} K
              </span>
              <span className="text-[9px] text-ink-mute block">Brightness temp.</span>
            </div>

            <div className="bg-hud-glass/80 border border-hud-border p-2.5 rounded">
              <span className="label-caps flex items-center gap-1">
                <Clock className="h-3 w-3" /> Stay
              </span>
              <span className="block text-base font-semibold dato-num text-nominal">
                {station.permanencia_min} min
              </span>
              <span className="text-[9px] text-ink-mute block">Time on site</span>
            </div>
          </div>

          {/* Coordenadas y crédito */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-hud-subtle text-[11px] font-mono text-ink-mute dato-num">
            <span>{station.lon.toFixed(4)}° E · {station.lat.toFixed(4)}° N</span>
            <span>
              {photo
                ? `${nombreCamara(photo.camara)} · sol ${photo.sol} · ${photo.credito ?? 'NASA/JPL-Caltech'}`
                : 'No photo'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
