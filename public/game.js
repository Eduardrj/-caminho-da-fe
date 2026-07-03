// ============================================================
//  AVENTURA BÍBLICA MMO — Cliente 3D estilo blocos (Three.js)
// ============================================================
const socket = io({ autoConnect: false });

const canvas3d = document.getElementById('canvas3d');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');

let MUNDO = null, ZONAS = [], NPCS = [], CLASSES = {}, TIPOS_MOB = {}, MONTARIAS = {}, IDOLOS = [], PACTOS = {};
let FE_MAX = 1000;
let meuId = null;
let tentacaoPendente = null; // { idoloId, expiraEm }
const efeitosMilagre = [];   // anéis dourados temporários
const efeitosFogo = [];      // colunas de fogo temporárias
let aguasAbertas = false;    // milagre Dividir Águas ativo
let meshRio = null;
let murosAgua = [];
let estado = { jogadores: [], mobs: [], itens: [] };
let minhasQuests = [];   // missões ativas (diário)
let questsFeitas = [];   // ids de missões concluídas
let QUESTS_DEFS = [];    // definições de todas as missões (para marcadores ❗/❓)
const danosFlutuantes = [];
const teclas = {};
let posLocal = null;
let classeEscolhida = 'pastor';
let forjaAberta = false;
let estabuloAberto = false;

// Escala: 10 unidades do servidor = 1 unidade do mundo 3D
const E = 0.1;
const CUSTOS = {
  arma: n => 50 * n,
  armadura: n => 40 * n,
  sandalias: n => 30 * n,
  escudo: n => 35 * n,
};
const NIVEL_MAX_EQUIP = 10;

// Rio (mesma regra do servidor): não se anda na água, exceto pela ponte
const RIO = { x1: 1155, x2: 1245, y1: 650, y2: 1150, ponteY1: 870, ponteY2: 930 };
function dentroAgua(x, y) {
  if (aguasAbertas) return false;
  return x > RIO.x1 && x < RIO.x2 && y > RIO.y1 && y < RIO.y2 &&
         !(y > RIO.ponteY1 && y < RIO.ponteY2);
}

// ------------------------------------------------------------
// Texturas pixeladas (estilo Minecraft) geradas em canvas
// ------------------------------------------------------------
function criarTextura(tam, desenhar) {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  desenhar(c.getContext('2d'), tam);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function hexParaRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function texturaRuido(hex, variacao, tam = 16) {
  const [r, g, b] = hexParaRgb(hex);
  return criarTextura(tam, (cx) => {
    for (let x = 0; x < tam; x++) for (let y = 0; y < tam; y++) {
      const v = Math.floor((Math.random() - 0.5) * variacao);
      cx.fillStyle = `rgb(${r + v},${g + v},${b + v})`;
      cx.fillRect(x, y, 1, 1);
    }
  });
}

function texturaMadeira() {
  return criarTextura(16, (cx) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      const tom = (x % 4 === 0) ? 78 : 108 + Math.floor(Math.random() * 14);
      cx.fillStyle = `rgb(${tom},${Math.floor(tom * 0.62)},${Math.floor(tom * 0.3)})`;
      cx.fillRect(x, y, 1, 1);
    }
  });
}

function texturaTijolo() {
  return criarTextura(16, (cx) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      const linha = Math.floor(y / 4);
      const junta = (y % 4 === 3) || ((x + (linha % 2) * 4) % 8 === 7);
      const v = Math.floor(Math.random() * 16);
      cx.fillStyle = junta ? '#7a6a58' : `rgb(${170 + v},${132 + v},${96 + v})`;
      cx.fillRect(x, y, 1, 1);
    }
  });
}

function texturaAgua() {
  return criarTextura(16, (cx) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      const v = Math.floor(Math.random() * 30);
      const claro = Math.random() < 0.08;
      cx.fillStyle = claro ? '#9fd8f0' : `rgb(${52 + v},${118 + v},${190 + v})`;
      cx.fillRect(x, y, 1, 1);
    }
  });
}

function texturaRosto() {
  return criarTextura(8, (cx) => {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      const v = Math.floor((Math.random() - 0.5) * 14);
      cx.fillStyle = `rgb(${232 + v},${184 + v},${138 + v})`;
      cx.fillRect(x, y, 1, 1);
    }
    // olhos
    cx.fillStyle = '#ffffff'; cx.fillRect(1, 3, 2, 1); cx.fillRect(5, 3, 2, 1);
    cx.fillStyle = '#3a2a68'; cx.fillRect(2, 3, 1, 1); cx.fillRect(5, 3, 1, 1);
    // boca
    cx.fillStyle = '#a06848'; cx.fillRect(3, 6, 2, 1);
  });
}

function texturaRostoBravo(corPele) {
  const [r, g, b] = hexParaRgb(corPele);
  return criarTextura(8, (cx) => {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      const v = Math.floor((Math.random() - 0.5) * 16);
      cx.fillStyle = `rgb(${r + v},${g + v},${b + v})`;
      cx.fillRect(x, y, 1, 1);
    }
    // sobrancelhas bravas + olhos vermelhos
    cx.fillStyle = '#2a1a0a'; cx.fillRect(1, 2, 2, 1); cx.fillRect(5, 2, 2, 1);
    cx.fillStyle = '#cc3322'; cx.fillRect(2, 3, 1, 1); cx.fillRect(5, 3, 1, 1);
    cx.fillStyle = '#2a1a0a'; cx.fillRect(2, 6, 4, 1);
  });
}

let TEX = null;
const cacheCores = {};
function texCor(hex, variacao = 18) {
  if (!cacheCores[hex]) cacheCores[hex] = texturaRuido(hex, variacao);
  return cacheCores[hex];
}
function matBloco(hex, variacao) {
  return new THREE.MeshLambertMaterial({ map: texCor(hex, variacao) });
}

function iniciarTexturas() {
  TEX = {
    grama: texturaRuido('#7dab50', 26),
    gramaEla: texturaRuido('#84a355', 24),
    areia: texturaRuido('#dcbb74', 22),
    terra: texturaRuido('#a08a6a', 22),
    argila: texturaRuido('#c2a58a', 20),
    gramaJordao: texturaRuido('#7ec8a9', 20),
    madeira: texturaMadeira(),
    folhas: texturaRuido('#3f7a2e', 34),
    tijolo: texturaTijolo(),
    pedra: texturaRuido('#8a8a86', 24),
    agua: texturaAgua(),
    pele: texturaRuido('#e8b88a', 12, 8),
    rosto: texturaRosto(),
  };
}

// ------------------------------------------------------------
// Three.js — cena base
// ------------------------------------------------------------
let renderer, scene, camera, sol, hemi, relogio, texAguaRio, luzForja;
const meshJogadores = {};
const meshMobs = {};
const meshItens = {};

// Cores do ciclo de dia e noite
const COR_DIA = new THREE.Color(0x9cc8e8);
const COR_POR = new THREE.Color(0xe8946a);
const COR_NOITE = new THREE.Color(0x121830);
const corCeu = new THREE.Color();

function iniciarCena() {
  renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc8e8);
  scene.fog = new THREE.Fog(0x9cc8e8, 60, 160);

  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

  hemi = new THREE.HemisphereLight(0xfff2d8, 0x556633, 0.8);
  scene.add(hemi);

  sol = new THREE.DirectionalLight(0xffeecc, 1.05);
  sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024);
  sol.shadow.camera.left = -50; sol.shadow.camera.right = 50;
  sol.shadow.camera.top = 50; sol.shadow.camera.bottom = -50;
  sol.shadow.camera.far = 200;
  scene.add(sol);
  scene.add(sol.target);

  relogio = new THREE.Clock();
  iniciarTexturas();
  construirMundo();
  redimensionar();
}

function pos3d(x, y, altura = 0) {
  return new THREE.Vector3(x * E, altura, y * E);
}

function bloco(lx, ly, lz, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(lx, ly, lz), material);
  m.castShadow = true;
  return m;
}

// ------------------------------------------------------------
// Construção do mundo
// ------------------------------------------------------------
function planoTexturizado(w, h, tex, tamBloco = 2) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(w / tamBloco, h / tamBloco);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t }));
  p.rotation.x = -Math.PI / 2;
  p.receiveShadow = true;
  return p;
}

