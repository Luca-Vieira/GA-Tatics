# Merge do Escritório — Decisões de design e técnicas

Complementa o GDD v1.2. Onde houver conflito, este documento prevalece (cada desvio está marcado com **[muda o GDD]**). Todos os números são provisórios e serão ajustados com simulação em lote.

## 1. Determinismo (revisado)

- O **host** executa a simulação oficial e publica **apenas dados brutos**: vencedor, unidades vivas com vida restante, percentual de vida somado de cada lado, duração e vidas perdidas.
- Os demais clientes **não precisam reproduzir o combate bit a bit**. Eles re-simulam localmente (mesma semente e mesmos tabuleiros) só para animar. Ao fim da animação, o estado exibido converge para o resultado oficial: unidades que não constam como sobreviventes somem com um fade rápido, e os números finais vêm do dado oficial.
- Consequência: não há necessidade de aritmética inteira ou ponto fixo, nem de evitar `Math.sin`. Mantêm-se passos fixos de 50 ms e PRNG com semente, porque tornam os testes reproduzíveis na mesma engine e facilitam o balanceamento em lote.
- O teste de aceitação passa a ser: mesma semente + mesmo estado inicial → mesmo resultado, na mesma engine.

## 2. Conversão dos atributos (escala 1–10 → valores de jogo)

| Atributo | Fórmula | Exemplo |
| --- | --- | --- |
| Vida | `150 × v` (era `100 × v`; recalibrada na Seção 13) | Bixo 10 → 1500; Leo 3 → 450 |
| Dano por ataque | `10 × v` | Vinícius 7 → 70 |
| Velocidade de ataque (ataques/s) | `0,4 + 0,15 × v` | Leo 9 → 1,75/s; João Lucas 2 → 0,7/s |
| Alcance | `v` hexágonos | Felipão 4 |
| Mobilidade (hexágonos/s) | `0,5 + 0,25 × v` | Leo 10 → 3,0; João Lucas 2 → 1,0 |

Multiplicadores de estrela (GDD): 1×, 2,5×, 6× sobre vida e dano. Velocidade, alcance e mobilidade não escalam com estrela.

## 3. Tabuleiro **[muda o GDD]**

- 8 linhas × 5 colunas = **40 casas, 20 por jogador** (4 linhas cada), em grade hexagonal "pointy-top" com linhas alternadamente deslocadas (offset odd-r).
- O formato é simétrico por rotação de 180°, então os dois lados são espelhados. 38 casas (19 por lado) não formam uma grade espelhada contígua; 40 sim, e o limite de 7 unidades por rodada continua sendo a restrição real.
- Coordenadas internas em axial `(q, r)`; a conversão para a grade de exibição fica em `shared/`.

## 4. Combate

- **Redução de dano:** multiplicativa. `dano recebido = dano × (1 − resistência) × (1 − redução de habilidade)`, com **teto de 80%** de redução total.
- **Moço (Roleta):** por ataque, 15% erra (0), 45% medíocre (20–40), 40% excelente (80–100). Média ≈ 50, igual a um Dano 5.
- **Empate e tempo limite:** conforme GDD 5.5.
- **Pathfinding:** BFS com desempate fixo (ordem de vizinhos constante e id da unidade como critério final).

## 5. Economia e loja **[muda o GDD em dois pontos]**

- **Início:** 0 moedas; a rodada 1 concede as 5 moedas da tabela (equivale às "5 iniciais" do GDD, sem dobrar).
- **Ordem de cálculo a cada rodada:** juros (1 por 5 moedas guardadas, máx. 2) sobre as moedas do fim da rodada anterior, depois renda da tabela; total limitado a 10.
- **Custos:** comum 3, raro 4, **especial 5** (era 4) e atualizar 2.
- **Raridades do elenco (70/25/5):**
  - Comum (7): Bixo, Vinícius, Felipão, Matheus, Wilian, Wender, Marquinhos.
  - Raro (3): Helder, Gustavo, Leo.
  - Especial (2): João Lucas, Moço.
- **Compra com tudo cheio:** permitida se a compra completar uma fusão (a terceira cópia libera espaço). Caso contrário, bloqueada.

## 6. Duração da partida

- A preparação cai de 40 s para **30 s a partir da rodada 6**.
- **"Horas extras":** a partir da **rodada 10**, quem perde o combate perde **2 vidas** em vez de 1. Garante fim de partida mesmo com 3 jogadores vivos e um único duelo por rodada.

## 7. Rotação de sinergias **[muda o GDD]**

- O **host** lê/gera a distribuição e **grava o mapa completo** em `match/synergyMap` (além do índice). Clientes só leem. Isso elimina divergência por relógio e por mudança de configuração.
- Cada rotação calculada é gravada como registro **imutável** em `gameConfig/synergyHistory/{índice}`. Mudar intervalo, âncora ou semente no admin só vale a partir da próxima fronteira, usando o último registro gravado como base.
- **Sorteio direto, sem rejeição:** com 4 personagens por sinergia e a regra "ninguém repete", a matriz de transferência entre sinergias tem forma `x` (A→B), `x` (B→C), `x` (C→A) e `4−x` nos sentidos opostos, com `x` de 0 a 4. O PRNG com semente `hash(prefixo + índice)` sorteia `x` e depois embaralha quais personagens de cada grupo vão para onde. Sempre válido, sempre determinístico.
- O índice 0 é a distribuição manual da Seção 4.5 do GDD.
- **Revisão (pedido do dono):** as sinergias **não precisam ter o mesmo número de personagens**. A regra passou a ser: cada sinergia com **pelo menos 4 personagens** (o nível 2 pede 4 no tabuleiro), todos os personagens ativos distribuídos, e a quantidade de sinergias pode ser de **3 a 5**. O sorteio fica assim:
  - **3 sinergias do mesmo tamanho:** o sorteio original, sem rejeição (preservado, então o que já existia continua igual).
  - **3 sinergias de tamanhos diferentes** (ex.: 5, 4 e 4): sorteia-se um `x` por sinergia e descarta-se a combinação que deixaria alguma sinergia abaixo de 4; se em 200 tentativas nada servir, cada sinergia envia metade dos seus personagens.
  - **4 ou 5 sinergias:** cada personagem vai para uma das outras sinergias, sorteada com a semente da rotação, descartando a distribuição que deixaria alguma sinergia abaixo de 4 (até 1000 tentativas); se nenhuma servir, usa-se uma divisão cíclica que reparte cada grupo por igual entre as outras sinergias.
  - Em todos os casos continua valendo "ninguém repete" (todos os personagens mudam de sinergia a cada rotação) e o sorteio é determinístico (semente + índice).

