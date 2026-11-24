<div align="center">

# 🏢 Merge do Escritório

**Um auto battler casual de navegador, com humor de escritório.**
Monte sua equipe, funda três cópias para evoluir e sobreviva às rodadas contra mais três jogadores.

![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)
![Phaser](https://img.shields.io/badge/Phaser-3.90-8b5cf6)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Node](https://img.shields.io/badge/Node-22%2B-339933?logo=node.js&logoColor=white)
![Vitest](https://img.shields.io/badge/testes-Vitest-6e9f18?logo=vitest&logoColor=white)

</div>

---

## 🎮 O jogo

Quatro jogadores por partida (as vagas livres são preenchidas por bots), partidas de **6 a 10 minutos**, só no navegador.
A cada rodada você **prepara** a equipe e depois assiste ao **combate automático** contra um adversário. Quem perde um combate perde vidas; quem fica sem vidas é eliminado. Vence o último de pé.

### Como funciona uma rodada

1. **Preparação.** Receba moedas (mais juros sobre as economizadas), compre personagens na loja, organize o tabuleiro e a reserva. Cartas da loja podem ser **congeladas** para a próxima rodada.
2. **Fusão.** Três cópias iguais viram uma de ⭐⭐ (e três de ⭐⭐ viram ⭐⭐⭐): mais vida e mais dano.
3. **Sinergias.** Cada personagem pertence a uma sinergia (**Operacional**, **Gestão** ou **Caos**, e dá para criar outras). Reunir 2 ou 4 do mesmo grupo no tabuleiro ativa bônus de equipe. A distribuição **rotaciona a cada 2 dias**, então a estratégia nunca fica velha.
4. **Combate.** Tudo é automático: movimento, alvo, ataques e habilidades. Clique ou arraste uma unidade para ver o **alcance de ataque**.
5. **Resultado.** Vidas perdidas, eliminações e próxima rodada.

### Extras

- 🏗️ **Torre:** estrutura rara na loja que rende moedas enquanto estiver de pé. Os inimigos podem atacá-la, e se for destruída some para sempre.
- 🧑‍💼 **Elenco com habilidades próprias:** do tanque que "senta para descansar" ao **Derson**, que cria um clone provocador.
- 🎲 **Regras de sala:** vidas extras, mais tempo de preparação ou de combate, mais dinheiro e mais status.

---

## ✨ Recursos

| | |
| --- | --- |
| **Multiplayer** | Servidor WebSocket autoritativo, hub com **lista de salas públicas**, **partida rápida**, salas **públicas ou privadas**, **senha** opcional e **regras de sala**. |
| **Contra bots** | Partida completa no próprio navegador, sem servidor. |
| **Determinismo** | O combate roda em passos fixos com semente: o resultado oficial é igual para todos. |
| **Dados editáveis** | Personagens, habilidades, sinergias e configuração são **dados validados** (Zod), não código. |
| **Painel de admin** | Cria e edita personagens e sinergias por formulário ou JSON, envia **sprites (PNG)**, importa por texto e baixa uma **referência** do que dá para criar. Ao publicar, os jogadores conectados recebem o aviso para recarregar. |
| **Balanceamento por testes** | Faixas de vitória por personagem, por sinergia e por partida são verificadas automaticamente. |

---

## 🚀 Começando

**Requisitos:** [Node.js](https://nodejs.org/) 22 ou mais novo.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. Na tela inicial, **Jogar contra bots** já funciona sem mais nada.

### Jogar em rede

Em outro terminal, suba o servidor de partidas:

```bash
npm run server
```

No jogo, informe seu nome, conecte em `ws://localhost:8787` e use o hub (partida rápida, criar sala ou entrar numa da lista). Para jogar com outras pessoas da mesma rede local:

```bash
npm run server -- --lan
```

> ⚠️ O servidor **não tem login de jogador nem HTTPS**. Use só em rede de confiança.

### Painel de administração

Defina um usuário e uma senha (mínimo de 8 caracteres) **no ambiente**, nunca em arquivo do projeto, e suba o servidor:

```powershell
$env:ADMIN_USERNAME = "seu-usuario"
$env:ADMIN_PASSWORD = "uma-senha-forte"
npm run server
```

Com o `npm run dev` ligado, abra `http://localhost:5173/admin`. O conteúdo editado e os sprites ficam em `server-data/` (fora do controle de versão). Sem essas variáveis, o painel fica desligado.

---

## 🧰 Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento do Vite (jogo em `/`, painel em `/admin`) |
| `npm run server` | Servidor de partidas (WebSocket + API do painel), em `127.0.0.1:8787` |
| `npm test` | Todos os testes (inclui o balanceamento, que roda milhares de combates) |
| `npm run typecheck` · `npm run lint` | Verificações de tipos e de estilo |
| `npm run build` | Verifica os tipos e gera `dist/` |
| `npm run sim -- --matches 6000 --units 5 --seed 31` | Simulador de combates em lote (vitórias por personagem) |
| `npm run sim:games -- --games 200` | Simulador de partidas completas com 4 bots |

---

## 🧱 Arquitetura

```
src/
├── core/         regras da partida (loja, economia, fusão, rodadas, sinergias, torre)  ← lógica pura
├── combat/       simulação de combate determinística e habilidades                     ← lógica pura
├── shared/       hexágonos, tabuleiro, projeção, aleatoriedade com semente             ← lógica pura
├── data/         esquemas (Zod) e conteúdo padrão: personagens, sinergias, configuração
├── multiplayer/  protocolo, salas, servidor WebSocket, API do admin e cliente de rede
├── rendering/    cenas do Phaser: hub, partida, painéis, sprites e animações
└── admin/        painel de administração (formulários, importação, referência)
admin/            página HTML do painel
tools/            servidor e simuladores
```

Princípios que o projeto segue:

- **O servidor é a única fonte da verdade.** O cliente só envia intenções (comprar, mover, vender, ficar pronto) e desenha o que recebe.
- **`core`, `combat` e `shared` não conhecem Phaser, rede nem Firebase** (o ESLint barra esses imports). Por isso são testados sem navegador.
- **A interface não sabe se a partida é local ou em rede:** a cena conversa com uma `MatchSession`, implementada pela partida contra bots (`LocalMatchSession`) e pela partida em rede (`RemoteMatchSession`).
- **Dados antes de código:** um personagem novo é um JSON validado; só comportamentos realmente novos pedem código.

---

## 🧪 Testes e balanceamento

`npm test` cobre regras, combate, protocolo, servidor real (com clientes WebSocket), painel e interface (modelos de tela). As faixas de balanceamento ficam em `src/core/balance/balanceBands.ts`: por exemplo, cada personagem deve vencer entre **42% e 58%** dos combates e uma partida com bots deve durar entre 5 e 10 rodadas. Se um teste de balanceamento quebrar depois de mexer num dado, ajuste o dado, não a faixa.

---

## ☁️ Hospedagem (em andamento)

O plano é publicar a **página do jogo e o `/admin`** como site estático (GitHub Pages e/ou Firebase Hosting). O **servidor de partidas é um processo Node com WebSocket** e precisa de outro lugar para rodar (seu PC com túnel, uma VM gratuita ou um serviço pago). Falta fazer:

- [ ] Configurar o `base` do Vite para o endereço do GitHub Pages
- [ ] Liberar a origem da página publicada no servidor (hoje só aceita páginas locais ou de rede privada)
- [ ] Servir o servidor por HTTPS/WSS (o jogo e o admin usam o campo "Endereço do servidor")
- [ ] Guardar `server-data/` em disco que não seja apagado a cada reinício

Detalhes e alternativas estão em [`o-que-falta.md`](o-que-falta.md).

---

## 📚 Documentação

| Arquivo | Conteúdo |
| --- | --- |
| [`merge-do-escritorio-gdd(1).md`](merge-do-escritorio-gdd(1).md) | Game Design Document original |
| [`decisoes-de-design.md`](decisoes-de-design.md) | Decisões tomadas durante o desenvolvimento (regras, balanceamento, servidor, admin, hub) |
| [`o-que-falta.md`](o-que-falta.md) | Estado atual, pendências e armadilhas conhecidas |

---

## 🗺️ Status

Funcionando: combate, partida completa, loja com congelamento, fusão, sinergias com rotação, torre, regras de sala, multiplayer com hub, painel de administração e sprites.
Em aberto: reconexão no meio da partida, HTTPS e hospedagem pública, arte final e sons, tela de espectador.

<div align="center">

Feito com 🥤 e muitas reuniões que poderiam ser um e-mail.

</div>
