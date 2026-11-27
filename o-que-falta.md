# Merge do Escritório — o que falta e como continuar

Este documento reúne o que ainda não foi feito e o que quem continuar precisa saber para não refazer decisões. As decisões de design já tomadas estão em `decisoes-de-design.md` (Seções 1–13); o GDD original é `merge-do-escritorio-gdd(1).md`.

## 1. Estado atual

Funciona e está testado (typecheck, lint, build e todos os testes limpos):

- **Combate determinístico** (`src/combat/`): passo fixo de 50 ms, `SeededRandom`, habilidades guiadas por dados, estados, invocações, armadilhas.
- **Partida completa contra 3 bots** no navegador (`src/rendering/`, `src/core/game/`): loja, economia, fusão, sinergias com rotação, rodadas, vidas, resultado e tela final.
- **Balanceamento por testes** (`src/core/balance/`): faixas-alvo em `balanceBands.ts`.
- **Servidor WebSocket autoritativo** (`src/multiplayer/`, `npm run server`): salas, bots nas vagas livres, cronômetros, limites e validação. Testado com clientes `ws`.

- **Cliente de rede** (`src/multiplayer/client/`, `src/rendering/scenes/LobbyScene.ts`): saguão, partida em rede e retorno ao saguão. Detalhes na Seção 14 do `decisoes-de-design.md`.

- **Painel `/admin`** (`admin/index.html`, `src/admin/`, API em `src/multiplayer/host/adminApi.ts`): login único por variáveis de ambiente, edição do conteúdo em JSON, publicação com aviso aos jogadores (Seção 17 do `decisoes-de-design.md`).
- **Congelar oferta, alcance de ataque e torre** (Seção 15) e o personagem **Derson** (Seção 16, inativo por padrão).

Não existe ainda: reconexão nem login de jogador.

Comandos:

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Vite em `http://localhost:5173` (saguão: partida local contra bots ou em rede) |
| `npm test` | Todos os testes (~60 s; os de balanceamento rodam milhares de combates) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Verificações |
| `npm run sim -- --matches 6000 --units 5 --seed 31 [--tier caos:1]` | Simulador de combates em lote |
| `npm run sim:games -- --games 200` | Simulador de partidas completas com 4 bots |
| `npm run server [-- --lan] [-- --port N]` | Servidor de rede (padrão: só `127.0.0.1:8787`). Com `ADMIN_USERNAME` e `ADMIN_PASSWORD` definidos (senha de 8+ caracteres) liga o painel; o conteúdo editado fica em `server-data/content.json` |
| `http://localhost:5173/admin` | Painel de administração (com `npm run dev` e o servidor no ar) |

### Entrega de 25/11/2026 (Seção 21 do `decisoes-de-design.md`)

Os itens do documento de requisitos do dono foram implementados. Typecheck, lint, build e 633 testes limpos. **Publicado na VPS em 2026-11-26**, a partir da branch `versao-2` (a `main` guarda a versão anterior). Servidor e página precisam ser atualizados juntos.

**Conferido no navegador** (servidor local): saguão e galeria (desktop e 667×375), sala de 2, compra e posicionamento, espectador, painel (abas "Sprites e ícones" e "Em andamento", encerrar sala) e "Sair" em rede; o subagente da tela conferiu partida contra bots em 1280×720, 844×390, 667×375 e 375×812.

**Falta conferir:**
- Celular de verdade (toque, arrasto, desempenho) e o som (ninguém ouviu).
- Desenho dos ataques em foice, tracejada, círculo e semicírculo, um a um.
- Envio de um sprite real pelo painel e o resultado na partida; arrastar na prévia; painel em tela estreita.
- Partida com pessoas em máquinas diferentes e uma partida de 8 até o fim.

