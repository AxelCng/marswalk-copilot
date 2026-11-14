/**
 * Modo visor en primera persona: el HUD de casco de web/ui/hud, alimentado con la misión de la consola
 * (la que salió del chat o del Plan B), no con una misión propia.
 * Los componentes visuales son los de hud/src/components; acá solo va el estado (tramo, giro de cabeza).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './visorHud.css';
// @ts-expect-error JSX sin tipos (web/ui/hud); props documentadas en hud/README.md
import HeadingTape from '../../hud/src/components/HeadingTape.jsx';
// @ts-expect-error JSX sin tipos (web/ui/hud)
import Reticle from '../../hud/src/components/Reticle.jsx';
// @ts-expect-error JSX sin tipos (web/ui/hud)
import TargetLock from '../../hud/src/components/TargetLock.jsx';
// @ts-expect-error JSX sin tipos (web/ui/hud)
import MissionPanel from '../../hud/src/components/MissionPanel.jsx';
// @ts-expect-error JSX sin tipos (web/ui/hud)
import AlertStrip from '../../hud/src/components/AlertStrip.jsx';
// @ts-expect-error JSX sin tipos (web/ui/hud)
import MiniMap from '../../hud/src/components/MiniMap.jsx';
// @ts-expect-error JS sin tipos (web/ui/hud)
import { rumboTramo, delta, norm } from '../../hud/src/geo.js';
import type { EstacionDetalle, Grafo, RespuestaMision } from '../types/mission';

// Campo visual horizontal del visor, en grados (igual que hud/src/App.jsx).
const FOV = 60;
const DESVIO_MAX = 120;

interface Props {
  mision: RespuestaMision | null;
  /** Misión antes de la alerta: el minimapa dibuja los tramos evitados. */
  misionPrevia: RespuestaMision | null;
  zonaAlerta: string | null;
  estaciones: EstacionDetalle[];
  zonas: NonNullable<Grafo['zonas']>;
  /** 'api' o 'ejemplo': el chip del panel de misión. */
  fuente: 'api' | 'ejemplo';
  cargando?: boolean;
  onSalir: () => void;
  onAlerta: (zona: string) => void;
  onQuitarAlerta: () => void;
}

