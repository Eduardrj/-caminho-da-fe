// ============================================================
//  AVENTURA BÍBLICA MMO — Servidor
//  Node.js + Express + Socket.IO
// ============================================================
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// Configuração do jogo (game design em game_config.json)
// ------------------------------------------------------------
const CONFIG = require('./game_config.json');
const FE = CONFIG.faith_system.faith_points;           // { min, max, starting_value }
const ORACOES = {};
for (const p of CONFIG.prayer_system.prayer_types) {
  if (p.implemented) ORACOES[p.id] = p;
}
const DEBUFFS_PECADO = {};
for (const d of CONFIG.sin_system.sin_debuffs) DEBUFFS_PECADO[d.id] = d;
const IDOLO_CFG = CONFIG.server_config.idols;
const MILAGRES = {};
for (const m of CONFIG.miracle_system.miracles) {
  if (m.implemented) MILAGRES[m.id] = m;
}
const PACTOS = {};
for (const p of CONFIG.covenant_system.covenants) {
  PACTOS[p.id] = p;
}
let aguasAbertasAte = 0; // milagre Dividir Águas: timestamp até quando o Jordão pode ser atravessado a nado

// ------------------------------------------------------------
// Persistência (progresso salvo pelo nome do herói)
// ------------------------------------------------------------
const DIR_DADOS = path.join(__dirname, 'dados');
const ARQ_JOGADORES = path.join(DIR_DADOS, 'jogadores.json');
fs.mkdirSync(DIR_DADOS, { recursive: true });

let salvos = {};
try {
  salvos = JSON.parse(fs.readFileSync(ARQ_JOGADORES, 'utf8'));
} catch { salvos = {}; }

function salvarJogador(j) {
  salvos[j.nome.toLowerCase()] = {
    nome: j.nome, classe: j.classe,
    xp: j.xp, moedas: j.moedas,
    fe: j.fe, piedade: j.piedade,
    pactoAtivo: j.pactoAtivo, pactosDesbloqueados: j.pactosDesbloqueados,
    nivelArma: j.nivelArma, nivelArmadura: j.nivelArmadura,
    nivelSandalias: j.nivelSandalias, nivelEscudo: j.nivelEscudo,
    montarias: j.montarias, montariaAtiva: j.montariaAtiva,
    questsFeitas: j.questsFeitas,
    quests: j.quests || [],
  };
}

function gravarDisco() {
  try {
    fs.writeFileSync(ARQ_JOGADORES, JSON.stringify(salvos, null, 2));
  } catch (e) { console.error('Erro ao salvar:', e.message); }
}
setInterval(() => {
  for (const j of Object.values(jogadores)) salvarJogador(j);
  gravarDisco();
}, 30000);

// ------------------------------------------------------------
// Definição do mundo
// ------------------------------------------------------------
const MUNDO = { largura: 3600, altura: 2700 };
const SPAWN = { x: 1080, y: 900 };

// Rio que corta o Jordão (intransponível, exceto pela ponte)
const RIO = { x1: 1155, x2: 1245, y1: 650, y2: 1150, ponteY1: 870, ponteY2: 930 };
function dentroAgua(x, y) {
  if (Date.now() < aguasAbertasAte) return false;
  return x > RIO.x1 && x < RIO.x2 && y > RIO.y1 && y < RIO.y2 &&
         !(y > RIO.ponteY1 && y < RIO.ponteY2);
}

// Ciclo de dia e noite (4 minutos = um dia completo)
const CICLO_DIA = 240000;

const ZONAS = [
  { id: 'jordao',    nome: 'Rio Jordão',         x: 950,  y: 650,  w: 500,  h: 500, cor: '#7ec8a9', nivel: '1+' },
  { id: 'eden',      nome: 'Jardim do Éden',     x: 2500, y: 0,    w: 1100, h: 600, cor: '#6fbf73', nivel: '1-2' },
  { id: 'ela',       nome: 'Vale de Elá',        x: 0,    y: 0,    w: 1100, h: 600, cor: '#8aa85e', nivel: '2-3' },
  { id: 'sinai',     nome: 'Deserto do Sinai',   x: 1300, y: 0,    w: 1100, h: 600, cor: '#d9b36c', nivel: '3-4' },
  { id: 'leoes',     nome: 'Cova dos Leões',     x: 0,    y: 1200, w: 1100, h: 600, cor: '#a08a6a', nivel: '5-6' },
  { id: 'jerico',    nome: 'Muralhas de Jericó', x: 1300, y: 1200, w: 1100, h: 600, cor: '#c2a58a', nivel: '6-7' },
  { id: 'babilonia', nome: 'Babilônia',          x: 2500, y: 2100, w: 1100, h: 600, cor: '#8a7a9a', nivel: '8-10' },
];

const CLASSES = {
  pastor:   { nome: 'Pastor de Ovelhas', hp: 100, dano: 9,  alcance: 170, vel: 4.2, cor: '#4f8fdb', arma: 'Funda de Davi' },
  guerreiro:{ nome: 'Guerreiro de Judá', hp: 140, dano: 15, alcance: 70,  vel: 3.8, cor: '#c0553d', arma: 'Espada de Judá' },
  profeta:  { nome: 'Profeta',           hp: 110, dano: 11, alcance: 120, vel: 4.0, cor: '#9b6fc3', arma: 'Cajado Profético' },
};

const NIVEL_MAX_EQUIP = 10;
const custoArma = (n) => 50 * n;
const custoArmadura = (n) => 40 * n;
const custoSandalias = (n) => 30 * n;
const custoEscudo = (n) => 35 * n;

const MONTARIAS = {
  jumento: { nome: 'Jumento', preco: 150, mult: 1.6 },
  camelo:  { nome: 'Camelo',  preco: 500, mult: 1.95 },
};

const NPCS = [
  { id: 'adao',     nome: 'Adão',                  x: 2700, y: 200,  cor: '#c89a6a', fala: 'O Senhor plantou este jardim... cuide bem dele.' },
  { id: 'eva',      nome: 'Eva',                   x: 3250, y: 420,  cor: '#d9a8a0', fala: 'Cuidado com a serpente, peregrino.' },
  { id: 'davi',     nome: 'Davi',                  x: 350,  y: 300,  cor: '#e8c95a', fala: 'O Senhor é o meu pastor; nada me faltará.' },
  { id: 'moises',   nome: 'Moisés',                x: 1850, y: 250,  cor: '#e0e0e0', profeta: true, fala: 'O Senhor pelejará por vós.' },
  { id: 'daniel',   nome: 'Daniel',                x: 350,  y: 1500, cor: '#7fd1d9', profeta: true, fala: 'O meu Deus enviou o seu anjo.' },
  { id: 'josue',    nome: 'Josué',                 x: 1850, y: 1500, cor: '#d98c5f', fala: 'Eu e a minha casa serviremos ao Senhor.' },
  { id: 'sadraque', nome: 'Sadraque',              x: 2650, y: 2250, cor: '#c8b8ff', fala: 'Ainda que Ele não nos livre, não serviremos a outros deuses.' },
  { id: 'bezalel',  nome: 'Bezalel, o Artífice',   x: 1330, y: 780,  cor: '#d97f4f', forja: true },
  { id: 'obede',    nome: 'Obede, o Estalajadeiro',x: 1060, y: 1070, cor: '#8fbf6f', estabulo: true },
];