**Pendências conhecidas:**
- A galeria e a prévia do painel ainda desenham o boneco provisório como cápsula; no jogo ele é de perfil. Os tamanhos do boneco estão copiados em `src/admin/spriteAdjust.ts` (origem: `src/rendering/sprites/unitTexture.ts`).
- Equilíbrio: a duração e os personagens não foram calibrados para mesas de 2, 3, 5 e 8 jogadores.
- Um `content.json` já publicado mantém os valores gravados nele (por exemplo, loja e reserva de 3).
- Espectador: um jogador pode assistir à própria sala em outra aba.
- `config.tower.compensationOnLoss` é editado no JSON da aba Configuração.

### Ajustes seguintes (Seção 22 do `decisoes-de-design.md`)

- Conferido no navegador: foice para cima e para baixo sob o personagem, área do Matheus, nitidez com 1 pixel por pixel (também ao redimensionar no meio da partida), e preparação, detalhes e combate em 667×375.
- Falta conferir: celular de verdade; o resultado da rodada e a confirmação de saída no modo compacto; sprites enviados grandes, reduzidos muitas vezes na tela, podem serrilhar.
- Equilíbrio (Seções 23 a 25): vantagem do 1º lugar, torre, João Lucas e Moço ajustados. Em aberto: uma unidade de 2 estrelas decide quase sempre o combate (e atualizar a loja a 1 moeda deve antecipá-la); duas sinergias de nível 1 rendem mais que uma de nível 2; Wilian ficou como o mais fraco em combate de 1 estrela (perto de 44%).

## 2. Regras de trabalho (do `~/.claude/CLAUDE.md` do dono do projeto)

- Repositórios de código: git só para leitura. Nada de branch, commit, push, PR, checkout, reset, stash, rebase ou merge. A pasta do projeto não é um repositório git hoje.
- Nunca tocar na `master` da origin.
- Mensagens de commit e descrições de PR sem `Co-Authored-By` e sem rodapé do Claude.
- Editar código só para o que foi pedido, com mudanças mínimas. Reaproveitar antes de criar.
- Nunca escrever segredo (senha, token, chave, string de conexão) em código, nota ou commit.
- Legibilidade acima de eficiência: nomes descritivos, retorno antecipado, métodos curtos, sem recursão (se inevitável, sufixo `Recursivo` e comentário com o caso-base).
- Só perguntar ao dono o que o código e as notas não respondem.
- O dono liberou decisões de design autônomas, desde que registradas em `decisoes-de-design.md`.
- Determinismo: só os **dados brutos** (resultado do combate, vidas, colocação) precisam ser iguais entre clientes. As animações não precisam acompanhar de forma exata.

## 3. Arquitetura que não pode ser quebrada

- `src/core`, `src/combat` e `src/shared` são lógica pura. Não podem importar `phaser`, `firebase`, `@rendering`, `@multiplayer` nem `@admin` (o ESLint barra isso).
- `src/multiplayer` pode importar `core`, `combat` e `data`. `src/rendering` pode importar o protocolo (`src/multiplayer/protocol/`) para tipos, mas não código do servidor (`host/`, `rooms/`), que usa módulos do Node.
- Aliases: `@core @combat @rendering @multiplayer @admin @data @shared`.
- O combate não conhece sinergias: o `core` calcula os `TeamBonuses` de cada unidade e os entrega em `UnitSpec.bonuses`.
- Casas do tabuleiro: coordenadas axiais, grade lógica de 12 linhas × 5 colunas (linhas 0–5 lado A, 6–11 lado B), desenhada deitada. As unidades de um jogador ficam sempre no referencial do lado A; quem luta como lado B tem as casas espelhadas (`mirrorCell`).
- A `Scene` do Phaser já tem a propriedade `game`; por isso o campo do jogo em `GameScene` se chama `match`.
- O servidor é a única fonte da verdade. Cliente só envia intenções e nunca decide resultado.

## 4. Etapa 4 — cliente de rede (feita; sobras)