## 8. Escolhas de ferramental

- npm; TypeScript em modo estrito; Vite; Phaser 3; Vitest.
- **Zod** para validar personagens, habilidades, sinergias e configuração (os mesmos esquemas servem ao admin).
- **ESLint** com `no-restricted-imports`: `core/`, `combat/` e `shared/` não importam Phaser nem Firebase.
- Firebase modular (Auth anônima para jogadores, Realtime Database, Storage). Em desenvolvimento, usar o Firebase Emulator Suite.
- **Bots simples** (compram o mais barato, posicionam em linha, ficam sempre prontos) para testar partidas completas sem multiplayer.
- **Simulador em lote** (`npm run sim`): roda milhares de combates e emite taxa de vitória por personagem, composição e sinergia. Existe desde a Etapa 2.

## 9. Ordem de entrega

0. Esqueleto + matemática hexagonal + PRNG.
1. Combate offline com dois personagens genéricos.
2. Personagens data-driven, habilidades, 12 personagens, simulador em lote.
3. Partida completa contra bots (loja, fusão, sinergias, rotação, rodadas).
4. Multiplayer com host.
5. Painel `/admin`.
6. Polimento e balanceamento.

## 10. Definições adicionais da Etapa 1

- **Percentual de vida do desempate (GDD 5.5):** vida restante somada do lado ÷ vida máxima somada das unidades que começaram o combate, em %.
- **Ordem de ação:** unidades agem em ordem de id, e a ordem inverte a cada passo de 50 ms, para nenhum lado agir sempre primeiro.
- **Alvo:** permanece o mesmo enquanto estiver vivo; depois, o inimigo mais próximo (empate pelo menor id).
- **Movimento:** uma casa por vez, levando `1 / casas-por-segundo`; a casa de destino é reservada na hora, então a posição lógica nunca fica ambígua. O renderizador só interpola o desenho.
- **Observação de balanceamento:** com 4 contra 4 nos protótipos, o combate dura em média 11,5 s (10% abaixo de 8,9 s, 90% abaixo de 14,5 s), menos que os 20–30 s do GDD. Ajustar vida e dano na Etapa 6, com 7 unidades por lado e as habilidades reais.

## 11. Definições da Etapa 2 (personagens, habilidades e perfis de comportamento)

- **Dados puros:** os 12 personagens ficam em JSON (`src/data/defaults/characters`), validados por Zod ao carregar. O combate só lê dados; nada de personagem é escrito em código, exceto comportamentos "registrados" (ver abaixo).
- **Habilidade = ativação + alvo + efeitos.** Ativações: recarga (com condição: sempre, aliado ferido ou aliado caído), limiar de vida, primeiro golpe no alvo e passiva. Alvos de lançamento: o próprio, alvo atual, inimigo mais próximo e aglomerado de inimigos. Efeitos: dano, cura, estado, armadilha e comportamento registrado.
- **Estados temporários:** veneno, drenagem, lentidão, sono, enfraquecimento, confusão, redução de dano, bônus de velocidade, bônus de dano e descanso. Redução de dano é multiplicativa e limitada a 80%.
- **Comportamentos registrados** (casos que dados não expressam): projétil em L (João Lucas), ataque aleatório (Wender) e velocidade por vida faltando (Gustavo).
- **Perfis de comportamento:** movimento `chase`, `frontline` ou `kite` (recua quando o inimigo mais próximo está perto demais); prioridade de alvo `nearest`, `lowest_health` ou `cluster` (só considera alvos dentro do alcance + 2, senão o mais próximo).
- **Invocações e armadilhas:** não contam como eliminação nem no resultado do combate; invocações expiram por tempo.
- **Atraso inicial das habilidades:** 1,5 s, para ninguém lançar tudo no primeiro passo.
- **Simulador em lote:** `npm run sim -- --matches N --units N --seed N` roda N combates sem interface (2000 combates em ~2 s) e relata vitórias por personagem e duração.
- **Observações de balanceamento:** na Etapa 2 João Lucas estava forte demais, Wilian, Moço e Helder fracos, e a duração média ~11 s. Tudo isso foi tratado na Seção 13.
- **Renderização:** cena consome todos os eventos (dano por causa, cura, estados, projéteis, invocações, armadilhas, nome da habilidade). Os efeitos são só desenho; nada visual influencia a simulação. No painel de pré-visualização do app o WebGL falhou ao iniciar e o Phaser caiu para Canvas, que funciona; isso parece ser limitação do painel, não do código.

## 12. Definições da Etapa 3 (partida completa contra bots)

- **Quem manda em quê:** `core/game/Game.ts` guarda todas as regras da partida e não tem relógio nem Phaser; a rodada avança por chamadas explícitas (`resolveCombats` → `concludeRound` → `startNextRound`). O cronômetro da preparação fica na cena (e, na Etapa 4, no host).
- **Referencial das casas:** as unidades do jogador ficam sempre no referencial do lado A (linhas 0–3). Quem luta como lado B tem as casas espelhadas (`mirrorCell`). Na tela, a metade do jogador é a de baixo (lado B), mesmo lugar onde ele monta a equipe. O jogador humano é sempre o "de baixo" em seus duelos; a ordem oficial (para o host, na Etapa 4) é a da dupla, e os outros clientes só espelham a visão.
- **Compra:** a unidade vai para a reserva; com a reserva cheia, vai para o tabuleiro se houver vaga; com tudo cheio, só vale se completar uma fusão (a unidade some na hora).
- **Fusão:** automática, em cadeia (três de 2★ → 3★). A unidade nova ocupa o lugar da "primeira" do grupo: as do tabuleiro antes das da reserva, e as mais antigas primeiro.
- **Moedas:** o teto de 10 vale só para o recebimento de início de rodada; vender unidades pode passar de 10. Cada loja nova (início da rodada) é grátis; atualizar custa 2.
- **Loja:** sorteio da raridade pelos pesos 70/25/5 e depois do personagem dentro da raridade. Cada jogador tem sua própria sequência de sorteios, derivada de `seed + jogador + rodada`.
- **Posicionamento:** mover para uma casa ocupada troca as duas unidades de lugar. Vender: botão no painel de detalhes ou soltar a unidade sobre a loja.
- **Pareamento:** com 4 jogadores segue AB/CD, AC/BD, AD/BC e repete, pois escolhe sempre o pareamento com menos confrontos repetidos (empate: o mais antigo). Com número ímpar, descansa quem menos descansou.
- **Sinergias no combate:** o combate não conhece sinergias; o núcleo calcula os `TeamBonuses` de cada unidade no início do combate e os entrega no `UnitSpec`. Resistência soma, multiplicadores de dano e velocidade se multiplicam, recarga soma (teto de 90%) e regeneração vira uma taxa só. Amplificação de efeitos positivos vale para a cura de habilidades e para estados benéficos (redução de dano, velocidade, dano) lançados pelo próprio personagem.
- **Rotação:** `rotationIndexAt` e `synergyMappingForIndex` seguem a Seção 7. Como a regra "ninguém repete" faz todos os 12 personagens mudarem de sinergia em toda rotação, **não há selo de "atualizado"** por personagem (seria sempre todos). A partida guarda o mapa vigente na criação e o mantém até o fim.
- **Bots:** compram primeiro o que repete um personagem que já têm e depois o mais barato; levam os mais fortes ao tabuleiro (corpo a corpo na frente, à distância atrás) e ficam sempre prontos.
- **Fim do jogador humano:** se o jogador é eliminado antes do fim, a partida continua só entre os bots, de forma instantânea, para definir a colocação final.
- **Duração medida (800 partidas, 4 bots):** média de 6,9 rodadas, 12,8 s por combate, cerca de 6 minutos por partida (limite inferior do GDD, 6–10 min), nenhuma travada e distribuição de vitórias pelos lugares dentro do esperado. Comando: `npm run sim:games`.

