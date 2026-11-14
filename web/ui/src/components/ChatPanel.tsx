import React, { useState, useRef, useEffect } from 'react';
import type { ChatResponse, MensajeHistorial, RespuestaMision } from '../types/mission';
import { ChatMessage } from './ChatMessage';
import { api } from '../services/api';
import { Send, Sparkles, Loader2, RefreshCw, Radio } from 'lucide-react';

interface ChatPanelProps {
  onRouteGenerated?: (ruta: RespuestaMision, respuesta?: ChatResponse) => void;
  onViewRoute?: () => void;
}

const DEMO_PRESETS = [
  {
    label: "Paso 1: Misión 15° (<3h)",
    text: "Quiero visitar el frente del delta y dos puntos de muestreo, volver en menos de 3 horas, sin pendientes de más de 15°"
  },
  {
    label: "Paso 2: ¿Y si acepto 20°?",
    text: "¿Y si acepto hasta 20°?"
  },
  {
    label: "Paso 3: Alerta Polvo Z2",
    text: "Alerta de polvo en la zona Z2"
  }
];

export const ChatPanel: React.FC<ChatPanelProps> = ({ onRouteGenerated, onViewRoute }) => {
  const [messages, setMessages] = useState<MensajeHistorial[]>([
    {
      id: 'init-1',
      rol: 'asistente',
      contenido: "Copiloto EVA MarsWalk en línea. Indícame los objetivos científicos de la caminata en Jezero Crater, el tiempo límite de soporte vital y la pendiente máxima tolerable por el traje.",
      timestamp: 'SOL 415 10:14'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: MensajeHistorial = {
      id: `user-${Date.now()}`,
      rol: 'usuario',
      contenido: text,
      timestamp: `SOL 415 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const historyPayload = messages.map((m) => ({
        rol: m.rol,
        contenido: m.contenido
      }));

      const res = await api.postChat(text, historyPayload);

      const botMsg: MensajeHistorial = {
        id: `bot-${Date.now()}`,
        rol: 'asistente',
        contenido: res.respuesta,
        timestamp: `SOL 415 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        llamadas: res.llamadas,
        ruta: res.ruta
      };

      setMessages((prev) => [...prev, botMsg]);

      if (res.ruta) {
        onRouteGenerated?.(res.ruta, res);
      }
    } catch (err) {
      console.error(err);
      const errorMsg: MensajeHistorial = {
        id: `err-${Date.now()}`,
        rol: 'asistente',
        contenido: "Error en el enlace de radio con el copiloto LLM. Puedes utilizar el Formulario Plan B para calcular la misión directamente por el motor de grafos.",
        timestamp: 'ERROR'
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        id: 'init-1',
        rol: 'asistente',
        contenido: "Historial reiniciado. Lista para planificar una nueva EVA en Jezero Crater.",
        timestamp: 'SOL 415'
      }
    ]);
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0f1b] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3 bg-[#0d1424]/90 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Radio className="h-4 w-4 text-cyan-400 animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
          </div>
          <div>
            <h3 className="font-mono text-xs font-bold text-white tracking-wider uppercase">
              Canal EVA / Copiloto de Caminata
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              Llamada a funciones FastAPI activa
            </span>
          </div>
        </div>

        <button
          onClick={handleClear}
          title="Reiniciar chat"
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Preset Pills for Space Apps Demo Video */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-950/60 border-b border-slate-900 overflow-x-auto text-[11px] font-mono">
        <span className="text-slate-500 text-[10px] flex-shrink-0 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-amber-400" /> GUION DEMO:
        </span>
        {DEMO_PRESETS.map((preset, i) => (
          <button
            key={i}
            onClick={() => handleSend(preset.text)}
            disabled={loading}
            className="flex-shrink-0 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 hover:border-cyan-500/60 hover:bg-cyan-950/40 text-slate-300 hover:text-cyan-300 transition-all cursor-pointer disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onViewRoute={onViewRoute} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 rounded-xl p-3 w-fit animate-pulse">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Consultando modelo de coste y optimizador OR-Tools...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3 bg-[#0d1424] border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ej: Quiero visitar E1 y M1 con máx 15° de pendiente..."
            disabled={loading}
            className="flex-1 bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-mono"
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 text-white hover:from-orange-500 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-orange-950/50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