Feita: `GameScene` conduzida por uma `MatchSession` (local ou remota), saguão, partida em rede e volta ao saguão (Seção 14 do `decisoes-de-design.md`). Para jogar em rede: `npm run server`, `npm run dev`, abrir o saguão, criar a sala e iniciar; outros jogadores entram com o código.

O que ficou de fora:

- **Reconexão:** quem cai vira bot e não pode voltar. Seria preciso um token de sessão por jogador (gerado no servidor, guardado no cliente) e um estado `connected` que volte a `true`. Não escrever o token em arquivo versionado. Hoje o cliente mostra "Conexão perdida" e leva ao saguão.
- **Espectador:** quem assiste pelo hub tem o modo espectador (Seção 21); o jogador eliminado continua na própria tela e precisa sair para assistir a outra pessoa.
- **Computador lento:** se a animação não acompanha o relógio do servidor, a cena pula o resultado daquela rodada (ver Seção 14). Pode valer um botão "pular animação" ou um tempo máximo de combate no cliente.
- **Hub de salas (Seção 18):** a lista pública não tem busca nem filtro e mostra até 50 salas; as regras da sala não podem ser mudadas depois de criada; não há expulsar jogador nem passar o anfitrião de volta; a senha da sala viaja sem criptografia (sem TLS). Quem cai de uma partida não volta (ver Reconexão).
- **Teste entre duas máquinas:** o modo `--lan` ainda não foi testado entre duas máquinas. O endereço padrão do cliente é `ws://<host da página>:8787`; numa página `https` o navegador bloqueia `ws://` (não há TLS).
- **Sem login e sem TLS:** aceitável só na rede de confiança. Uma sala por vez por conexão e nenhuma lista de salas públicas.
- **Hora do servidor:** `Room` usa `scheduler.nowMs()` para o índice de rotação das sinergias (2 dias a partir de `2026-01-01T00:00:00Z`); o relógio da máquina do servidor precisa estar certo. O cliente calcula a contagem de rotação com o relógio dele.
- **Dados do jogo no cliente:** o cliente usa o elenco e a configuração padrão do código. Quando o `/admin` permitir editar, o servidor terá de enviá-los no `match_started` (ou o cliente os carrega de um arquivo servido).
- **Interface em rede:** sem testes automatizados (Phaser). Verificado à mão no navegador: criar sala, iniciar, comprar, mover, pronto, combate com o tabuleiro girado, resultado, próxima rodada, perda de conexão, retorno ao saguão. A compra por arrastar e soltar não foi exercitada (só clique e clique).

## 5. Etapa 5 — painel `/admin` (feita; sobras)

Feita: ver a Seção 17 do `decisoes-de-design.md`. Para usar: defina `ADMIN_USERNAME` e `ADMIN_PASSWORD` no ambiente (PowerShell: `$env:ADMIN_USERNAME='...'; $env:ADMIN_PASSWORD='...'; npm run server`), rode `npm run dev` e abra `http://localhost:5173/admin`. Nunca escreva a senha em arquivo do projeto.

O que ficou de fora:

