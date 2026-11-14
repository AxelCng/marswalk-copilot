/**
 * Puente entre la pantalla (web/ui) y el mapa de la demo (web/map/src/MarsMap.jsx, AeroHUD).
 * MarsMap recibe todo por props; acá solo se arma la alerta en el formato que espera.
 */
import React from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './mapaAeroHud.css';
// @ts-expect-error MarsMap es JSX sin tipos (web/map es de Axl); sus props están documentadas en web/map/README.md
import MarsMap from '../../../map/src/MarsMap.jsx';
import type { Grafo, RespuestaMision } from '../types/mission';

interface Props {
  grafo: Grafo | null;
  mision: RespuestaMision | null;
  /** Zona en alerta. Si viene, `mision` es la respuesta de /alerta. */
  zonaAlerta: string | null;
  onClickEstacion?: (id: string) => void;
  /** Posición y rumbo del astronauta (visor 3D, en vivo). */
  astronauta?: { pos: [number, number]; rumbo: number } | null;
  /** Clic en el mapa (lon, lat): mueve al astronauta ahí. */
  onClickMapa?: (pos: [number, number]) => void;
  className?: string;
}

export const MapaMision: React.FC<Props> = ({ grafo, mision, zonaAlerta, onClickEstacion, astronauta, onClickMapa, className }) => {
  const alerta = zonaAlerta
    ? { zona: zonaAlerta, tipo: 'polvo', aristas_afectadas: mision?.aristas_afectadas ?? [] }
    : null;
  return (
    // MarsMap se posiciona con "inset: 0": el contenedor tiene que ser relative y tener alto
    <div className={`relative ${className ?? ''}`}>
      <MarsMap
        grafo={grafo} mision={mision} alerta={alerta} onSelectEstacion={onClickEstacion}
        astronauta={astronauta ?? null} onClickMapa={onClickMapa}
      />
    </div>
  );
};