function construirMundo() {
  // Chão base
  const chao = planoTexturizado(MUNDO.largura * E + 60, MUNDO.altura * E + 60, TEX.grama);
  chao.position.set(MUNDO.largura * E / 2, -0.02, MUNDO.altura * E / 2);
  scene.add(chao);

  // Zonas com texturas próprias
  const texZona = {
    jordao: TEX.gramaJordao, ela: TEX.gramaEla, sinai: TEX.areia,
    leoes: TEX.terra, jerico: TEX.argila,
    eden: TEX.gramaJordao, babilonia: TEX.pedra,
  };
  for (const z of ZONAS) {
    const plano = planoTexturizado(z.w * E, z.h * E, texZona[z.id] || TEX.grama);
    plano.position.set((z.x + z.w / 2) * E, 0, (z.y + z.h / 2) * E);
    scene.add(plano);
  }

  const jordao = ZONAS.find(z => z.id === 'jordao');
  const ela = ZONAS.find(z => z.id === 'ela');
  const sinai = ZONAS.find(z => z.id === 'sinai');
  const leoes = ZONAS.find(z => z.id === 'leoes');
  const jerico = ZONAS.find(z => z.id === 'jerico');

  // Rio pixelado animado
  texAguaRio = TEX.agua.clone();
  texAguaRio.needsUpdate = true;
  texAguaRio.repeat.set(4, jordao.h * E / 2);
  const rio = new THREE.Mesh(
    new THREE.PlaneGeometry(8, jordao.h * E),
    new THREE.MeshLambertMaterial({ map: texAguaRio, transparent: true, opacity: 0.92 })
  );
  rio.rotation.x = -Math.PI / 2;
  rio.position.set((jordao.x + jordao.w / 2) * E, 0.03, (jordao.y + jordao.h / 2) * E);
  scene.add(rio);
  meshRio = rio;

  // Muros de água (milagre Dividir Águas): ficam ocultos até o milagre ser invocado
  const matMuroAgua = new THREE.MeshLambertMaterial({
    map: TEX.agua, transparent: true, opacity: 0, side: THREE.DoubleSide,
  });
  const compRio = (RIO.y2 - RIO.y1) * E;
  for (const bordaX of [RIO.x1, RIO.x2]) {
    const muro = new THREE.Mesh(new THREE.PlaneGeometry(compRio, 6), matMuroAgua.clone());
    muro.rotation.y = Math.PI / 2;
    muro.position.set(bordaX * E, 3, (RIO.y1 + RIO.y2) / 2 * E);
    muro.visible = false;
    scene.add(muro);
    murosAgua.push(muro);
  }

  // Ponte de madeira sobre o rio
  const matPonte = new THREE.MeshLambertMaterial({ map: TEX.madeira });
  const ponteZ = ((RIO.ponteY1 + RIO.ponteY2) / 2) * E;
  const ponteX = ((RIO.x1 + RIO.x2) / 2) * E;
  const tabuleiro = bloco(13, 0.35, (RIO.ponteY2 - RIO.ponteY1) * E, matPonte);
  tabuleiro.position.set(ponteX, 0.4, ponteZ);
  tabuleiro.receiveShadow = true;
  scene.add(tabuleiro);
  for (const lado of [-1, 1]) {
    const corrimao = bloco(13, 0.18, 0.18, matPonte);
    corrimao.position.set(ponteX, 1.15, ponteZ + lado * ((RIO.ponteY2 - RIO.ponteY1) * E / 2 - 0.15));
    scene.add(corrimao);
    for (let i = -2; i <= 2; i++) {
      const balaustre = bloco(0.16, 0.85, 0.16, matPonte);
      balaustre.position.set(ponteX + i * 3, 0.85, ponteZ + lado * ((RIO.ponteY2 - RIO.ponteY1) * E / 2 - 0.15));
      scene.add(balaustre);
    }
  }

  // Árvores em blocos
  const eden = ZONAS.find(z => z.id === 'eden');
  const babilonia = ZONAS.find(z => z.id === 'babilonia');
  const posArvores = [];
  for (let i = 0; i < 14; i++) {
    posArvores.push([ela.x + 100 + (i * 167) % (ela.w - 200), ela.y + 100 + (i * 211) % (ela.h - 200)]);
  }
  // Éden: jardim denso de árvores
  for (let i = 0; i < 18; i++) {
    posArvores.push([eden.x + 80 + (i * 193) % (eden.w - 160), eden.y + 80 + (i * 137) % (eden.h - 160)]);
  }
  posArvores.push([1000, 700], [1400, 720], [1010, 1090], [1390, 1060]);

  // Fornalha Ardente na Babilônia (zigurate com fogo)
  {
    const matZig = new THREE.MeshLambertMaterial({ map: TEX.pedra });
    const fx = 3300 * E, fz = 2450 * E;
    for (let nivel = 0; nivel < 3; nivel++) {
      const tam = 9 - nivel * 2.4;
      const degrau = bloco(tam, 1.1, tam, matZig);
      degrau.position.set(fx, 0.55 + nivel * 1.1, fz);
      degrau.receiveShadow = true;
      scene.add(degrau);
    }
    const boca = bloco(1.8, 1.6, 1.8, new THREE.MeshStandardMaterial({
      color: 0xff6a1a, emissive: 0xcc3300, emissiveIntensity: 1.2, roughness: 0.4,
    }));
    boca.position.set(fx, 3.9, fz);
    scene.add(boca);
    const luzFornalha = new THREE.PointLight(0xff5a1a, 2.2, 45);
    luzFornalha.position.set(fx, 4.5, fz);
    scene.add(luzFornalha);
  }
  for (const [ax, ay] of posArvores) scene.add(criarArvore(ax, ay));

  // Dunas em blocos no Sinai
  const matAreiaBloco = new THREE.MeshLambertMaterial({ map: TEX.areia });
  for (let i = 0; i < 9; i++) {
    const dx = sinai.x + 130 + (i * 241) % (sinai.w - 260);
    const dy = sinai.y + 120 + (i * 173) % (sinai.h - 240);
    const g = new THREE.Group();
    const b1 = bloco(6 + (i % 3), 1, 4.5, matAreiaBloco); b1.position.y = 0.5; g.add(b1);
    const b2 = bloco(3.5, 0.9, 2.6, matAreiaBloco); b2.position.set(0.6, 1.4, 0.3); g.add(b2);
    g.position.copy(pos3d(dx, dy));
    g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    scene.add(g);
  }

  // Pedras em blocos na Cova dos Leões
  const matPedra = new THREE.MeshLambertMaterial({ map: TEX.pedra });
  for (let i = 0; i < 10; i++) {
    const rx = leoes.x + 90 + (i * 197) % (leoes.w - 180);
    const ry = leoes.y + 110 + (i * 149) % (leoes.h - 200);
    const tam = 1.4 + (i % 3) * 0.8;
    const pedra = bloco(tam, tam * 0.8, tam * 0.9, matPedra);
    pedra.position.copy(pos3d(rx, ry, tam * 0.4));
    pedra.rotation.y = i * 0.7;
    scene.add(pedra);
  }

  // Muralhas de Jericó (tijolos pixelados)
  const muros = [
    [jerico.x + 240, jerico.y + 100, 320, 24],
    [jerico.x + jerico.w - 240, jerico.y + 100, 320, 24],
    [jerico.x + jerico.w / 2, jerico.y + jerico.h - 100, jerico.w - 200, 24],
    [jerico.x + 100, jerico.y + jerico.h / 2, 24, jerico.h - 200],
    [jerico.x + jerico.w - 100, jerico.y + jerico.h / 2, 24, jerico.h - 200],
  ];
  for (const [cx, cy, lx, ly] of muros) {
    const t = TEX.tijolo.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(lx, ly) * E / 3, 1.5);
    const muro = new THREE.Mesh(new THREE.BoxGeometry(lx * E, 4.5, ly * E),
      new THREE.MeshLambertMaterial({ map: t }));
    muro.position.copy(pos3d(cx, cy, 2.25));
    muro.castShadow = true; muro.receiveShadow = true;
    scene.add(muro);
    // ameias
    const matAmeia = new THREE.MeshLambertMaterial({ map: TEX.tijolo });
    const passos = Math.max(2, Math.floor((Math.max(lx, ly) * E) / 4));
    for (let i = 0; i <= passos; i++) {
      const tt = i / passos - 0.5;
      const am = bloco(1, 0.9, 1, matAmeia);
      am.position.copy(pos3d(cx, cy, 4.9));
      am.position.x += lx > ly ? tt * lx * E : 0;
      am.position.z += ly > lx ? tt * ly * E : 0;
      scene.add(am);
    }
  }

  // Torres em blocos nos cantos de Jericó
  const matTorre = new THREE.MeshLambertMaterial({ map: TEX.tijolo });
  for (const [tx, ty] of [[jerico.x + 100, jerico.y + 100], [jerico.x + jerico.w - 100, jerico.y + 100],
                          [jerico.x + 100, jerico.y + jerico.h - 100], [jerico.x + jerico.w - 100, jerico.y + jerico.h - 100]]) {
    const torre = bloco(4.4, 7, 4.4, matTorre);
    torre.position.copy(pos3d(tx, ty, 3.5));
    scene.add(torre);
    const teto = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 4),
      new THREE.MeshLambertMaterial({ map: TEX.madeira }));
    teto.rotation.y = Math.PI / 4;
    teto.position.copy(pos3d(tx, ty, 8.2));
    teto.castShadow = true;
    scene.add(teto);
  }

  // Monte Sinai: pirâmide de blocos
  const baseMonte = pos3d(sinai.x + sinai.w - 180, sinai.y + 150);
  const niveisMonte = [[26, 0], [20, 4], [14, 8], [8, 12]];
  for (const [tam, alt] of niveisMonte) {
    const nivel = bloco(tam, 4, tam, matPedra);
    nivel.position.set(baseMonte.x, alt + 2, baseMonte.z);
    nivel.receiveShadow = true;
    scene.add(nivel);
  }
  const topoNeve = bloco(5, 1.2, 5, matBloco('#f0f0f0', 10));
  topoNeve.position.set(baseMonte.x, 16.6, baseMonte.z);
  scene.add(topoNeve);

  // Detalhes do chão (tufos e pedrinhas em bloco)
  const matTufo = new THREE.MeshLambertMaterial({ map: TEX.folhas });
  const matPedrinha = new THREE.MeshLambertMaterial({ map: TEX.pedra });
  for (let i = 0; i < 170; i++) {
    const x = 40 + (i * 613.7) % (MUNDO.largura - 80);
    const y = 40 + (i * 991.3) % (MUNDO.altura - 80);
    if (Math.abs(x - (jordao.x + jordao.w / 2)) < 50 && y > jordao.y && y < jordao.y + jordao.h) continue;
    const zAqui = ZONAS.find(z => x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h);
    let d;
    if (zAqui && zAqui.id === 'sinai') {
      d = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.4), matAreiaBloco);
      d.position.copy(pos3d(x, y, 0.12));
    } else if (zAqui && (zAqui.id === 'leoes' || zAqui.id === 'jerico')) {
      const s = 0.3 + (i % 4) * 0.12;
      d = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s), matPedrinha);
      d.position.copy(pos3d(x, y, s * 0.35));
    } else {
      d = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.28), matTufo);
      d.position.copy(pos3d(x, y, 0.25));
      d.rotation.y = i;
    }
    scene.add(d);
  }

  // Forja de Bezalel
  const bezalel = NPCS.find(n => n.forja);
  if (bezalel) {
    const base = bloco(2.2, 1, 1.6, matPedra);
    base.position.copy(pos3d(bezalel.x + 30, bezalel.y, 0.5));
    scene.add(base);
    const bigorna = bloco(1.8, 0.5, 0.8, matBloco('#444450', 14));
    bigorna.position.copy(pos3d(bezalel.x + 30, bezalel.y, 1.25));
    scene.add(bigorna);
    luzForja = new THREE.PointLight(0xff7733, 1.4, 18);
    luzForja.position.copy(pos3d(bezalel.x - 25, bezalel.y, 1.5));
    scene.add(luzForja);
    const brasa = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 1),
      new THREE.MeshBasicMaterial({ color: 0xff8844 }));
    brasa.position.copy(pos3d(bezalel.x - 25, bezalel.y, 0.35));
    scene.add(brasa);
  }

  // Estábulo de Obede (cerca + cocho + jumento decorativo)
  const obede = NPCS.find(n => n.estabulo);
  if (obede) {
    const matCerca = new THREE.MeshLambertMaterial({ map: TEX.madeira });
    for (let i = 0; i < 7; i++) {
      const ang = Math.PI * 0.25 + (i / 6) * Math.PI * 1.5;
      const poste = bloco(0.25, 1.6, 0.25, matCerca);
      poste.position.copy(pos3d(obede.x + Math.cos(ang) * 55, obede.y + Math.sin(ang) * 55, 0.8));
      scene.add(poste);
      if (i > 0) {
        const angAnt = Math.PI * 0.25 + ((i - 1) / 6) * Math.PI * 1.5;
        const p1 = pos3d(obede.x + Math.cos(angAnt) * 55, obede.y + Math.sin(angAnt) * 55, 1.2);
        const p2 = pos3d(obede.x + Math.cos(ang) * 55, obede.y + Math.sin(ang) * 55, 1.2);
        const trave = bloco(p1.distanceTo(p2), 0.16, 0.16, matCerca);
        trave.position.copy(p1.clone().lerp(p2, 0.5));
        trave.rotation.y = -Math.atan2(p2.z - p1.z, p2.x - p1.x);
        scene.add(trave);
      }
    }
    const cocho = bloco(1.8, 0.5, 0.7, matCerca);
    cocho.position.copy(pos3d(obede.x - 35, obede.y - 20, 0.25));
    scene.add(cocho);
    const jumentinho = criarMontaria3d('jumento');
    jumentinho.position.copy(pos3d(obede.x + 25, obede.y + 30));
    jumentinho.rotation.y = -Math.PI / 2 + 0.8;
    scene.add(jumentinho);
  }

  // Ídolos de ouro (bezerro sobre pedestal)
  const matOuro = new THREE.MeshStandardMaterial({
    color: 0xffd700, metalness: 0.9, roughness: 0.25, emissive: 0x775500, emissiveIntensity: 0.35,
  });
  for (const idolo of IDOLOS) {
    const g = new THREE.Group();
    const pedestal = bloco(2.2, 1.1, 2.2, new THREE.MeshLambertMaterial({ map: TEX.pedra }));
    pedestal.position.y = 0.55;
    g.add(pedestal);
    const corpo = bloco(1.7, 0.85, 0.75, matOuro);
    corpo.position.y = 1.9;
    g.add(corpo);
    for (const [px, pz] of [[0.6, 0.25], [0.6, -0.25], [-0.6, 0.25], [-0.6, -0.25]]) {
      const perna = bloco(0.2, 0.6, 0.2, matOuro);
      perna.position.set(px, 1.35, pz);
      g.add(perna);
    }
    const cabeca = bloco(0.6, 0.55, 0.5, matOuro);
    cabeca.position.set(1.05, 2.35, 0);
    g.add(cabeca);
    for (const lado of [-1, 1]) {
      const chifre = bloco(0.12, 0.4, 0.12, matOuro);
      chifre.position.set(1.05, 2.75, lado * 0.2);
      chifre.rotation.x = lado * 0.4;
      g.add(chifre);
    }
    g.position.copy(pos3d(idolo.x, idolo.y));
    scene.add(g);
    idolo._mesh = g;
  }

  // NPCs
  for (const npc of NPCS) {
    const g = criarHumanoide(npc.cor, 'npc');
    g.position.copy(pos3d(npc.x, npc.y));
    scene.add(g);
    npc._mesh = g;
  }
}

