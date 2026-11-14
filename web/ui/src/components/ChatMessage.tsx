import React, { useState } from 'react';
import type { MensajeHistorial } from '../types/mission';
import { Bot, User, Wrench, CheckCircle2, ChevronDown, ChevronRight, Route } from 'lucide-react';

interface ChatMessageProps {
  message: MensajeHistorial;
  onViewRoute?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onViewRoute }) => {
  const isUser = message.rol === 'usuario';
  const [showTools, setShowTools] = useState(false);

  return (
    <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'} animate-in fade-in duration-200`}>
      {/* Sender Header */}
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 px-1">
        {isUser ? (
          <>
            <span>{message.timestamp}</span>
            <span className="font-semibold text-amber-400">ASTRONAUTA</span>
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
              <User className="h-2.5 w-2.5" />
            </div>
          </>
        ) : (
          <>
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">
              <Bot className="h-2.5 w-2.5" />
            </div>
            <span className="font-semibold text-cyan-400">MARSWALK COPILOT</span>
            <span>{message.timestamp}</span>
          </>
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[88%] rounded-2xl p-3.5 text-sm leading-relaxed shadow-md ${
          isUser
            ? 'bg-gradient-to-br from-amber-600/30 to-orange-700/30 border border-amber-500/40 text-slate-100 rounded-tr-sm'
            : 'bg-[#101827] border border-slate-700/80 text-slate-200 rounded-tl-sm'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.contenido}</p>

        {/* Tool calling telemetry dropdown */}
        {message.llamadas && message.llamadas.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-slate-700/60 font-mono text-xs">
            <button
              onClick={() => setShowTools(!showTools)}
              className="flex items-center gap-1.5 text-[11px] text-cyan-400/90 hover:text-cyan-300 transition-colors"
            >
              <Wrench className="h-3 w-3" />
              <span>
                {message.llamadas.length} {message.llamadas.length === 1 ? 'función ejecutada' : 'funciones ejecutadas'}
              </span>
              {showTools ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>

            {showTools && (
              <div className="mt-2 space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                {message.llamadas.map((tool, idx) => (
                  <div
                    key={idx}
                    className="rounded bg-black/60 border border-cyan-900/50 p-2 text-[10px] text-slate-300 font-mono"
                  >
                    <div className="flex items-center justify-between text-cyan-400 font-bold mb-1">
                      <span>⚡ {tool.herramienta}()</span>
                      <span className="flex items-center gap-0.5 text-emerald-400 text-[9px]">
                        <CheckCircle2 className="h-2.5 w-2.5" /> OK
                      </span>
                    </div>
                    <pre className="text-slate-400 overflow-x-auto p-1 bg-black/40 rounded text-[9.5px]">
                      {JSON.stringify(tool.argumentos, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Route button preview */}
        {message.ruta && (
          <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs font-mono">
            <span className="text-emerald-400 flex items-center gap-1">
              <Route className="h-3.5 w-3.5" /> Ruta óptima: {message.ruta.ruta.join(' → ')}
            </span>
            {onViewRoute && (
              <button
                onClick={onViewRoute}
                className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-900 transition-colors text-[10px]"
              >
                Ver Telemetría
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
