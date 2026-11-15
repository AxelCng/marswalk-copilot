import React, { useState, useRef, useEffect } from 'react';
import type { ChatResponse, MensajeHistorial, RespuestaMision } from '../types/mission';
import { ChatMessage } from './ChatMessage';
import { api } from '../services/api';
import { Send, Loader2, RotateCcw } from 'lucide-react';
import { DEMO, FRASES } from '../demo';

interface ChatPanelProps {
  onRouteGenerated?: (ruta: RespuestaMision, respuesta?: ChatResponse) => void;
  onViewRoute?: () => void;
  /** Lleva al formulario Plan B cuando el copiloto no responde. */
  onIrPlanB?: () => void;
}

// Las 3 preguntas del guion de la demo, en orden (es una secuencia real: cada una depende de la anterior).
const DEMO_PRESETS = [
  { label: `Walk at ${DEMO.pendiente_1}°, under 4 h`, text: FRASES.paso1 },
  { label: `Allow ${DEMO.pendiente_2}°`, text: FRASES.paso2 },
  { label: `Dust in ${DEMO.zona}`, text: FRASES.paso3 },
];

// Hora local de quien usa la consola (antes se mostraba un "SOL 415" inventado).
const hora = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const SALUDO =
  `Where do you want to walk? Tell me the stations, how much time you have and the steepest slope you'll accept. ` +
  `For example: "the delta front and Séítah, back in 3 hours, no slopes over ${DEMO.pendiente_2}°".`;

const saludo = (contenido: string): MensajeHistorial => ({
  id: `init-${Date.now()}`,
  rol: 'asistente',
  contenido,
  timestamp: '',
  local: true,
});

export const ChatPanel: React.FC<ChatPanelProps> = ({ onRouteGenerated, onViewRoute, onIrPlanB }) => {
  const [messages, setMessages] = useState<MensajeHistorial[]>([
    saludo(SALUDO)
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [espera, setEspera] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);

  // Baja al último mensaje desplazando solo la lista del chat. scrollIntoView movía la página entera,
  // así que al cargar (sobre todo en el celular) la pantalla saltaba sola hasta el chat.
  useEffect(() => {
    const lista = listaRef.current;
    if (lista) lista.scrollTo({ top: lista.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Contador de espera: el modelo local tarda decenas de segundos en CPU.
  useEffect(() => {
    if (!loading) return;
    setEspera(0);
    const t0 = Date.now();
    const id = setInterval(() => setEspera(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: MensajeHistorial = {
      id: `user-${Date.now()}`,
      rol: 'usuario',
      contenido: text,
      timestamp: hora()
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      // Solo la conversación real: un historial vacío hace que /chat empiece de cero.
      const historyPayload = messages
        .filter((m) => !m.local)
        .map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.contenido }));

      const res = await api.postChat(text, historyPayload);

      const botMsg: MensajeHistorial = {
        id: `bot-${Date.now()}`,
        rol: 'asistente',
        contenido: res.answer,
        timestamp: hora(),
        llamadas: res.calls,
        ruta: res.route,
        segundos: res.seconds,
        numeros_sin_fuente: res.unsourced_numbers,
        // Con error, /chat igual responde 200: el mensaje no entra al historial y se ofrece el Plan B.
        error: Boolean(res.error),
        local: Boolean(res.error),
      };

      setMessages((prev) => [...prev, botMsg]);

      if (res.route && !res.error) {
        onRouteGenerated?.(res.route, res);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        rol: 'asistente',
        contenido: "The copilot isn't reachable right now. The mission form plans the same walk with the route engine directly.",
        timestamp: hora(),
        error: true,
        local: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([saludo(SALUDO)]);
  };

  return (
    <div className="panel flex flex-col h-full overflow-hidden">
      {/* Encabezado */}
      <div className="flex items-center justify-between border-b border-hud-border/80 px-4 py-3">
        <div>
          <h3 className="m-0 font-display text-base font-semibold text-ink">Copilot</h3>
          <p className="m-0 text-xs text-ink-mute">Asks the route engine, then explains the plan</p>
        </div>

        <button
          onClick={handleClear}
          disabled={loading}
          title="Start a new conversation"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs text-ink-dim hover:bg-hud-glass hover:text-ink transition-colors disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> New
        </button>
      </div>

      {/* Guion de la demo: las 3 preguntas en orden */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-hud-subtle overflow-x-auto text-[13px]">
        <span className="text-ink-mute flex-shrink-0 mr-1">Try</span>
        {DEMO_PRESETS.map((preset, i) => (
          <button
            key={i}
            onClick={() => handleSend(preset.text)}
            disabled={loading}
            title={preset.text}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-hud-border text-ink hover:border-hud-cyan transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="dato-num text-hud-cyan">{i + 1}</span> {preset.label}
          </button>
        ))}
      </div>

      {/* Mensajes */}
      <div ref={listaRef} className="flex-1 overflow-y-auto p-4 space-y-4" aria-live="polite">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onViewRoute={onViewRoute} onIrPlanB={onIrPlanB} />
        ))}

        {loading && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-dim border border-hud-border rounded px-3 py-2 w-fit" role="status">
            <Loader2 className="h-4 w-4 animate-spin text-hud-cyan" />
            <span>Planning the route</span>
            <span className="dato-num text-ink-mute">{espera} s</span>
            {espera >= 20 && onIrPlanB && (
              <button type="button" onClick={onIrPlanB} className="ml-1 underline text-ink-dim hover:text-hud-cyan">
                Taking long? Use the mission form
              </button>
            )}
          </div>
        )}
      </div>

      {/* Entrada */}
      <div className="p-3 bg-hud-panel border-t border-hud-border">
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
            placeholder="Ask for a walk, or change the last one"
            disabled={loading}
            aria-label="Message to the copilot"
            className="flex-1 min-w-0 bg-hud-deep/90 border border-hud-border rounded px-3.5 py-2.5 text-[15px] text-ink placeholder-ink-mute focus:outline-none focus:border-hud-cyan transition-colors"
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="flex items-center justify-center h-10 w-10 shrink-0 rounded bg-hud-cyan text-hud-deep hover:bg-[#5cefff] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