function criarArvore(x, y) {
  const g = new THREE.Group();
  const tronco = bloco(0.55, 3.2, 0.55, new THREE.MeshLambertMaterial({ map: TEX.madeira }));
  tronco.position.y = 1.6;
  g.add(tronco);
  const matFolhas = new THREE.MeshLambertMaterial({ map: TEX.folhas });
  const copa1 = bloco(2.7, 1.3, 2.7, matFolhas);
  copa1.position.y = 3.6;
  g.add(copa1);
  const copa2 = bloco(1.8, 1.1, 1.8, matFolhas);
  copa2.position.y = 4.7;
  g.add(copa2);
  g.position.copy(pos3d(x, y));
  return g;
}

// ------------------------------------------------------------
// Personagem em blocos (estilo Minecraft)
// ------------------------------------------------------------
function criarHumanoide(corTunica, papel) {
  const g = new THREE.Group();
  const corpo = new THREE.Group();
  g.add(corpo);
  g.userData.corpo = corpo;

  const matTunica = matBloco(corTunica, 22);
  const matPele = new THREE.MeshLambertMaterial({ map: TEX.pele });

  // pernas (pivô no quadril)
  g.userData.pernasJog = [];
  for (const lado of [-1, 1]) {
    const geoPerna = new THREE.BoxGeometry(0.32, 1.0, 0.34);
    geoPerna.translate(0, -0.5, 0);
    const perna = new THREE.Mesh(geoPerna, matTunica);
    perna.position.set(lado * 0.19, 1.0, 0);
    perna.castShadow = true;
    corpo.add(perna);
    g.userData.pernasJog.push(perna);
  }

  // torso
  const torso = bloco(0.85, 1.1, 0.5, matTunica);
  torso.position.y = 1.55;
  corpo.add(torso);

  // cinto
  const cinto = bloco(0.88, 0.14, 0.53, matBloco('#5a4020', 14));
  cinto.position.y = 1.06;
  corpo.add(cinto);

  // cabeça: cubo com rosto pixelado na frente
  const matLados = matPele;
  const materiaisCabeca = [matLados, matLados, matLados, matLados,
    new THREE.MeshLambertMaterial({ map: TEX.rosto }), matLados];
  const cabeca = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.82, 0.82), materiaisCabeca);
  cabeca.position.y = 2.55;
  cabeca.castShadow = true;
  corpo.add(cabeca);

  // cabelo/turbante (camada em cima) + faixa da cor da classe
  const cabelo = bloco(0.86, 0.3, 0.86, matBloco('#4a3018', 16));
  cabelo.position.y = 2.88;
  corpo.add(cabelo);
  const faixa = bloco(0.9, 0.14, 0.9, matTunica);
  faixa.position.y = 2.74;
  corpo.add(faixa);

  // braço esquerdo (escudo)
  const bracoE = new THREE.Group();
  bracoE.position.set(-0.57, 2.0, 0);
  corpo.add(bracoE);
  g.userData.bracoE = bracoE;
  const geoBracoE = new THREE.BoxGeometry(0.28, 1.0, 0.3);
  geoBracoE.translate(0, -0.45, 0);
  const membroE = new THREE.Mesh(geoBracoE, matPele);
  membroE.castShadow = true;
  bracoE.add(membroE);

  // braço direito (arma) — anima no ataque
  const braco = new THREE.Group();
  braco.position.set(0.57, 2.0, 0);
  corpo.add(braco);
  g.userData.braco = braco;
  const geoBracoD = new THREE.BoxGeometry(0.28, 1.0, 0.3);
  geoBracoD.translate(0, -0.45, 0);
  const membroD = new THREE.Mesh(geoBracoD, matPele);
  membroD.castShadow = true;
  braco.add(membroD);

  g.userData.papel = papel;
  return g;
}

function criarArma(classe, nivelArma) {
  const g = new THREE.Group();
  const lendaria = nivelArma >= 7;
  const boa = nivelArma >= 4;
  const corMetal = lendaria ? 0xffd700 : (boa ? 0xc8c8d8 : 0x9a9aa8);
  const emissivo = lendaria ? 0xaa8800 : 0x000000;
  const matMetal = new THREE.MeshStandardMaterial({
    color: corMetal, metalness: 0.85, roughness: 0.3, emissive: emissivo, emissiveIntensity: 0.6,
  });
  const matMadeira = new THREE.MeshLambertMaterial({ map: TEX.madeira });
  const escala = 1 + (nivelArma - 1) * 0.05;

  if (classe === 'guerreiro') {
    const lamina = bloco(0.12, 1.6, 0.34, matMetal);
    lamina.position.y = 0.85;
    g.add(lamina);
    const ponta = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 4), matMetal);
    ponta.rotation.y = Math.PI / 4;
    ponta.position.y = 1.8;
    g.add(ponta);
    const guarda = bloco(0.5, 0.12, 0.14, matMetal);
    g.add(guarda);
    const cabo = bloco(0.1, 0.5, 0.1, matMadeira);
    cabo.position.y = -0.3;
    g.add(cabo);
  } else if (classe === 'profeta') {
    const cajado = bloco(0.14, 2.6, 0.14, matMadeira);
    cajado.position.y = 0.5;
    g.add(cajado);
    const orbe = bloco(0.42, 0.42, 0.42, new THREE.MeshStandardMaterial({
      color: lendaria ? 0xffe066 : 0x9b6fc3, emissive: lendaria ? 0xcc9900 : 0x5a2f8a,
      emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.3,
    }));
    orbe.position.y = 1.95;
    g.add(orbe);
  } else {
    // pastor: cajado com curva em blocos
    const cajado = bloco(0.14, 2.5, 0.14, matMadeira);
    cajado.position.y = 0.45;
    g.add(cajado);
    const curva1 = bloco(0.4, 0.14, 0.14, matMadeira);
    curva1.position.set(0.16, 1.72, 0);
    g.add(curva1);
    const curva2 = bloco(0.14, 0.34, 0.14, matMadeira);
    curva2.position.set(0.34, 1.55, 0);
    g.add(curva2);
    if (boa) {
      const pedra = bloco(0.22, 0.22, 0.22, matMetal);
      pedra.position.set(0.2, 1.2, 0);
      g.add(pedra);
    }
  }
  g.scale.setScalar(escala);
  return g;
}

function aplicarEquipamentos(g, j) {
  const corpo = g.userData.corpo;
  for (const nome of ['arma', 'ombro1', 'ombro2', 'elmo', 'aura', 'escudo']) {
    const antigo = g.userData[nome];
    if (antigo) { antigo.parent.remove(antigo); g.userData[nome] = null; }
  }
  // Arma na mão direita
  const arma = criarArma(j.classe, j.nivelArma);
  arma.position.y = -0.85;
  g.userData.braco.add(arma);
  g.userData.arma = arma;

  const matArmadura = new THREE.MeshStandardMaterial({
    color: j.nivelArmadura >= 8 ? 0xffd700 : 0x8a8a98,
    metalness: 0.8, roughness: 0.35,
    emissive: j.nivelArmadura >= 8 ? 0x886600 : 0x000000, emissiveIntensity: 0.5,
  });
  if (j.nivelArmadura >= 3) {
    for (const lado of [-1, 1]) {
      const ombro = bloco(0.44, 0.22, 0.56, matArmadura);
      ombro.position.set(lado * 0.57, 2.16, 0);
      corpo.add(ombro);
      g.userData[lado === -1 ? 'ombro1' : 'ombro2'] = ombro;
    }
  }
  if (j.nivelArmadura >= 5) {
    const elmo = bloco(0.92, 0.5, 0.92, matArmadura);
    elmo.position.y = 2.85;
    corpo.add(elmo);
    g.userData.elmo = elmo;
  }
  // Escudo em blocos no braço esquerdo (a partir do nível 2)
  if (j.nivelEscudo >= 2) {
    const lendario = j.nivelEscudo >= 7;
    const escudo = bloco(0.12, 0.95, 0.7, new THREE.MeshStandardMaterial({
      color: lendario ? 0xffd700 : 0x8a5a30, metalness: lendario ? 0.85 : 0.35, roughness: 0.4,
      emissive: lendario ? 0x775500 : 0x000000, emissiveIntensity: 0.5,
    }));
    escudo.position.set(-0.24, -0.55, 0);
    g.userData.bracoE.add(escudo);
    g.userData.escudo = escudo;
  }
  if (j.nivelArmadura >= 8 || j.nivelArma >= 8) {
    const aura = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.7 }));
    aura.rotation.x = Math.PI / 2;
    aura.position.y = 0.15;
    g.add(aura);
    g.userData.aura = aura;
  }
  g.userData.nivelArma = j.nivelArma;
  g.userData.nivelArmadura = j.nivelArmadura;
  g.userData.nivelEscudo = j.nivelEscudo;
}