## 13. Balanceamento e servidor de rede

### Testes de balanceamento (`src/core/balance/`)

Os testes rodam milhares de combates simulados e **falham quando um número sai da faixa-alvo**; assim, mexer num personagem ou numa sinergia mostra na hora o que quebrou. As faixas ficam em `balanceBands.ts`. Se um teste falhar depois de uma mudança de dados, ajuste o dado, não a faixa (a não ser que o design tenha mudado).

| O que mede | Faixa | Onde |
| --- | --- | --- |
| Vitórias de cada personagem, times de 5 | 42–58% | `characterBalance.test.ts` |
| Idem, times de 7 / de 3 | 40–60% / 38–62% | `teamSizeBalance.test.ts` |
| Vitórias do lado A (simetria do tabuleiro) | 46–54% | `characterBalance.test.ts` |
| Duração média do combate | 15–25 s | `balanceBands.ts` (todos os testes de combate) |
| Combates que estouram o tempo limite / empates | ≤ 12% / ≤ 2% | idem |
| Toda habilidade ativa é usada (> 0,3 vez por combate) | — | `characterBalance.test.ts` |
| Nível 1 de cada sinergia (bônus no time inteiro contra time sem bônus) | 54–63% de vitórias | `synergyBalance.test.ts` |
| Nível 2 de cada sinergia | 60–72%, e maior que o nível 1 | idem |
| Partida de 4 bots: rodadas / minutos estimados | 5–10 rodadas / 6–10 min | `gameBalance.test.ts` |
| Vitórias por lugar da mesa (4 bots) | 12–40% (25% é o equilíbrio) | idem |
| Partidas travadas | nenhuma | idem |

As medições usam sementes fixas, então o resultado é reproduzível. Ferramentas manuais: `npm run sim -- --matches 6000 --units 5 --seed 31 [--tier caos:1]` e `npm run sim:games -- --games 200`.

### Ajustes feitos para entrar nas faixas

- **Vida por ponto de atributo: 100 → 150** (`HEALTH_PER_POINT`). Com 100 o combate durava ~11 s; com 200 durava 21 s mas 17–21% dos combates estouravam os 30 s. Com 150: ~17 s em média e ~6% de estouros. Ficou abaixo dos 20–30 s do GDD de propósito: os 20–30 s são o tempo reservado à fase, e combates mais longos viram impasse (curas e fuga), não mais emoção.
- **Personagens:** João Lucas dano 10 → 7 (era 70% de vitórias). Wilian vida 4 → 6, dano 4 → 5, recarga 8 → 5 s e sono 2,5 → 3 s. Moço vida 5 → 6 e chances 5% erro / 35% medíocre / 60% excelente. Helder dano 2 → 3. Matheus vida 4 → 5 e veneno 0,35 → 0,5. Gustavo recarga da invocação 10 → 12 s. Vinícius dano 8 → 7. Leo dano 9 → 8.
- **Sinergias:** com a vida maior os bônus de equipe ficaram fortes demais (Caos nível 2 chegava a 86% de vitórias). Novos valores: Operacional 5% de resistência e 1% de vida a cada 3 s (nível 1), 9% e 1,5% (nível 2); Caos +6% de dano e +4% de velocidade de ataque (nível 1), +12% e +8% (nível 2). Gestão ficou como estava.
- **Efeito colateral nos testes:** os testes de habilidades passaram a ler o dano do personagem do próprio elenco, em vez de repetir números do GDD, para não travarem o balanceamento.

### Servidor de rede (`src/multiplayer/`, `npm run server`)

Troca a ideia original (Firebase) por um servidor Node com WebSocket (`ws`) na rede local. O host é a única fonte da verdade: ele roda o `Game`, os cronômetros e os bots; os clientes só mandam intenções e recebem o que podem ver.

- **Protocolo (`protocol/`):** mensagens do cliente validadas com Zod (`create_room`, `join_room`, `leave_room`, `start_match`, `buy`, `refresh_shop`, `sell`, `move`, `set_ready`); campos extras, tipos errados, nomes com caracteres de controle e mensagens acima de 2 KB são recusados. As do servidor são tipos simples (JSON).
- **Salas (`rooms/`):** código de 4 letras sorteado com `crypto.randomInt`. Até 4 pessoas; as vagas livres viram bots. Só o anfitrião inicia. Quem sai no meio da partida é jogado por um bot; se todos saem, a sala fecha. Ao fim, a sala volta ao saguão.
- **Partida (`host/MatchController.ts`):** preparação com cronômetro (40 s, 30 s a partir da rodada 6) que termina antes se todos ficarem prontos; o servidor simula todos os duelos de uma vez e manda a cada jogador o `CombatConfig` do seu duelo e o resultado oficial (o cliente anima o que quiser; o dado bruto é o do servidor). Loja e unidades de cada jogador só vão para ele. A semente da partida é aleatória (`randomBytes`), então não dá para prever as lojas.
- **Segurança:** escuta só em `127.0.0.1` por padrão; abrir para a rede exige `--lan`. Conexões de navegador só valem se a página vier de máquina local ou de rede privada (evita que um site qualquer da internet use o navegador de alguém da rede para entrar). Limites: 64 conexões, 16 salas, 30 mensagens de rajada + 10 por segundo por conexão (50 infrações fecham a conexão), `maxPayload` de 2 KB, batimento a cada 15 s derruba conexões mortas. O servidor não lê arquivos, não executa nada recebido e captura erros por mensagem. **Não há login**: quem alcança a porta joga; use `--lan` só na rede de confiança.
- **Testes:** protocolo, política de origem, limite de mensagens, controlador da partida e das salas (relógio manual) e o servidor real com clientes `ws` na porta 0 (partida de ponta a ponta, mensagens inválidas, origem proibida, limites).
- **Fica para a próxima etapa:** reconexão no meio da partida e o painel `/admin` (o cliente Phaser foi feito na Seção 14).

