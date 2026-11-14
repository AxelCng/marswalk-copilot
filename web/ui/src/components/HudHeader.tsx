import React, { useState, useEffect } from 'react';
import { Battery, Activity, Database, MessageSquare, ShieldCheck, MapPin } from 'lucide-react';
import { api } from '../services/api';

type Tab = 'chat' | 'planb' | 'stations';

interface HudHeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  stationsCount: number;
}

export const HudHeader: React.FC<HudHeaderProps> = ({ activeTab, onTabChange, stationsCount }) => {
  const [useMock, setUseMock] = useState(api.useMock);
  const [time, setTime] = useState(() => new Date().toISOString().slice(11, 19));

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toISOString().slice(11, 19)), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleMock = () => {
    const next = !useMock;
    setUseMock(next);
    api.setUseMock(next);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'chat', label: 'Copiloto', icon: <MessageSquare className="h-3.5 w-3.5" /> },
    { id: 'planb', label: 'Plan B', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
    { id: 'stations', label: `Fichas (${stationsCount})`, icon: <MapPin className="h-3.5 w-3.5" /> },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-hud-border bg-hud-panel/95 backdrop-blur-md px-4 py-2">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 min-h-9">
        {/* Marca */}
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-[22px] w-[22px] shrink-0 rounded-full border-2 border-hud-cyan"
            style={{ boxShadow: 'inset 0 0 0 4px var(--hud-panel), inset 0 0 0 7px var(--hud-cyan)' }}
          />
          <div>
            <h1 className="m-0 font-display font-bold text-base leading-[18px] tracking-[0.02em] uppercase text-ink">
              MarsWalk Copilot
            </h1>
            <p className="label-caps m-0">EVA HUD · Cráter Jezero</p>
          </div>
        </div>

        {/* Vistas */}
        <nav className="segmentado w-full sm:w-auto sm:min-w-[320px] bg-hud-deep order-last sm:order-none" aria-label="Vistas">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`inline-flex items-center justify-center gap-1.5 ${activeTab === t.id ? 'activo' : ''}`}
              aria-pressed={activeTab === t.id}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        {/* Telemetría y fuente de datos */}
        <div className="flex items-center gap-2 text-xs dato-num">
          <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1 border border-hud-border rounded bg-hud-deep text-nominal">
            <Battery className="h-3.5 w-3.5" /> 94% TRAJE
          </span>
          <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1 border border-hud-border rounded bg-hud-deep text-hud-cyan">
            <Activity className="h-3.5 w-3.5" /> O₂ 4.2 h
          </span>
          <span className="hidden md:inline-flex items-baseline gap-1.5 px-2 py-1 border border-hud-border rounded bg-hud-deep text-ink">
            <span className="label-caps">UTC</span> {time}
          </span>

          <button
            type="button"
            onClick={handleToggleMock}
            title="Alternar entre datos de prueba locales y FastAPI :8000"
            className={`chip sin-punto cursor-pointer bg-hud-deep min-h-[26px] ${useMock ? 'warning' : 'nominal'}`}
          >
            <Database className="h-3 w-3" />
            {useMock ? 'Modo prueba' : 'FastAPI :8000'}
          </button>
        </div>
      </div>
    </header>
  );
};