// ------------------------------------------------------------
// Missões estilo WoW: cadeias por zona, tipos variados,
// múltiplas ativas, marcadores ❗/❓ nos NPCs
// tipo: matar | coletar | falar (concluída no NPC alvo) | explorar
// ------------------------------------------------------------
const QUESTS = [
  // ── ATO 1: Jardim do Éden (nível 1) ──
  { id: 'eden1', npc: 'adao', titulo: 'Os Frutos do Jardim', tipo: 'coletar', alvo: 'fruto', qtd: 3,
    xp: 60, moedas: 30, fe: 8, nivelMin: 1,
    descricao: 'Colete 3 Frutos do Jardim espalhados pelo Éden.',
    versiculo: '"De toda árvore do jardim comerás livremente." — Gênesis 2:16' },
  { id: 'eden2', npc: 'adao', requer: 'eden1', titulo: 'A Companheira', tipo: 'falar', alvo: 'eva', qtd: 1,
    xp: 40, moedas: 20, fe: 5, nivelMin: 1,
    descricao: 'Leve os frutos a Eva, do outro lado do jardim.',
    versiculo: '"Não é bom que o homem esteja só." — Gênesis 2:18' },
  { id: 'eden3', npc: 'eva', requer: 'eden2', titulo: 'A Serpente Anda Solta', tipo: 'matar', alvo: 'serpente_eden', qtd: 4,
    xp: 90, moedas: 50, fe: 10, nivelMin: 1,
    descricao: 'Serpentes rastejam entre as árvores. Derrote 4 Serpentes do Éden.',
    versiculo: '"Ora, a serpente era o mais astuto dos animais." — Gênesis 3:1' },
  { id: 'eden4', npc: 'eva', requer: 'eden3', titulo: 'Expulsos para o Oeste', tipo: 'falar', alvo: 'davi', qtd: 1,
    xp: 50, moedas: 20, fe: 5, nivelMin: 1,
    descricao: 'O caminho segue para o oeste, além do Jordão. Procure Davi no Vale de Elá.',
    versiculo: '"O Senhor Deus o lançou fora do jardim do Éden." — Gênesis 3:23' },

  // ── ATO 2: Vale de Elá (nível 2) ──
  { id: 'ela1', npc: 'davi', titulo: 'O Desafio do Vale', tipo: 'matar', alvo: 'gigante', qtd: 3,
    xp: 120, moedas: 80, fe: 12, nivelMin: 2,
    descricao: 'Derrote 3 Gigantes Filisteus no Vale de Elá.',
    versiculo: '"Eu vou contra ti em nome do Senhor." — 1 Samuel 17:45' },
  { id: 'ela2', npc: 'davi', requer: 'ela1', titulo: 'Cinco Pedras Lisas', tipo: 'coletar', alvo: 'pedra', qtd: 5,
    xp: 110, moedas: 60, fe: 10, nivelMin: 2,
    descricao: 'Recolha 5 Pedras Lisas do ribeiro do vale.',
    versiculo: '"Escolheu para si cinco pedras lisas do ribeiro." — 1 Samuel 17:40' },
  { id: 'ela3', npc: 'davi', requer: 'ela2', titulo: 'Rumo ao Deserto', tipo: 'falar', alvo: 'moises', qtd: 1,
    xp: 60, moedas: 25, fe: 5, nivelMin: 3,
    descricao: 'Moisés guia o povo no Deserto do Sinai, a nordeste. Apresente-se a ele.',
    versiculo: '"Fala aos filhos de Israel que marchem." — Êxodo 14:15' },

  // ── ATO 3: Deserto do Sinai (nível 3) ──
  { id: 'sinai1', npc: 'moises', titulo: 'Pão do Céu', tipo: 'coletar', alvo: 'mana', qtd: 5,
    xp: 100, moedas: 60, fe: 10, nivelMin: 3,
    descricao: 'Colete 5 porções de Maná no Deserto do Sinai.',
    versiculo: '"Eis que vos farei chover pão dos céus." — Êxodo 16:4' },
  { id: 'sinai2', npc: 'moises', requer: 'sinai1', titulo: 'Serpentes Ardentes', tipo: 'matar', alvo: 'serpente', qtd: 6,
    xp: 140, moedas: 80, fe: 12, nivelMin: 3,
    descricao: 'As serpentes ardentes afligem o povo. Derrote 6 delas.',
    versiculo: '"O Senhor mandou serpentes ardentes entre o povo." — Números 21:6' },
  { id: 'sinai3', npc: 'moises', requer: 'sinai2', titulo: 'As Tábuas da Lei', tipo: 'falar', alvo: 'josue', qtd: 1,
    xp: 80, moedas: 30, fe: 8, nivelMin: 4,
    descricao: 'Leve a palavra da Lei a Josué, ao sul, diante das muralhas de Jericó.',
    versiculo: '"Escreve estas palavras." — Êxodo 34:27' },

  // ── ATO 4: Cova dos Leões (nível 5) ──
  { id: 'cova1', npc: 'daniel', titulo: 'Fé na Cova', tipo: 'matar', alvo: 'leao', qtd: 4,
    xp: 150, moedas: 100, fe: 15, nivelMin: 5,
    descricao: 'Enfrente 4 Leões na Cova dos Leões.',
    versiculo: '"O meu Deus enviou o seu anjo e fechou a boca dos leões." — Daniel 6:22' },
  { id: 'cova2', npc: 'daniel', requer: 'cova1', titulo: 'O Fundo da Cova', tipo: 'explorar', ponto: { x: 250, y: 1700 }, qtd: 1,
    xp: 120, moedas: 60, fe: 12, nivelMin: 5,
    descricao: 'Desça sem medo até o fundo da Cova dos Leões, no extremo sudoeste.',
    versiculo: '"Não temas, porque eu sou contigo." — Isaías 41:10' },
  { id: 'cova3', npc: 'daniel', requer: 'cova2', titulo: 'Coragem dos Justos', tipo: 'matar', alvo: 'leao', qtd: 6,
    xp: 180, moedas: 110, fe: 15, nivelMin: 5,
    descricao: 'Prove sua coragem: derrote mais 6 Leões.',
    versiculo: '"O justo é ousado como o leão." — Provérbios 28:1' },

  // ── ATO 5: Muralhas de Jericó (nível 6) ──
  { id: 'jerico1', npc: 'josue', titulo: 'Espiando as Muralhas', tipo: 'explorar', ponto: { x: 2100, y: 1500 }, qtd: 1,
    xp: 130, moedas: 70, fe: 10, nivelMin: 6,
    descricao: 'Infiltre-se além das muralhas de Jericó e observe o inimigo.',
    versiculo: '"Enviou Josué dois homens, secretamente, como espias." — Josué 2:1' },
  { id: 'jerico2', npc: 'josue', requer: 'jerico1', titulo: 'A Queda das Muralhas', tipo: 'matar', alvo: 'sentinela', qtd: 6,
    xp: 200, moedas: 130, fe: 15, nivelMin: 6,
    descricao: 'Derrote 6 Sentinelas de Jericó.',
    versiculo: '"Gritou o povo, e as muralhas caíram." — Josué 6:20' },
  { id: 'jerico3', npc: 'josue', requer: 'jerico2', titulo: 'Rumo ao Exílio', tipo: 'falar', alvo: 'sadraque', qtd: 1,
    xp: 90, moedas: 40, fe: 10, nivelMin: 7,
    descricao: 'Um império sombrio se levanta no sudeste. Encontre Sadraque na Babilônia.',
    versiculo: '"Serão levados à Babilônia." — 2 Reis 20:17' },

  // ── ATO FINAL: Babilônia (nível 8) ──
  { id: 'bab1', npc: 'sadraque', titulo: 'Soldados do Império', tipo: 'matar', alvo: 'soldado', qtd: 6,
    xp: 220, moedas: 150, fe: 18, nivelMin: 8,
    descricao: 'Os soldados de Nabucodonosor patrulham a cidade. Derrote 6 deles.',
    versiculo: '"Livrará o vosso Deus das minhas mãos?" — Daniel 3:15' },
  { id: 'bab2', npc: 'sadraque', requer: 'bab1', titulo: 'Não Nos Curvaremos', tipo: 'explorar', ponto: { x: 3300, y: 2450 }, qtd: 1,
    xp: 180, moedas: 100, fe: 20, nivelMin: 8,
    descricao: 'Aproxime-se da Fornalha Ardente sem se curvar à estátua de ouro.',
    versiculo: '"Não serviremos a teus deuses." — Daniel 3:18' },
  { id: 'bab3', npc: 'sadraque', requer: 'bab2', titulo: 'A Fornalha Ardente', tipo: 'matar', alvo: 'guarda', qtd: 1,
    xp: 300, moedas: 250, fe: 50, nivelMin: 9, final: true,
    descricao: 'Derrote o Guarda da Fornalha e prove que a Fé não se dobra ao fogo.',
    versiculo: '"O nosso Deus pode livrar-nos da fornalha de fogo ardente." — Daniel 3:17' },
];
const MAX_QUESTS_ATIVAS = 4;
function questDef(id) { return QUESTS.find(q => q.id === id); }
function concluirEmDe(q) { return q.tipo === 'falar' ? q.alvo : q.npc; }