## 14. Cliente de rede (Etapa 4)

A `GameScene` deixou de falar com o `Game` e passou a falar com uma **sessão** (`MatchSession`, em `src/core/game/MatchSession.ts`). Há duas: a local (`LocalMatchSession`, o `Game` com bots e cronômetro, agora fora da cena e testável sem Phaser) e a remota (`src/multiplayer/client/RemoteMatchSession.ts`, que só envia intenções e aplica o que o servidor devolve). O servidor continua sendo a única fonte da verdade.

- **Contrato da sessão:** a cena chama ações (`buy`, `refreshShop`, `sell`, `move`, `setReady`), `presentationFinished()` e `continueAfterResult()`; a sessão avisa por um ouvinte (`preparationStarted`, `combatStarted`, `roundConcluded`, `matchEnded`, `stateChanged`, `actionFailed`, `fusionHappened`, `connectionLost`). Na sessão local o resultado é aplicado quando a cena termina a animação; na remota o resultado chega do servidor e a cena o guarda até a animação acabar.
- **`MatchView`:** os view models (`viewModels.ts`) passaram a receber `MatchView`, um `Pick<Game, ...>` com só o que a interface lê. O `Game` já cumpre; o cliente remoto monta o mesmo formato (`RemoteMatchState`). Dos outros jogadores o cliente só tem nome, vidas e eliminação; `opponentOf` só responde para o próprio jogador. Elenco, sinergias e configuração vêm dos padrões do código, então servidor e cliente precisam estar na mesma versão (quando o `/admin` existir, o servidor terá de enviar esses dados).
- **Orientação do combate:** o servidor monta cada dupla na ordem do sorteio, e o jogador pode ser o lado A (em cima). Em vez de mudar o servidor, o cliente gira o tabuleiro 180° (`flipBoardProjection`) e troca as cores, para o jogador aparecer sempre embaixo. O resultado oficial não depende disso.
- **Relógio:** a preparação usa `preparationEndsAtMs` e a diferença entre o relógio do servidor e o do cliente medida em cada `round_started`.
- **Cliente lento ou atrasado:** a animação segue o relógio do navegador, o servidor segue o dele. Se o resultado chega antes de a animação acabar, a cena espera a animação; se a próxima rodada começa antes (computador muito lento), a cena abandona o combate e vai direto à nova preparação, sem mostrar o resultado daquela rodada.
- **Resultado da rodada:** só o duelo do próprio jogador traz a vida restante (vem do `combat_started`); os outros duelos mostram vencedor e vidas perdidas.
- **Cliente (`ServerConnection`):** valida só que a mensagem é um objeto com `type` e confere `protocolVersion` no `hello`. Limita o que envia (rajada de 20, 6 por segundo), abaixo do limite do servidor. Falhas de conexão e erros do servidor viram mensagens em português.
- **Saguão (`LobbyScene`):** tela inicial com "Jogar contra bots" e "Jogar em rede" (nome, endereço do servidor, criar sala, entrar com código, lista de jogadores, anfitrião, iniciar). O endereço padrão é `ws://<host da página>:8787`. Usa campos HTML do Phaser (`dom.createContainer`); os nomes dos jogadores entram como texto, nunca como HTML. Ao fim da partida em rede o botão leva de volta ao saguão, com a mesma conexão e a sala.
- **Jogador eliminado em rede:** continua recebendo as rodadas como espectador simples (a cena mostra "você foi eliminado e acompanha a partida"); não há tela de espectador própria.
- **Testes:** `LocalMatchSession.test.ts` (fluxo completo sem Phaser), `RemoteMatchSession.test.ts` (saguão, compra, rodada e partida inteira contra um `GameServer` real na porta 0 usando o `WebSocket` do Node, mais a `ServerConnection` com soquete de mentira) e `flipBoardProjection` em `boardProjection.test.ts`. A interface Phaser foi verificada à mão no navegador (local e em rede).

## 15. Congelar oferta, alcance de ataque e torre

### Congelar oferta da loja
- Cada carta da loja tem um botão **Congelar/Congelada** (de graça). Uma oferta congelada **fica na loja quando ela é atualizada e na rodada seguinte**, até ser comprada ou descongelada. As demais vagas são sorteadas de novo.
- O sorteio da loja é feito por inteiro mesmo com ofertas congeladas, então a sequência de sorteios não depende do congelamento (as partidas continuam reproduzíveis pela semente).
- Protocolo: mensagem `toggle_freeze { shopSlot }`; `player_view` traz `frozen` em cada oferta. Bots não congelam.

### Alcance de ataque
- Ao **selecionar** uma unidade que está no tabuleiro, ao **arrastá-la** (a partir da casa em que ela cairia) e ao **posicioná-la** (ela fica selecionada), as casas ao alcance de ataque são destacadas em vermelho. A regra é a do combate: distância em casas ≤ alcance (`cellsWithinRange`, em `src/shared/constants/board.ts`). Unidades na reserva e a torre não mostram área; o alcance de quem está na reserva aparece no painel de detalhes.

