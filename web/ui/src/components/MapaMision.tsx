/**
 * Puente entre la pantalla (React, Axl) y el mapa (web/map, Añe).
 * El mapa no usa React: se crea una vez y se le pasan el grafo, la misión y la alerta.
 */
import React, { useEffect, useRef } from 'react';
import { crearMapa } from '../../../map/src/mapa';
import type { Grafo, MapaMision as ApiMapa, Mision } from '../../../map/src/mapa';
import type { RespuestaMision } from '../types/mission';

interface Props {
  grafo: Grafo | null;
  mision: RespuestaMision | null;
  /** Zona en alerta. Si viene, `mision` es la respuesta de /alerta. */
  zonaAlerta: string | null;
  onClickEstacion?: (id: string) => void;
  className?: string;
}

export const MapaMision: React.FC<Props> = ({ grafo, mision, zonaAlerta, onClickEstacion, className }) => {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<ApiMapa | null>(null);
  const clic = useRef(onClickEstacion);
  useEffect(() => { clic.current = onClickEstacion; }, [onClickEstacion]);

  useEffect(() => {
    if (!contenedor.current) return;
    mapa.current = crearMapa(contenedor.current, { onClickEstacion: (id) => clic.current?.(id) });
    return () => { mapa.current?.destruir(); mapa.current = null; };
  }, []);

  useEffect(() => { if (grafo) mapa.current?.cargarGrafo(grafo); }, [grafo]);

  useEffect(() => {
    if (!mapa.current) return;
    if (!mision) mapa.current.limpiar();
    else if (zonaAlerta) mapa.current.mostrarAlerta(mision as unknown as Mision, zonaAlerta);
    else mapa.current.mostrarMision(mision as unknown as Mision);
  }, [mision, zonaAlerta]);

  return <div ref={contenedor} className={className} />;
};