- **Formulários nas outras abas:** personagens e sinergias já têm formulário, importação por JSON e referência; a distribuição de sinergias tem seletores. Só a configuração (economia, loja, rodadas, torre) e a regra de rotação ainda são JSON validado. O "ataque aleatório" ainda é editado no JSON avançado do personagem.
- **Balanceamento de sinergias com tamanhos diferentes:** os testes medem o nível 1 e o 2 de cada sinergia, mas não o efeito de uma sinergia ter 5 personagens e outra 4 (mais personagens ao alcance = nível 2 mais fácil). Vale observar ao criar sinergias novas e medir com `npm run sim -- --tier <sinergia>:1`.
- **Histórico e desfazer:** o servidor guarda só a versão vigente. Seria útil guardar as últimas versões e permitir voltar.
- **Medição antes de publicar:** o painel não roda os testes de balanceamento. Depois de mexer em números, rode `npm test` e `npm run sim` com o conteúdo editado (copie `server-data/content.json` para os padrões ou carregue-o numa ferramenta) antes de confiar.
- **Modo local:** a partida contra bots no navegador usa o conteúdo empacotado com o jogo, não o do servidor.
- **TLS:** a senha do admin trafega sem criptografia; use só em rede de confiança ou atrás de um proxy HTTPS.
- **Sprites:** o painel envia PNGs (personagens e auxiliares) e o jogo em rede os usa; a partida local contra bots usa o desenho provisório. Não há animação própria nem imagem para sinergias, e o `server-data/sprites` cresce a cada envio (versões antigas não são apagadas).
- **Publicação na VPS (Seção 20 do `decisoes-de-design.md`, passo a passo em `docs/hospedagem-do-servidor.md`):** **no ar desde 2026-11-24**, atrás do nginx que já existia na VPS, com HTTPS do certbot (renovação automática) e um endereço provisório do sslip.io. Conferido na VPS: construção das duas imagens, `Caddyfile` com o Caddy de verdade, configuração de nginx do guia, `/health`, conexão `wss` com o endereço já preenchido, partida rápida e início de partida contra bots; o outro projeto seguiu respondendo. **Falta conferir:** login no painel (depende de o dono pôr usuário e senha no `.env`), se uma publicação sobrevive a `docker compose restart servidor` e uma partida com pessoas em máquinas diferentes. As partes do guia para Caddy, Apache e proxy em contêiner nunca foram executadas.
- **Painel em produção:** o `/admin` é um arquivo estático (servido pelo Vite no desenvolvimento e pelo Caddy na VPS). O servidor do jogo só expõe a API.

## 6. Etapa 6 — polimento e balanceamento

- **Duração do combate:** média de ~21 s com 5 unidades e limite de 35 s (Seção 21).
- **Estrelas 2 e 3:** os testes de balanceamento usam só unidades de 1 estrela. Medir o peso de 2★ (×2,5) e 3★ (×6), e o custo de chegar lá.
- **Bots:** simples (priorizam cópias e seguem a ordem da loja). Partidas só entre bots podem esconder problemas de economia que jogadores reais explorariam.
- **Margens apertadas:** ver as pendências da entrega de 25/11/2026, na Seção 1.
- **Selo de "atualizado" por personagem:** descartado porque a regra de rotação faz todos mudarem de sinergia em toda rotação (Seção 12 do `decisoes-de-design.md`). Reavaliar se a regra mudar.
- **Interface e arte:** os personagens usam texturas geradas por código (`src/rendering/sprites/unitTexture.ts`), sem arte final. O som é sintetizado (`src/rendering/audio/`).
- **WebGL:** no painel de pré-visualização do app o WebGL falha ("Framebuffer status: Incomplete Attachment") e o Phaser cai para Canvas, que funciona. Verificar em um navegador comum com WebGL.
- **Tamanho do pacote:** um único chunk de ~1,4 MB (Phaser). `chunkSizeWarningLimit` está em 1500; dividir só se importar.

## 7. Como medir o balanceamento depois de mexer em dados

1. `npm run sim -- --matches 6000 --units 5 --seed 31` mostra vitória, sobrevivência e usos de habilidade por personagem.
2. `npm run sim -- --matches 3000 --units 5 --seed 21 --tier caos:1` dá o nível de sinergia ao lado A contra o lado B sem bônus (`operacional`, `gestao`, `caos`; nível `0` ou `1`).
3. `npm run sim:games -- --games 200 --seed 5` mostra rodadas, minutos estimados e vitórias por lugar da mesa.
4. `npm test` confirma as faixas de `src/core/balance/balanceBands.ts`. Se um teste quebrar depois de uma mudança de dados, ajuste o dado, não a faixa (a menos que o design tenha mudado).