// ------------------------------------------------------------
// Montarias em blocos
// ------------------------------------------------------------
function criarMontaria3d(tipo) {
  const g = new THREE.Group();
  const ehCamelo = tipo === 'camelo';
  const mat = matBloco(ehCamelo ? '#c8a060' : '#8a8078', 16);

  const corpo = bloco(ehCamelo ? 2.6 : 2.1, 0.95, 0.85, mat);
  corpo.position.y = ehCamelo ? 1.45 : 1.1;
  g.add(corpo);

  // pernas (pivô na anca)
  const altPerna = ehCamelo ? 1 : 0.65;
  g.userData.pernas = [];
  for (const [px, pz] of [[0.8, 0.3], [0.8, -0.3], [-0.8, 0.3], [-0.8, -0.3]]) {
    const geoPerna = new THREE.BoxGeometry(0.24, altPerna * 2, 0.24);
    geoPerna.translate(0, -altPerna, 0);
    const perna = new THREE.Mesh(geoPerna, mat);
    perna.position.set(px * (ehCamelo ? 1.15 : 1), altPerna * 2, pz);
    perna.castShadow = true;
    g.add(perna);
    g.userData.pernas.push(perna);
  }

  // pescoço + cabeça
  const pescoco = bloco(0.35, ehCamelo ? 1.3 : 0.8, 0.35, mat);
  pescoco.position.set(ehCamelo ? 1.5 : 1.2, ehCamelo ? 2.2 : 1.7, 0);
  pescoco.rotation.z = -0.5;
  g.add(pescoco);
  const cabeca = bloco(0.7, 0.4, 0.42, mat);
  cabeca.position.set(ehCamelo ? 1.95 : 1.6, ehCamelo ? 2.75 : 2.1, 0);
  g.add(cabeca);
  g.userData.cabeca = cabeca;
  g.userData.cabecaY = cabeca.position.y;

  if (ehCamelo) {
    const corcova = bloco(1, 0.7, 0.75, mat);
    corcova.position.set(-0.55, 2.1, 0);
    g.add(corcova);
  } else {
    for (const lado of [-1, 1]) {
      const orelha = bloco(0.12, 0.45, 0.12, mat);
      orelha.position.set(1.5, 2.45, lado * 0.16);
      g.add(orelha);
    }
  }
  const cauda = bloco(0.12, 0.8, 0.12, mat);
  cauda.position.set(ehCamelo ? -1.35 : -1.1, ehCamelo ? 1.4 : 1.1, 0);
  cauda.rotation.z = 0.6;
  g.add(cauda);
  g.userData.cauda = cauda;

  const manta = bloco(0.9, 0.14, 1, matBloco('#a83030', 18));
  manta.position.set(ehCamelo ? 0.55 : 0, ehCamelo ? 1.98 : 1.62, 0);
  g.add(manta);

  g.rotation.y = -Math.PI / 2;
  return g;
}

function aplicarMontaria(g, j) {
  const antiga = g.userData.montaria;
  if (antiga) { g.remove(antiga); g.userData.montaria = null; }
  const corpo = g.userData.corpo;
  if (j.montariaAtiva) {
    const m = criarMontaria3d(j.montariaAtiva);
    g.add(m);
    g.userData.montaria = m;
    corpo.position.y = j.montariaAtiva === 'camelo' ? 1.9 : 1.5;
    corpo.scale.setScalar(0.85);
  } else {
    corpo.position.y = 0;
    corpo.scale.setScalar(1);
  }
  g.userData.montariaTipo = j.montariaAtiva;
}

// ------------------------------------------------------------
// Mobs em blocos
// ------------------------------------------------------------
function criarMob3d(m) {
  const def = TIPOS_MOB[m.tipo];
  const g = new THREE.Group();

  if (m.tipo === 'gigante') {
    const mat = matBloco(def.cor, 18);
    for (const lado of [-1, 1]) {
      const perna = bloco(0.5, 1.4, 0.5, mat);
      perna.position.set(lado * 0.4, 0.7, 0);
      g.add(perna);
    }
    const torso = bloco(1.7, 1.8, 0.95, mat);
    torso.position.y = 2.3;
    g.add(torso);
    for (const lado of [-1, 1]) {
      const braco = bloco(0.45, 1.7, 0.5, mat);
      braco.position.set(lado * 1.1, 2.3, 0);
      g.add(braco);
    }
    const matPeleG = matBloco('#c89a78', 14);
    const cabeca = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 1.05),
      [matPeleG, matPeleG, matPeleG, matPeleG,
        new THREE.MeshLambertMaterial({ map: texturaRostoBravo('#c89a78') }), matPeleG]);
    cabeca.position.y = 3.9; cabeca.castShadow = true;
    g.add(cabeca);
    const elmo = bloco(1.12, 0.42, 1.12, matBloco('#555560', 14));
    elmo.position.y = 4.35;
    g.add(elmo);
    const clava = bloco(0.4, 2.2, 0.4, new THREE.MeshLambertMaterial({ map: TEX.madeira }));
    clava.position.set(1.45, 3, 0.3); clava.rotation.z = -0.35;
    g.add(clava);
  } else if (m.tipo.startsWith('serpente')) {
    const mat = matBloco(def.cor, 24);
    g.userData.segmentos = [];
    for (let i = 0; i < 5; i++) {
      const tam = 0.7 - i * 0.09;
      const seg = bloco(tam, tam * 0.8, tam, mat);
      seg.position.set(-i * 0.6, 0.35, 0);
      g.add(seg);
      g.userData.segmentos.push(seg);
    }
    const olhos = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffdd55 }));
    olhos.position.set(0.2, 0.55, 0);
    g.add(olhos);
  } else if (m.tipo === 'leao') {
    const mat = matBloco(def.cor, 18);
    const corpo = bloco(2.2, 1.05, 1, mat);
    corpo.position.y = 0.95;
    g.add(corpo);
    const cabeca = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8),
      [mat, mat, mat, mat, new THREE.MeshLambertMaterial({ map: texturaRostoBravo(def.cor) }), mat]);
    cabeca.rotation.y = Math.PI / 2;
    cabeca.position.set(1.35, 1.45, 0); cabeca.castShadow = true;
    g.add(cabeca);
    const juba = bloco(0.45, 1.15, 1.15, matBloco('#8a5a20', 20));
    juba.position.set(1.05, 1.45, 0);
    g.add(juba);
    const cauda = bloco(0.14, 1.1, 0.14, mat);
    cauda.position.set(-1.25, 1.4, 0); cauda.rotation.z = 0.7;
    g.add(cauda);
    for (const [px, pz] of [[0.75, 0.35], [0.75, -0.35], [-0.75, 0.35], [-0.75, -0.35]]) {
      const pata = bloco(0.26, 0.85, 0.26, mat);
      pata.position.set(px, 0.42, pz);
      g.add(pata);
    }
  } else {
    // sentinela: humanoide de blocos com lança e escudo
    const mat = matBloco(def.cor, 18);
    for (const lado of [-1, 1]) {
      const perna = bloco(0.3, 0.95, 0.3, mat);
      perna.position.set(lado * 0.18, 0.48, 0);
      g.add(perna);
    }
    const torso = bloco(0.85, 1.1, 0.5, mat);
    torso.position.y = 1.5;
    g.add(torso);
    const matPeleS = matBloco('#d8aa88', 14);
    const cabeca = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75),
      [matPeleS, matPeleS, matPeleS, matPeleS,
        new THREE.MeshLambertMaterial({ map: texturaRostoBravo('#d8aa88') }), matPeleS]);
    cabeca.position.y = 2.45; cabeca.castShadow = true;
    g.add(cabeca);
    const elmo = bloco(0.82, 0.35, 0.82, matBloco('#707080', 14));
    elmo.position.y = 2.85;
    g.add(elmo);
    const lanca = bloco(0.1, 3.2, 0.1, new THREE.MeshLambertMaterial({ map: TEX.madeira }));
    lanca.position.set(0.62, 1.9, 0);
    g.add(lanca);
    const ponta = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 4),
      new THREE.MeshStandardMaterial({ color: 0xb0b0c0, metalness: 0.8, roughness: 0.3 }));
    ponta.rotation.y = Math.PI / 4;
    ponta.position.set(0.62, 3.7, 0);
    g.add(ponta);
    const escudo = bloco(0.12, 0.9, 0.65, matBloco('#7a4a3a', 16));
    escudo.position.set(-0.68, 1.6, 0);
    g.add(escudo);
  }
  // Boss: maior e com brilho de fogo
  if (def.boss) {
    g.scale.setScalar(1.7);
    const brasa = new THREE.PointLight(0xff5a1a, 1.6, 25);
    brasa.position.y = 2.5;
    g.add(brasa);
  }
  g.userData.fase = Math.random() * 10;
  return g;
}

// ------------------------------------------------------------
// Tela de login
// ============ AUTENTICAÇÃO ============
function mostrarTelaLogin() {
  document.getElementById('tela-login-form').classList.remove('oculto');
  document.getElementById('tela-registro-form').classList.add('oculto');
  document.getElementById('tela-classe-form').classList.add('oculto');
}

function mostrarTelaRegistro() {
  document.getElementById('tela-login-form').classList.add('oculto');
  document.getElementById('tela-registro-form').classList.remove('oculto');
  document.getElementById('tela-classe-form').classList.add('oculto');
}

function mostrarTelaClasse() {
  document.getElementById('tela-login-form').classList.add('oculto');
  document.getElementById('tela-registro-form').classList.add('oculto');
  document.getElementById('tela-classe-form').classList.remove('oculto');
}

function salvarToken(token) {
  localStorage.setItem('token', token);
}

function obterToken() {
  return localStorage.getItem('token');
}

function removerToken() {
  localStorage.removeItem('token');
}

async function fazerLogin() {
  const username = document.getElementById('input-username').value.trim();
  const password = document.getElementById('input-senha').value;

  if (!username || !password) {
    alert('Preencha username e senha');
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.erro || 'Erro ao fazer login');
      return;
    }

    salvarToken(data.token);
    document.getElementById('input-username').value = '';
    document.getElementById('input-senha').value = '';
    mostrarTelaClasse();
  } catch (e) {
    alert('Erro na conexão: ' + e.message);
  }
}

async function fazerRegistro() {
  const username = document.getElementById('input-username-reg').value.trim();
  const password = document.getElementById('input-senha-reg').value;
  const confirmar = document.getElementById('input-senha-confirmar').value;

  if (!username || !password || !confirmar) {
    alert('Preencha todos os campos');
    return;
  }

  if (password !== confirmar) {
    alert('As senhas não coincidem');
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.erro || 'Erro ao criar conta');
      return;
    }

    salvarToken(data.token);
    document.getElementById('input-username-reg').value = '';
    document.getElementById('input-senha-reg').value = '';
    document.getElementById('input-senha-confirmar').value = '';
    mostrarTelaClasse();
  } catch (e) {
    alert('Erro na conexão: ' + e.message);
  }
}

function entrar() {
  const token = obterToken();
  if (!token) {
    alert('Token não encontrado. Faça login novamente.');
    removerToken();
    mostrarTelaLogin();
    return;
  }

  socket.auth = { token };
  socket.connect();
  socket.emit('entrar', { classe: classeEscolhida });
}