// Ídolos de ouro: tentação — shekels em troca de Fé
const IDOLOS = [
  { id: 'idolo_jerico', x: 1750, y: 1400 },
  { id: 'idolo_nod', x: 520, y: 960 },
  { id: 'idolo_babilonia', x: 3000, y: 2350 },
];

const TIPOS_MOB = {
  serpente_eden: { nome: 'Serpente do Éden',   hp: 18,  dano: 3,  vel: 2.2, raio: 12, xp: 10,  moedas: 4,   cor: '#5a8a3a', zona: 'eden' },
  gigante:       { nome: 'Gigante Filisteu',   hp: 70,  dano: 10, vel: 1.6, raio: 26, xp: 35,  moedas: 14,  cor: '#6b4f3a', zona: 'ela' },
  serpente:      { nome: 'Serpente Ardente',   hp: 30,  dano: 5,  vel: 2.6, raio: 12, xp: 15,  moedas: 6,   cor: '#b8552e', zona: 'sinai' },
  leao:          { nome: 'Leão',               hp: 45,  dano: 8,  vel: 2.8, raio: 18, xp: 25,  moedas: 10,  cor: '#c98f3d', zona: 'leoes' },
  sentinela:     { nome: 'Sentinela de Jericó',hp: 50,  dano: 7,  vel: 2.2, raio: 16, xp: 28,  moedas: 11,  cor: '#8a4a4a', zona: 'jerico' },
  soldado:       { nome: 'Soldado da Babilônia', hp: 65, dano: 10, vel: 2.3, raio: 16, xp: 34, moedas: 14,  cor: '#5a5a8a', zona: 'babilonia' },
  guarda:        { nome: '🔥 Guarda da Fornalha', hp: 300, dano: 16, vel: 2.0, raio: 30, xp: 200, moedas: 150, cor: '#a83a1a', zona: 'babilonia', boss: true },
};

// ------------------------------------------------------------
// Estado do jogo
// ------------------------------------------------------------
const jogadores = {}; // socket.id -> jogador
const mobs = {};      // id -> mob
const itens = {};     // id -> item (maná)
let proximoId = 1;

function zonaDe(idZona) {
  return ZONAS.find(z => z.id === idZona);
}

function pontoAleatorioNaZona(z) {
  return {
    x: z.x + 60 + Math.random() * (z.w - 120),
    y: z.y + 60 + Math.random() * (z.h - 120),
  };
}

function criarMob(tipo) {
  const def = TIPOS_MOB[tipo];
  const z = zonaDe(def.zona);
  const p = def.boss ? { x: 3300, y: 2450 } : pontoAleatorioNaZona(z);
  const id = 'm' + (proximoId++);
  mobs[id] = {
    id, tipo, x: p.x, y: p.y,
    hp: def.hp, maxHp: def.hp,
    alvo: null, ultimoAtaque: 0,
    origem: { x: p.x, y: p.y },
  };
  return mobs[id];
}

// Itens coletáveis por zona (usados em missões de coleta)
const TIPOS_ITEM = {
  mana:  { nome: 'Maná',            zona: 'sinai', hp: 10 },
  fruto: { nome: 'Fruto do Jardim', zona: 'eden',  hp: 5 },
  pedra: { nome: 'Pedra Lisa',      zona: 'ela',   hp: 0 },
};

function criarItem(tipo) {
  const z = zonaDe(TIPOS_ITEM[tipo].zona);
  const p = pontoAleatorioNaZona(z);
  const id = 'i' + (proximoId++);
  itens[id] = { id, tipo, x: p.x, y: p.y };
  return itens[id];
}

// População inicial
for (let i = 0; i < 8; i++) criarMob('serpente_eden');
for (let i = 0; i < 6; i++) criarMob('gigante');
for (let i = 0; i < 8; i++) criarMob('serpente');
for (let i = 0; i < 7; i++) criarMob('leao');
for (let i = 0; i < 8; i++) criarMob('sentinela');
for (let i = 0; i < 8; i++) criarMob('soldado');
criarMob('guarda'); // boss único da Fornalha
for (let i = 0; i < 10; i++) criarItem('mana');
for (let i = 0; i < 6; i++) criarItem('fruto');
for (let i = 0; i < 7; i++) criarItem('pedra');