### Torre (estrutura que rende moedas)
Pedido do dono: uma torre que pode ser comprada, rende mais dinheiro se for colocada e protegida e some para sempre se for quebrada. Decisões (todas ajustáveis em `config.tower`, no painel de administração):
- **Loja:** cada vaga sorteada tem 10% de chance de virar uma torre (`offerChancePercent`), custo 5 (`cost`), no máximo 2 por jogador contando as que já tem (`maximumOwned`). O sorteio das torres usa uma sequência própria (`${semente}:tower:...`), então o resto da loja não muda. Torre pode ser congelada.
- **Posicionamento:** a torre é uma unidade como as outras na reserva e no tabuleiro. Ela **ocupa uma vaga do limite de unidades** do tabuleiro (rodada 1 permite 3), que é o custo de usá-la. Não funde, não tem sinergia e vale 1 moeda ao vender. Só rende se estiver **no tabuleiro**.
- **Renda:** no início de cada rodada, `+2` moedas por torre viva no tabuleiro (`incomePerRound`), somadas **depois** do teto de 10 moedas daquela rodada (o teto da rodada seguinte volta a valer, então a renda extra não pode ser acumulada sem limite).
- **Combate:** a torre entra como **estrutura**: não anda nem ataca, tem vida (escala 4 = 600 de vida), pode ser atacada e **não segura o combate** (quando só ela resta de um lado, o outro vence na hora) nem entra na vida restante ou nas unidades vivas do resultado. Ela fica protegida pela posição: os inimigos escolhem o alvo mais próximo, então atrás da linha de frente ela corre menos risco.
- **Destruição:** a torre que morre no combate **some para sempre** do jogador, mesmo que ele tenha vencido (`CombatResult.destroyedStructureIds` → `RoundSummary.towersLostByPlayerId`). A tela de resultado avisa ("Sua torre foi destruída e sumiu para sempre!"). Torre que sobrevive continua e rende de novo.
- **Bots** ignoram as torres (não compram). Os testes de balanceamento de partida com bots seguem nas faixas.
- **Pendências de balanceamento:** valores iniciais, sem medição com jogadores reais. Observar se 2 torres por pessoa e renda 2 fazem a economia disparar.

## 16. Derson

- **Personagem:** Derson, "Protagonista", raro, corpo a corpo (alcance 1; vida 5, dano 6, velocidade de ataque 4, mobilidade 3).
- **Habilidade "Invocar o protagonista":** a cada 14 s, se houver inimigo a até 4 casas, cria um **clone** perto dele (até 2 casas, na casa livre mais próxima do inimigo). O clone **não ataca nem anda**, dura 4 s e tem vida de escala 3 (450, crescendo com a estrela do Derson). Os inimigos que estiverem a até 3 casas do clone o escolhem como alvo (mesmo que já tivessem outro) enquanto ele durar.
- **Novo efeito de dados:** `summon_decoy` (`name`, `health`, `lifetimeSeconds`, `tauntRadius`, `placementRange`), disponível para qualquer habilidade (editável no painel). O clone é uma invocação (não segura o combate nem conta no resultado).
- **Ativo por padrão, em Caos:** com a regra revisada da rotação (Seção 7), o elenco ativo deixou de precisar ser múltiplo de 3. Caos fica com 5 personagens (Derson, Leo, Matheus, Moço e Vinícius) e as outras com 4.
- **Balanceamento:** com o Derson no sorteio ele ficou em ~48% e os demais se deslocaram; para voltar às faixas foram feitos dois ajustes: João Lucas dano 7 → 6 e Wilian dano 5 → 6, e a recarga da invocação do Gustavo foi de 12 para 13 s.

## 17. Painel de administração e conteúdo no servidor (Etapa 5)

- **Conteúdo editável (`GameContent`, `src/data/schemas/content.ts`):** elenco, 3 sinergias, configuração do jogo (inclui a torre), regra de rotação (com `override`) e a distribuição de sinergias de lançamento. A validação cruzada recusa: campos desconhecidos, ids repetidos, id `torre` (reservado), número de sinergias fora de 3 a 5, personagem ativo fora da distribuição, personagem ou sinergia inexistente na distribuição e sinergia com menos de 4 personagens.
- **Onde fica:** direto no servidor, em `server-data/content.json` (ignorado pelo controle de versão), com versão numerada que sobe a cada publicação. A gravação é atômica. Arquivo inválido ou corrompido: o servidor sobe com o conteúdo padrão e avisa no log, sem apagar o arquivo.
- **Partidas:** cada partida usa o conteúdo da versão em que foi criada e o mantém até o fim (regra do GDD 4.4). Partidas novas usam o conteúdo novo.
- **Login:** um único usuário e senha, **sem cadastro**: vêm das variáveis de ambiente `ADMIN_USERNAME` e `ADMIN_PASSWORD` ao subir o servidor (senha com ao menos 8 caracteres). Sem elas, o painel fica desligado (a API responde 503). Nada disso é escrito em arquivo.
- **Segurança da API (`/api/admin/*`, no mesmo endereço e porta do WebSocket):** comparação de usuário e senha em tempo constante; 5 erros por endereço em 1 minuto travam o endereço (e há um limite global); token aleatório de 8 h no cabeçalho `Authorization: Bearer` (não usa cookie, então outra página não age em nome do admin); no máximo 20 sessões; corpo limitado (4 KB no login, 2 MB no conteúdo); só aceita `application/json`; recusa páginas de fora da rede local/privada (mesma política do WebSocket); publicar exige a versão em que o painel se baseou (409 se outra pessoa publicou antes) e passa na validação completa (422 com a lista de problemas). **Não há TLS**: a senha viaja sem criptografia, então só use em rede de confiança (ou atrás de um proxy com HTTPS).
- **Aviso aos jogadores:** o protocolo foi para a versão 2. O `hello` traz o conteúdo e a versão dele; ao publicar, o servidor envia `content_updated` a todos os conectados e o cliente mostra uma faixa no topo da página ("O jogo recebeu novidades! Recarregue a página...", com os botões "Recarregar agora" e "Depois"). Se uma pessoa com a página antiga tentar iniciar uma partida, o cliente reconhece a diferença de versão (`match_started.contentVersion`), mostra o aviso e sai da sala, em vez de jogar com dados errados.
- **Tela (`/admin`, `admin/index.html` + `src/admin/`):** entrada (endereço do servidor, usuário e senha, só na memória da página), abas **Personagens** (lista com caixa de ativo, novo a partir de cópia, remover, edição em JSON), **Sinergias**, **Configuração** e **Rotação e distribuição** (JSON), validação ao vivo e botão Publicar. Cada aba valida a parte editada ao aplicar e o conteúdo inteiro ao publicar. Em desenvolvimento ela abre em `http://localhost:5173/admin` e fala com o servidor (padrão `http://<host>:8787`).
- **Limites desta versão:** edição por JSON (sem formulários por campo), sem pré-visualização de sprites, sem histórico de versões nem desfazer publicação, e o modo local contra bots (no navegador) continua usando o conteúdo que veio no pacote do jogo, não o do servidor. Sprites e imagens novas ainda precisam ser adicionadas ao projeto por arquivo.

### Ampliações do painel: formulários, sprites, importação e referência