// Event listeners de autenticação
document.getElementById('link-registrar').addEventListener('click', mostrarTelaRegistro);
document.getElementById('link-voltar-login').addEventListener('click', mostrarTelaLogin);
document.getElementById('btn-login').addEventListener('click', fazerLogin);
document.getElementById('btn-registrar').addEventListener('click', fazerRegistro);
document.getElementById('input-username').addEventListener('keydown', e => {
  if (e.key === 'Enter') fazerLogin();
});
document.getElementById('input-senha').addEventListener('keydown', e => {
  if (e.key === 'Enter') fazerLogin();
});
document.getElementById('input-username-reg').addEventListener('keydown', e => {
  if (e.key === 'Enter') fazerRegistro();
});
document.getElementById('input-senha-reg').addEventListener('keydown', e => {
  if (e.key === 'Enter') fazerRegistro();
});
document.getElementById('input-senha-confirmar').addEventListener('keydown', e => {
  if (e.key === 'Enter') fazerRegistro();
});

// Escolha de classe
document.querySelectorAll('.btn-classe').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-classe').forEach(b => b.classList.remove('selecionada'));
    btn.classList.add('selecionada');
    classeEscolhida = btn.dataset.classe;
  });
});

document.getElementById('btn-entrar').addEventListener('click', entrar);

// Verificar se há token salvo ao carregar
window.addEventListener('load', () => {
  const token = obterToken();
  if (token) {
    mostrarTelaClasse();
  } else {
    mostrarTelaLogin();
  }
});

socket.on('connect_error', (error) => {
  console.error('Erro de conexão:', error.message);
  alert('Erro de autenticação: ' + error.message);
  removerToken();
  mostrarTelaLogin();
});

socket.on('mundo', (dados) => {
  MUNDO = dados.MUNDO; ZONAS = dados.ZONAS; NPCS = dados.NPCS;
  CLASSES = dados.CLASSES; TIPOS_MOB = dados.TIPOS_MOB;
  MONTARIAS = dados.MONTARIAS || {};
  IDOLOS = dados.IDOLOS || [];
  PACTOS = dados.PACTOS || {};
  QUESTS_DEFS = dados.QUESTS || [];
  FE_MAX = dados.FE_MAX || 1000;
  meuId = dados.voce;
  document.getElementById('tela-login').classList.add('oculto');
  document.getElementById('tela-jogo').classList.remove('oculto');
  iniciarCena();
  requestAnimationFrame(loop);
});

// ------------------------------------------------------------
// Rede
// ------------------------------------------------------------
socket.on('estado', (e) => {
  estado = e;
  aguasAbertas = !!e.aguasAbertas;
  const eu = meuJogador();
  if (eu && posLocal) {
    if (Math.hypot(eu.x - posLocal.x, eu.y - posLocal.y) > 80) {
      posLocal.x = eu.x; posLocal.y = eu.y;
    }
  }
  atualizarHud();
  if (forjaAberta) atualizarForja();
  if (estabuloAberto) atualizarEstabulo();
});

socket.on('dano', ({ alvoTipo, id, dano, x, y }) => {
  danosFlutuantes.push({
    x, y, altura: alvoTipo === 'mob' ? 3.2 : 3.4,
    texto: '-' + dano,
    cor: alvoTipo === 'mob' ? '#ffd700' : '#ff5544',
    criadoEm: Date.now(),
  });
});

socket.on('oracao_resultado', ({ tipo, tier, texto }) => {
  const cores = {
    silencio: '#8a8a8a', bonus_menor: '#a8d8ff', bencao_parcial: '#7ec8a9',
    milagre: '#ffd700', intervencao_divina: '#ff8c00',
  };
  adicionarMensagem(`<span class="sistema">🙏 ${escapar(texto)}</span>`);
  if (posLocal) {
    danosFlutuantes.push({
      x: posLocal.x, y: posLocal.y, altura: 4,
      texto: tier === 'silencio' ? '...' : '🙏 ' + tier.replace(/_/g, ' '),
      cor: cores[tier], criadoEm: Date.now(),
    });
    // Milagres criam um anel de luz dourada
    if ((tier === 'milagre' || tier === 'intervencao_divina') && scene) {
      const anel = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.1, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 })
      );
      anel.rotation.x = Math.PI / 2;
      anel.position.copy(pos3d(posLocal.x, posLocal.y, 0.3));
      anel.userData.criadoEm = Date.now();
      scene.add(anel);
      efeitosMilagre.push(anel);
    }
  }
});

socket.on('milagre_fogo', ({ x, y, expiraEm }) => {
  if (!scene) return;
  const coluna = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.8, 14, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
  );
  coluna.position.copy(pos3d(x, y, 7));
  coluna.userData.criadoEm = Date.now();
  coluna.userData.expiraEm = expiraEm;
  scene.add(coluna);
  efeitosFogo.push(coluna);

  const luz = new THREE.PointLight(0xff6a1a, 3.2, 70);
  luz.position.copy(pos3d(x, y, 3));
  luz.userData.criadoEm = Date.now();
  luz.userData.expiraEm = expiraEm;
  luz.userData.luz = true;
  scene.add(luz);
  efeitosFogo.push(luz);
});

socket.on('quests', ({ ativas, feitas }) => {
  minhasQuests = ativas || [];
  questsFeitas = feitas || [];
  const painel = document.getElementById('hud-quest');
  if (minhasQuests.length === 0) { painel.classList.add('oculto'); return; }
  painel.classList.remove('oculto');
  painel.innerHTML = '<strong>📜 Diário de Missões</strong>' + minhasQuests.map(q => `
    <div class="quest-item${q.pronta ? ' pronta' : ''}">
      <div class="quest-titulo">${q.pronta ? '✅' : '▹'} ${escapar(q.titulo)}</div>
      <div class="quest-prog">${q.pronta
        ? `Entregar a ${escapar(q.entregarA)}`
        : q.tipo === 'explorar' ? 'Explore o local indicado'
        : q.tipo === 'falar' ? `Fale com ${escapar(q.entregarA)}`
        : `${q.progresso}/${q.qtd}`}</div>
    </div>`).join('');
});

socket.on('dialogo', ({ npc, texto }) => {
  const el = document.getElementById('dialogo');
  document.getElementById('dialogo-npc').textContent = npc;
  document.getElementById('dialogo-texto').textContent = texto;
  el.classList.remove('oculto');
});
document.getElementById('dialogo').addEventListener('click', () => {
  document.getElementById('dialogo').classList.add('oculto');
});

// ------------------------------------------------------------
// Forja
// ------------------------------------------------------------
socket.on('abrir_forja', () => {
  forjaAberta = true;
  document.getElementById('forja').classList.remove('oculto');
  atualizarForja();
});

function fecharForja() {
  forjaAberta = false;
  document.getElementById('forja').classList.add('oculto');
}
document.getElementById('btn-fechar-forja').addEventListener('click', fecharForja);

const SLOTS_FORJA = [
  { tipo: 'arma',      campo: 'nivelArma',      bonus: '+2 dano' },
  { tipo: 'armadura',  campo: 'nivelArmadura',  bonus: '+15 HP, +3,5% defesa' },
  { tipo: 'sandalias', campo: 'nivelSandalias', bonus: '+3% velocidade' },
  { tipo: 'escudo',    campo: 'nivelEscudo',    bonus: '-1 dano recebido' },
];
for (const s of SLOTS_FORJA) {
  document.getElementById('btn-melhorar-' + s.tipo)
    .addEventListener('click', () => socket.emit('melhorar', s.tipo));
}

function atualizarForja() {
  const eu = meuJogador();
  if (!eu) return;
  document.getElementById('forja-moedas').textContent = eu.moedas;
  document.getElementById('forja-arma-nome').textContent = '⚔️ ' + CLASSES[eu.classe].arma;

  for (const s of SLOTS_FORJA) {
    const nivel = eu[s.campo];
    const status = document.getElementById(`forja-${s.tipo}-status`);
    const btn = document.getElementById('btn-melhorar-' + s.tipo);
    if (nivel >= NIVEL_MAX_EQUIP) {
      status.textContent = `Nível ${nivel} — LENDÁRIO ✨`;
      btn.disabled = true; btn.textContent = 'Máx.';
    } else {
      const custo = CUSTOS[s.tipo](nivel);
      status.textContent = `Nível ${nivel} → ${nivel + 1} · ${s.bonus} · custo ${custo} 🪙`;
      btn.disabled = eu.moedas < custo;
      btn.textContent = 'Forjar';
    }
  }
}

// ------------------------------------------------------------
// Estábulo
// ------------------------------------------------------------
socket.on('abrir_estabulo', () => {
  estabuloAberto = true;
  document.getElementById('estabulo').classList.remove('oculto');
  atualizarEstabulo();
});

function fecharEstabulo() {
  estabuloAberto = false;
  document.getElementById('estabulo').classList.add('oculto');
}
document.getElementById('btn-fechar-estabulo').addEventListener('click', fecharEstabulo);
document.getElementById('btn-jumento').addEventListener('click', () => socket.emit('comprar_montaria', 'jumento'));
document.getElementById('btn-camelo').addEventListener('click', () => socket.emit('comprar_montaria', 'camelo'));

function atualizarEstabulo() {
  const eu = meuJogador();
  if (!eu) return;
  document.getElementById('estabulo-moedas').textContent = eu.moedas;
  for (const tipo of ['jumento', 'camelo']) {
    const m = MONTARIAS[tipo];
    const status = document.getElementById(`estabulo-${tipo}-status`);
    const btn = document.getElementById('btn-' + tipo);
    if (eu.montarias && eu.montarias.includes(tipo)) {
      status.textContent = `Velocidade ×${m.mult} — adquirido ✅`;
      btn.disabled = true; btn.textContent = 'Seu';
    } else {
      status.textContent = `Velocidade ×${m.mult} · preço ${m.preco} 🪙`;
      btn.disabled = eu.moedas < m.preco;
      btn.textContent = 'Comprar';
    }
  }
}

// ------------------------------------------------------------
// Chat
// ------------------------------------------------------------
function adicionarMensagem(html) {
  const div = document.getElementById('chat-mensagens');
  const p = document.createElement('div');
  p.innerHTML = html;
  div.appendChild(p);
  while (div.children.length > 60) div.removeChild(div.firstChild);
  div.scrollTop = div.scrollHeight;
}
function escapar(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
socket.on('sistema', (texto) => {
  adicionarMensagem(`<span class="sistema">${escapar(texto)}</span>`);
  // Detec vitória: Pacto Danielico desbloqueado
  if (texto.includes('alcançou o PACTO DANIELICO')) {
    setTimeout(() => {
      const vitoria = document.createElement('div');
      vitoria.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,.85); display: flex; flex-direction: column;
        justify-content: center; align-items: center; z-index: 10000;
        color: #ffd700; font-size: 2.2rem; font-weight: bold;
        font-family: 'Arial', sans-serif; text-align: center;
      `;
      vitoria.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 20px;">🔥🕊️</div>
        <div>PACTO DANIELICO ALCANÇADO!</div>
        <div style="font-size: 1.2rem; margin-top: 30px; color: #87ceeb;">
          Você provou sua Fé nos fogos ardentes da tentação.<br>
          Os leões de Deus o reconhecem como seu próprio.
        </div>
        <div style="font-size: 1rem; margin-top: 40px; color: #aaa;">
          JORNADA DE FÉ — CONCLUÍDA<br>
          Do Éden ao Livro de Daniel: você andou com Deus.
        </div>
      `;
      document.body.appendChild(vitoria);
      setTimeout(() => vitoria.remove(), 5000);
    }, 500);
  }
});
socket.on('chat', ({ nome, texto }) =>
  adicionarMensagem(`<span class="fala"><span class="autor">${escapar(nome)}:</span> ${escapar(texto)}</span>`));

