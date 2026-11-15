/**
 * Voz del copiloto en el visor: escuchar al astronauta (Talk o tecla T) y leer en voz alta las
 * respuestas. Solo el visor la usa: la consola nunca habla, así con dos ventanas suena una sola voz.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { copiloto, useCopiloto } from '../services/copiloto';
import { Reconocimiento, ERRORES_VOZ, type BrowserRecognition } from '../types/speech';

const CLAVE_SILENCIO = 'marswalk-visor-silencio';
const leerSilencio = () => { try { return localStorage.getItem(CLAVE_SILENCIO) === '1'; } catch { return false; } };
const esCampo = (el: Element | null) => !!el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
const callar = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };

export interface VozCopiloto {
  escuchando: boolean;
  puedeEscuchar: boolean;
  /** Sin reconocimiento de voz: Talk abre un campo de texto. */
  escribiendo: boolean;
  silencio: boolean;
  aviso: string;
  hablar(): void;
  cerrarTexto(): void;
  alternarSilencio(): void;
}

export function useVozCopiloto(): VozCopiloto {
  const { mensajes, cargando } = useCopiloto();
  const [escuchando, setEscuchando] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [silencio, setSilencio] = useState(leerSilencio);
  const [aviso, setAviso] = useState('');
  const rec = useRef<BrowserRecognition | null>(null);
  const cargandoRef = useRef(cargando);
  cargandoRef.current = cargando;

  const soltar = () => {
    const r = rec.current;
    rec.current = null;
    if (r) { r.onresult = null; r.onerror = null; r.onend = null; r.abort(); }
    setEscuchando(false);
  };

  const hablar = useCallback(() => {
    callar();
    if (!Reconocimiento) { setEscribiendo((v) => !v); return; }
    if (rec.current) { rec.current.stop(); return; }
    if (cargandoRef.current) return;
    const r = new Reconocimiento();
    rec.current = r;
    r.lang = 'en-US';
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      const frases: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) frases.push(e.results[i][0].transcript.trim());
      }
      const texto = frases.filter(Boolean).join(' ');
      if (texto) { setAviso(''); void copiloto.preguntar(texto); }
    };
    r.onerror = (e) => setAviso(ERRORES_VOZ[e.error] ?? `Voice input failed (${e.error}).`);
    r.onend = () => {
      if (rec.current === r) rec.current = null;
      setEscuchando(false);
      setAviso((a) => (a === 'Listening…' ? '' : a));
    };
    try {
      r.start();
      setEscuchando(true);
      setAviso('Listening…');
    } catch {
      rec.current = null;
      setAviso('Could not start voice input. Check your browser and microphone.');
    }
  }, []);

  // Tecla T: hablar con el copiloto (no mientras se escribe en un campo).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 't' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || esCampo(document.activeElement)) return;
      e.preventDefault();
      hablar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [hablar]);

  // Leer en voz alta cada respuesta nueva. Las de antes de abrir el visor no se leen: los ids llevan
  // la hora de creación (bot-<ms>) y la conversación de otra ventana llega un momento después.
  const abiertoEn = useRef(Date.now());
  const leidas = useRef(new Set<string>());
  useEffect(() => {
    for (const m of mensajes) {
      if (leidas.current.has(m.id)) continue;
      leidas.current.add(m.id);
      if (Number(m.id.split('-')[1]) < abiertoEn.current) continue;
      if (m.rol !== 'asistente' || silencio || !('speechSynthesis' in window)) continue;
      callar();
      const u = new SpeechSynthesisUtterance(m.contenido);
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    }
  }, [mensajes, silencio]);

  // Al cerrar el visor: se calla y suelta el micrófono.
  useEffect(() => () => { soltar(); callar(); }, []);

  const alternarSilencio = () => setSilencio((s) => {
    const nuevo = !s;
    if (nuevo) callar();
    try { localStorage.setItem(CLAVE_SILENCIO, nuevo ? '1' : '0'); } catch { /* sin almacenamiento */ }
    return nuevo;
  });

  return {
    escuchando, puedeEscuchar: !!Reconocimiento, escribiendo, silencio, aviso,
    hablar, cerrarTexto: () => setEscribiendo(false), alternarSilencio,
  };
}
