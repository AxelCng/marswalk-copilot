/**
 * Visor del astronauta en primera persona, sincronizado con el mapa del tablero.
 *
 * - Escena 3D (three.js) sobre la DTM CTX 20 m del USGS SIM 3464 y control WASD / mouse / piloto:
 *   web/map/src/escena3d.js y visor3d.js.
 * - Encima, los instrumentos del HUD de casco (web/ui/hud): rumbo, retícula, objetivo fijado sobre la
 *   próxima estación del tramo, panel de misión y alerta. Al llegar cerca de una estación aparece su Navcam.
 * - Modo "partido": a la derecha el mapa del tablero muestra al astronauta en vivo (clic = moverlo ahí).
 *   Modo "ventana" (?vista=visor): solo el visor; la consola de otra ventana lo sigue por eva.ts.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './visorHud.css';
import './eva.css';
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
// @ts-expect-error JS sin tipos (web/ui/hud)
import { delta } from '../../hud/src/geo.js';
// @ts-expect-error JS sin tipos (web/map)
import { crearEscena } from '../../../map/src/escena3d.js';
// @ts-expect-error JS sin tipos (web/map)
import { iniciarVisor, rumboEntre, MARCHA } from '../../../map/src/visor3d.js';
// @ts-expect-error JS sin tipos (web/map)
import { CAMARAS, R_MARTE } from '../../../map/src/caminata.js';
// @ts-expect-error JS sin tipos (web/map)
import { COLOR_TIPO } from '../../../map/src/tokens.js';
import { MapaMision } from './MapaMision';
import { eva, type EstadoAstronauta } from '../services/eva';
import type { EstacionDetalle, Grafo, RespuestaMision } from '../types/mission';

// Marco del mapa (mosaico CTX del SIM 3464): el astronauta no sale de acá.
const MARCO = [76.802, 17.702, 77.798, 18.698];
const FOV_VERTICAL = 70; // el de la cámara de escena3d.js
const NAVCAM_RADIO_M = 150;
const VELOCIDADES = [10, 60, 300];

type Pos = [number, number];
interface EstadoVisor {
  pos: Pos; rumbo: number; elev_m: number | null; pendiente_deg: number; velocidad_kmh: number;
  bloqueado: boolean; piloto: { idx: number; frac: number; enMarcha: boolean } | null;
}
interface Control {
  camara: (c: string) => void;
  teletransportar: (q: Pos, rumbo?: number) => void;
  seguirRuta: (tramos: unknown[], vel?: number) => void;
  pilotoVel: (v: number) => void;
  pilotoPausa: (enMarcha: boolean) => void;
  pilotoTramo: (i: number) => void;
  destruir: () => void;
}

interface Props {
  mision: RespuestaMision | null;
  /** Misión antes de la alerta (la consola la comparte con la ventana del visor). */
  misionPrevia?: RespuestaMision | null;
  zonaAlerta: string | null;
  estaciones: EstacionDetalle[];
  zonas: NonNullable<Grafo['zonas']>;
  grafo: Grafo | null;
  fuente: 'api' | 'ejemplo';
  cargando?: boolean;
  /** 'partido': visor + mapa del tablero. 'ventana': solo el visor (otra ventana tiene la consola). */
  modo?: 'partido' | 'ventana';
  pendienteMax?: number;
  onSalir: () => void;
  onAlerta: (zona: string) => void;
  onQuitarAlerta: () => void;
}

const rad = (d: number) => (d * Math.PI) / 180;
function distancia([lo1, la1]: Pos, [lo2, la2]: Pos) {
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 2 * R_MARTE * Math.asin(Math.sqrt(a));
}
const fmt = (n: number | null | undefined, d = 0) =>
  n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Tramo en curso: el del piloto, o el más cercano a la posición (por sus puntos de geometría). */