- **Formulários de personagem:** a aba Personagens deixou de ser só JSON. Cada personagem tem formulário com dados básicos, atributos (1–10), comportamento em combate, habilidade (nome, descrição, recarga, quando usa, de onde atua, efeito visual) e uma **lista de efeitos** (dano, cura, estado, armadilha que invoca, clone provocador e comportamentos especiais), cada um com seus campos; dá para adicionar, remover e trocar o tipo. Os campos são descritos em `src/admin/fieldSpecs.ts` e a validação de verdade é sempre a do esquema do jogo: erro no formulário mostra o motivo, mantém o personagem fora do conteúdo e bloqueia a publicação. Só os resultados do "ataque aleatório" continuam no JSON avançado.
- **Sprites:** o painel envia um PNG por personagem (`PUT /api/admin/sprites/<id>`, com login). O servidor confere assinatura e fim do PNG e as dimensões (até 1 MB e 1024×1024), e guarda em `server-data/sprites/<id>-<hash de 12 caracteres>.png`: o nome é montado pelo servidor, nada vindo da rede vira caminho de arquivo, e versões antigas continuam disponíveis para partidas em andamento. O arquivo é entregue publicamente em `GET /sprites/...` (com `nosniff` e cache longo). O conteúdo só aceita caminhos nesse formato e só publica se o arquivo existir no servidor.
- **No jogo:** o cliente baixa os sprites antes da partida (`MatchSession.spriteSources`), troca a cápsula provisória pela imagem (altura ajustada à da cápsula, vezes `scale`; `offset` e `anchor` ajustam os pés) e mostra a cor do time/sinergia num anel no chão. Se a imagem não carregar, o personagem fica com o desenho provisório. A partida local contra bots continua sem sprites. Quem tem o sprite no ar é identificado em combate por `CombatUnit.characterId` (as invocações e a torre usam o desenho provisório).
- **Importar personagens por texto JSON:** na aba Personagens, cola-se um personagem, uma lista ou `{ "characters": [...] }`. É tudo ou nada (se algum tiver erro, nada entra e a lista de problemas aparece), entra inativo por padrão, id repetido só com "Substituir se o id já existir" (o substituído mantém o sprite) e o campo `sprite` do texto é ignorado (o caminho precisa vir de um envio pelo painel). Máximo de 50 por vez.
- **Referência exportável:** o botão "Baixar referência (JSON)" gera `merge-do-escritorio-referencia-de-personagens.json` com o JSON Schema do personagem (gerado do esquema real, então não fica desatualizado), os passos para criar um personagem, as fórmulas e a tabela de conversão dos atributos, o significado de cada ativação, origem da habilidade, efeito, estado e comportamento especial (com exemplo válido de cada um), as sinergias e custos atuais, as regras de sprite e de validação, e exemplos completos (modelo mínimo, Bixo, Gustavo, Derson e Wender). Os testes garantem que todo tipo de efeito e de estado do esquema está documentado e que os exemplos são válidos.

### Sinergias no painel

Pedido do dono: como as sinergias mexem direto nos atributos, poder **criar sinergias como se criam personagens**.
- **Aba Sinergias:** lista com a cor e quantos personagens ativos cada uma tem (destaque quando falta para os 4), formulário (nome, nome completo, cor, ícone, quem recebe o bônus, descrição), **níveis** (unidades no tabuleiro que ativam) e, em cada nível, a **lista de bônus** (multiplicador de dano ou de velocidade de ataque, resistência, regeneração, redução de recarga e amplificação de efeitos positivos), com adicionar e remover. "Nova (cópia desta)" cria uma sinergia sem personagens; "Remover" manda os personagens dela para as sinergias que têm menos (o jogo exige ao menos 3 sinergias e aceita no máximo 5). Também há JSON avançado e **importação por texto JSON** (uma, lista ou `{ "synergies": [...] }`, tudo ou nada).
- **Aba Rotação e distribuição:** um seletor por personagem ativo, com a contagem de cada sinergia ao vivo (aviso abaixo de 4). Uma sinergia nova só deixa publicar depois de ter 4 personagens, e para isso o elenco ativo precisa crescer (importar ou criar personagens) ou os personagens serem remanejados.
- **No jogo:** o painel de sinergias é montado a cada partida com a quantidade de linhas do conteúdo (até 5, com linhas compactas a partir de 4) e a rotação usa o sorteio da Seção 7.
- **Referência (`merge-do-escritorio-referencia-de-conteudo.json`):** agora cobre também as sinergias (limites, passos para criar, cada tipo de bônus com exemplo, JSON Schema e exemplos). O arquivo passou a se chamar "referência de conteúdo".
- **Limites:** o ícone da sinergia é só um texto (o jogo ainda não desenha ícones) e os níveis são editados por formulário, mas os efeitos novos de sinergia (um tipo novo de bônus) ainda exigem código.

## 18. Hub de salas, partida rápida e regras de sala

Pedido do dono: ver as salas abertas, ter partida rápida, criar sala privada ou pública (com senha) e escolher modificadores de sala.
- **Fluxo:** sem conexão, a tela inicial tem "Jogar contra bots" e "Conectar" (nome + endereço do servidor). Conectado, o **hub** mostra "Partida rápida", "Criar sala", "Entrar com código" (com senha, se tiver) e a **lista de salas públicas** (anfitrião, código, jogadores, cadeado, em partida/aguardando e as regras ativas), que se atualiza sozinha a cada 3 s. Salas com senha pedem a senha ao clicar em "Entrar". Dentro da sala aparecem código, visibilidade, cadeado, regras e jogadores.
- **Pública × privada:** pública aparece na lista; privada só entra quem tem o código. **A senha é independente da visibilidade** (qualquer uma das duas pode ter senha, e é opcional).
- **Partida rápida:** entra numa sala pública, aberta (no saguão e com vaga) e **sem senha**, preferindo as de regras normais; se não houver, cria uma sala pública com regras normais. (Interpretei "entra em uma sala aberta" assim.)
- **Senha de sala:** o servidor guarda só o resumo (scrypt com sal próprio) e confere em tempo constante; o texto nunca é enviado de volta nem aparece na lista. A senha é conferida antes de saber se a sala está cheia ou em partida (quem erra não descobre isso). **Mais de 8 senhas erradas seguidas fecham a conexão.** É uma senha para jogar entre amigos: sem HTTPS ela trafega sem criptografia.
- **Modificadores (escolhidos por quem cria; valem para todos da sala, bots inclusive):**

