// Pruebas de services/vozNatural.ts (texto para leer en voz alta y elección de voz).
// Correr desde la raíz:  node web/ui/scripts/probar-voz.ts
import assert from 'node:assert/strict';
import { paraHablar, elegirVoz } from '../src/services/vozNatural.ts';

const NOMBRES = { HAB: 'Octavia E. Butler habitat', M2: 'Three Forks sample depot', E1: 'Delta front, Amalik outcrop', M1: 'South Séítah, Brac outcrop' };
const casos: [string, () => void][] = [];
const caso = (n: string, f: () => void) => casos.push([n, f]);

caso('arrows become "then"', () =>
  assert.equal(paraHablar('Route: A → B → C.'), 'Route: A, then B, then C.'));
caso('minutes', () => {
  assert.equal(paraHablar('Total time: 200.6 min.'), 'Total time: 200.6 minutes.');
  assert.equal(paraHablar('1 min left'), '1 minute left');
  assert.equal(paraHablar('+35.8 min (from 164.8 to 200.6 min)'), '35.8 minutes more (from 164.8 to 200.6 minutes)');
});
caso('long distances in kilometers, short ones in meters', () => {
  assert.equal(paraHablar('Distance: 7490.8 m.'), 'Distance: about 7.5 kilometers.');
  assert.equal(paraHablar('2,425 m to go'), 'about 2.4 kilometers to go');
  assert.equal(paraHablar('540 m away'), '540 meters away');
});
caso('degrees', () =>
  assert.equal(paraHablar('the gentlest path has 9.18° and the limit is 8°.'), 'the gentlest path has 9.18 degrees and the limit is 8 degrees.'));
caso('station ids become names; zones stay', () =>
  assert.equal(paraHablar('HAB → M2 → E1 → M1 → HAB, avoiding Z2', NOMBRES),
    'Octavia E. Butler habitat, then Three Forks sample depot, then Delta front, Amalik outcrop, then South Seitah, Brac outcrop, then Octavia E. Butler habitat, avoiding zone Z2'));
caso('Séítah is spelled for the voice', () => assert.equal(paraHablar('Séítah'), 'Seitah'));
caso('ids inside words are untouched', () => assert.equal(paraHablar('THEMIS HABITAT', NOMBRES), 'THEMIS HABITAT'));

const v = (name: string, lang = 'en-US') => ({ name, lang }) as SpeechSynthesisVoice;
caso('prefers an English natural (neural) voice', () =>
  assert.equal(elegirVoz([v('Microsoft David - English (United States)'), v('Microsoft Aria Online (Natural) - English (United States)')])?.name,
    'Microsoft Aria Online (Natural) - English (United States)'));
caso('then Google US English', () =>
  assert.equal(elegirVoz([v('Microsoft David - English (United States)'), v('Google US English')])?.name, 'Google US English'));
caso('then any US English voice, then any English one', () => {
  assert.equal(elegirVoz([v('Paulina', 'es-MX'), v('Microsoft David - English (United States)')])?.name, 'Microsoft David - English (United States)');
  assert.equal(elegirVoz([v('Paulina', 'es-MX'), v('Daniel', 'en-GB')])?.name, 'Daniel');
});
caso('no English voice: null (browser default)', () => assert.equal(elegirVoz([v('Paulina', 'es-MX')]), null));

let fallos = 0;
for (const [n, f] of casos) {
  try { f(); console.log(`ok   ${n}`); } catch (e) { fallos++; console.log(`FAIL ${n}\n     ${(e as Error).message.split('\n').join('\n     ')}`); }
}
console.log(`${casos.length - fallos}/${casos.length} passed`);
process.exit(fallos ? 1 : 0);