function tramoEnCurso(mision: RespuestaMision | null, est: EstadoVisor | null): number | null {
  const tramos = mision?.tramos ?? [];
  if (!tramos.length || !est) return null;
  if (est.piloto) return est.piloto.idx;
  let mejor = 0;
  let dMin = Infinity;
  tramos.forEach((t, i) => {
    for (const g of t.geometria) {
      const d = distancia(est.pos, g as Pos);
      if (d < dMin) { dMin = d; mejor = i; }
    }
  });
  return mejor;
}

export const VisorHud: React.FC<Props> = ({
  mision, zonaAlerta, estaciones, zonas, grafo, fuente, cargando,
  modo = 'partido', pendienteMax = 15, onSalir, onAlerta, onQuitarAlerta,
}) => {
  const hudRef = useRef<HTMLDivElement>(null);
  const lienzoRef = useRef<HTMLDivElement>(null);
  const control = useRef<Control | null>(null);
  const escenaRef = useRef<{ ponerRuta: (t: unknown) => void; listo: Promise<void> } | null>(null);
  const [est, setEst] = useState<EstadoVisor | null>(null);
  const [cargandoTerreno, setCargandoTerreno] = useState(true);
  const [cam, setCam] = useState('ojos');
  const [vel, setVel] = useState(60);
  const [zonaElegida, setZonaElegida] = useState(zonaAlerta ?? 'Z2');
  const [tam, setTam] = useState({ w: 1, h: 1 });
  const tramos = mision?.tramos ?? [];
  const nodos = useMemo(() => Object.fromEntries(estaciones.map((n) => [n.id, n])), [estaciones]);

  // tamaño del visor (para ubicar el objetivo fijado en pantalla)
  useEffect(() => {
    const el = hudRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setTam({ w: el.clientWidth || 1, h: el.clientHeight || 1 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // la consola de fondo no scrollea mientras el visor está abierto
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    return () => { document.body.style.overflow = antes; };
  }, []);

  // escena + control, una sola vez
  useEffect(() => {
    const hab = nodos.HAB ?? estaciones[0];
    const pos: Pos = (tramos[0]?.geometria[0] as Pos) ?? (hab ? [hab.lon, hab.lat] : [77.45089, 18.44463]);
    const hacia = tramos[0]?.geometria[1] as Pos | undefined;
    const escena = crearEscena(lienzoRef.current, { origen: pos });
    escena.ponerEstaciones(estaciones.map((n) => ({ ...n, color: COLOR_TIPO[n.tipo] ?? '#E6EDF3' })));
    escena.listo.then(() => setCargandoTerreno(false));
    escenaRef.current = escena;
    const c: Control = iniciarVisor({
      elemento: lienzoRef.current,
      pos, rumbo: hacia ? rumboEntre(pos, hacia) : 0, camara: 'ojos', limites: MARCO,
      onCuadro: (e: unknown) => escena.actualizar(e),
      onEstado: (e: EstadoVisor) => setEst(e),
    });
    control.current = c;
    const quitar = eva.alIr((q) => c.teletransportar(q));
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onSalir(); };
    window.addEventListener('keydown', esc);
    return () => {
      quitar();
      window.removeEventListener('keydown', esc);
      c.destruir();
      escena.destruir();
      control.current = null;
      eva.publicarEstado(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { escenaRef.current?.ponerRuta(tramos); }, [mision, cargandoTerreno]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { control.current?.camara(cam); }, [cam]);
  useEffect(() => { control.current?.pilotoVel(vel); }, [vel]);

  const idx = tramoEnCurso(mision, est);
  const tramo = idx != null ? tramos[idx] : null;
  const destino = tramo ? nodos[tramo.destino] ?? null : null;

  // estado publicado a la consola (esta ventana u otra)
  useEffect(() => {
    if (!est) return;
    const e: EstadoAstronauta = {
      pos: est.pos, rumbo: est.rumbo, elev_m: est.elev_m, pendiente_deg: est.pendiente_deg,
      velocidad_kmh: est.velocidad_kmh, tramo: idx, piloto: !!est.piloto,
    };
    eva.publicarEstado(e);
  }, [est, idx]);

  const rumboObj = est && destino ? rumboEntre(est.pos, [destino.lon, destino.lat]) : null;
  const distObj = est && destino ? distancia(est.pos, [destino.lon, destino.lat]) : null;
  const hfov = (2 * Math.atan(Math.tan(rad(FOV_VERTICAL / 2)) * (tam.w / tam.h)) * 180) / Math.PI;
  const pxPorGrado = tam.w / hfov;
  const vista = est?.rumbo ?? 0;

  // Navcam de la estación más cercana si está a menos de 150 m
  const cercana = useMemo(() => {
    if (!est) return null;
    let mejor: { n: EstacionDetalle; d: number } | null = null;
    for (const n of estaciones) {
      const d = distancia(est.pos, [n.lon, n.lat]);
      if (!mejor || d < mejor.d) mejor = { n, d };
    }
    return mejor;
  }, [est, estaciones]);
  const navcam = cercana && cercana.d < NAVCAM_RADIO_M ? cercana.n.fotos?.find((f) => f.url) ?? null : null;

  const alerta = zonaAlerta ? { zona: zonaAlerta, tipo: 'polvo' } : null;
  const zona = zonaAlerta ? zonas.find((z) => z.id === zonaAlerta) ?? null : null;
  const pend = est?.pendiente_deg ?? null;
  const clasePend = est?.bloqueado ? 'critico' : pend != null && Math.abs(pend) > pendienteMax ? 'aviso' : '';
  const pil = est?.piloto ?? null;

  const abrirVentana = () => {
    window.open(`${location.pathname}?vista=visor`, 'marswalk-visor', 'width=1280,height=800');
    onSalir();
  };

  return (
    <div className={`eva eva-${modo}`} role="dialog" aria-modal="true" aria-label="Astronaut visor" style={{ zIndex: 60 }}>
      <div ref={hudRef} className={`hud eva-visor${alerta ? ' hud-alerta' : ''}`}>
        <div ref={lienzoRef} className="eva-lienzo" tabIndex={0} aria-label="3D view. W A S D to move, drag to look around." />
        <div className="visor" />
        {cargandoTerreno && <p className="eva-cargando label-caps">Loading DTM terrain…</p>}

        <HeadingTape vista={vista} objetivo={rumboObj ?? vista} idObjetivo={tramo?.destino ?? '—'} />
        <Reticle pendiente={Math.round((pend ?? 0) * 10) / 10} />
        {tramo && rumboObj != null && (
          <TargetLock
            tramo={tramo}
            nodo={destino}
            rumbo={rumboObj}
            dx={delta(vista, rumboObj) * pxPorGrado}
            ancho={tam.w}
            onCentrar={() => est && control.current?.teletransportar(est.pos, rumboObj)}
          />
        )}

        {mision && idx != null ? (
          <MissionPanel mision={mision} idx={idx} fuente={fuente} />
        ) : (
          <section className="mision eva-sin-mision">
            <span className="label-caps">Free exploration</span>
            <p>No mission: request a route in the Copilot or Mission Planner to get a target and the autopilot.</p>
          </section>
        )}

        {/* lecturas del terreno bajo los pies (DTM) */}
        <dl className={`eva-lecturas ${clasePend}`}>
          <div><dt>Elev.</dt><dd>{fmt(est?.elev_m)} m</dd></div>
          <div><dt>Slope</dt><dd>{pend != null ? `${pend > 0 ? '+' : ''}${fmt(pend, 1)}°` : '—'}</dd></div>
          <div><dt>Pace</dt><dd>{fmt(est?.velocidad_kmh, 1)} km/h</dd></div>
          {distObj != null && <div><dt>To {tramo?.destino}</dt><dd>{fmt(distObj)} m</dd></div>}
        </dl>
        <p className="eva-ayuda"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Q</kbd><kbd>E</kbd> turn · drag to look · <kbd>Shift</kbd> ×10</p>
        {est?.bloqueado && <p className="eva-aviso critico">Slope &gt; {MARCHA.thetaMax}°: terrain blocked</p>}
        {!est?.bloqueado && clasePend === 'aviso' && <p className="eva-aviso">Above the maximum slope ({pendienteMax}°)</p>}

        {navcam?.url && cercana && (
          <figure className="eva-navcam">
            <img src={navcam.url} alt={`Navcam at ${cercana.n.id}`} referrerPolicy="no-referrer" />
            <figcaption>{cercana.n.id} · {navcam.camara} · sol {navcam.sol}</figcaption>
          </figure>
        )}

        <div className="abajo-izq">
          {alerta && mision && <AlertStrip alerta={alerta} zona={zona} mision={mision} />}
          <p className="credito">Terrain DTM CTX 20 m · USGS SIM 3464 · Tobler pace × {fmt(MARCHA.factor, 2)}</p>
        </div>

        <nav className="controles eva-controles" aria-label="Visor controls">
          <button type="button" onClick={onSalir} title="Back to the console (Esc)">✕ Console</button>
          {modo === 'partido' && eva.disponible && (
            <button type="button" onClick={abrirVentana} title="Open the visor in another window; the console follows it live">⧉ Window</button>
          )}
          <select aria-label="Camera" value={cam} onChange={(e) => setCam(e.target.value)} className="eva-select">
            {Object.entries(CAMARAS as Record<string, { nombre: string }>).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select>
          {tramos.length > 0 && !pil && (
            <button type="button" className="primario" onClick={() => control.current?.seguirRuta(tramos, vel)}>Autopilot: follow route</button>
          )}
          {pil && (
            <>
              <button type="button" onClick={() => control.current?.pilotoTramo(pil.idx - 1)} disabled={pil.idx === 0}>◀</button>
              <button type="button" className="primario" onClick={() => control.current?.pilotoPausa(!pil.enMarcha)}>{pil.enMarcha ? 'Pausa' : 'Seguir'}</button>
              <button type="button" onClick={() => control.current?.pilotoTramo(pil.idx + 1)} disabled={pil.idx >= tramos.length - 1}>▶</button>
              <select aria-label="Autopilot speed" value={vel} onChange={(e) => setVel(Number(e.target.value))} className="eva-select">
                {VELOCIDADES.map((v) => <option key={v} value={v}>×{v}</option>)}
              </select>
            </>
          )}
          {alerta ? (
            <button type="button" onClick={onQuitarAlerta} disabled={cargando}>Clear alert</button>
          ) : (
            <>
              <select aria-label="Alert zone" value={zonaElegida} onChange={(e) => setZonaElegida(e.target.value)} className="eva-select">
                {(zonas.length ? zonas : [{ id: 'Z2', nombre: '' }]).map((z) => <option key={z.id} value={z.id}>{z.id}</option>)}
              </select>
              <button type="button" className="alerta" onClick={() => onAlerta(zonaElegida)} disabled={cargando || !mision}>Dust alert</button>
            </>
          )}
        </nav>
      </div>

      {modo === 'partido' && (
        <aside className="eva-tablero" aria-label="Live dashboard map">
          <header className="eva-tablero-cab">
            <span className="label-caps">Dashboard map · live</span>
            <span className="eva-tablero-ayuda">Click the map to move the astronaut</span>
          </header>
          <MapaMision
            className="eva-tablero-mapa"
            grafo={grafo}
            mision={mision}
            zonaAlerta={zonaAlerta}
            astronauta={est ? { pos: est.pos, rumbo: est.rumbo } : null}
            onClickMapa={(q) => control.current?.teletransportar(q)}
          />
        </aside>
      )}
    </div>
  );
};
