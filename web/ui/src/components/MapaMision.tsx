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
  className?: string;
}

export const MapaMision: React.FC<Props> = ({ grafo, mision, zonaAlerta, onClickEstacion, className }) => {
  const alerta = zonaAlerta
    ? { zona: zonaAlerta, tipo: 'polvo', aristas_afectadas: mision?.aristas_afectadas ?? [] }
    : null;
  return (
    // MarsMap se posiciona con "inset: 0": el contenedor tiene que ser relative y tener alto
    <div className={`relative ${className ?? ''}`}>
      <MarsMap grafo={grafo} mision={mision} alerta={alerta} onSelectEstacion={onClickEstacion} />
    </div>
  );
};
