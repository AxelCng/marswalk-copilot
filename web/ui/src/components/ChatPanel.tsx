import React, { useState, useRef, useEffect } from 'react';
import type { ChatResponse, MensajeHistorial, RespuestaMision } from '../types/mission';
import { ChatMessage } from './ChatMessage';
import { api } from '../services/api';
import { Send, Sparkles, Loader2, RefreshCw, Radio, Mic, Square } from 'lucide-react';
import { DEMO, FRASES } from '../demo';

// Web Speech is not yet included in TypeScript's standard DOM definitions.
type SpeechResultEvent = Event & { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } } };
type SpeechErrorEvent = Event & { error: string };
interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionConstructor = new () => BrowserRecognition;
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };

interface ChatPanelProps {
  onRouteGenerated?: (ruta: RespuestaMision, respuesta?: ChatResponse) => void;
  onViewRoute?: () => void;
  /** Lleva al formulario Plan B cuando el copiloto no responde. */
  onIrPlanB?: () => void;
}

const DEMO_PRESETS = [
  { label: `Step 1: Mission ${DEMO.pendiente_1}° (<4h)`, text: FRASES.paso1 },
  { label: `Step 2: What if I accept ${DEMO.pendiente_2}°?`, text: FRASES.paso2 },
  { label: `Step 3: Dust alert ${DEMO.zona}`, text: FRASES.paso3 },
];

const hora = () => `SOL 415 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

const saludo = (contenido: string): MensajeHistorial => ({
  id: `init-${Date.now()}`,
  rol: 'asistente',
  contenido,
  timestamp: 'SOL 415',
  local: true,
});

export const ChatPanel: React.FC<ChatPanelProps> = ({ onRouteGenerated, onViewRoute, onIrPlanB }) => {
  const [messages, setMessages] = useState<MensajeHistorial[]>([
    saludo("MarsWalk EVA copilot online. Tell me the science targets for the walk in Jezero Crater, the life-support time limit and the maximum slope the suit can take.")
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [espera, setEspera] = useState(0);
  const [listening, setListening] = useState(false);
  const [speechStatus, setSpeechStatus] = useState('');
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const Recognition = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Contador de espera: el modelo local tarda decenas de segundos en CPU.
  useEffect(() => {
    if (!loading) return;
    setEspera(0);
    const t0 = Date.now();
    const id = setInterval(() => setEspera(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    }
  }, []);

  const toggleDictation = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (!Recognition) return;
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const phrases: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) phrases.push(event.results[i][0].transcript.trim());
      }
      const spoken = phrases.filter(Boolean).join(' ');
      if (spoken) {
        setInput((current) => current.trim() ? `${current.trimEnd()} ${spoken}` : spoken);
        setSpeechStatus('Dictation added. Review the message before sending.');
      }
    };
    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        'not-allowed': 'Microphone permission denied. Allow it in browser settings to use voice input.',
        'service-not-allowed': 'Speech recognition is blocked in this browser.',
        'audio-capture': 'No microphone found. Check your microphone and try again.',
        'no-speech': 'No speech detected. Try again.',
        'network': 'Speech recognition needs a network connection. You can type instead.',
      };
      setSpeechStatus(messages[event.error] ?? `Voice input failed (${event.error}). You can type instead.`);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setListening(false);
      setSpeechStatus((status) => status.startsWith('Listening') ? 'Voice input stopped. You can type or try again.' : status);
    };
    try {
      recognition.start();
      setListening(true);
      setSpeechStatus('Listening… Speak now, then review the text.');
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setSpeechStatus('Could not start voice input. Check your browser and microphone.');
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      setListening(false);
    }
    setSpeechStatus('');

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
        contenido: "No link to the copilot. Compute the mission directly with Mission Planner.",
        timestamp: hora(),
        error: true,
        local: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([saludo("History cleared. Ready to plan a new EVA in Jezero Crater.")]);
  };

  return (
    <div className="panel flex flex-col h-full overflow-hidden">
      {/* Encabezado */}
      <div className="flex items-center justify-between border-b border-hud-border/80 px-4 py-3 bg-hud-panel/90 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Radio className="h-4 w-4 text-hud-cyan animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-hud-cyan animate-ping" />
          </div>
          <div>
            <h3 className="m-0 font-display text-sm font-semibold text-ink">
              EVA Channel / Walk Copilot
            </h3>
            <span className="label-caps">
              Tool calling · FastAPI
            </span>
          </div>
        </div>

        <button
          onClick={handleClear}
          disabled={loading}
          title="Restart conversation"
          className="p-1.5 rounded text-ink-dim hover:bg-hud-glass hover:text-ink transition-colors disabled:opacity-40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Guion de la demo */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-hud-deep/60 border-b border-hud-subtle overflow-x-auto text-[11px] font-mono">
        <span className="label-caps flex-shrink-0 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-hud-cyan" /> Demo script
        </span>
        {DEMO_PRESETS.map((preset, i) => (
          <button
            key={i}
            onClick={() => handleSend(preset.text)}
            disabled={loading}
            title={preset.text}
            className="flex-shrink-0 px-2.5 py-1 rounded bg-hud-glass/80 border border-hud-border hover:border-hud-cyan text-hud-cyan transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" aria-live="polite">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onViewRoute={onViewRoute} onIrPlanB={onIrPlanB} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs font-mono text-hud-cyan bg-hud-cyan/5 border border-hud-cyan/40 rounded p-3 w-fit">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Copilot computing with the graph engine…</span>
            <span className="dato-num text-ink-dim">{espera} s</span>
            {espera >= 20 && onIrPlanB && (
              <button type="button" onClick={onIrPlanB} className="ml-1 underline text-ink-dim hover:text-hud-cyan">
                use Mission Planner
              </button>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
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
            placeholder={`E.g.: I want to visit E1 and M1 with at most ${DEMO.pendiente_2}° of slope...`}
            disabled={loading}
            aria-label="Message to the copilot"
            className="flex-1 min-w-0 bg-hud-deep/90 border border-hud-border rounded px-4 py-2.5 text-sm text-ink placeholder-ink-mute focus:outline-none focus:border-hud-cyan focus:shadow-glow-focus transition-all font-mono"
          />

          <button type="button" onClick={toggleDictation} disabled={loading || !Recognition}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'} aria-pressed={listening}
            title={Recognition ? (listening ? 'Stop voice input' : 'Dictate a message') : 'Voice input is not supported by this browser'}
            className={`flex items-center justify-center h-10 w-10 shrink-0 rounded border border-hud-border disabled:opacity-40 ${listening ? 'bg-critical text-ink' : 'bg-hud-deep text-hud-cyan'}`}>
            {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="flex items-center justify-center h-10 w-10 shrink-0 rounded bg-hud-cyan text-hud-deep hover:shadow-glow-cyan disabled:opacity-40 disabled:cursor-not-allowed transition-shadow"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-1 mb-0 text-[10px] text-ink-mute" role="status" aria-live="polite">
          {speechStatus || (Recognition ? 'Voice transcription may use an online browser service. Review text before sending.' : 'Voice input is unavailable in this browser; type your message.')}
        </p>
      </div>
    </div>
  );
};