function useAncho() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export const VisorHud: React.FC<Props> = ({
  mision, misionPrevia, zonaAlerta, estaciones, zonas, fuente, cargando, onSalir, onAlerta, onQuitarAlerta,
}) => {
  const [idx, setIdx] = useState(0);
  const [desvio, setDesvio] = useState(0); // vista − rumbo al objetivo, en grados
  const [fotoFallo, setFotoFallo] = useState<Record<string, boolean>>({});
  const [zonaElegida, setZonaElegida] = useState(zonaAlerta ?? 'Z2');
  const ancho = useAncho();
  const pxPorGrado = ancho / FOV;

  const nodos = useMemo(() => Object.fromEntries(estaciones.map((n) => [n.id, n])), [estaciones]);
  const tramos = mision?.tramos ?? [];

  // Misión nueva (otra ruta o alerta): la API la recalcula desde el origen, se vuelve al tramo 1.
  useEffect(() => { setIdx(0); setDesvio(0); }, [mision]);

  const irA = useCallback((i: number) => {
    if (!tramos.length) return;
    setIdx(Math.max(0, Math.min(tramos.length - 1, i)));
    setDesvio(0);
  }, [tramos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') irA(idx + 1);
      else if (e.key === 'ArrowLeft') irA(idx - 1);
      else if (e.key === 'Escape') onSalir();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, irA, onSalir]);

  // Arrastrar la escena gira la cabeza (solo la vista; el rumbo al objetivo no cambia).
  const drag = useRef<{ x: number; d: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, select')) return;
    drag.current = { x: e.clientX, d: desvio };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const d = drag.current.d - (e.clientX - drag.current.x) / pxPorGrado;
    setDesvio(Math.max(-DESVIO_MAX, Math.min(DESVIO_MAX, d)));
  };
  const onPointerUp = () => { drag.current = null; };

  const salir = (
    <button type="button" onClick={onSalir} title="Volver a la consola (Esc)">✕ Consola</button>
  );

  const tramo = tramos[Math.min(idx, Math.max(tramos.length - 1, 0))];
  if (!mision || !tramo) {
    return (
      <div className="hud" role="dialog" aria-modal="true" aria-label="Visor de casco" style={{ zIndex: 60 }}>
        <div className="visor" />
        <div className="cargando" style={{ flexDirection: 'column', gap: 12 }}>
          <span className="label-caps">Sin misión para el visor</span>
          <span className="sin-foto-sub">Pide una ruta en el copiloto o en el Plan B y vuelve.</span>
          {salir}
        </div>
      </div>
    );
  }

  const destino = nodos[tramo.destino] ?? null;
  const objetivo: number = rumboTramo(tramo);
  const vista: number = norm(objetivo + desvio);
  const foto = destino?.fotos?.[0] ?? null;
  const fotoUrl = foto?.url && !fotoFallo[foto.url] ? foto.url : null;
  const alerta = zonaAlerta ? { zona: zonaAlerta, tipo: 'polvo' } : null;
  const zona = zonaAlerta ? zonas.find((z) => z.id === zonaAlerta) ?? null : null;
  const paralaje = Math.max(-0.1, Math.min(0.1, (-desvio * pxPorGrado * 0.35) / ancho));

  return (
    <div
      className={`hud${alerta ? ' hud-alerta' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Visor de casco"
      style={{ zIndex: 60 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="escena" aria-hidden={!fotoUrl}>
        {fotoUrl ? (
          <img
            key={fotoUrl}
            src={fotoUrl}
            alt={`Navcam en ${tramo.destino}, ${destino?.nombre ?? ''}`}
            draggable={false}
            referrerPolicy="no-referrer"
            style={{ transform: `scale(1.25) translateX(${paralaje * 100}%)` }}
            onError={() => setFotoFallo((f) => ({ ...f, [foto!.url!]: true }))}
          />
        ) : (
          <div className="sin-foto">
            <span className="label-caps">Sin imagen Navcam para {tramo.destino}</span>
            <span className="sin-foto-sub">
              {foto?.url ? 'La foto no cargó.' : 'El nodo no tiene foto.'}
              {foto?.sol != null ? ` Referencia: sol ${foto.sol}.` : ''}
            </span>
          </div>
        )}
      </div>
      <div className="tinte" />
      <div className="visor" />

      <HeadingTape vista={vista} objetivo={objetivo} idObjetivo={tramo.destino} />
      <Reticle pendiente={tramo.pendiente_max_deg} />
      <TargetLock
        tramo={tramo}
        nodo={destino}
        rumbo={objetivo}
        dx={delta(vista, objetivo) * pxPorGrado}
        ancho={ancho}
        onCentrar={() => setDesvio(0)}
      />

      <MissionPanel mision={mision} idx={idx} fuente={fuente} />

      <div className="abajo-izq">
        {alerta && <AlertStrip alerta={alerta} zona={zona} mision={mision} />}
        {foto && fotoUrl && (
          <p className="credito">
            {foto.camara} · SOL {foto.sol} · {foto.credito ?? 'NASA/JPL-Caltech'}
          </p>
        )}
      </div>

      <MiniMap
        mision={mision}
        misionPrevia={misionPrevia}
        alerta={alerta}
        zona={zona}
        idx={idx}
        nodos={nodos}
      />

      <nav className="controles" aria-label="Navegación por tramos">
        {salir}
        <button type="button" onClick={() => irA(idx - 1)} disabled={idx === 0}>◀ Anterior</button>
        <button type="button" className="primario" onClick={() => irA(idx + 1)} disabled={idx >= tramos.length - 1}>
          Siguiente ▶
        </button>
        {alerta ? (
          <button type="button" onClick={onQuitarAlerta} disabled={cargando}>Quitar alerta</button>
        ) : (
          <>
            <select
              aria-label="Zona de la alerta"
              value={zonaElegida}
              onChange={(e) => setZonaElegida(e.target.value)}
              style={{
                minHeight: 40, padding: '0 6px', borderRadius: 'var(--radius)', border: '1px solid var(--hud-border)',
                background: 'var(--hud-glass-80)', color: 'var(--on-surface)', font: '600 12px/16px var(--font-mono)',
              }}
            >
              {(zonas.length ? zonas : [{ id: 'Z2', nombre: '' }]).map((z) => (
                <option key={z.id} value={z.id}>{z.id}</option>
              ))}
            </select>
            <button type="button" className="alerta" onClick={() => onAlerta(zonaElegida)} disabled={cargando}>
              Alerta polvo
            </button>
          </>
        )}
      </nav>
    </div>
  );
};