// ------------------------------------------------------------
// Entrada do jogador
// ------------------------------------------------------------
const chatInput = document.getElementById('chat-input');

window.addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput) {
    if (e.key === 'Enter') {
      const t = chatInput.value.trim();
      if (t) socket.emit('chat', t);
      chatInput.value = '';
      chatInput.blur();
    } else if (e.key === 'Escape') {
      chatInput.blur();
    }
    return;
  }
  if (e.key === 'Enter') { chatInput.focus(); e.preventDefault(); return; }
  teclas[e.key.toLowerCase()] = true;
  if (e.key === ' ') { socket.emit('atacar'); e.preventDefault(); }
  if (e.key.toLowerCase() === 'e') {
    const dlg = document.getElementById('dialogo');
    if (!dlg.classList.contains('oculto')) { dlg.classList.add('oculto'); return; }
    if (forjaAberta) { fecharForja(); return; }
    if (estabuloAberto) { fecharEstabulo(); return; }
    const npc = npcProximo();
    if (npc) { socket.emit('falar_npc', npc.id); return; }
    // Ídolo próximo? Primeira vez avisa, segunda cede à tentação
    const idolo = idoloProximo();
    if (idolo) {
      if (tentacaoPendente && tentacaoPendente.idoloId === idolo.id && tentacaoPendente.expiraEm > Date.now()) {
        socket.emit('tocar_idolo', idolo.id);
        tentacaoPendente = null;
      } else {
        tentacaoPendente = { idoloId: idolo.id, expiraEm: Date.now() + 6000 };
        adicionarMensagem('<span class="sistema">🐂 O ídolo de ouro reluz... +50 shekels por adorá-lo, mas custará 50 de Fé. Pressione E de novo para ceder à tentação — ou afaste-se.</span>');
      }
    }
  }
  if (e.key === '1') socket.emit('orar', 'suplica');
  if (e.key === '2') socket.emit('orar', 'gratidao');
  if (e.key === '3') socket.emit('orar', 'arrependimento');
  if (e.key === '4') socket.emit('milagre', 'part_waters');
  if (e.key === '5') socket.emit('milagre', 'pillar_fire');
  // Ativar pactos (6-9 para pactos desbloqueados)
  const eu = meuJogador();
  if (eu && eu.pactosDesbloqueados) {
    const pactos = eu.pactosDesbloqueados.filter(id => id !== 'adamico');
    if (e.key === '6' && pactos[0]) socket.emit('ativar_pacto', pactos[0]);
    if (e.key === '7' && pactos[1]) socket.emit('ativar_pacto', pactos[1]);
    if (e.key === '8' && pactos[2]) socket.emit('ativar_pacto', pactos[2]);
    if (e.key === '9' && pactos[3]) socket.emit('ativar_pacto', pactos[3]);
  }
  if (e.key.toLowerCase() === 'f') {
    if (forjaAberta) { fecharForja(); return; }
    const npc = npcProximo();
    if (npc && npc.forja) socket.emit('falar_npc', npc.id);
  }
  if (e.key.toLowerCase() === 'm') socket.emit('montar');
  if (e.key === 'Escape') {
    if (forjaAberta) fecharForja();
    if (estabuloAberto) fecharEstabulo();
  }
});
window.addEventListener('keyup', (e) => { teclas[e.key.toLowerCase()] = false; });

// ------------------------------------------------------------
// Mouse estilo Roblox: botão direito gira a câmera, scroll dá zoom
// ------------------------------------------------------------
let camYaw = 0;          // rotação horizontal da câmera
let camPitch = 0.74;     // inclinação (0 = rasante, 1.4 = de cima)
let camDist = 30;        // distância (zoom)
let arrastando = false;
let mouseAnt = { x: 0, y: 0 };

canvas3d.addEventListener('mousedown', (e) => {
  if (e.button === 0) socket.emit('atacar');
  if (e.button === 2 || e.button === 1) {
    arrastando = true;
    mouseAnt.x = e.clientX;
    mouseAnt.y = e.clientY;
    e.preventDefault();
  }
});
window.addEventListener('mousemove', (e) => {
  if (!arrastando) return;
  const dx = e.clientX - mouseAnt.x;
  const dy = e.clientY - mouseAnt.y;
  mouseAnt.x = e.clientX;
  mouseAnt.y = e.clientY;
  camYaw -= dx * 0.006;
  camPitch = Math.max(0.15, Math.min(1.4, camPitch + dy * 0.005));
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2 || e.button === 1) arrastando = false;
});
canvas3d.addEventListener('contextmenu', (e) => e.preventDefault());
canvas3d.addEventListener('wheel', (e) => {
  e.preventDefault();
  camDist = Math.max(8, Math.min(70, camDist * (e.deltaY > 0 ? 1.12 : 0.89)));
}, { passive: false });

function meuJogador() {
  return estado.jogadores.find(j => j.id === meuId);
}

function npcProximo() {
  if (!posLocal) return null;
  return NPCS.find(n => Math.hypot(n.x - posLocal.x, n.y - posLocal.y) < 80) || null;
}

function idoloProximo() {
  if (!posLocal) return null;
  return IDOLOS.find(i => Math.hypot(i.x - posLocal.x, i.y - posLocal.y) < 80) || null;
}

// Movimento local previsto + envio ao servidor
setInterval(() => {
  const eu = meuJogador();
  if (!eu || !MUNDO) return;
  if (!posLocal) posLocal = { x: eu.x, y: eu.y, dir: 1 };
  if (eu.hp <= 0) { posLocal.x = eu.x; posLocal.y = eu.y; return; }

  const multMont = eu.montariaAtiva && MONTARIAS[eu.montariaAtiva] ? MONTARIAS[eu.montariaAtiva].mult : 1;
  const vel = CLASSES[eu.classe].vel * (1 + (eu.nivelSandalias - 1) * 0.03) * multMont;
  let dx = 0, dy = 0;
  if (teclas['w'] || teclas['arrowup']) dy -= 1;
  if (teclas['s'] || teclas['arrowdown']) dy += 1;
  if (teclas['a'] || teclas['arrowleft']) { dx -= 1; posLocal.dir = -1; }
  if (teclas['d'] || teclas['arrowright']) { dx += 1; posLocal.dir = 1; }
  if (dx || dy) {
    // WASD relativo à câmera (estilo Roblox): W anda para onde a câmera aponta
    const cosY = Math.cos(camYaw), sinY = Math.sin(camYaw);
    const mdx = dx * cosY + dy * sinY;
    const mdy = -dx * sinY + dy * cosY;
    const n = Math.hypot(mdx, mdy);
    let nx = Math.max(20, Math.min(MUNDO.largura - 20, posLocal.x + (mdx / n) * vel));
    let ny = Math.max(20, Math.min(MUNDO.altura - 20, posLocal.y + (mdy / n) * vel));
    // Não entra na água (desliza pela margem, igual ao servidor)
    if (dentroAgua(nx, ny)) {
      if (!dentroAgua(posLocal.x, ny)) nx = posLocal.x;
      else if (!dentroAgua(nx, posLocal.y)) ny = posLocal.y;
      else { nx = posLocal.x; ny = posLocal.y; }
    }
    posLocal.x = nx;
    posLocal.y = ny;
    socket.emit('mover', { x: posLocal.x, y: posLocal.y, dir: posLocal.dir });
  }
}, 33);

// ------------------------------------------------------------
// HUD
// ------------------------------------------------------------
function atualizarHud() {
  const eu = meuJogador();
  if (!eu) return;
  document.getElementById('hud-nome').textContent =
    `${eu.nome} — ${CLASSES[eu.classe].nome} · Nível ${eu.nivel}`;
  const pctHp = Math.max(0, (eu.hp / eu.maxHp) * 100);
  document.getElementById('barra-hp').style.width = pctHp + '%';
  document.getElementById('texto-hp').textContent = `${eu.hp} / ${eu.maxHp} HP`;

  const xpAtualNivel = 60 * Math.pow(eu.nivel - 1, 2);
  const xpProxNivel = 60 * Math.pow(eu.nivel, 2);
  const pctXp = ((eu.xp - xpAtualNivel) / (xpProxNivel - xpAtualNivel)) * 100;
  document.getElementById('barra-xp').style.width = Math.min(100, pctXp) + '%';
  document.getElementById('texto-xp').textContent = `${eu.xp} XP (próx. nível: ${xpProxNivel})`;

  const nomesEstado = { retidao: 'Retidão ✨', timido: 'Tímido', caido: 'Caído 🥀' };
  document.getElementById('barra-fe').style.width = Math.min(100, (eu.fe / FE_MAX) * 100) + '%';
  document.getElementById('texto-fe').textContent = `Fé ${eu.fe} / ${FE_MAX} · ${nomesEstado[eu.estadoFe] || ''}`;

  // Pactos disponíveis e ativo
  const pactoHud = document.getElementById('hud-pacto');
  if (eu.pactoAtivo) {
    const p = PACTOS[eu.pactoAtivo];
    pactoHud.textContent = `🕊️ Pacto Ativo: ${p.name}`;
    pactoHud.style.color = eu.pactoAtivo === 'danielico' ? '#ffd700' : '#87ceeb';
  } else if (eu.pactosDesbloqueados && eu.pactosDesbloqueados.length > 1) {
    const deskaq = eu.pactosDesbloqueados.filter(id => id !== 'adamico');
    const nomes = deskaq.map(id => PACTOS[id].name).join(' / ');
    pactoHud.textContent = `📖 Pactos disponíveis: ${nomes} (teclas 6+)`;
    pactoHud.style.color = '#a8d8ff';
  } else {
    pactoHud.textContent = '';
  }

  const nomesDebuff = { idolatria: '🐂 Idolatria', culpa: '😔 Culpa', quebra_de_voto: '💔 Quebra de Voto' };
  document.getElementById('hud-debuffs').textContent =
    (eu.debuffs || []).map(d => nomesDebuff[d] || d).join(' · ');

  document.getElementById('hud-moedas').textContent = `🪙 ${eu.moedas}`;
  document.getElementById('hud-arma').textContent = `⚔️ Nv ${eu.nivelArma}`;
  document.getElementById('hud-armadura').textContent = `🛡️ Nv ${eu.nivelArmadura}`;
  document.getElementById('hud-sandalias').textContent = `👟 Nv ${eu.nivelSandalias}`;
  document.getElementById('hud-escudo').textContent = `🔰 Nv ${eu.nivelEscudo}`;
  const hudMont = document.getElementById('hud-montaria');
  if (eu.montariaAtiva) {
    hudMont.classList.remove('oculto');
    hudMont.textContent = eu.montariaAtiva === 'camelo' ? '🐪' : '🫏';
  } else {
    hudMont.classList.add('oculto');
  }
  document.getElementById('qtd-online').textContent = estado.jogadores.length;

  if (estado.hora !== undefined) {
    const h = estado.hora;
    let fase;
    if (h > 0.2 && h < 0.32) fase = '🌅 Amanhecer';
    else if (h >= 0.32 && h < 0.68) fase = '☀️ Dia';
    else if (h >= 0.68 && h < 0.8) fase = '🌇 Entardecer';
    else fase = '🌙 Noite';
    document.getElementById('hud-hora').textContent = fase;
  }
}

