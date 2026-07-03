# ✝️ Caminho da Fé — MMORPG Gospel

Um MMORPG online 3D de navegador, do Jardim do Éden ao Livro de Daniel. Multiplayer em tempo real com Node.js + Socket.IO e renderização 3D estilo blocos com Three.js (WebGL). O game design completo (7 atos narrativos, pactos, milagres) está em [game_config.json](game_config.json) — o servidor lê esse arquivo na inicialização.

## Sistema de Fé 🙏

A **Fé** (0–1000) é o atributo central. Estados: **Retidão** (80%+, +10% de dano), **Tímido** (40–79%) e **Caído** (<40%, aflige Culpa). Missões concedem Fé; pecados a destroem.

**Orações** (roll de resposta divina de 1 a 100 — silêncio, bênção menor, bênção parcial, milagre ou intervenção divina; orar às margens do Jordão dá +15 no roll):
- **1 — Súplica**: cura e escudo conforme a resposta (cooldown 60 s)
- **2 — Gratidão**: só até 15 s após uma vitória; +Fé e +20% XP (cooldown 30 s)
- **3 — Arrependimento**: diante de um profeta (Moisés ou Daniel); restaura 50% da Fé perdida e purifica pecados (cooldown 10 min)

**Ídolos de Ouro** 🐂 (em Jericó e a oeste): oferecem +50 shekels em troca de −50 Fé e o debuff Idolatria (bloqueia ganho de Fé e penaliza orações por 10 min). Pressione E duas vezes para ceder... ou afaste-se.

## Milagres (teclas 4 e 5)

- **4 — Dividir Águas** (Fé 400+, cooldown 3 min): abre o Rio Jordão por 20s — a água central baixa e muros de água sobem nas margens, revelando um caminho a nado por qualquer ponto do rio, não só a ponte
- **5 — Coluna de Fogo** (Fé 300+, cooldown 90s): dano em área (40) a todos os inimigos num raio de 220, cura 20% do HP máximo de todos os aliados próximos, com coluna de fogo e luz visíveis por 6s

## Pactos (teclas 6–9)

**Pactos Bíblicos** progressivos — desbloqueados automaticamente por **Nível + Piedade**:

| Pacto | Nível | Piedade | Bônus | Visão |
|-------|-------|---------|-------|-------|
| **Adâmico** | 1 | 0 | Cura básica | Início automático |
| **Noético** | 2 | 30 | +20% velocidade | Pequeno avanço |
| **Abraâmico** | 4 | 100 | +20% loot de moedas | Prosperidade |
| **Mosaico** | 6 | 220 | Acesso a Dividir Águas/Coluna de Fogo | Poder divino |
| **Davídico** | 8 | 400 | +25% de dano | Autoridade |
| **Danielico** | 10 | 600 | **OBJETIVO FINAL** — Imune a debuffs, proteção contra fogo | Retidão Plena |

**Ativar um pacto com teclas 6–9** (conforme quantos você desbloqueou). O pacto ativo aparece no HUD em azul. Ao atingir **Pacto Danielico**, você vê uma tela de vitória épica: **JORNADA DE FÉ — CONCLUÍDA**.

## Objetivo do Jogo 🎯

Uma **campanha de 19 missões em cadeia** (estilo World of Warcraft) que atravessa a Bíblia — do Jardim do Éden à Fornalha Ardente da Babilônia — e culmina em dois desafios finais:

1. **Derrotar o Guarda da Fornalha** (boss, missão "A Fornalha Ardente")
2. **Alcançar o Pacto Danielico** (nível 10 + 600 Piedade)

## Campanha e Missões (estilo WoW)

- **Marcadores nos NPCs**: ❗ = missão disponível · ❓ = missão pronta para entregar
- **Até 4 missões ativas** no diário simultaneamente
- **Tipos variados**: matar, coletar itens no mundo, falar com outro NPC (mensageiro) e explorar locais marcados com ▼
- **Cadeias por zona**, cada uma levando à próxima (breadcrumbs):

| Ato | Zona | Nível | NPC | Missões |
|-----|------|-------|-----|---------|
| 1 | Jardim do Éden (NE) | 1 | Adão e Eva | frutos, serpentes do Éden |
| 2 | Vale de Elá (NO) | 2 | Davi | gigantes, pedras lisas |
| 3 | Deserto do Sinai (N) | 3 | Moisés | maná, serpentes ardentes, Tábuas da Lei |
| 4 | Cova dos Leões (SO) | 5 | Daniel | leões, explorar o fundo da cova |
| 5 | Jericó (SE) | 6 | Josué | espionar as muralhas, sentinelas |
| Final | Babilônia (extremo SE) | 8 | Sadraque | soldados, a estátua de ouro, **boss Guarda da Fornalha** |

