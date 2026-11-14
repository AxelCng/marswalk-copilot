import React, { useState, useEffect } from 'react';
import type { EstacionDetalle, RespuestaMision } from './types/mission';
import { api } from './services/api';
import { HudHeader } from './components/HudHeader';
import { ChatPanel } from './components/ChatPanel';
import { StationCard } from './components/StationCard';
import { StationModal } from './components/StationModal';
import { MissionSummary } from './components/MissionSummary';
import { PlanBForm } from './components/PlanBForm';
import { MapaMision } from './components/MapaMision';
import { MOCK_ESTACIONES, MOCK_GRAFO } from './mocks/mockData';
import type { Grafo } from './types/mission';
import type { ChatResponse } from './types/mission';
import { MapPin, Compass, Route, Info, Wind, RadioTower, RotateCcw } from 'lucide-react';

export const App: React.FC = () => {
  const [stations, setStations] = useState<EstacionDetalle[]>(MOCK_ESTACIONES);
  const [selectedStation, setSelectedStation] = useState<EstacionDetalle | null>(null);
  const [activeMission, setActiveMission] = useState<RespuestaMision | null>(null);
  const [grafo, setGrafo] = useState<Grafo | null>(null);
  const [zonaAlerta, setZonaAlerta] = useState<string | null>(null);
  const [avisoAlerta, setAvisoAlerta] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'planb' | 'stations'>('chat');
  const [filterTipo, setFilterTipo] = useState<string>('all');

  useEffect(() => {
    // Attempt loading stations from API service
    const loadData = async () => {
      try {
        const fullStations = await Promise.all(
          MOCK_ESTACIONES.map(async (st) => {
            try {
              return await api.getEstacion(st.id);
            } catch {
              return st;
            }
          })
        );
        setStations(fullStations);
      } catch (e) {
        console.warn('Usando mock de estaciones:', e);
      }
    };
    loadData();
    api.getGrafo()
      .then(setGrafo)
      .catch((e) => { console.warn('Sin /grafo, se usa contracts/graph_fake.json:', e); setGrafo(MOCK_GRAFO); });
  }, []);

  /** Misión nueva (chat o plan B): sin alerta activa. */
  const mostrarMision = (m: RespuestaMision) => { setZonaAlerta(null); setAvisoAlerta(null); setActiveMission(m); };

  /** Respuesta del chat: si el copiloto llamó a recalcular_por_alerta, se muestra como alerta. */
  const onRutaDelChat = (ruta: RespuestaMision, res?: ChatResponse) => {
    const alerta = res?.llamadas.find((l) => l.herramienta === 'recalcular_por_alerta');
    if (alerta) { setZonaAlerta(String(alerta.argumentos.zona ?? '')); setActiveMission(ruta); }
    else mostrarMision(ruta);
  };

  const lanzarAlerta = async (zona: string, tipo: 'polvo' | 'comms') => {
    if (!activeMission) { setAvisoAlerta('Primero pide una misión (chat o Plan B).'); return; }
    try {
      const r = await api.postAlerta(zona, tipo);
      setZonaAlerta(tipo === 'polvo' ? zona : null);
      setActiveMission(r);
      const evitados = r.aristas_afectadas ?? [];
      setAvisoAlerta(`${tipo === 'polvo' ? `Polvo en ${zona}` : 'Pérdida de comunicación'}: ` +
        (evitados.length ? `evitados ${evitados.join(', ')}` : 'la ruta no cruzaba la zona') + ` · ${r.totales.tiempo_min} min`);
    } catch (e) {
      setAvisoAlerta(`No se pudo recalcular: ${e instanceof Error ? e.message : e}`);
    }
  };

  const resetear = async () => {
    try { await api.resetAlerta(); } catch (e) { console.warn(e); }
    setZonaAlerta(null); setAvisoAlerta(null); setActiveMission(null);
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

  return (
    <div className="min-h-screen bg-hud-deep text-ink flex flex-col font-sans">
      {/* Top Tactical HUD Header */}
      <HudHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stationsCount={stations.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Banner: Space Apps Context & Mission Area */}
        <div className="relative overflow-hidden rounded border border-hud-border bg-hud-panel p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 chip sin-punto !text-rust !border-rust/40">
                  <MapPin className="h-3 w-3" /> CRÁTER JEZERO · MARTE
                </span>
                <span className="text-xs font-mono text-ink-dim">
                  Ruta Perseverance · Octavia E. Butler Landing
                </span>
              </div>
              <h2 className="m-0 font-display text-lg sm:text-xl font-semibold text-ink">
                Planificador Inteligente de EVA y Geología de Superficie
              </h2>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-ink-dim">Fórmula de marcha:</span>
              <span className="bg-black/60 border border-hud-border text-hud-cyan px-2.5 py-1 rounded">
                Tobler v(θ) × factor_traje
              </span>
            </div>
          </div>
        </div>

        {/* Mapa de la misión (web/map, Añe) + alertas */}
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-hud-border font-mono text-xs">
            <span className="text-ink-dim mr-1 flex items-center gap-1"><Wind className="h-3.5 w-3.5 text-critical" /> Alerta de polvo:</span>
            {(grafo?.zonas ?? []).map((z) => (
              <button key={z.id} onClick={() => lanzarAlerta(z.id, 'polvo')}
                className={`px-2.5 py-1 rounded border transition-colors ${zonaAlerta === z.id
                  ? 'bg-critical border-critical text-ink' : 'bg-hud-panel border-hud-border text-ink-dim hover:border-critical'}`}>
                {z.id} {z.nombre}
              </button>
            ))}
            <button onClick={() => lanzarAlerta('Z1', 'comms')}
              className="px-2.5 py-1 rounded border bg-hud-panel border-hud-border text-ink-dim hover:border-critical flex items-center gap-1">
              <RadioTower className="h-3.5 w-3.5" /> Sin comunicación
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
          />
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
                    <Route className="h-3.5 w-3.5 text-hud-cyan" /> Telemetría de la Misión
                  </h3>
                  <span className="text-[10px] font-mono text-nominal">
                    Sincronizado con Grafo
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
                    <Compass className="h-3.5 w-3.5 text-warning" /> Estaciones Cercanas
                  </h3>
                  <button
                    onClick={() => setActiveTab('stations')}
                    className="text-[11px] font-mono text-hud-cyan hover:underline"
                  >
                    Ver todas ({stations.length}) →
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
                onAlertaCalculada={(r, z) => { setZonaAlerta(z); setActiveMission(r); }}
              />
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="label-caps m-0">
                  Resultado de la Optimización
                </h3>
              </div>
              <MissionSummary
                mission={activeMission}
                onSelectStation={handleSelectStationById}
              />

              <div className="panel p-4 text-xs text-ink-dim space-y-2">
                <div className="flex items-center gap-1.5 text-hud-cyan font-semibold">
                  <Info className="h-4 w-4" /> ¿Por qué existe el Modo Plan B?
                </div>
                <p className="leading-relaxed">
                  En la evaluación en vivo ante el jurado o en misiones reales con caída de enlace de satélite, este formulario garantiza que la misión se compute 100% matemáticamente mediante los algoritmos de <strong>OR-Tools / Dijkstra</strong> sin depender de la inferencia del LLM.
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
                <span className="text-ink-mute mr-1">Filtrar por tipo:</span>
                {[
                  { id: 'all', label: 'TODAS' },
                  { id: 'ciencia', label: 'CIENCIA' },
                  { id: 'muestreo', label: 'MUESTREO' },
                  { id: 'habitat', label: 'BASE / ROVER' },
                  { id: 'refugio', label: 'REFUGIO / COMMS' }
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
                Mostrando {filteredStations.length} de {stations.length} puntos de interés
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
          NASA Space Apps Challenge 2026 · MarsWalk Copilot · Datos: NASA/JPL-Caltech (Perseverance), USGS SIM 3464, MSSS/ASU.
        </p>
        <p className="text-[10px] text-ink-mute mt-1">
          Este proyecto es un prototipo desarrollado para propósitos educativos y de investigación aeroespacial. No implica aval oficial de NASA.
        </p>
      </footer>
    </div>
  );
};
export default App;
