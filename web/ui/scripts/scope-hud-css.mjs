// Genera src/components/visorHud.css a partir de hud/src/styles.css, con todo acotado a `.hud`.
// El visor (web/ui/hud) es una app de pantalla completa con estilos globales (body, button, .chip…);
// dentro de la consola esos estilos tienen que valer solo dentro del visor.
//
//   node scripts/scope-hud-css.mjs        (desde web/ui; volver a correrlo si cambia hud/src/styles.css)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const aqui = dirname(fileURLToPath(import.meta.url));
// styles.css + tecnico.css (estética técnica, va después y pisa colores y sombras)
const origenes = ['../hud/src/styles.css', '../hud/src/tecnico.css'].map((p) => resolve(aqui, p));
const destino = resolve(aqui, '../src/components/visorHud.css');

const raiz = postcss.parse(origenes.map((o) => readFileSync(o, 'utf8')).join('\n'));

raiz.walkRules((regla) => {
  if (regla.parent?.type === 'atrule' && /keyframes$/.test(regla.parent.name)) return;

  const sel = regla.selectors.map((s) => s.trim());

  // :root y body → variables y tipografía base del contenedor del visor
  if (sel.length === 1 && (sel[0] === ':root' || sel[0] === 'body')) {
    regla.selectors = ['.hud'];
    if (sel[0] === 'body') regla.walkDecls('overflow', (d) => d.remove());
    return;
  }
  // reglas de documento: no aplican dentro de la consola
  if (sel.every((s) => ['html', 'body', '#root', '*'].includes(s))) {
    regla.remove();
    return;
  }

  regla.selectors = sel.map((s) => {
    if (s.startsWith('.hud')) return s; // .hud, .hud:active, .hud-alerta .visor
    if (s === '*' || s.startsWith('*::')) return `.hud ${s}, .hud${s.slice(1)}`;
    return `.hud ${s}`;
  });
});

// .hud-alerta va en el mismo elemento que .hud
raiz.walkRules((regla) => {
  regla.selectors = regla.selectors.map((s) => s.replace(/^\.hud \.hud-alerta/, '.hud.hud-alerta').replace(/^\.hud-alerta/, '.hud.hud-alerta'));
});

const cabecera = `/* GENERADO por scripts/scope-hud-css.mjs desde hud/src/styles.css y tecnico.css: no editar a mano.
   Mismos estilos del visor de casco, acotados a .hud para que no afecten a la consola. */\n`;
writeFileSync(destino, cabecera + raiz.toString(), 'utf8');
console.log(`ok → ${destino}`);
