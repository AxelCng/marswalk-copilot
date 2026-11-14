/** Piezas compartidas por StationCard y StationModal: foto con respaldo y unidad geológica. */
import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import type { EstacionDetalle, FotoEstacion } from '../types/mission';
import { limpiarUnidad } from '../services/geologia';

const CAMARAS: Record<string, string> = {
  NAVCAM_LEFT: 'Navcam left',
  NAVCAM_RIGHT: 'Navcam right',
  MCZ_LEFT: 'Mastcam-Z left',
  MCZ_RIGHT: 'Mastcam-Z right',
};
export const nombreCamara = (c?: string) => (c ? CAMARAS[c] ?? c.replace(/_/g, ' ') : 'Camera');

interface FotoProps {
  foto?: FotoEstacion;
  alt: string;
  className?: string;
  imgClassName?: string;
  grande?: boolean;
}

/**
 * Foto de Perseverance de la estación. Si no hay URL o la imagen no carga, muestra un marco
 * con el sol de referencia (spec: "foto del sol más cercano, con el sol indicado en la ficha").
 */
export const FotoEstacionView: React.FC<FotoProps> = ({ foto, alt, className = '', imgClassName = '', grande }) => {
  const [fallo, setFallo] = useState(false);
  const hayImagen = Boolean(foto?.url) && !fallo;

  return (
    <div className={`relative overflow-hidden bg-hud-deep ${className}`}>
      {hayImagen ? (
        <img
          src={foto!.url!}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFallo(true)}
          className={`h-full w-full object-cover ${imgClassName}`}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(42,52,71,0.35)_6px_7px)]">
          <Camera className={`${grande ? 'h-9 w-9' : 'h-6 w-6'} text-ink-mute`} />
          <span className="label-caps">{fallo ? 'Photo not available' : 'No photo'}</span>
          {foto?.sol != null && (
            <span className="font-mono text-[10px] text-ink-mute dato-num">
              Referencia: sol {foto.sol}
            </span>
          )}
        </div>
      )}
      {hayImagen && foto && (
        <span className="absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded bg-black/75 border border-hud-border font-mono text-[9px] tracking-[0.06em] uppercase text-ink-dim dato-num">
          {nombreCamara(foto.camara)} · sol {foto.sol}
        </span>
      )}
    </div>
  );
};

/** Unidad geológica: SIM 3464 (misma etiqueta y color que el mapa) o, si no hay capa, el texto de graph.json. */
export const UnidadGeo: React.FC<{ station: EstacionDetalle; compacta?: boolean }> = ({ station, compacta }) => {
  const sim = station.unidad_sim;
  if (sim) {
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0" title={`USGS SIM 3464 · ${sim.simbolo} ${sim.nombre}`}>
        <i className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/40" style={{ background: sim.color }} aria-hidden />
        <b className="font-mono text-[11px] font-semibold text-ink">{sim.simbolo}</b>
        <span className="truncate text-[11px] text-ink-dim">
          {sim.nombre}{!compacta && sim.edad ? ` · ${sim.edad}` : ''}
        </span>
      </span>
    );
  }
  const { texto, provisional } = limpiarUnidad(station.unidad_geologica ?? '');
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="truncate text-[11px] font-mono text-ink-dim">{texto || 'Unit without data'}</span>
      {provisional && (
        <span className="chip sin-punto warning !min-h-[16px] !px-1 !text-[8px] shrink-0" title="graph_fake.json: SIM 3464 layer from data/ is missing">
          provisional
        </span>
      )}
    </span>
  );
};