// ------------------------------------------------------------
// Progressão e equipamentos
// ------------------------------------------------------------
function nivelPorXp(xp) {
  return Math.floor(Math.sqrt(xp / 60)) + 1;
}
function maxHpDe(j) {
  return CLASSES[j.classe].hp + (j.nivel - 1) * 20 + (j.nivelArmadura - 1) * 15;
}
function danoDe(j) {
  let dano = CLASSES[j.classe].dano + Math.floor((j.nivel - 1) * 1.5) + (j.nivelArma - 1) * 2;
  if (estadoFeDe(j) === 'retidao') dano = Math.round(dano * 1.1); // Retidão fortalece
  if (j.bencaoDanoAte && j.bencaoDanoAte > Date.now()) dano = Math.round(dano * 1.5);
  dano = Math.round(dano * bonusPactoDano(j)); // Pacto Davídico dá +25% de dano
  return dano;
}
function velDe(j) {
  const mont = j.montariaAtiva ? MONTARIAS[j.montariaAtiva].mult : 1;
  const culpa = temDebuff(j, 'culpa') ? 0.9 : 1;
  return CLASSES[j.classe].vel * (1 + (j.nivelSandalias - 1) * 0.03) * mont * culpa * bonusVelPacto(j);
}
function danoRecebido(j, dano) {
  const reducao = Math.min(0.35, (j.nivelArmadura - 1) * 0.035);
  let resultado = Math.max(1, Math.round(dano * (1 - reducao)) - (j.nivelEscudo - 1));
  if (j.escudoAte && j.escudoAte > Date.now()) resultado = Math.max(1, Math.round(resultado * 0.5));
  return resultado;
}

// ------------------------------------------------------------
// Sistema de Fé
// ------------------------------------------------------------
function estadoFeDe(j) {
  const pct = (j.fe / FE.max) * 100;
  if (pct >= 80) return 'retidao';
  if (pct >= 40) return 'timido';
  return 'caido';
}

function debuffsAtivos(j) {
  const agora = Date.now();
  j.debuffs = (j.debuffs || []).filter(d => d.expiraEm > agora);
  return j.debuffs;
}

function temDebuff(j, id) {
  return debuffsAtivos(j).some(d => d.id === id);
}

function darDebuff(j, id, socket) {
  const def = DEBUFFS_PECADO[id];
  if (!def || temDebuff(j, id)) return;
  j.debuffs.push({ id, expiraEm: Date.now() + def.duration_minutes * 60000 });
  if (socket) socket.emit('sistema', `⚠️ Você foi afligido por: ${def.name} (${def.duration_minutes} min)`);
}

function darFe(j, qtd, socket, motivo) {
  // Idolatria bloqueia ganho de fé
  if (qtd > 0 && temDebuff(j, 'idolatria')) qtd = 0;
  const antes = j.fe;
  j.fe = Math.max(FE.min, Math.min(FE.max, j.fe + qtd));
  if (qtd > 0) {
    j.piedade = (j.piedade || 0) + Math.round(qtd * 1.4);
    if (socket) desbloquearPactosDisponiveis(j, socket);
  }
  if (socket && j.fe !== antes) {
    socket.emit('sistema', `${qtd > 0 ? '✨' : '🥀'} Fé ${qtd > 0 ? '+' : ''}${j.fe - antes}${motivo ? ' — ' + motivo : ''}`);
  }
  // Cair em estado Caído aflige com Culpa
  if (qtd < 0 && estadoFeDe(j) === 'caido' && !temDebuff(j, 'culpa')) {
    darDebuff(j, 'culpa', socket);
  }
}

// Roll de resposta divina: clamp( d100 + min(80, fé/25) + modificadores - pecado, 1, 100 )
function rollDivino(j) {
  let r = 1 + Math.floor(Math.random() * 100);
  r += Math.min(80, Math.floor(j.fe / 25));
  const jordao = zonaDe('jordao');
  if (j.x > jordao.x && j.x < jordao.x + jordao.w && j.y > jordao.y && j.y < jordao.y + jordao.h) {
    r += 15; // orar às margens do Jordão (lugar santo)
  }
  if (debuffsAtivos(j).length > 0) r -= 30;
  return Math.max(1, Math.min(100, r));
}

function darXp(jogador, xp, socket) {
  const nivelAntes = jogador.nivel;
  if (jogador.xpBuffAte && jogador.xpBuffAte > Date.now()) xp = Math.round(xp * 1.2);
  jogador.xp += xp;
  jogador.nivel = nivelPorXp(jogador.xp);
  if (jogador.nivel > nivelAntes) {
    jogador.maxHp = maxHpDe(jogador);
    jogador.hp = jogador.maxHp;
    socket.emit('sistema', `✨ Você alcançou o nível ${jogador.nivel}!`);
    io.emit('sistema', `⭐ ${jogador.nome} alcançou o nível ${jogador.nivel}!`);
    desbloquearPactosDisponiveis(jogador, socket);
  }
}

// ------------------------------------------------------------
// Motor de missões (estilo WoW: várias ativas, cadeias, tipos)
// ------------------------------------------------------------
function enviarQuests(j, socket) {
  socket.emit('quests', {
    ativas: j.quests.map(q => {
      const def = questDef(q.id);
      return {
        id: q.id, titulo: def.titulo, descricao: def.descricao,
        tipo: def.tipo, progresso: q.progresso, qtd: def.qtd, pronta: q.pronta,
        entregarA: NPCS.find(n => n.id === concluirEmDe(def)).nome,
      };
    }),
    feitas: j.questsFeitas,
  });
}

function questAtiva(j, id) { return j.quests.find(q => q.id === id); }

function questsDisponiveis(j, npcId) {
  return QUESTS.filter(q =>
    q.npc === npcId &&
    !j.questsFeitas.includes(q.id) &&
    !questAtiva(j, q.id) &&
    j.nivel >= q.nivelMin &&
    (!q.requer || j.questsFeitas.includes(q.requer))
  );
}

function progressoQuest(j, tipo, alvo, socket) {
  let mudou = false;
  for (const q of j.quests) {
    if (q.pronta) continue;
    const def = questDef(q.id);
    if (def.tipo !== tipo || def.alvo !== alvo) continue;
    q.progresso++;
    mudou = true;
    if (q.progresso >= def.qtd) {
      q.progresso = def.qtd;
      q.pronta = true;
      const npcEntrega = NPCS.find(n => n.id === concluirEmDe(def));
      socket.emit('sistema', `📜 "${def.titulo}" completa! Volte a ${npcEntrega.nome} para receber a recompensa.`);
    }
  }
  if (mudou) enviarQuests(j, socket);
}

function completarQuest(j, def, socket, npc) {
  j.quests = j.quests.filter(q => q.id !== def.id);
  j.questsFeitas.push(def.id);
  darXp(j, def.xp, socket);
  j.moedas += def.moedas;
  darFe(j, def.fe || 10, socket, 'missão cumprida');
  socket.emit('dialogo', {
    npc: npc.nome,
    texto: `Muito bem, servo fiel! ${def.versiculo} (+${def.xp} XP, +${def.moedas} shekels, +${def.fe || 10} Fé)`,
  });
  io.emit('sistema', `🏆 ${j.nome} completou a missão "${def.titulo}"!`);
  if (def.final) {
    io.emit('sistema', `🔥🕊️ ${j.nome} venceu a FORNALHA ARDENTE e completou a campanha do Caminho da Fé! ✝️`);
  }
  enviarQuests(j, socket);
  salvarJogador(j);
}