| Regra | Opções | Efeito |
| --- | --- | --- |
| Vidas extras | +1 a +3 | soma às vidas iniciais |
| Mais tempo de preparação | +10, +20, +30 s | soma ao tempo de cada preparação (inclusive a curta) |
| Mais tempo de combate | +10, +20, +30 s | soma ao limite de 30 s de cada combate (o "turno" de luta) |
| Mais dinheiro por rodada | +1 a +3, +5 | soma à renda de cada rodada |
| Mais status | +10, +25, +50 % | multiplica a vida e o dano de todas as unidades (inclui a torre) |

  Implementação: `applyRoomModifiers` (vidas, preparação, renda) e `combatRulesOf` (status e tempo de combate) em `src/core/game/roomModifiers.ts`; o esquema e os tetos estão em `src/data/schemas/roomModifiers.ts` (o servidor recusa valores fora deles). O servidor manda os modificadores no `match_started`, e o cliente aplica a mesma função à configuração para mostrar os mesmos corações, tempos e renda; o `combatConfig` já traz os status e o limite de tempo. No começo da partida a interface mostra "Regras da sala: ..." por alguns segundos. As regras são fixas depois que a sala é criada.
- **Protocolo (versão 3):** `create_room` ganha `visibility` (padrão `public`), `password` e `modifiers`; `join_room` ganha `password`; novas mensagens `list_rooms` → `room_list` e `quick_match`; `room_state` e `match_started` trazem visibilidade, cadeado e regras; novo erro `wrong_password`. O tipo `ClientMessage` passou a ser o que o cliente envia e `ParsedClientMessage` o que o servidor entende depois de validar (com os padrões preenchidos).
- **Pendências de balanceamento:** os tetos são palpites. Combinar "+50% de status" com muito tempo de combate muda a duração dos combates (a faixa de 15 a 25 s do GDD vale só para regras normais).

## 19. Servidor pronto para publicar

- **Configuração por ambiente** (`src/multiplayer/host/serverConfig.ts`): `HOST`, `PORT`, `DATA_DIR`, `ALLOWED_ORIGINS`, `TRUST_PROXY`, `ADMIN_USERNAME` e `ADMIN_PASSWORD`; os argumentos `--lan` e `--port` continuam valendo sobre o ambiente. Valor inválido impede a subida, com mensagem explicando.
- **Origens liberadas:** além das páginas locais e de rede privada, só os endereços **exatos** de `ALLOWED_ORIGINS` (sem curinga e sem caminho) usam o WebSocket e a API do painel.
- **Proxy:** o servidor não faz HTTPS; um proxy ou túnel faz. Com `TRUST_PROXY=1`, o limite de tentativas de login usa o **último** item de `X-Forwarded-For` (o que o proxy acrescentou).
- **Saúde:** `GET /health` responde `{"status":"ok"}`, sem revelar salas nem jogadores.
- **Contêiner:** `Dockerfile` (Node 22 Alpine, só dependências de produção, usuário sem privilégios, volume `/data`, um processo para o sinal de parada chegar ao servidor), `docker-compose.yml` (ver Seção 20) e `.env.example`. Por isso o `tsx` passou a ser dependência de produção.
- **Guia:** `docs/hospedagem-do-servidor.md` (reescrito para a VPS na Seção 20).

## 20. Publicação na VPS do dono

- **Decisão do dono:** publicar na própria VPS. (Antes disso foi considerado usar o Firebase como backend; foi descartado.)
- **VPS compartilhada** (já roda outro projeto): o jogo **não usa as portas 80 e 443**. O `docker-compose.yml` tem nome próprio (`merge-do-escritorio`), publica só o contêiner `web` em `127.0.0.1:8090` (`WEB_PORT` troca a porta) e limita a memória (384 MB no servidor, 128 MB no web). O proxy que já existe na VPS cuida do HTTPS e encaminha um **subdomínio** para essa porta (subpasta não funciona).
- **Mesmo endereço para tudo:** o `web` (Caddy, só HTTP; `deploy/Caddyfile`) serve a página e o `/admin` e encaminha `/ws`, `/api/*`, `/sprites/*` e `/health` ao `servidor`, que não publica porta. Com dois proxies em série, o Caddy lê o `X-Forwarded-For` de proxies da rede interna (`trusted_proxies_strict`) e entrega ao servidor só o IP de quem está do outro lado.
- **Endereço automático no cliente** (`src/shared/utils/serverAddress.ts`): em desenvolvimento, `ws://<máquina>:8787`; no build publicado, o mesmo endereço da página com `/ws` (`wss` quando a página é `https`); `VITE_SERVER_URL` no build sobrepõe, para publicar a página em outro lugar.
- **Padrões do compose:** `TRUST_PROXY=1`; `ALLOWED_ORIGINS` vazio libera `https://<SITE_DOMAIN>`.
- **Guia:** `docs/hospedagem-do-servidor.md`, com diagnóstico só de leitura, cuidados para não afetar o outro projeto, configuração para nginx, Caddy, Apache e proxy em contêiner, e teste sem subdomínio.

## 21. Melhorias de 25/11/2026 (documento de requisitos do dono)

Onde esta seção contraria uma anterior (tabuleiro, tempo de combate, loja, reserva, sinergias, torre, resolução), vale esta.

### Torre
- **Causa do bug:** um lado só com a torre contava como eliminado e o combate acabava em 0 ms; por isso a torre como primeira compra tirava vida e ficava intacta. Agora o combate acaba quando um lado não tem lutadores nem torre, ou quando nenhum lado tem lutadores. A torre continua fora do cálculo do vencedor.
- **Compensação:** +2 moedas (`config.tower.compensationOnLoss`) por torre destruída, pagas uma vez no início da **rodada** seguinte, mesmo acima do teto de moedas; quem é eliminado não recebe. "Próxima partida", no pedido, foi lido como próxima rodada: as partidas não guardam nada de uma para a outra.

### Tabuleiro, alvo e ataque
- **Tabuleiro 12×5** (30 casas por lado). As coordenadas lógicas continuam as mesmas (linhas = eixo da batalha); a tela gira 90° (hexágonos "flat-top"), com quem vê à esquerda. Velocidade `0,8 + 0,3·mobilidade` e limite de combate de 35 s.
- **Alvo:** sem caminho até o alvo (causa de gente parada), a unidade tenta outro alcançável e, se não houver, chega o mais perto possível. Com o alvo fora da área e outro dentro, troca (quem usa `farthest` só depois de alcançar o alvo). O recuo só acontece com o alvo na área. Prioridades: `nearest`, `farthest`, `lowest_health`, `cluster`.
- **Área de ataque** (`attack` no personagem; funções em `src/shared/utils/attackArea.ts`): círculo, faixa frontal, diagonais, semicírculo, foice e tracejada (só distâncias ímpares), simétricas entre os lados. Com mais de um alvo, os extras levam 50% do dano, salvo outro valor. Áreas menores para quase todos; os valores estão nos JSON de `src/data/defaults/characters/`. Os raios das habilidades não mudaram.
- **Gustavo:** invoca 2 cavalos direto (efeito `summon`) por 6 s; dano deles 3→2; recarga 13→15. `place_trap` continua disponível no painel.
- **Sinergias:** Operacional 5→4% e 9→8% de resistência; Caos 6→5% e 12→9% de dano, 4→3% e 8→5% de velocidade de ataque.
- **Medido** (5 unidades, 4000 combates): média de 20,9 s, 4,3% de estouro de tempo, vitórias por personagem de 42,1% (Moço) a 56,5% (Felipão). 200 partidas de 4 bots: média de 7 rodadas.