## Como jogar

```bash
npm install
npm start
```

Abra **http://localhost:3000** no navegador. Para jogar com amigos na mesma rede, eles devem acessar `http://SEU_IP:3000`.

## Controles

| Tecla | Ação |
|---|---|
| WASD / Setas | Mover (relativo à câmera, estilo Roblox) |
| Botão direito + arrastar | Girar a câmera ao redor do personagem |
| Scroll do mouse | Zoom in / zoom out |
| Espaço ou clique esquerdo | Atacar |
| E | Falar com NPC / fechar diálogo |
| F | Abrir/fechar a Forja (perto de Bezalel) |
| M | Montar / desmontar |
| Enter | Abrir o chat global |

## O mundo (3600 × 2700)

- **Ciclo de dia e noite** — um dia completo dura 4 minutos, sincronizado para todos os jogadores
- **Rio Jordão** (centro-oeste) — hub: spawn, renascimento, cura lenta, forja e estábulo. Atravesse pela ponte ou com o milagre Dividir Águas
- **Jardim do Éden** (nordeste, nível 1-2) — jardim denso; Serpentes do Éden, Frutos coletáveis; Adão e Eva
- **Vale de Elá** (noroeste, nível 2-3) — Gigantes Filisteus, Pedras Lisas; Davi
- **Deserto do Sinai** (norte, nível 3-4) — Serpentes Ardentes, Maná; Moisés
- **Cova dos Leões** (sudoeste, nível 5-6) — Leões; Daniel
- **Muralhas de Jericó** (sudeste, nível 6-7) — Sentinelas; Josué
- **Babilônia** (extremo sudeste, nível 8-10) — Soldados do Império, o zigurate da **Fornalha Ardente** com o boss **Guarda da Fornalha** (respawn 60s); Sadraque

## Vocações

- 🪨 **Pastor de Ovelhas** — funda de longo alcance, como Davi
- 🛡️ **Guerreiro de Judá** — corpo a corpo, muita vida
- 📜 **Profeta** — equilibrado

## Forja de Bezalel (equipamentos)

No Rio Jordão, perto do spawn, fica **Bezalel, o Artífice** (Êxodo 31). Monstros derrubam **moedas** 🪙; missões também recompensam moedas. Na forja (tecla F):

- **⚔️ Arma** (nível 1–10) — +2 de dano por nível; custo `50 × nível atual`
- **🛡️ Vestimenta** (nível 1–10) — +15 HP e +3,5% de defesa por nível; custo `40 × nível atual`
- **👟 Sandálias** (nível 1–10) — +3% de velocidade por nível; custo `30 × nível atual`
- **🔰 Escudo** (nível 1–10) — −1 de dano recebido por nível; custo `35 × nível atual`

A evolução muda o visual do personagem:
- Arma nível 4+: metal polido · nível 7+: dourada e brilhante
- Vestimenta nível 3+: ombreiras · nível 5+: elmo · nível 8+: aura dourada
- Escudo nível 2+: escudo redondo no braço · nível 7+: escudo dourado
- Nível 10: anúncio de item LENDÁRIO para todo o servidor

## Estábulo de Obede (montarias)

Ao sul do Rio Jordão fica **Obede, o Estalajadeiro**, com seu curral cercado:

- **🫏 Jumento** — 150 moedas · velocidade ×1,6
- **🐪 Camelo** — 500 moedas · velocidade ×1,95

Pressione **M** a qualquer momento para montar/desmontar. O personagem aparece cavalgando para todos os jogadores.

## Progresso salvo

O progresso é salvo automaticamente pelo **nome do herói** (a cada 30 s e ao sair) em `dados/jogadores.json`: XP, nível, moedas, equipamentos, montarias e missões concluídas. Entre de novo com o mesmo nome para continuar de onde parou.

## Sistemas

- Multiplayer em tempo real (posições, combate, equipamentos e chat sincronizados)
- Renderização 3D low-poly (Three.js): sombras, névoa, fogo animado na forja, Monte Sinai, muralhas e torres de Jericó
- Missões com recompensas de XP, moedas e versículos bíblicos
- Níveis e progressão (XP por mob derrotado e missão)
- Defesa por armadura reduz o dano recebido (até 35%)
- IA de mobs com patrulha, perseguição e desistência
- Coleta de Maná (+10 HP), morte e renascimento no Rio Jordão
- Chat global com mensagens de sistema, minimapa e HUD