Faixas atuais: vitórias por personagem 42–58% (times de 5), 40–60% (7) e 38–62% (3); lado A 46–54%; duração média 15–25 s; estouro de tempo ≤ 12%; empates ≤ 2%; nível 1 de sinergia 54–63%; nível 2 60–72% e maior que o 1; partida de 4 bots entre 5 e 10 rodadas, 6–10 min e 12–40% de vitórias por lugar.

## 8. Mapa dos arquivos principais

| Área | Arquivos |
| --- | --- |
| Regras da partida | `src/core/game/Game.ts`, `botMatch.ts`, `gameBatch.ts`, `combatSetup.ts` |
| Ações do jogador | `src/core/players/playerActions.ts`, `playerState.ts`, `botStrategy.ts` |
| Economia, loja, fusão, rodadas | `src/core/economy/`, `shop/`, `fusion/`, `rounds/` |
| Sinergias e rotação | `src/core/synergies/synergies.ts`, `rotation.ts`, `describe.ts` |
| Combate | `src/combat/engine/CombatSimulation.ts`, `abilities/`, `units/`, `simulation/batch.ts` |
| Dados | `src/data/defaults/` (padrões) e `src/data/schemas/` (validação) |
| Interface | `src/rendering/scenes/GameScene.ts`, `PreparationView.ts`, `ui/`, `viewModels/` |
| Servidor | `src/multiplayer/host/` (`GameServer`, `MatchController`, `scheduler`, `originPolicy`, `rateLimiter`), `rooms/`, `protocol/` |
| Ferramentas | `tools/simulate.ts`, `simulateGames.ts`, `server.ts` |
| Apoio a testes | `src/core/testSupport.ts` (`makeGame`, `giveUnit`, `cellAt`), `src/multiplayer/host/scheduler.ts` (`ManualScheduler`) |

## 9. Armadilhas já encontradas

- `Scene.game` e `Scene.data` do Phaser colidem com campos de mesmo nome; use `match` e `sceneData`.
- `this.sys.isActive()` ainda é falso dentro de `create()`; para saber se a cena está montada use uma flag própria (como em `LobbyScene`).
- O Phaser sobrescreve o `display` do elemento raiz de um `add.dom(...)`; ponha o painel (que usa flex) dentro de um invólucro.
- No Windows, parar `npm run server` pelo gerenciador pode deixar o `node` filho vivo na porta 8787; confira com `Get-NetTCPConnection -LocalPort 8787`.
- O conteúdo do servidor é validado ao ser lido do arquivo; se `server-data/content.json` ficar inválido o servidor sobe com os padrões e avisa no log. Apague o arquivo para voltar aos padrões de vez.
- Ao mudar o formato do `hello` ou das mensagens, aumente `PROTOCOL_VERSION` (hoje 4): o cliente recusa servidor de outra versão.
- No painel de pré-visualização o Canvas roda a ~2 quadros por segundo; para conferir resultado e fim de partida, pule a animação (`scene.playback.advanceTo(60000)` pelo console).
- Retomar uma partida parada na tela de resultado exige `startNextRound()` antes de `resolveCombats()` (já tratado em `playMatchWithBots`).
- Efeitos temporários criados em tween precisam de `markTransient` / `destroyTransientEffects`, senão sobram textos e efeitos órfãos depois de `tweens.killAll()`.
- O teste `behaviors.test.ts` de 120 sementes precisa do tempo limite de 60 s para não estourar com a máquina carregada. Os testes de balanceamento usam `LONG_TEST_TIMEOUT_MS`.
- Testes que dependem do dano ou da vida de um personagem devem ler o valor do elenco (como `attackDamageOf` em `abilities.test.ts` e `HEALTH_PER_POINT`), não repetir o número, senão qualquer ajuste de balanceamento os quebra.
- Em Windows o `ws` pode reportar 1006 em vez de 1009 no cliente quando o servidor derruba uma mensagem grande demais; o teste aceita os dois.