// ------------------------------------------------------------
// Sistema de Pactos
// ------------------------------------------------------------
function pactoDisponivel(j, id) {
  const def = PACTOS[id];
  return j.nivel >= def.required_level && j.piedade >= def.required_piety;
}

function desbloquearPactosDisponiveis(j, socket) {
  let desbloqueado = false;
  for (const id of Object.keys(PACTOS)) {
    if (j.pactosDesbloqueados.includes(id)) continue;
    if (pactoDisponivel(j, id)) {
      j.pactosDesbloqueados.push(id);
      socket.emit('sistema', `🕊️ ✨ PACTO DESBLOQUEADO: ${PACTOS[id].name}!`);
      if (id === 'danielico') {
        io.emit('sistema', `🔥🕊️ ${j.nome} alcançou o PACTO DANIELICO — o pico da jornada de Fé!`);
      }
      desbloqueado = true;
    }
  }
  return desbloqueado;
}

function ativarPacto(j, id, socket) {
  if (!PACTOS[id] || !j.pactosDesbloqueados.includes(id)) return false;
  j.pactoAtivo = id;
  const def = PACTOS[id];
  socket.emit('sistema', `✨ Pacto Ativo: ${def.name}`);
  salvarJogador(j);
  return true;
}

// Bônus passivos dos pactos (aplicados durante o combate/movimentação)
function bonusPactoDano(j) {
  if (j.pactoAtivo === 'davidico') return 1.25;
  return 1;
}

function bonusVelPacto(j) {
  if (j.pactoAtivo === 'noetico') return 1.2;
  if (j.pactoAtivo === 'abraamico') return 1.1;
  return 1;
}

function bonusDropPacto(j) {
  if (j.pactoAtivo === 'abraamico') return 1.2;
  return 1;
}