// ------------------------------------------------------------
// Loop de renderização
// ------------------------------------------------------------
function redimensionar() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  overlay.width = w;
  overlay.height = h;
}
window.addEventListener('resize', () => { if (renderer) redimensionar(); });

function loop() {
  requestAnimationFrame(loop);
  const t = relogio.getElapsedTime();
  const eu = meuJogador();
  if (!eu) { renderer.render(scene, camera); return; }
  const px = posLocal ? posLocal.x : eu.x;
  const py = posLocal ? posLocal.y : eu.y;

  sincronizarJogadores(t);
  sincronizarMobs(t);
  sincronizarItens(t);

  // Água do rio corre
  if (texAguaRio) texAguaRio.offset.y = -t * 0.12;
  const agoraMs = Date.now();

  // Milagre Dividir Águas: a água central baixa/soma, muros das margens sobem
  if (meshRio) {
    const alvoOpacidade = aguasAbertas ? 0.08 : 0.92;
    meshRio.material.opacity += (alvoOpacidade - meshRio.material.opacity) * 0.08;
  }
  for (const muro of murosAgua) {
    muro.visible = aguasAbertas || muro.material.opacity > 0.02;
    const alvoOpacidade = aguasAbertas ? 0.85 : 0;
    muro.material.opacity += (alvoOpacidade - muro.material.opacity) * 0.08;
    muro.material.map.offset.y = -t * 0.15;
  }

  // Colunas de fogo se apagam com o tempo
  for (let i = efeitosFogo.length - 1; i >= 0; i--) {
    const ef = efeitosFogo[i];
    const restante = ef.userData.expiraEm - agoraMs;
    if (restante <= 0) {
      scene.remove(ef);
      efeitosFogo.splice(i, 1);
      continue;
    }
    if (ef.userData.luz) {
      ef.intensity = 3.2 * Math.min(1, restante / 800) + Math.random() * 0.4;
    } else {
      ef.material.opacity = 0.75 * Math.min(1, restante / 800);
      ef.rotation.y += 0.15;
    }
  }

  // Anéis de milagre se expandem e desaparecem
  for (let i = efeitosMilagre.length - 1; i >= 0; i--) {
    const anel = efeitosMilagre[i];
    const idade = agoraMs - anel.userData.criadoEm;
    if (idade > 2500) {
      scene.remove(anel);
      efeitosMilagre.splice(i, 1);
      continue;
    }
    const s = 1 + (idade / 2500) * 5;
    anel.scale.setScalar(s);
    anel.material.opacity = 0.9 * (1 - idade / 2500);
    anel.position.y = 0.3 + (idade / 2500) * 2;
  }

  // Câmera orbital em terceira pessoa (botão direito gira, scroll dá zoom)
  const alvo = pos3d(px, py, 1.5);
  const desejo = new THREE.Vector3(
    alvo.x + camDist * Math.cos(camPitch) * Math.sin(camYaw),
    alvo.y + camDist * Math.sin(camPitch),
    alvo.z + camDist * Math.cos(camPitch) * Math.cos(camYaw)
  );
  camera.position.lerp(desejo, arrastando ? 0.5 : 0.22);
  camera.lookAt(alvo);

  // Névoa acompanha o zoom para não engolir o mundo no zoom out
  scene.fog.near = camDist + 35;
  scene.fog.far = camDist + 140;

  // ---------- Ciclo de dia e noite ----------
  // hora: 0 = meia-noite, 0.25 = amanhecer, 0.5 = meio-dia, 0.75 = entardecer
  const hora = estado.hora !== undefined ? estado.hora : 0.5;
  const elev = Math.sin((hora - 0.25) * Math.PI * 2); // altura do sol (-1..1)

  if (elev > 0.35) corCeu.copy(COR_DIA);
  else if (elev > 0) corCeu.copy(COR_POR).lerp(COR_DIA, elev / 0.35);
  else corCeu.copy(COR_POR).lerp(COR_NOITE, Math.min(1, -elev / 0.25));
  scene.background.copy(corCeu);
  scene.fog.color.copy(corCeu);

  if (elev > 0) {
    // sol
    sol.color.setHex(elev > 0.3 ? 0xffeecc : 0xffb070);
    sol.intensity = 0.25 + elev * 0.85;
  } else {
    // lua
    sol.color.setHex(0x8899cc);
    sol.intensity = 0.16;
  }
  hemi.intensity = 0.22 + Math.max(0, elev) * 0.6;

  // Sol/lua acompanha o jogador (para as sombras)
  const altSol = 18 + Math.max(0.08, Math.abs(elev)) * 42;
  sol.position.set(alvo.x + 30, altSol, alvo.z + 15);
  sol.target.position.copy(alvo);

  // Fogo da forja tremula (mais visível à noite)
  if (luzForja) luzForja.intensity = 1.2 + Math.sin(t * 9) * 0.3 + Math.random() * 0.15 + (elev < 0 ? 0.5 : 0);

  renderer.render(scene, camera);
  desenharOverlay(px, py, t);
}

function sincronizarJogadores(t) {
  const vivos = new Set();
  for (const j of estado.jogadores) {
    vivos.add(j.id);
    let g = meshJogadores[j.id];
    if (!g) {
      g = criarHumanoide(CLASSES[j.classe].cor, 'jogador');
      aplicarEquipamentos(g, j);
      scene.add(g);
      meshJogadores[j.id] = g;
      g.position.copy(pos3d(j.x, j.y));
    }
    if (g.userData.nivelArma !== j.nivelArma || g.userData.nivelArmadura !== j.nivelArmadura ||
        g.userData.nivelEscudo !== j.nivelEscudo) {
      aplicarEquipamentos(g, j);
    }
    if (g.userData.montariaTipo !== j.montariaAtiva) {
      aplicarMontaria(g, j);
    }

    const ehEu = j.id === meuId;
    const dest = ehEu && posLocal ? pos3d(posLocal.x, posLocal.y) : pos3d(j.x, j.y);
    const antes = g.position.clone();
    g.position.lerp(dest, ehEu ? 0.6 : 0.25);

    // Rotaciona na direção do movimento
    const mdx = g.position.x - antes.x, mdz = g.position.z - antes.z;
    const movendo = Math.hypot(mdx, mdz) > 0.01;
    if (movendo) {
      const angAlvo = Math.atan2(mdx, mdz);
      let d = angAlvo - g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += d * 0.25;
    }

    // Animação de caminhada / galope
    const mont = g.userData.montaria;
    const pernas = g.userData.pernasJog;
    const bracoE = g.userData.bracoE;
    if (mont) {
      // sentado na montaria
      pernas[0].rotation.x = -1.15;
      pernas[1].rotation.x = -1.15;
      bracoE.rotation.x = -0.5;
      const fase = t * 11;
      if (movendo) {
        mont.userData.pernas.forEach((p, i) => {
          const desloc = (i === 0 || i === 3) ? 0 : Math.PI;
          p.rotation.z = Math.sin(fase + desloc) * 0.6;
        });
        g.position.y = Math.abs(Math.sin(fase)) * 0.22;
        mont.rotation.z = Math.sin(fase) * 0.05;
        mont.userData.cabeca.position.y = mont.userData.cabecaY + Math.sin(fase) * 0.1;
        mont.userData.cauda.rotation.x = Math.sin(fase) * 0.35;
      } else {
        mont.userData.pernas.forEach(p => { p.rotation.z *= 0.75; });
        mont.rotation.z *= 0.75;
        g.position.y = 0;
        mont.userData.cauda.rotation.x = Math.sin(t * 2) * 0.2;
        mont.userData.cabeca.position.y = mont.userData.cabecaY + Math.sin(t * 1.3) * 0.04;
      }
    } else if (movendo) {
      // caminhada: pernas e braços balançam alternados
      const fase = t * 9;
      pernas[0].rotation.x = Math.sin(fase) * 0.7;
      pernas[1].rotation.x = Math.sin(fase + Math.PI) * 0.7;
      bracoE.rotation.x = Math.sin(fase + Math.PI) * 0.55;
      g.position.y = Math.abs(Math.sin(fase)) * 0.08;
    } else {
      pernas[0].rotation.x *= 0.8;
      pernas[1].rotation.x *= 0.8;
      bracoE.rotation.x *= 0.8;
      g.position.y = 0;
    }

    // Animação de ataque (braço direito) ou balanço ao andar
    const braco = g.userData.braco;
    const dtGolpe = Date.now() - j.golpeEm;
    if (dtGolpe < 250) {
      braco.rotation.x = -1.7 * Math.sin((dtGolpe / 250) * Math.PI);
    } else if (movendo && !mont) {
      braco.rotation.x = Math.sin(t * 9) * 0.55;
    } else {
      braco.rotation.x *= 0.8;
    }

    // Morte / dano
    if (j.hp <= 0) {
      g.rotation.z = Math.PI / 2;
      g.position.y = 0.4;
    } else {
      g.rotation.z *= 0.7;
    }
    const ferido = (Date.now() - j.ultimoGolpe < 180) && j.hp > 0;
    if (ferido !== g.userData.flashAtivo) {
      g.userData.flashAtivo = ferido;
      g.traverse(o => {
        if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.emissive !== undefined) {
          if (o.material._emissiveBase === undefined) {
            o.material._emissiveBase = o.material.emissive.getHex();
          }
          o.material.emissive.setHex(ferido ? 0x660000 : o.material._emissiveBase);
        }
      });
    }

    if (g.userData.aura) g.userData.aura.rotation.z = t * 1.5;
  }
  for (const id of Object.keys(meshJogadores)) {
    if (!vivos.has(id)) {
      scene.remove(meshJogadores[id]);
      delete meshJogadores[id];
    }
  }
}

function sincronizarMobs(t) {
  const vivos = new Set();
  for (const m of estado.mobs) {
    vivos.add(m.id);
    let g = meshMobs[m.id];
    if (!g) {
      g = criarMob3d(m);
      g.position.copy(pos3d(m.x, m.y));
      scene.add(g);
      meshMobs[m.id] = g;
    }
    const antes = g.position.clone();
    g.position.lerp(pos3d(m.x, m.y), 0.2);
    const mdx = g.position.x - antes.x, mdz = g.position.z - antes.z;
    if (Math.hypot(mdx, mdz) > 0.005) {
      const angAlvo = Math.atan2(mdx, mdz) + (m.tipo === 'leao' ? -Math.PI / 2 : 0);
      let d = angAlvo - g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += d * 0.2;
    }
    const fase = g.userData.fase;
    if (m.tipo.startsWith('serpente') && g.userData.segmentos) {
      g.userData.segmentos.forEach((seg, i) => {
        seg.position.z = Math.sin(t * 5 + fase + i * 0.9) * 0.3;
      });
    } else {
      g.position.y = Math.abs(Math.sin(t * 6 + fase)) * 0.08;
    }
  }
  for (const id of Object.keys(meshMobs)) {
    if (!vivos.has(id)) {
      scene.remove(meshMobs[id]);
      delete meshMobs[id];
    }
  }
}

