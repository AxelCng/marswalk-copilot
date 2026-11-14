import React, { useState, useEffect } from 'react';
import { Battery, Activity, Compass, Database } from 'lucide-react';
import { api } from '../services/api';

interface HudHeaderProps {
  activeTab: 'chat' | 'planb' | 'stations';
  onTabChange: (tab: 'chat' | 'planb' | 'stations') => void;
  stationsCount: number;
}

export const HudHeader: React.FC<HudHeaderProps> = ({ activeTab, onTabChange, stationsCount }) => {
  const [useMock, setUseMock] = useState(api.useMock);
  const [time, setTime] = useState('10:45:00');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTime(now.toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleMock = () => {
    const next = !useMock;
    setUseMock(next);
    api.setUseMock(next);
  };

  return (
    <header className="border-b border-slate-800/80 bg-[#070c16]/95 backdrop-blur-md sticky top-0 z-40 px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Mission Identification */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 shadow-md shadow-orange-950/60 border border-orange-400/40">
            <Compass className="h-5 w-5 text-white animate-spin-slow" />
            <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-[#070c16]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono font-bold text-base text-white tracking-wider">
                MARSWALK COPILOT
              </h1>
              <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-orange-950/80 border border-orange-500/50 text-orange-400 font-semibold">
                NASA Jezero
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              EVA Path Planning & Real-time Geological Assistant
            </p>
          </div>
        </div>

        {/* Tactical Nav Tabs */}
        <div className="flex items-center bg-slate-900/90 border border-slate-800 p-1 rounded-xl text-xs font-mono">
          <button
            onClick={() => onTabChange('chat')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'chat'
                ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            💬 Copiloto Chat
          </button>

          <button
            onClick={() => onTabChange('planb')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'planb'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Plan B (Manual)
          </button>

          <button
            onClick={() => onTabChange('stations')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'stations'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📍 Fichas ({stationsCount})
          </button>
        </div>

        {/* Telemetry status & Backend source switch */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {/* Suit Vitals */}
          <div className="hidden lg:flex items-center gap-3 bg-slate-950/70 border border-slate-800/80 px-3 py-1.5 rounded-xl text-slate-300">
            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
              <Battery className="h-3.5 w-3.5" /> 94% TRAJE
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1 text-[11px] text-cyan-400">
              <Activity className="h-3.5 w-3.5" /> O₂ 4.2h
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-[11px] text-slate-400">
              LMST {time}
            </span>
          </div>

          {/* Toggle between Mock and Live backend */}
          <button
            onClick={handleToggleMock}
            title="Alternar entre datos simulados locales y FastAPI :8000"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-mono transition-all ${
              useMock
                ? 'bg-slate-900 border-amber-500/50 text-amber-300 hover:bg-slate-800'
                : 'bg-emerald-950 border-emerald-500 text-emerald-300 hover:bg-emerald-900'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>{useMock ? 'MODO: MOCK LOCAL' : 'MODO: FASTAPI :8000'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