// ------------------------------------------------------------
// Conexões
// ------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('entrar', ({ nome, classe }) => {
    nome = String(nome || '').trim().slice(0, 16) || 'Peregrino';
    if (!CLASSES[classe]) classe = 'pastor';

    // Restaura progresso salvo pelo nome
    const salvo = salvos[nome.toLowerCase()];
    const base = {
      classe,
      xp: 0, moedas: 0,
      fe: FE.starting_value, piedade: 0,
      pactoAtivo: null, pactosDesbloqueados: ['adamico'],
      nivelArma: 1, nivelArmadura: 1, nivelSandalias: 1, nivelEscudo: 1,
      montarias: [], montariaAtiva: null,
      questsFeitas: [],
    };
    const dados = salvo ? { ...base, ...salvo } : base;

    const j = {
      id: socket.id,
      nome, ...dados,
      x: SPAWN.x + (Math.random() * 120 - 60),
      y: SPAWN.y + (Math.random() * 120 - 60),
      hp: 1, maxHp: 1,
      nivel: nivelPorXp(dados.xp),
      dir: 1, ultimoAtaque: 0, ultimoGolpe: 0,
      debuffs: [], oracoes: {}, ultimaVitoria: 0,
    };
    // Restaura missões ativas salvas (descarta ids que não existem mais)
    j.quests = (dados.quests || []).filter(q => questDef(q.id));
    j.questsFeitas = (j.questsFeitas || []).filter(id => questDef(id));
    j.maxHp = maxHpDe(j);
    j.hp = j.maxHp;
    jogadores[socket.id] = j;

    socket.emit('mundo', {
      MUNDO, ZONAS, NPCS, CLASSES, SPAWN, TIPOS_MOB, MONTARIAS, IDOLOS, PACTOS, QUESTS,
      FE_MAX: FE.max, JOGO: CONFIG.game_info, voce: socket.id,
    });
    enviarQuests(j, socket);
    desbloquearPactosDisponiveis(j, socket);
    if (salvo) {
      socket.emit('sistema', `📖 Bem-vindo de volta, ${nome}! Seu progresso foi restaurado (nível ${j.nivel}, ${j.moedas} shekels).`);
    } else {
      socket.emit('sistema', '🌿 Sua jornada começa no Jardim do Éden, a NORDESTE (siga o minimapa). Procure Adão — ele tem uma missão para você (❗).');
    }
    io.emit('sistema', `🕊️ ${nome} (${CLASSES[j.classe].nome}) entrou na aventura!`);
  });

  socket.on('mover', ({ x, y, dir }) => {
    const j = jogadores[socket.id];
    if (!j || j.hp <= 0) return;
    // Limita a velocidade máxima (anti-teleporte)
    const vel = velDe(j) * 3;
    const dx = Math.max(-vel, Math.min(vel, x - j.x));
    const dy = Math.max(-vel, Math.min(vel, y - j.y));
    let nx = Math.max(20, Math.min(MUNDO.largura - 20, j.x + dx));
    let ny = Math.max(20, Math.min(MUNDO.altura - 20, j.y + dy));
    // Não entra na água (desliza pela margem)
    if (dentroAgua(nx, ny)) {
      if (!dentroAgua(j.x, ny)) nx = j.x;
      else if (!dentroAgua(nx, j.y)) ny = j.y;
      else { nx = j.x; ny = j.y; }
    }
    j.x = nx;
    j.y = ny;
    j.dir = dir;
  });

  socket.on('atacar', () => {
    const j = jogadores[socket.id];
    if (!j || j.hp <= 0) return;
    const agora = Date.now();
    if (agora - j.ultimoAtaque < 450) return;
    j.ultimoAtaque = agora;
    j.golpeEm = agora;

    const def = CLASSES[j.classe];
    let melhor = null, melhorDist = Infinity;
    for (const m of Object.values(mobs)) {
      const d = Math.hypot(m.x - j.x, m.y - j.y);
      if (d < def.alcance + TIPOS_MOB[m.tipo].raio && d < melhorDist) {
        melhor = m; melhorDist = d;
      }
    }
    if (!melhor) return;

    const dano = danoDe(j);
    melhor.hp -= dano;
    melhor.alvo = socket.id;
    io.emit('dano', { alvoTipo: 'mob', id: melhor.id, dano, x: melhor.x, y: melhor.y });

    if (melhor.hp <= 0) {
      const tipoMorto = melhor.tipo;
      const defMob = TIPOS_MOB[tipoMorto];
      delete mobs[melhor.id];
      let ganhoMoedas = defMob.moedas + Math.floor(Math.random() * 5);
      ganhoMoedas = Math.round(ganhoMoedas * bonusDropPacto(j));
      j.moedas += ganhoMoedas;
      j.ultimaVitoria = Date.now();
      socket.emit('sistema', `🪙 +${ganhoMoedas} shekels`);
      darXp(j, defMob.xp, socket);
      progressoQuest(j, 'matar', tipoMorto, socket);
      if (defMob.boss) io.emit('sistema', `⚔️ ${j.nome} derrotou ${defMob.nome}!`);
      // Respawn: 8s (mobs comuns), 60s (boss)
      setTimeout(() => criarMob(tipoMorto), defMob.boss ? 60000 : 8000);
    }
  });

  socket.on('melhorar', (tipo) => {
    const j = jogadores[socket.id];
    if (!j) return;
    // Precisa estar perto do ferreiro Bezalel
    const forja = NPCS.find(n => n.forja);
    if (Math.hypot(forja.x - j.x, forja.y - j.y) > 110) {
      socket.emit('sistema', '🔨 Você precisa estar perto de Bezalel, o Artífice, para forjar.');
      return;
    }
    const slots = {
      arma:      { campo: 'nivelArma',      custo: custoArma,      rotulo: '⚔️ Arma',       extra: '(+2 de dano)' },
      armadura:  { campo: 'nivelArmadura',  custo: custoArmadura,  rotulo: '🛡️ Vestimenta', extra: '(+15 HP, +3,5% defesa)' },
      sandalias: { campo: 'nivelSandalias', custo: custoSandalias, rotulo: '👟 Sandálias',   extra: '(+3% velocidade)' },
      escudo:    { campo: 'nivelEscudo',    custo: custoEscudo,    rotulo: '🔰 Escudo',      extra: '(-1 dano recebido)' },
    };
    const slot = slots[tipo];
    if (!slot) return;
    if (j[slot.campo] >= NIVEL_MAX_EQUIP) { socket.emit('sistema', `${slot.rotulo} já está no nível máximo!`); return; }
    const custo = slot.custo(j[slot.campo]);
    if (j.moedas < custo) { socket.emit('sistema', `🪙 Moedas insuficientes (${j.moedas}/${custo}).`); return; }
    j.moedas -= custo;
    j[slot.campo]++;
    if (tipo === 'armadura') {
      j.maxHp = maxHpDe(j);
      j.hp = Math.min(j.maxHp, j.hp + 15);
    }
    socket.emit('sistema', `${slot.rotulo} forjado(a) para o nível ${j[slot.campo]}! ${slot.extra}`);
    if (j[slot.campo] === NIVEL_MAX_EQUIP) {
      io.emit('sistema', `🔥 ${j.nome} forjou ${slot.rotulo} LENDÁRIO(A) (nível ${NIVEL_MAX_EQUIP})!`);
    }
    salvarJogador(j);
  });

  socket.on('comprar_montaria', (tipo) => {
    const j = jogadores[socket.id];
    if (!j || !MONTARIAS[tipo]) return;
    const estabulo = NPCS.find(n => n.estabulo);
    if (Math.hypot(estabulo.x - j.x, estabulo.y - j.y) > 110) {
      socket.emit('sistema', '🐴 Você precisa estar perto de Obede, o Estalajadeiro.');
      return;
    }
    if (j.montarias.includes(tipo)) { socket.emit('sistema', 'Você já possui essa montaria!'); return; }
    const m = MONTARIAS[tipo];
    if (j.moedas < m.preco) { socket.emit('sistema', `🪙 Moedas insuficientes (${j.moedas}/${m.preco}).`); return; }
    j.moedas -= m.preco;
    j.montarias.push(tipo);
    j.montariaAtiva = tipo;
    socket.emit('sistema', `🐴 Você comprou um ${m.nome}! (velocidade ×${m.mult}) Pressione M para montar/desmontar.`);
    io.emit('sistema', `🐴 ${j.nome} agora cavalga um ${m.nome}!`);
    salvarJogador(j);
  });

  socket.on('montar', () => {
    const j = jogadores[socket.id];
    if (!j || j.montarias.length === 0) return;
    if (j.montariaAtiva) {
      j.montariaAtiva = null;
      socket.emit('sistema', '🚶 Você desmontou.');
    } else {
      // Monta na melhor montaria que possui
      j.montariaAtiva = j.montarias.includes('camelo') ? 'camelo' : j.montarias[0];
      socket.emit('sistema', `🐴 Você montou no ${MONTARIAS[j.montariaAtiva].nome}.`);
    }
  });

  socket.on('falar_npc', (npcId) => {
    const j = jogadores[socket.id];
    if (!j) return;
    const npc = NPCS.find(n => n.id === npcId);
    if (!npc) return;
    if (Math.hypot(npc.x - j.x, npc.y - j.y) > 90) return;

    if (npc.forja) {
      socket.emit('abrir_forja');
      return;
    }
    if (npc.estabulo) {
      socket.emit('abrir_estabulo');
      return;
    }

    // 1) Missões prontas para entregar a este NPC
    for (const q of j.quests) {
      const def = questDef(q.id);
      if (q.pronta && concluirEmDe(def) === npc.id) {
        completarQuest(j, def, socket, npc);
        return;
      }
    }

    // 2) Missões do tipo "falar": conversar com o NPC alvo conclui na hora
    for (const q of j.quests) {
      const def = questDef(q.id);
      if (def.tipo === 'falar' && def.alvo === npc.id && !q.pronta) {
        q.pronta = true;
        completarQuest(j, def, socket, npc);
        return;
      }
    }

    // 3) Oferecer a próxima missão disponível deste NPC
    const disponiveis = questsDisponiveis(j, npc.id);
    if (disponiveis.length > 0) {
      if (j.quests.length >= MAX_QUESTS_ATIVAS) {
        socket.emit('dialogo', { npc: npc.nome, texto: `Teu diário de missões está cheio (${MAX_QUESTS_ATIVAS}). Termina o que começaste e volta a mim.` });
        return;
      }
      const def = disponiveis[0];
      j.quests.push({ id: def.id, progresso: 0, pronta: false });
      enviarQuests(j, socket);
      socket.emit('dialogo', { npc: npc.nome, texto: `📜 ${def.titulo} — ${def.descricao} Que o Senhor te fortaleça!` });
      return;
    }

    // 4) Missão em andamento deste NPC — lembrete
    const emAndamento = j.quests.map(q => questDef(q.id)).find(d => d.npc === npc.id);
    if (emAndamento) {
      const q = questAtiva(j, emAndamento.id);
      socket.emit('dialogo', { npc: npc.nome, texto: `Ainda não terminaste: ${emAndamento.descricao} (${q.progresso}/${emAndamento.qtd})` });
      return;
    }

    // 5) Conversa comum
    const proxima = QUESTS.find(q => q.npc === npc.id && !j.questsFeitas.includes(q.id) && j.nivel < q.nivelMin);
    if (proxima) {
      socket.emit('dialogo', { npc: npc.nome, texto: `${npc.fala || 'A paz do Senhor.'} (Volta a mim no nível ${proxima.nivelMin}.)` });
    } else {
      socket.emit('dialogo', { npc: npc.nome, texto: `Que a paz esteja contigo, ${j.nome}. ${npc.fala || ''}` });
    }
  });

  socket.on('orar', (tipo) => {
    const j = jogadores[socket.id];
    if (!j || j.hp <= 0) return;
    const def = ORACOES[tipo];
    if (!def) return;
    const agora = Date.now();

    const proximaEm = j.oracoes[tipo] || 0;
    if (proximaEm > agora) {
      socket.emit('sistema', `🙏 Espere ${Math.ceil((proximaEm - agora) / 1000)}s antes de orar ${def.name} novamente.`);
      return;
    }
    if (j.fe < def.requires_faith_min) {
      socket.emit('sistema', `🙏 Fé insuficiente para ${def.name} (${j.fe}/${def.requires_faith_min}).`);
      return;
    }
    if (def.must_trigger_after_combat_win &&
        agora - j.ultimaVitoria > (def.combat_win_window_seconds || 15) * 1000) {
      socket.emit('sistema', '🙏 A Gratidão se oferece logo após uma vitória (até 15s).');
      return;
    }
    if (def.requires_npc_prophet) {
      const perto = NPCS.some(n => n.profeta && Math.hypot(n.x - j.x, n.y - j.y) < 110);
      if (!perto) {
        socket.emit('sistema', '🙏 O Arrependimento requer confissão diante de um profeta (Moisés ou Daniel).');
        return;
      }
    }

    j.oracoes[tipo] = agora + def.cooldown_seconds * 1000;
    const r = rollDivino(j);
    let tier, texto;
    if (r <= 20) { tier = 'silencio'; texto = 'Os céus permanecem em silêncio... persevere.'; }
    else if (r <= 50) tier = 'bonus_menor';
    else if (r <= 80) tier = 'bencao_parcial';
    else if (r <= 95) tier = 'milagre';
    else tier = 'intervencao_divina';

    if (tier !== 'silencio') {
      if (tipo === 'suplica') {
        if (tier === 'bonus_menor') {
          j.hp = Math.min(j.maxHp, j.hp + Math.round(j.maxHp * 0.15));
          texto = 'Uma brisa suave restaura suas forças. (+15% HP)';
        } else if (tier === 'bencao_parcial') {
          j.hp = Math.min(j.maxHp, j.hp + Math.round(j.maxHp * 0.3));
          j.escudoAte = agora + 20000;
          texto = 'Uma bênção o envolve! (+30% HP, escudo por 20s)';
        } else if (tier === 'milagre') {
          j.hp = j.maxHp;
          j.escudoAte = agora + 30000;
          texto = '✨ MILAGRE! Cura completa e escudo por 30s!';
        } else {
          j.hp = j.maxHp;
          j.escudoAte = agora + 30000;
          j.bencaoDanoAte = agora + 30000;
          texto = '🔥 INTERVENÇÃO DIVINA! Cura total, escudo e força celestial (+50% dano) por 30s!';
          io.emit('sistema', `🔥 Os céus responderam a ${j.nome} com poder!`);
        }
      } else if (tipo === 'gratidao') {
        darFe(j, 8, null);
        j.xpBuffAte = agora + 60000;
        texto = `Sua gratidão sobe como incenso. (+8 Fé, +20% XP por 60s)${tier === 'intervencao_divina' ? ' Os céus se alegram com você!' : ''}`;
      } else if (tipo === 'arrependimento') {
        const restaurado = Math.floor((FE.max - j.fe) * 0.5);
        j.fe = Math.min(FE.max, j.fe + restaurado);
        j.debuffs = [];
        texto = `O profeta declara: "Teus pecados são perdoados." (+${restaurado} Fé, pecados purificados)`;
        io.emit('sistema', `🕊️ ${j.nome} se arrependeu e foi restaurado.`);
      }
    } else if (tipo === 'arrependimento') {
      // Arrependimento sincero nunca é totalmente em vão
      darFe(j, 10, null);
      texto = 'O profeta o consola: "Continua buscando ao Senhor." (+10 Fé)';
    }

    socket.emit('oracao_resultado', { tipo, tier, texto });
  });

  socket.on('milagre', (id) => {
    const j = jogadores[socket.id];
    if (!j || j.hp <= 0) return;
    const def = MILAGRES[id];
    if (!def) return;
    const agora = Date.now();

    const proximaEm = j.oracoes[id] || 0;
    if (proximaEm > agora) {
      socket.emit('sistema', `🙏 Espere ${Math.ceil((proximaEm - agora) / 1000)}s antes de invocar ${def.name} novamente.`);
      return;
    }
    if (j.fe < def.required_faith) {
      socket.emit('sistema', `🙏 Fé insuficiente para ${def.name} (${j.fe}/${def.required_faith}).`);
      return;
    }
    j.oracoes[id] = agora + def.cooldown_seconds * 1000;

    if (id === 'part_waters') {
      aguasAbertasAte = agora + def.duration_seconds * 1000;
      io.emit('sistema', `🌊 ${j.nome} clamou a Deus, e as águas do Jordão se abriram por ${def.duration_seconds}s!`);
    } else if (id === 'pillar_fire') {
      const raio = 220;
      let atingidos = 0;
      for (const m of Object.values(mobs)) {
        if (Math.hypot(m.x - j.x, m.y - j.y) > raio) continue;
        m.hp -= 40;
        atingidos++;
        io.emit('dano', { alvoTipo: 'mob', id: m.id, dano: 40, x: m.x, y: m.y });
        if (m.hp <= 0) {
          const defMob = TIPOS_MOB[m.tipo];
          const tipoMorto = m.tipo;
          delete mobs[m.id];
          j.moedas += defMob.moedas;
          darXp(j, defMob.xp, socket);
          progressoQuest(j, 'matar', tipoMorto, socket);
          setTimeout(() => criarMob(tipoMorto), defMob.boss ? 60000 : 8000);
        }
      }
      for (const aliado of Object.values(jogadores)) {
        if (aliado.hp <= 0 || Math.hypot(aliado.x - j.x, aliado.y - j.y) > raio) continue;
        aliado.hp = Math.min(aliado.maxHp, aliado.hp + Math.round(aliado.maxHp * 0.2));
      }
      io.emit('milagre_fogo', { x: j.x, y: j.y, expiraEm: agora + def.duration_seconds * 1000 });
      io.emit('sistema', `🔥 ${j.nome} invocou uma Coluna de Fogo! ${atingidos} inimigo(s) atingido(s), aliados próximos curados.`);
    }
  });

  socket.on('tocar_idolo', (idoloId) => {
    const j = jogadores[socket.id];
    if (!j || j.hp <= 0) return;
    const idolo = IDOLOS.find(i => i.id === idoloId);
    if (!idolo || Math.hypot(idolo.x - j.x, idolo.y - j.y) > 90) return;
    if (temDebuff(j, 'idolatria')) {
      socket.emit('sistema', '⚠️ Seu coração ainda está entregue à idolatria.');
      return;
    }
    j.moedas += IDOLO_CFG.shekel_reward;
    darFe(j, -IDOLO_CFG.faith_loss, socket, 'você adorou um ídolo');
    darDebuff(j, 'idolatria', socket);
    socket.emit('sistema', `🪙 +${IDOLO_CFG.shekel_reward} shekels... mas a que custo?`);
    io.emit('sistema', `🐂 ${j.nome} cedeu à tentação do ídolo de ouro...`);
    salvarJogador(j);
  });

  socket.on('ativar_pacto', (id) => {
    const j = jogadores[socket.id];
    if (!j) return;
    if (ativarPacto(j, id, socket)) {
      io.emit('sistema', `✨ ${j.nome} ativou o ${PACTOS[id].name}!`);
    }
  });

  socket.on('chat', (texto) => {
    const j = jogadores[socket.id];
    if (!j) return;
    texto = String(texto || '').trim().slice(0, 200);
    if (!texto) return;
    io.emit('chat', { nome: j.nome, texto });
  });

  socket.on('disconnect', () => {
    const j = jogadores[socket.id];
    if (j) {
      salvarJogador(j);
      gravarDisco();
      io.emit('sistema', `${j.nome} deixou a aventura.`);
      delete jogadores[socket.id];
    }
  });
});