function sincronizarItens(t) {
  const vivos = new Set();
  for (const item of estado.itens) {
    vivos.add(item.id);
    let mesh = meshItens[item.id];
    if (!mesh) {
      const visuais = {
        mana:  { color: 0xfff2c8, emissive: 0xc8a838 },
        fruto: { color: 0xe84a3a, emissive: 0x8a1a0a },
        pedra: { color: 0xb8b8c0, emissive: 0x3a3a44 },
      };
      const v = visuais[item.tipo] || visuais.mana;
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.55, 0.55),
        new THREE.MeshStandardMaterial({
          color: v.color, emissive: v.emissive, emissiveIntensity: 0.8, roughness: 0.3,
        })
      );
      mesh.position.copy(pos3d(item.x, item.y, 0.8));
      scene.add(mesh);
      meshItens[item.id] = mesh;
    }
    mesh.position.y = 0.8 + Math.sin(t * 3 + item.x) * 0.25;
    mesh.rotation.y = t * 2;
  }
  for (const id of Object.keys(meshItens)) {
    if (!vivos.has(id)) {
      scene.remove(meshItens[id]);
      delete meshItens[id];
    }
  }
}

// ------------------------------------------------------------
// Overlay 2D: nomes, barras de vida, danos, minimapa
// ------------------------------------------------------------
function projetar(x, y, altura) {
  const v = pos3d(x, y, altura).project(camera);
  if (v.z > 1) return null;
  return { x: (v.x + 1) / 2 * overlay.width, y: (-v.y + 1) / 2 * overlay.height };
}

function desenharOverlay(px, py, t) {
  octx.clearRect(0, 0, overlay.width, overlay.height);

  // NPCs com marcadores de missão estilo WoW (❗ disponível, ❓ entregar)
  const eu2 = meuJogador();
  for (const npc of NPCS) {
    const p = projetar(npc.x, npc.y, 4.2);
    if (!p) continue;

    // Estado de missão deste NPC para mim
    let marcador = null;
    if (!npc.forja && !npc.estabulo && eu2) {
      const ativaIds = new Set(minhasQuests.map(q => q.id));
      const prontaAqui = minhasQuests.some(q => {
        const def = QUESTS_DEFS.find(d => d.id === q.id);
        if (!def) return false;
        const entregaEm = def.tipo === 'falar' ? def.alvo : def.npc;
        return entregaEm === npc.id && (q.pronta || def.tipo === 'falar');
      });
      const disponivel = QUESTS_DEFS.some(d =>
        d.npc === npc.id && !questsFeitas.includes(d.id) && !ativaIds.has(d.id) &&
        eu2.nivel >= d.nivelMin && (!d.requer || questsFeitas.includes(d.requer)));
      if (prontaAqui) marcador = { simbolo: '?', cor: '#ffd700' };
      else if (disponivel) marcador = { simbolo: '!', cor: '#ffe94a' };
    }

    if (marcador) {
      octx.textAlign = 'center';
      octx.font = 'bold 26px Georgia';
      octx.fillStyle = marcador.cor;
      octx.strokeStyle = 'rgba(0,0,0,.8)';
      octx.lineWidth = 4;
      const flutuar = Math.sin(t * 3) * 3;
      octx.strokeText(marcador.simbolo, p.x, p.y - 18 + flutuar);
      octx.fillText(marcador.simbolo, p.x, p.y - 18 + flutuar);
    }

    octx.textAlign = 'center';
    octx.font = 'bold 14px Segoe UI';
    octx.fillStyle = '#ffe98a';
    octx.strokeStyle = 'rgba(0,0,0,.7)';
    octx.lineWidth = 3;
    const rotulo = (npc.forja ? '🔨 ' : npc.estabulo ? '🐴 ' : '') + npc.nome;
    octx.strokeText(rotulo, p.x, p.y);
    octx.fillText(rotulo, p.x, p.y);
    if (posLocal && Math.hypot(npc.x - posLocal.x, npc.y - posLocal.y) < 80) {
      octx.font = '12px Segoe UI';
      octx.fillStyle = '#ffffff';
      const acao = npc.forja ? '[E] Forjar' : npc.estabulo ? '[E] Estábulo' : '[E] Falar';
      octx.strokeText(acao, p.x, p.y + 16);
      octx.fillText(acao, p.x, p.y + 16);
    }
  }

  // Ponto de exploração ativo (marcador no mundo)
  for (const q of minhasQuests) {
    if (q.pronta) continue;
    const def = QUESTS_DEFS.find(d => d.id === q.id);
    if (!def || def.tipo !== 'explorar' || !def.ponto) continue;
    const p = projetar(def.ponto.x, def.ponto.y, 3);
    if (!p) continue;
    octx.textAlign = 'center';
    octx.font = 'bold 22px Georgia';
    octx.fillStyle = '#7ec8ff';
    octx.strokeStyle = 'rgba(0,0,0,.8)';
    octx.lineWidth = 4;
    const flutuar = Math.sin(t * 3) * 4;
    octx.strokeText('▼', p.x, p.y + flutuar);
    octx.fillText('▼', p.x, p.y + flutuar);
    octx.font = '11px Segoe UI';
    octx.strokeText(def.titulo, p.x, p.y + 16);
    octx.fillText(def.titulo, p.x, p.y + 16);
  }

  // Ídolos
  for (const idolo of IDOLOS) {
    const p = projetar(idolo.x, idolo.y, 3.6);
    if (!p) continue;
    octx.textAlign = 'center';
    octx.font = 'bold 13px Segoe UI';
    octx.fillStyle = '#ffd700';
    octx.strokeStyle = 'rgba(0,0,0,.7)';
    octx.lineWidth = 3;
    octx.strokeText('🐂 Ídolo de Ouro', p.x, p.y);
    octx.fillText('🐂 Ídolo de Ouro', p.x, p.y);
    if (posLocal && Math.hypot(idolo.x - posLocal.x, idolo.y - posLocal.y) < 80) {
      octx.font = '12px Segoe UI';
      octx.fillStyle = '#ff9a7a';
      octx.strokeText('[E] Tentação...', p.x, p.y + 16);
      octx.fillText('[E] Tentação...', p.x, p.y + 16);
    }
  }

  // Mobs
  for (const m of estado.mobs) {
    const def = TIPOS_MOB[m.tipo];
    const alt = def.boss ? 6.5 : m.tipo === 'gigante' ? 5 : 3.4;
    const p = projetar(m.x, m.y, alt);
    if (!p) continue;
    octx.textAlign = 'center';
    octx.font = '11px Segoe UI';
    octx.fillStyle = 'rgba(255,255,255,.9)';
    octx.strokeStyle = 'rgba(0,0,0,.7)';
    octx.lineWidth = 3;
    octx.strokeText(def.nome, p.x, p.y - 8);
    octx.fillText(def.nome, p.x, p.y - 8);
    desenharBarra(p.x, p.y - 4, 44, m.hp / m.maxHp, '#d9534f');
  }

  // Jogadores
  for (const j of estado.jogadores) {
    const ehEu = j.id === meuId;
    const jx = ehEu && posLocal ? posLocal.x : j.x;
    const jy = ehEu && posLocal ? posLocal.y : j.y;
    const altNome = 3.8 + (j.montariaAtiva === 'camelo' ? 2.0 : j.montariaAtiva ? 1.6 : 0);
    const p = projetar(jx, jy, altNome);
    if (!p) continue;
    octx.textAlign = 'center';
    octx.font = 'bold 13px Segoe UI';
    octx.fillStyle = ehEu ? '#e8c95a' : '#ffffff';
    octx.strokeStyle = 'rgba(0,0,0,.7)';
    octx.lineWidth = 3;
    const rotulo = j.hp <= 0 ? `💀 ${j.nome}` : `${j.nome} [${j.nivel}]`;
    octx.strokeText(rotulo, p.x, p.y - 6);
    octx.fillText(rotulo, p.x, p.y - 6);
    if (j.hp > 0) desenharBarra(p.x, p.y - 2, 48, j.hp / j.maxHp, '#5cb85c');
  }

  // Danos flutuantes
  const agora = Date.now();
  for (let i = danosFlutuantes.length - 1; i >= 0; i--) {
    const d = danosFlutuantes[i];
    const idade = agora - d.criadoEm;
    if (idade > 900) { danosFlutuantes.splice(i, 1); continue; }
    const p = projetar(d.x, d.y, d.altura + idade / 400);
    if (!p) continue;
    octx.globalAlpha = 1 - idade / 900;
    octx.font = 'bold 17px Segoe UI';
    octx.textAlign = 'center';
    octx.strokeStyle = 'rgba(0,0,0,.8)';
    octx.lineWidth = 3;
    octx.fillStyle = d.cor;
    octx.strokeText(d.texto, p.x, p.y);
    octx.fillText(d.texto, p.x, p.y);
    octx.globalAlpha = 1;
  }

  // Nome da zona atual
  const zona = ZONAS.find(z => px > z.x && px < z.x + z.w && py > z.y && py < z.y + z.h);
  if (zona) {
    octx.textAlign = 'center';
    octx.font = 'bold 22px Georgia';
    octx.fillStyle = 'rgba(255,245,220,.85)';
    octx.strokeStyle = 'rgba(0,0,0,.5)';
    octx.lineWidth = 4;
    octx.strokeText(zona.nome, overlay.width / 2, 40);
    octx.fillText(zona.nome, overlay.width / 2, 40);
  }

  desenharMinimapa(px, py);
}

function desenharBarra(x, yTopo, largura, pct, cor) {
  octx.fillStyle = 'rgba(0,0,0,.55)';
  octx.fillRect(x - largura / 2, yTopo, largura, 5);
  octx.fillStyle = cor;
  octx.fillRect(x - largura / 2, yTopo, largura * Math.max(0, pct), 5);
}

function desenharMinimapa(px, py) {
  const mw = 170, mh = 128;
  const mx = overlay.width - mw - 12, my = overlay.height - mh - 12;
  octx.fillStyle = 'rgba(20,16,10,.8)';
  octx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  const ex = mw / MUNDO.largura, ey = mh / MUNDO.altura;
  for (const z of ZONAS) {
    octx.fillStyle = z.cor;
    octx.fillRect(mx + z.x * ex, my + z.y * ey, z.w * ex, z.h * ey);
  }
  for (const n of NPCS) {
    octx.fillStyle = n.forja ? '#ff8844' : '#ffe98a';
    octx.fillRect(mx + n.x * ex - 2, my + n.y * ey - 2, 4, 4);
  }
  for (const j of estado.jogadores) {
    octx.fillStyle = j.id === meuId ? '#ffffff' : '#7ec8a9';
    const jx = j.id === meuId ? px : j.x;
    const jy = j.id === meuId ? py : j.y;
    octx.beginPath();
    octx.arc(mx + jx * ex, my + jy * ey, 3, 0, Math.PI * 2);
    octx.fill();
  }
}