### Loja, bots e número de jogadores
- Loja com 5 ofertas, reserva com 6 vagas, chance de torre 6% por vaga. Os bots priorizam cópias e depois a ordem da loja; só compram personagem novo até o limite do tabuleiro (podem passar em um).
- Partidas de **2 a 8 jogadores** (sala e partida local). A partida rápida prefere salas com regras normais e 4 jogadores. Conexões no servidor: 64→96; salas: 16.

### Sair, assistir e encerrar (protocolo 4)
- **Sair** pede confirmação. Em rede, sair ou cair faz a vaga virar bot com as mesmas vidas, moedas e unidades; o anfitrião passa o cargo; sem nenhuma pessoa, a sala fecha. Contra bots, sair encerra a partida.
- **Espectador:** até 8 por sala, sem ocupar vaga; sala privada pede código (e senha). Não recebe loja, moedas, reserva, tabuleiro em montagem nem o próximo adversário, e o servidor recusa qualquer ação. **Brecha aceita por ora:** um jogador pode abrir outra aba e assistir à própria sala para ver os outros duelos.
- **Painel:** a aba "Em andamento" lista e encerra salas (`GET /api/admin/activities`, `POST /api/admin/activities/<código>/end`).
- **Loja em rede:** o servidor só espera os duelos que alguém está vendo (pessoa ou espectador), com mínimo de 3 s (`MINIMUM_COMBAT_PHASE_MS`); combate só entre bots não atrasa a rodada. Quem troca de jogador assistido para um duelo mais longo pode ver o resultado antes do fim da animação.

### Tela, resolução e celular
- **Resolução (causa):** o canvas era sempre 1280×720 e o navegador o esticava. As cenas seguem em 1280×720, o canvas é criado com escala de 1 a 2 (tela × densidade) e a câmera aproxima na mesma proporção.
- **Demora da loja (causas):** ofertas antigas ficavam na tela até a rodada seguinte (agora a loja aparece fechada); o `preload` segurava a cena até baixar os sprites (agora em segundo plano); redesenho de texto a cada atualização; e a espera por combates de bots em rede (acima).
- **Sprites de perfil:** a arte enviada deve olhar para a **direita**; o jogo só espelha na horizontal, conforme o alvo.
- **Celular:** toque curto compra, segurar (380 ms) mostra detalhes, tocar na unidade e na casa move; em pé, em tela de toque de até 900 px, aparece o aviso para girar. O saguão é HTML próprio, sem depender do tamanho do canvas.
- **Consulta no combate:** tocar num personagem abre o painel ao vivo e destaca a área.

### Galeria, painel e áudio
- **"Personagens" no saguão:** galeria em HTML com filtro, ordenação, comparação lado a lado e desenho da área de ataque.
- **Ícones:** `ability.visual.icon` e `projectileIcon` (texto ou emoji; João Lucas usa "L"). Projéteis não têm imagem própria.
- **Sprites auxiliares** (`auxiliarySprites`: torre, cavalo, protagonista e outras invocações) e **ajuste manual** (posição, escala, âncoras, prévia) na aba "Sprites e ícones"; valem depois de publicar e persistem no servidor.
- **Áudio** sintetizado com Web Audio (sem arquivos), música e efeitos com volume e liga/desliga separados, salvos no navegador.

## 22. Ajustes depois do primeiro teste da Seção 21

Onde esta seção contraria a 21, vale esta.

- **Velocidade do combate:** volta a ser só o texto "Velocidade 1x · [S] muda" (sem botão); no celular ele não aparece.
- **Camadas:** áreas de ataque, anéis e explosões de habilidade são desenhados entre o chão e os personagens. Projéteis, chuva, números e nomes continuam por cima.
- **Orientação dos ataques:** todos viram para a frente ou para trás conforme o alvo. A **foice** também varre para cima ou para baixo, pelo lado em que o alvo está (`AttackSweep`, em `attackArea.ts`); na mesma altura mantém o lado anterior. Na preparação, a foice aparece para cima. Os formatos **não giram** para apontar reto para cima ou para baixo: os sprites só olham para os lados, e girar em todas as direções afrouxaria as áreas.
  - Efeito no alcance: contando os dois lados da varredura, a foice alcança tudo à frente e na mesma linha lógica; o que continua restrito é quem mais ela acerta em cada golpe.
- **Matheus:** formato novo `dashed_center`, a área tracejada mais a casa central (2 casas em linha reta à frente). O pedido foi lido como essa casa que faltava no desenho; o veneno continua vindo da habilidade. O Moço mantém a tracejada comum.
- **Rodízio de sinergias:** a cada 1 dia (era 2).
- **Equilíbrio** (6000 combates, 5 unidades): 4,6% de estouro de tempo; Wender 57,6% (perto do teto de 58%), Matheus 53,3%, Derson 46,8%, Moço 42,1% (perto do piso). O teste de lugares na mesa passou de 80 para 300 partidas, sem mudar a faixa: com 80 o acaso levava o 1º lugar a 41%; em 600 partidas ele fica entre 29% e 33%, acima dos 25% ideais.
- **Nitidez (causa):** a resolução era calculada pela tela inteira; numa janela de 1536×730 o canvas tinha 1920×1080 e o navegador reduzia 1,48 vez. Agora o canvas tem os mesmos pixels que o jogo ocupa na janela (escala de 0,5 a 3), acompanha o redimensionamento e redesenha os textos. A textura do boneco passou de 3× para 2×.
- **Modo compacto** (menos de 0,72 pixel CSS por unidade de tela: celulares): letras maiores; as cartas mostram só nome, sinergia e preço; sinergias mostram nome e contagem; o placar mostra só o nome da fase; sob o boneco ficam só as estrelas; o painel de detalhes esconde bônus de sinergia, comportamento e recarga e resume a área ao nome do formato. O modo é escolhido quando a partida começa.