// ------------------------------------------------------------
// Loop do jogo (10 ticks/segundo)
// ------------------------------------------------------------
setInterval(() => {
  const agora = Date.now();

  // IA dos mobs
  for (const m of Object.values(mobs)) {
    const def = TIPOS_MOB[m.tipo];

    // Procura jogador próximo se não tem alvo
    if (!m.alvo || !jogadores[m.alvo] || jogadores[m.alvo].hp <= 0) {
      m.alvo = null;
      for (const j of Object.values(jogadores)) {
        if (j.hp > 0 && Math.hypot(j.x - m.x, j.y - m.y) < 140) {
          m.alvo = j.id;
          break;
        }
      }
    }

    if (m.alvo) {
      const j = jogadores[m.alvo];
      const d = Math.hypot(j.x - m.x, j.y - m.y);
      if (d > 350) {
        m.alvo = null; // desiste
      } else if (d > def.raio + 18) {
        m.x += ((j.x - m.x) / d) * def.vel;
        m.y += ((j.y - m.y) / d) * def.vel;
      } else if (agora - m.ultimoAtaque > 1000) {
        m.ultimoAtaque = agora;
        const dano = danoRecebido(j, def.dano);
        j.hp -= dano;
        j.ultimoGolpe = agora;
        io.emit('dano', { alvoTipo: 'jogador', id: j.id, dano, x: j.x, y: j.y });
        if (j.hp <= 0) {
          j.hp = 0;
          const sock = io.sockets.sockets.get(j.id);
          if (sock) sock.emit('sistema', '💀 Você caiu... Renascendo no Rio Jordão.');
          setTimeout(() => {
            if (!jogadores[j.id]) return;
            j.hp = j.maxHp;
            j.x = SPAWN.x; j.y = SPAWN.y;
          }, 3000);
        }
      }
    } else {
      // Vagueia perto da origem
      if (Math.random() < 0.02) {
        m.vagX = m.origem.x + (Math.random() * 200 - 100);
        m.vagY = m.origem.y + (Math.random() * 200 - 100);
      }
      if (m.vagX != null) {
        const d = Math.hypot(m.vagX - m.x, m.vagY - m.y);
        if (d > 5) {
          m.x += ((m.vagX - m.x) / d) * def.vel * 0.4;
          m.y += ((m.vagY - m.y) / d) * def.vel * 0.4;
        }
      }
    }
  }

  // Coleta de itens + missões de exploração + regeneração no Rio Jordão
  const jordao = zonaDe('jordao');
  for (const j of Object.values(jogadores)) {
    if (j.hp <= 0) continue;
    for (const item of Object.values(itens)) {
      if (Math.hypot(item.x - j.x, item.y - j.y) < 30) {
        delete itens[item.id];
        const defItem = TIPOS_ITEM[item.tipo];
        const tipoItem = item.tipo;
        const sock = io.sockets.sockets.get(j.id);
        if (defItem.hp > 0) j.hp = Math.min(j.maxHp, j.hp + defItem.hp);
        if (sock) {
          sock.emit('sistema', `${tipoItem === 'mana' ? '🍞' : tipoItem === 'fruto' ? '🍎' : '🪨'} Você coletou: ${defItem.nome}!${defItem.hp > 0 ? ` (+${defItem.hp} HP)` : ''}`);
          progressoQuest(j, 'coletar', tipoItem, sock);
        }
        setTimeout(() => criarItem(tipoItem), 6000);
      }
    }
    // Missões de exploração: chegar ao ponto marcado
    for (const q of j.quests || []) {
      if (q.pronta) continue;
      const def = questDef(q.id);
      if (def.tipo !== 'explorar') continue;
      if (Math.hypot(def.ponto.x - j.x, def.ponto.y - j.y) < 100) {
        q.progresso = def.qtd;
        q.pronta = true;
        const sock = io.sockets.sockets.get(j.id);
        if (sock) {
          sock.emit('sistema', `🗺️ Local descoberto! "${def.titulo}" completa — volte a ${NPCS.find(n => n.id === concluirEmDe(def)).nome}.`);
          enviarQuests(j, sock);
        }
      }
    }
    // Cura no Rio Jordão
    if (j.x > jordao.x && j.x < jordao.x + jordao.w &&
        j.y > jordao.y && j.y < jordao.y + jordao.h) {
      if (j.hp < j.maxHp && agora % 1000 < 120) {
        j.hp = Math.min(j.maxHp, j.hp + 3);
      }
    }
  }

  // Transmite o estado
  const estado = {
    hora: (Date.now() % CICLO_DIA) / CICLO_DIA,
    aguasAbertas: agora < aguasAbertasAte,
    jogadores: Object.values(jogadores).map(j => ({
      id: j.id, nome: j.nome, classe: j.classe,
      x: Math.round(j.x), y: Math.round(j.y),
      hp: j.hp, maxHp: j.maxHp, nivel: j.nivel, xp: j.xp,
      moedas: j.moedas,
      fe: j.fe, estadoFe: estadoFeDe(j), piedade: j.piedade,
      pactoAtivo: j.pactoAtivo, pactosDesbloqueados: j.pactosDesbloqueados,
      debuffs: debuffsAtivos(j).map(d => d.id),
      escudo: !!(j.escudoAte && j.escudoAte > agora),
      nivelArma: j.nivelArma, nivelArmadura: j.nivelArmadura,
      nivelSandalias: j.nivelSandalias, nivelEscudo: j.nivelEscudo,
      montarias: j.montarias, montariaAtiva: j.montariaAtiva,
      dir: j.dir, golpeEm: j.golpeEm || 0, ultimoGolpe: j.ultimoGolpe || 0,
    })),
    mobs: Object.values(mobs).map(m => ({
      id: m.id, tipo: m.tipo,
      x: Math.round(m.x), y: Math.round(m.y),
      hp: m.hp, maxHp: m.maxHp,
    })),
    itens: Object.values(itens),
  };
  io.emit('estado', estado);
}, 100);

server.listen(PORT, () => {
  console.log(`⚔️  Aventura Bíblica MMO rodando em http://localhost:${PORT}`);
});
