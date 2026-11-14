import React, { useState, useEffect } from 'react';
import type { EstacionDetalle, RespuestaMision } from './types/mission';
import { api, ApiError } from './services/api';
import { VisorHud } from './components/VisorHud';
import { unidadesPorEstacion } from './services/geologia';
import { HudHeader } from './components/HudHeader';
import { ChatPanel } from './components/ChatPanel';
import { StationCard } from './components/StationCard';
import { StationModal } from './components/StationModal';
import { MissionSummary } from './components/MissionSummary';
import { PlanBForm } from './components/PlanBForm';
import { MapaMision } from './components/MapaMision';
import { MOCK_ALERTA_Z2, MOCK_ESTACIONES, MOCK_GRAFO } from './mocks/mockData';
import type { Grafo } from './types/mission';
import type { ChatResponse } from './types/mission';
import { MapPin, Compass, Route, Info, Wind, RadioTower, RotateCcw } from 'lucide-react';
import { eva, type EstadoAstronauta } from './services/eva';

/** ?vista=visor: esta ventana es solo el visor del astronauta; la consola de otra ventana lo sigue. */
const VENTANA_VISOR = new URLSearchParams(window.location.search).get('vista') === 'visor';

export const App: React.FC = () => {
  const [stations, setStations] = useState<EstacionDetalle[]>(MOCK_ESTACIONES);
  const [selectedStation, setSelectedStation] = useState<EstacionDetalle | null>(null);
  const [activeMission, setActiveMission] = useState<RespuestaMision | null>(null);
  const [grafo, setGrafo] = useState<Grafo | null>(null);
  const [zonaAlerta, setZonaAlerta] = useState<string | null>(null);
  const [avisoAlerta, setAvisoAlerta] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'planb' | 'stations'>('chat');
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [vista, setVista] = useState<'consola' | 'visor'>(VENTANA_VISOR ? 'visor' : 'consola');
  /** Astronauta de un visor abierto en otra ventana (llega por eva.ts). */
  const [astronauta, setAstronauta] = useState<EstadoAstronauta | null>(null);
  const [misionPrevia, setMisionPrevia] = useState<RespuestaMision | null>(null);
  const [ejemplo, setEjemplo] = useState(false);
  const [alertaCargando, setAlertaCargando] = useState(false);

  useEffect(() => {
    // Estaciones: la lista sale de GET /estaciones (las del graph.json real, no solo las de prueba)
    // y cada ficha de GET /estaciones/{id}. Después se cruza con la capa geológica SIM 3464.
    const loadData = async () => {
      try {
        const lista = await api.getEstaciones();
        const fullStations = await Promise.all(
          lista.map(async (st) => {
            try {
              return await api.getEstacion(st.id);
            } catch {
              return MOCK_ESTACIONES.find((m) => m.id === st.id) ?? null;
            }
          })
        );
        const conFicha = fullStations.filter((s): s is EstacionDetalle => s !== null);
        if (!conFicha.length) return;
        const geo = await unidadesPorEstacion(conFicha);
        setStations(geo ? conFicha.map((s) => (geo[s.id] ? { ...s, unidad_sim: geo[s.id] } : s)) : conFicha);
      } catch (e) {
        console.warn('Usando mock de estaciones:', e);
      }
    };
    loadData();
    // El modelo tarda en cargarse en la GPU la primera vez: se carga ya, antes de la primera pregunta
    api.precalentarChat().then((r) => { if (r) console.info('Copiloto precalentado:', r); });
    api.getGrafo()
      .then(setGrafo)
      .catch((e) => { console.warn('Sin /grafo, se usa contracts/graph_fake.json:', e); setGrafo(MOCK_GRAFO); });
  }, []);

  // --- EVA en vivo entre ventanas -----------------------------------------------
  // Consola: comparte la misión con la ventana del visor y muestra al astronauta que esta le manda.
  useEffect(() => {
    if (VENTANA_VISOR) return undefined;
    const compartir = () => eva.publicarMision({ mision: activeMission, misionPrevia, zonaAlerta, ejemplo });
    compartir();
    return eva.alPedido(compartir);
  }, [activeMission, misionPrevia, zonaAlerta, ejemplo]);
  useEffect(() => {
    if (VENTANA_VISOR) return undefined;
    let t: ReturnType<typeof setTimeout>;
    const quitar = eva.alEstado((e) => {
      setAstronauta(e);
      clearTimeout(t);
      t = setTimeout(() => setAstronauta(null), 3000); // si el visor se cierra, se borra el marcador
    });
    return () => { quitar(); clearTimeout(t); };
  }, []);
  // Ventana del visor: recibe la misión de la consola.
  useEffect(() => {
    if (!VENTANA_VISOR) return undefined;
    const quitar = eva.alMision((d) => {
      setActiveMission(d.mision); setMisionPrevia(d.misionPrevia); setZonaAlerta(d.zonaAlerta); setEjemplo(d.ejemplo);
    });
    eva.pedirMision();
    return quitar;
  }, []);

  /** Misión nueva (chat o plan B): sin alerta activa. `ejemplo`: salió de contracts/ porque no había motor. */
  const mostrarMision = (m: RespuestaMision, ejemplo = false) => {
    setZonaAlerta(null); setAvisoAlerta(null); setMisionPrevia(null);
    setEjemplo(ejemplo); setActiveMission(m);
  };

  /** Misión recalculada por una alerta: se guarda la anterior para dibujar los tramos evitados (visor). */
  const aplicarAlerta = (r: RespuestaMision, zona: string | null, ejemplo = false) => {
    if (!zonaAlerta) setMisionPrevia(activeMission);
    setZonaAlerta(zona); setEjemplo(ejemplo); setActiveMission(r);
  };

  /** Respuesta del chat: si el copiloto llamó a reroute_for_alert, se muestra como alerta. */
  const onRutaDelChat = (ruta: RespuestaMision, res?: ChatResponse) => {
    const alerta = res?.calls.find((l) => l.tool === 'reroute_for_alert');
    // comms afecta a toda la red: no hay zona que resaltar (igual que el Plan B)
    if (alerta) aplicarAlerta(ruta, alerta.arguments.type === 'comms' ? null : String(alerta.arguments.zone ?? '') || null);
    else mostrarMision(ruta);
  };

  const lanzarAlerta = async (zona: string, tipo: 'polvo' | 'comms') => {
    if (!activeMission) { setAvisoAlerta('Request a mission first (chat or Plan B).'); return; }
    setAlertaCargando(true);
    try {
      const r = await api.postAlerta(zona, tipo);
      aplicarAlerta(r, tipo === 'polvo' ? zona : null);
      const evitados = r.aristas_afectadas ?? [];
      setAvisoAlerta(`${tipo === 'polvo' ? `Dust in ${zona}` : 'Comms loss'}: ` +
        (evitados.length ? `avoided ${evitados.join(', ')}` : 'the route did not cross the zone') + ` · ${r.totales.tiempo_min} min`);
    } catch (e) {
      if (!(e instanceof ApiError) && tipo === 'polvo' && zona === 'Z2') {
        // Sin motor: el ejemplo oficial de contracts/ (igual que el Plan B y web/map)
        aplicarAlerta(MOCK_ALERTA_Z2, 'Z2', true);
        setAvisoAlerta('No connection to the engine: showing the Z2 alert example from contracts/.');
      } else {
        setAvisoAlerta(`Could not recalculate: ${e instanceof Error ? e.message : e}`);
      }
    } finally {
      setAlertaCargando(false);
    }
  };

  const resetear = async () => {
    try { await api.resetAlerta(); } catch (e) { console.warn(e); }
    setZonaAlerta(null); setAvisoAlerta(null); setActiveMission(null); setMisionPrevia(null);
  };

  /** Quita la alerta y vuelve a la misión de antes (la que la alerta había recalculado). */
  const quitarAlerta = async () => {
    setAlertaCargando(true);
    try { await api.resetAlerta(); } catch (e) { console.warn(e); }
    if (misionPrevia) setActiveMission(misionPrevia);
    setZonaAlerta(null); setAvisoAlerta(null); setMisionPrevia(null);
    setAlertaCargando(false);
  };

  const handleSelectStationById = async (id: string) => {
    const found = stations.find((s) => s.id === id);
    if (found) {
      setSelectedStation(found);
    }
  };

  const filteredStations = stations.filter((s) => {
    if (filterTipo === 'all') return true;
    return s.tipo === filterTipo;
  });

  if (VENTANA_VISOR) {
    return (
      <VisorHud
        mision={activeMission}
        misionPrevia={misionPrevia}
        zonaAlerta={zonaAlerta}
        estaciones={stations}
        zonas={grafo?.zonas ?? []}
        grafo={grafo}
        modo="ventana"
        fuente={api.useMock || ejemplo ? 'ejemplo' : 'api'}
        cargando={alertaCargando}
        onSalir={() => window.close()}
        onAlerta={(z) => lanzarAlerta(z, 'polvo')}
        onQuitarAlerta={quitarAlerta}
      />
    );
  }

  return (
    <div className="min-h-screen bg-hud-deep text-ink flex flex-col font-sans">
      {/* Top Tactical HUD Header */}
      <HudHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stationsCount={stations.length}
        onAbrirVisor={() => setVista('visor')}
      />

      {/* Modo visor en primera persona (HUD de casco, web/ui/hud) sobre la consola */}
      {vista === 'visor' && (
        <VisorHud
          mision={activeMission}
          misionPrevia={misionPrevia}
          zonaAlerta={zonaAlerta}
          estaciones={stations}
          zonas={grafo?.zonas ?? []}
          grafo={grafo}
          modo={VENTANA_VISOR ? 'ventana' : 'partido'}
          fuente={api.useMock || ejemplo ? 'ejemplo' : 'api'}
          cargando={alertaCargando}
          onSalir={() => (VENTANA_VISOR ? window.close() : setVista('consola'))}
          onAlerta={(z) => lanzarAlerta(z, 'polvo')}
          onQuitarAlerta={quitarAlerta}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Banner: Space Apps Context & Mission Area */}
        <div className="relative overflow-hidden rounded border border-hud-border bg-hud-panel p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 chip sin-punto !text-rust !border-rust/40">
                  <MapPin className="h-3 w-3" /> JEZERO CRATER · MARS
                </span>
                <span className="text-xs font-mono text-ink-dim">
                  Perseverance route · Octavia E. Butler Landing
                </span>
              </div>
              <h2 className="m-0 font-display text-lg sm:text-xl font-semibold text-ink">
                Intelligent EVA and Surface Geology Planner
              </h2>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-ink-dim">Walking model:</span>
              <span className="bg-black/60 border border-hud-border text-hud-cyan px-2.5 py-1 rounded">
                Tobler v(θ) × suit factor
              </span>
            </div>
          </div>
        </div>

        {/* Mapa de la misión (web/map, Añe) + alertas */}
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-hud-border font-mono text-xs">
            <span className="text-ink-dim mr-1 flex items-center gap-1"><Wind className="h-3.5 w-3.5 text-critical" /> Dust alert:</span>
            {(grafo?.zonas ?? []).map((z) => (
              <button key={z.id} onClick={() => lanzarAlerta(z.id, 'polvo')}
                className={`px-2.5 py-1 rounded border transition-colors ${zonaAlerta === z.id
                  ? 'bg-critical border-critical text-ink' : 'bg-hud-panel border-hud-border text-ink-dim hover:border-critical'}`}>
                {z.id} {z.nombre}
              </button>
            ))}
            <button onClick={() => lanzarAlerta('Z1', 'comms')}
              className="px-2.5 py-1 rounded border bg-hud-panel border-hud-border text-ink-dim hover:border-critical flex items-center gap-1">
              <RadioTower className="h-3.5 w-3.5" /> Comms loss
            </button>
            <button onClick={resetear}
              className="px-2.5 py-1 rounded border bg-hud-panel border-hud-border text-ink-dim hover:border-hud-cyan flex items-center gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            {avisoAlerta && <span className="ml-auto text-warning">{avisoAlerta}</span>}
          </div>
          <MapaMision
            className="h-[460px] w-full"
            grafo={grafo}
            mision={activeMission}
            zonaAlerta={zonaAlerta}
            onClickEstacion={handleSelectStationById}
            astronauta={astronauta ? { pos: astronauta.pos, rumbo: astronauta.rumbo } : null}
            onClickMapa={astronauta ? (q) => eva.ir(q) : undefined}
          />
          {astronauta && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 border-t border-hud-border font-mono text-xs tabular-nums text-ink-dim">
              <span className="text-hud-cyan">● Astronaut live</span>
              <span>{astronauta.pos[1].toFixed(5)}°N {astronauta.pos[0].toFixed(5)}°E</span>
              <span>elev {astronauta.elev_m != null ? Math.round(astronauta.elev_m) : '—'} m</span>
              <span>slope {astronauta.pendiente_deg.toFixed(1)}°</span>
              <span>{astronauta.velocidad_kmh.toFixed(1)} km/h</span>
              {astronauta.tramo != null && activeMission?.tramos[astronauta.tramo] && (
                <span>leg {astronauta.tramo + 1}: {activeMission.tramos[astronauta.tramo].origen} → {activeMission.tramos[astronauta.tramo].destino}</span>
              )}
              <span className="ml-auto">click the map to move the astronaut</span>
            </div>
          )}
        </div>

        {/* View Switcher Content */}
        {/* El chat queda montado aunque se cambie de pestaña: así no se pierde la conversación al ir al Plan B */}
        {(
          <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-start ${activeTab === 'chat' ? '' : 'hidden'}`}>
            {/* Left: Chat Copilot (takes 7 cols) */}
            <div className="lg:col-span-7 h-[680px]">
              <ChatPanel
                onRouteGenerated={onRutaDelChat}
                onIrPlanB={() => setActiveTab('planb')}
                onViewRoute={() => {
                  const el = document.getElementById('mission-summary-anchor');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            </div>

            {/* Right: Active Mission Telemetry & Station Quick Access (takes 5 cols) */}
            <div className="lg:col-span-5 space-y-5" id="mission-summary-anchor">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="label-caps m-0 flex items-center gap-1.5">
                    <Route className="h-3.5 w-3.5 text-hud-cyan" /> Mission Telemetry
                  </h3>
                  <span className="text-[10px] font-mono text-nominal">
                    Synced with graph
                  </span>
                </div>
                <MissionSummary
                  mission={activeMission}
                  onSelectStation={handleSelectStationById}
                />
              </div>

              {/* Quick Stations Carousel / Strip */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="label-caps m-0 flex items-center gap-1.5">
                    <Compass className="h-3.5 w-3.5 text-warning" /> Nearby Stations
                  </h3>
                  <button
                    onClick={() => setActiveTab('stations')}
                    className="text-[11px] font-mono text-hud-cyan hover:underline"
                  >
                    View all ({stations.length}) →
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 max-h-[310px] overflow-y-auto pr-1">
                  {stations.slice(0, 4).map((station) => (
                    <StationCard
                      key={station.id}
                      station={station}
                      onSelect={(st) => setSelectedStation(st)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'planb' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7">
              <PlanBForm
                stations={stations}
                onMissionCalculated={mostrarMision}
                zonas={grafo?.zonas ?? []}
                onAlertaCalculada={(r, z, ej) => { setAvisoAlerta(null); aplicarAlerta(r, z, ej); }}
                onReset={() => { setZonaAlerta(null); setAvisoAlerta(null); setActiveMission(null); setMisionPrevia(null); }}
              />
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="label-caps m-0">
                  Optimization Result
                </h3>
              </div>
              <MissionSummary
                mission={activeMission}
                onSelectStation={handleSelectStationById}
              />

              <div className="panel p-4 text-xs text-ink-dim space-y-2">
                <div className="flex items-center gap-1.5 text-hud-cyan font-semibold">
                  <Info className="h-4 w-4" /> Why a Plan B mode?
                </div>
                <p className="leading-relaxed">
                  During the live evaluation, or in a real mission with a satellite link outage, this form makes sure the mission is computed 100% by the <strong>OR-Tools / Dijkstra</strong> algorithms, without depending on LLM inference.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stations' && (
          <div className="space-y-4">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-hud-panel/60 border border-hud-border p-3 rounded font-mono text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-ink-mute mr-1">Filter by type:</span>
                {[
                  { id: 'all', label: 'ALL' },
                  { id: 'ciencia', label: 'SCIENCE' },
                  { id: 'muestreo', label: 'SAMPLING' },
                  { id: 'habitat', label: 'BASE / ROVER' },
                  { id: 'refugio', label: 'SHELTER / COMMS' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterTipo(f.id)}
                    className={`px-3 py-1 rounded border transition-colors ${filterTipo === f.id
                        ? 'bg-hud-cyan/10 border-hud-cyan text-hud-cyan font-bold'
                        : 'bg-hud-deep border-hud-border text-ink-dim hover:text-ink'
                      }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <span className="text-ink-dim text-[11px]">
                Showing {filteredStations.length} of {stations.length} points of interest
              </span>
            </div>

            {/* Stations Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredStations.map((station) => (
                <StationCard
                  key={station.id}
                  station={station}
                  onSelect={(st) => setSelectedStation(st)}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Station Modal for Detail Inspection */}
      <StationModal
        station={selectedStation}
        onClose={() => setSelectedStation(null)}
      />

      {/* Footer credits and NASA compliance note */}
      <footer className="mt-auto border-t border-hud-border/80 bg-hud-deep py-4 px-6 text-center text-xs font-mono text-ink-mute">
        <p>
          NASA Space Apps Challenge 2026 · MarsWalk Copilot · Data: NASA/JPL-Caltech (Perseverance), USGS SIM 3464, MSSS/ASU.
        </p>
        <p className="text-[10px] text-ink-mute mt-1">
          This project is a prototype built for educational and aerospace research purposes. It does not imply official NASA endorsement.
        </p>
      </footer>
    </div>
  );
};
export default App;
