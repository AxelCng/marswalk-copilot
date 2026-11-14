// Escena 3D del visor del astronauta (three.js).
//
// Terreno: malla de 6 × 6 km con un vértice cada 20 m (resolución de la DTM CTX del USGS SIM 3464),
// a escala 1:1 en metros de Marte, con la ortoimagen CTX como textura (mosaico de 14 m/px y
// teselas de 5 m donde hay). La malla se rearma alrededor del astronauta cuando se aleja.
// Cielo con neblina de polvo que oculta el borde de la malla. Ruta y estaciones encima.

import * as THREE from 'three';
import { elevacion, esperarZona } from './elevacion.js';

const R_MARTE = 3396190;
const LADO_M = 6000;
const PASO_M = 20;
const N = LADO_M / PASO_M + 1;
const RECENTRAR_M = 1600;
const CIELO = { arriba: '#5E4636', horizonte: '#C9A27E' };
const rad = (d) => (d * Math.PI) / 180;

function cargarImagen(url) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));

export function crearEscena(contenedor, { origen, nodos = {} }) {
  const [lon0, lat0] = origen;
  const kx = (Math.PI / 180) * R_MARTE * Math.cos(rad(lat0));
  const ky = (Math.PI / 180) * R_MARTE;
  const local = ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky]; // este, norte (m)
  const lonlat = (x, n) => [lon0 + x / kx, lat0 + n / ky];
  let h0 = elevacion(origen); // las alturas se guardan relativas al punto de partida

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  contenedor.appendChild(renderer.domElement);

  const escena = new THREE.Scene();
  const cielo = document.createElement('canvas');
  cielo.width = 2;
  cielo.height = 256;
  const gc = cielo.getContext('2d');
  const grad = gc.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, CIELO.arriba);
  grad.addColorStop(1, CIELO.horizonte);
  gc.fillStyle = grad;
  gc.fillRect(0, 0, 2, 256);
  const texCielo = new THREE.CanvasTexture(cielo);
  texCielo.colorSpace = THREE.SRGBColorSpace;
  escena.background = texCielo;
  escena.fog = new THREE.Fog(CIELO.horizonte, 1400, LADO_M / 2 - 150);

  escena.add(new THREE.AmbientLight('#f2d7bd', 1.1));
  const sol = new THREE.DirectionalLight('#fff1dc', 2.2);
  sol.position.set(-700, 600, -700); // sol desde el noroeste (oeste = -x, norte = -z)
  escena.add(sol);

  const camara = new THREE.PerspectiveCamera(70, 1, 0.3, LADO_M);

  // --- terreno ------------------------------------------------------------------
  let terreno = null;
  let centroParche = null;
  let armando = false;

  async function texturaDe(o, s, e, n) {
    const T = 2048;
    const c = document.createElement('canvas');
    c.width = T;
    c.height = T;
    const g = c.getContext('2d');
    g.fillStyle = '#9a7a5e';
    g.fillRect(0, 0, T, T);
    const y0 = mercY(s);
    const y1 = mercY(n);
    const px = (lon) => ((lon - o) / (e - o)) * T;
    const py = (lat) => ((y1 - mercY(lat)) / (y1 - y0)) * T;
    const dibujar = (img, coords) => {
      const [[lo0, la1], [lo1], , [, la0]] = coords;
      g.drawImage(img, px(lo0), py(la1), px(lo1) - px(lo0), py(la0) - py(la1));
    };
    try {
      const amplia = await (await fetch('/base/ctx_sim3464.json')).json();
      const img = await cargarImagen(amplia.url);
      if (img) dibujar(img, amplia.coordinates);
      const { teselas } = await (await fetch('/base/teselas.json')).json();
      const imgs = await Promise.all(teselas.map((t) => cargarImagen(t.url)));
      imgs.forEach((im, i) => im && dibujar(im, teselas[i].coordinates));
    } catch { /* sin imagen: queda el color de base */ }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  async function armarParche(p) {
    armando = true;
    await esperarZona(p, 2);
    if (h0 == null) h0 = elevacion(p) ?? 0;
    const [cx, cn] = local(p);
    const pos = new Float32Array(N * N * 3);
    const uv = new Float32Array(N * N * 2);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = cx - LADO_M / 2 + i * PASO_M;
        const n = cn + LADO_M / 2 - j * PASO_M;
        const h = (elevacion(lonlat(x, n)) ?? h0) - h0;
        const k = j * N + i;
        pos.set([x, h, -n], k * 3);
        uv.set([i / (N - 1), 1 - j / (N - 1)], k * 2);
      }
    }
    const idx = [];
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i;
        idx.push(a, a + N, a + 1, a + 1, a + N, a + N + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const [o, n1] = lonlat(cx - LADO_M / 2, cn + LADO_M / 2);
    const [e, s1] = lonlat(cx + LADO_M / 2, cn - LADO_M / 2);
    const tex = await texturaDe(o, s1, e, n1);
    const malla = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    if (terreno) {
      escena.remove(terreno);
      terreno.geometry.dispose();
      terreno.material.map?.dispose();
      terreno.material.dispose();
    }
    terreno = malla;
    escena.add(terreno);
    centroParche = [cx, cn];
    armando = false;
  }

  // --- estaciones -----------------------------------------------------------------
  const grupoEst = new THREE.Group();
  escena.add(grupoEst);
  function etiqueta(texto, color) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 48;
    const g = c.getContext('2d');
    g.fillStyle = '#0E1117';
    g.fillRect(0, 0, 128, 48);
    g.fillStyle = color;
    g.fillRect(0, 0, 6, 48);
    g.fillStyle = '#E6EDF3';
    g.font = '600 26px JetBrains Mono, monospace';
    g.textBaseline = 'middle';
    g.fillText(texto, 16, 25);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, fog: false }));
    sp.scale.set(0.08, 0.03, 1);
    sp.renderOrder = 10;
    return sp;
  }
  function ponerEstaciones(lista) {
    grupoEst.clear();
    for (const nd of lista) {
      const [x, n] = local([nd.lon, nd.lat]);
      const h = (elevacion([nd.lon, nd.lat]) ?? h0) - h0;
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 8), new THREE.MeshBasicMaterial({ color: nd.color }));
      poste.position.set(x, h + 4, -n);
      const et = etiqueta(nd.id, nd.color);
      et.position.set(x, h + 10, -n);
      grupoEst.add(poste, et);
    }
  }

  // --- ruta sobre el suelo -------------------------------------------------------------
  let ruta = null;
  function ponerRuta(tramos) {
    if (ruta) { escena.remove(ruta); ruta.geometry.dispose(); ruta = null; }
    if (!tramos?.length) return;
    const pts = [];
    for (const t of tramos) {
      for (let i = 1; i < t.geometria.length; i++) {
        const a = local(t.geometria[i - 1]);
        const b = local(t.geometria[i]);
        const pasos = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10));
        for (let k = 0; k < pasos; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / pasos, a[1] + ((b[1] - a[1]) * k) / pasos]);
      }
    }
    const ancho = 1.2;
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, n1] = pts[i];
      const [x2, n2] = pts[i + 1];
      const L = Math.hypot(x2 - x1, n2 - n1) || 1;
      const ox = (-(n2 - n1) / L) * ancho;
      const on = ((x2 - x1) / L) * ancho;
      const h1 = (elevacion(lonlat(x1, n1)) ?? h0) - h0 + 0.25;
      const h2 = (elevacion(lonlat(x2, n2)) ?? h0) - h0 + 0.25;
      const A = [x1 + ox, h1, -(n1 + on)];
      const B = [x1 - ox, h1, -(n1 - on)];
      const C = [x2 + ox, h2, -(n2 + on)];
      const D = [x2 - ox, h2, -(n2 - on)];
      pos.push(...A, ...B, ...C, ...C, ...B, ...D);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ruta = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#FFB000', side: THREE.DoubleSide, fog: true }));
    escena.add(ruta);
  }

  // --- tamaño y cuadro ---------------------------------------------------------------
  const ajustar = () => {
    const w = contenedor.clientWidth || 1;
    const h = contenedor.clientHeight || 1;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(ajustar);
  ro.observe(contenedor);
  ajustar();

  const listo = armarParche(origen);

  return {
    listo,
    /** Dibuja un cuadro con la cámara en pos (lon/lat), rumbo y mirada (grados), altura (m). */
    actualizar({ pos, rumbo, mirada = 0, altura = 1.8 }) {
      if (h0 == null) return; // todavía cargando el terreno
      const [x, n] = local(pos);
      if (centroParche && !armando && Math.hypot(x - centroParche[0], n - centroParche[1]) > RECENTRAR_M) armarParche(pos);
      const suelo = (elevacion(pos) ?? h0) - h0;
      camara.position.set(x, suelo + altura, -n);
      const p = rad(-mirada);
      const r = rad(rumbo);
      camara.lookAt(x + Math.sin(r) * Math.cos(p) * 100, suelo + altura + Math.sin(p) * 100, -(n + Math.cos(r) * Math.cos(p) * 100));
      renderer.render(escena, camara);
    },
    ponerEstaciones,
    ponerRuta,
    destruir() {
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
