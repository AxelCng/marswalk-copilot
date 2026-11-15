/**
 * Voz más natural para el copiloto del visor (Web Speech del navegador).
 *
 * - elegirVoz: la voz más humana disponible. Edge trae voces neuronales "Online (Natural)" (Aria,
 *   Jenny, Guy...); Chrome trae "Google US English"; si no, cualquier voz en inglés.
 * - paraHablar: el texto de la respuesta tal como se muestra no se lee bien ("HAB → M2", "7490.8 m",
 *   "9.18°"). Se reescribe solo lo que se dice; la pantalla muestra el texto original.
 *
 * Sin imports: se prueba con `node web/ui/scripts/probar-voz.ts`.
 */

/** Voz preferida: neuronal en inglés > Google US English > inglés de EE. UU. > cualquier inglés. null = la del navegador. */
export function elegirVoz(voces: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const ingles = voces.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const eeuu = ingles.filter((v) => /^en[-_]US$/i.test(v.lang));
  return (
    eeuu.find((v) => /natural/i.test(v.name)) ??
    ingles.find((v) => /natural/i.test(v.name)) ??
    ingles.find((v) => /google us english/i.test(v.name)) ??
    eeuu[0] ??
    ingles[0] ??
    null
  );
}

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const numero = (s: string) => Number(s.replace(/,/g, ''));
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Texto para leer en voz alta. `nombres`: id de estación → nombre en inglés (HAB → "Octavia E.
 * Butler habitat"), para no deletrear ids.
 */
export function paraHablar(texto: string, nombres: Record<string, string> = {}): string {
  let t = texto;

  for (const [id, nombre] of Object.entries(nombres)) {
    t = t.replace(new RegExp(String.raw`(?<![\w-])${escapar(id)}(?![\w-])`, 'g'), nombre);
  }
  t = t.replace(/S[ée][ií]tah/g, 'Seitah');
  t = t.replace(/(?<![\w-]|zone )(Z\d+)(?![\w-])/g, 'zone $1');

  t = t.replace(/\s*→\s*/g, ', then ');

  t = t.replace(new RegExp(String.raw`\+(${NUM}) min\b`, 'g'), (_, n) => `${n} ${numero(n) === 1 ? 'minute' : 'minutes'} more`);
  t = t.replace(new RegExp(String.raw`(${NUM}) min\b`, 'g'), (_, n) => `${n} ${numero(n) === 1 ? 'minute' : 'minutes'}`);

  // Distancias: desde 1 km, en kilómetros redondeados. Una elevación negativa (-2,562 m) queda en metros.
  t = t.replace(new RegExp(String.raw`([-−]?)(${NUM}) m\b`, 'g'), (_, signo, n) =>
    !signo && numero(n) >= 1000 ? `about ${(numero(n) / 1000).toFixed(1)} kilometers` : `${signo}${n} meters`);

  t = t.replace(new RegExp(String.raw`(${NUM})\s*°`, 'g'), '$1 degrees');
  return t;
}
