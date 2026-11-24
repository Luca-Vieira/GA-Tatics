# MERGE DO ESCRITÓRIO

## Game Design Document e Arquitetura Técnica

**Versão:** 1.2
**Histórico:** 1.0 — documento inicial; 1.1 — adicionado o Sistema de Sinergias (Seção 4); 1.2 — sinergias redefinidas como Operacional, Gestão e Caos, com efeitos estáticos e dinâmicos
**Gênero:** Auto Battler / Estratégia / Casual Multiplayer
**Plataforma:** Navegadores desktop
**Jogadores:** 4 por partida
**Duração desejada:** 6–10 minutos
**Modo de jogo:** Salas privadas multiplayer
**Estilo visual:** 2D, sprites estáticos com animações procedurais

---

# 1. Visão geral

Merge do Escritório é um jogo multiplayer casual de estratégia inspirado em auto battlers, especialmente no sistema de combinação de unidades de Merge Tactics.

O jogador monta uma equipe utilizando personagens que representam pessoas e arquétipos do ambiente de trabalho.

Durante a preparação, compra personagens em uma loja aleatória, posiciona-os no tabuleiro e combina três unidades iguais para criar uma versão mais poderosa.

Quando a preparação termina, os personagens passam a lutar automaticamente contra a equipe adversária.

O objetivo é sobreviver às rodadas, melhorar a equipe e eliminar os demais jogadores até restar apenas um vencedor.

Cada personagem também pertence a uma sinergia — Operacional, Gestão ou Caos. Reunir personagens da mesma sinergia no tabuleiro ativa bônus de equipe, e a distribuição das sinergias entre os personagens é redistribuída a cada 2 dias, mantendo a experiência em constante renovação (Seção 4).

O jogo deve ser simples de aprender, rápido de jogar e suficientemente estratégico para que os jogadores possam experimentar diferentes combinações de personagens.

## 1.1. Princípios de design

- **Partidas rápidas:** uma partida deve durar aproximadamente 6–10 minutos.
- **Fácil compreensão:** atributos, habilidades e ações devem ser visualmente claros.
- **Estratégia antes da batalha:** o posicionamento e a composição da equipe são mais importantes que a habilidade manual.
- **Humor:** os personagens e suas habilidades devem refletir características e piadas internas dos participantes.
- **Extensibilidade:** novos personagens devem poder ser adicionados sem alterar a lógica central do jogo.
- **Baixo custo operacional:** priorizar tecnologias com hospedagem gratuita ou de baixo custo.

# 2. Gameplay

## 2.1. Estrutura da partida

Uma partida começa com quatro jogadores em uma sala privada.

Todos começam com:

- 3 vidas.
- 5 moedas.
- Tabuleiro vazio.
- Reserva vazia.

A partida é dividida em rodadas com três fases.

| Fase       |        Duração | Descrição                                          |
| ---------- | -------------: | -------------------------------------------------- |
| Preparação |    40 segundos | Comprar, posicionar, vender e combinar personagens |
| Combate    | 20–30 segundos | As equipes lutam automaticamente                   |
| Resultado  |     5 segundos | Exibição do vencedor e aplicação de dano           |

Os jogadores preparam suas equipes simultaneamente.

Um jogador pode pressionar o botão Pronto para encerrar sua preparação individualmente, mas o combate só começa quando todos estiverem prontos ou quando o cronômetro terminar.

## 2.2. Sistema de rodadas

Os confrontos são individuais, sempre entre dois jogadores.

Pareamento inicial sugerido:

| Rodada | Confrontos    |
| ------ | ------------- |
| 1      | A × B / C × D |
| 2      | A × C / B × D |
| 3      | A × D / B × C |

Depois disso, os confrontos devem ser reorganizados para evitar repetições desnecessárias.

Quando houver quantidade ímpar de jogadores, um deles ficará sem adversário naquela rodada.

O jogador que descansar:

- Não perde vida.
- Não recebe vitória automática.
- Continua participando da preparação.
- Continua recebendo os recursos normais da rodada.

## 2.3. Eliminação

Cada jogador começa com três vidas.

Ao perder um combate, perde uma vida.

Quando chegar a zero, é eliminado da partida.

A partida termina quando restar apenas um jogador.

Em caso de empate no combate, nenhum jogador perde vida.

## 2.4. Economia

O jogo utiliza moedas para comprar personagens e atualizar a loja.

### Ganho por rodada

| Rodada | Moedas |
| ------ | -----: |
| 1      |      5 |
| 2      |      5 |
| 3      |      6 |
| 4      |      6 |
| 5+     |      7 |

O limite de armazenamento é de 10 moedas.

### Juros

O jogador recebe uma moeda adicional para cada cinco moedas armazenadas, limitado a duas moedas extras por rodada.

### Loja

A loja apresenta três personagens aleatórios.

| Operação            |    Custo |
| ------------------- | -------: |
| Personagem comum    | 3 moedas |
| Personagem especial | 4 moedas |
| Atualizar loja      | 2 moedas |

Probabilidades iniciais de raridade:

- Comum: 70%.
- Raro: 25%.
- Especial: 5%.

Esses valores são provisórios e devem ser ajustados após testes.

### Venda

| Nível do personagem | Valor de venda |
| ------------------- | -------------: |
| 1 estrela           |        1 moeda |
| 2 estrelas          |       3 moedas |
| 3 estrelas          |       8 moedas |

## 2.5. Posicionamento

O tabuleiro utiliza uma grade hexagonal.

Cada jogador controla uma metade espelhada do tabuleiro, sem casas compartilhadas durante a preparação.

A proposta inicial é utilizar 38 casas, 19 para cada jogador.

Durante a preparação:

- O jogador pode posicionar personagens livremente em sua metade.
- Cada casa comporta apenas um personagem.
- Personagens podem ser movidos entre casas.
- Personagens também podem ser guardados na reserva.

Durante o combate:

- Os personagens podem atravessar a divisão central.
- O movimento é automático.
- Os personagens procuram adversários e atacam conforme seus comportamentos.

### Limite de unidades

| Rodada | Unidades permitidas |
| ------ | ------------------: |
| 1      |                   3 |
| 2      |                   4 |
| 3      |                   5 |
| 4      |                   6 |
| 5+     |                   7 |

### Reserva

Cada jogador possui três espaços de reserva.

A reserva:

- Não participa do combate.
- Permite armazenar personagens.
- Participa do sistema de fusão.
- Pode ser utilizada para organizar a equipe durante a preparação.

Se o tabuleiro e a reserva estiverem cheios, o jogador não poderá comprar novos personagens.

## 2.6. Fusão de personagens

Três personagens iguais, do mesmo nível, podem ser combinados automaticamente.

A fusão produz uma unidade de nível superior.

| Nível      | Multiplicador de atributos |
| ---------- | -------------------------: |
| 1 estrela  |                         1x |
| 2 estrelas |                       2,5x |
| 3 estrelas |                         6x |

Os multiplicadores são valores iniciais para balanceamento, não regras definitivas.

A unidade resultante ocupa a posição da primeira unidade utilizada na combinação.

A fusão pode acontecer utilizando personagens do tabuleiro e da reserva.

As habilidades continuam sendo as mesmas habilidades especiais do personagem. Não são adicionadas habilidades novas durante a fusão.

# 3. Personagens

O elenco inicial terá 12 personagens.

Cada personagem possui:

- Nome.
- Sprite.
- Atributos.
- Uma habilidade especial.
- Comportamento de combate.
- Raridade.
- Nível de estrela.
- Sinergia vigente (Operacional, Gestão ou Caos), atribuída por rotação bienal (Seção 4).

Os atributos são definidos em uma escala inicial de 1 a 10.

| Atributo   | Significado                             |
| ---------- | --------------------------------------- |
| Vida       | Quantidade de dano que pode receber     |
| Dano       | Força dos ataques                       |
| Velocidade | Frequência dos ataques                  |
| Alcance    | Distância máxima de ataque em hexágonos |
| Mobilidade | Capacidade de movimentação              |

Além dos atributos base, o combate utiliza a resistência, uma estatística derivada com valor base zero, interpretada como redução percentual do dano recebido. Ela não pertence à escala de 1 a 10 e é modificável apenas por efeitos, como o bônus da sinergia Operacional (Seção 4).

## 3.1. Elenco inicial

### 1. Bixo — Guardião

**Função:** Tanque.

**Atributos:** Vida 10, Dano 4, Velocidade 3, Alcance 1, Mobilidade 3.

**Habilidade: Postura Defensiva (Descansar, né)**

Bixo para de atacar, senta e reduz drasticamente o dano recebido durante alguns segundos.

### 2. Vinícius — Berserker

**Função:** Lutador agressivo.

**Atributos:** Vida 7, Dano 8, Velocidade 5, Alcance 1, Mobilidade 5.

**Habilidade: Fúria (Burnout)**

Quanto menos vida possui, mais rápido ataca. Ao atingir pouca vida, entra em estado de fúria.

### 3. Leo — Assassino

**Função:** Dano explosivo.

**Atributos:** Vida 3, Dano 9, Velocidade 9, Alcance 1, Mobilidade 10.

**Habilidade: Emboscada (Errinho na sexta à tarde)**

Seu primeiro ataque contra um inimigo causa dano crítico. O inimigo fica confuso e pode errar o próximo ataque.

### 4. Marquinhos — Vampiro

**Função:** Sustentação.

**Atributos:** Vida 6, Dano 6, Velocidade 5, Alcance 1, Mobilidade 6.

**Habilidade: Drenar Vida (Olhar penetrante)**

Fixa o olhar em um inimigo, drenando sua vida gradualmente e recuperando a própria.

### 5. Felipão — Atirador

**Função:** Dano contínuo à distância.

**Atributos:** Vida 4, Dano 5, Velocidade 9, Alcance 4, Mobilidade 5.

**Habilidade: Chuva de Flechas (Chuva de cubo mágico)**

Dispara diversos cubos mágicos sobre uma região, atingindo vários inimigos.

### 6. João Lucas — Franco-atirador

**Função:** Dano de precisão.

**Atributos:** Vida 3, Dano 10, Velocidade 2, Alcance 6, Mobilidade 2.

**Habilidade: Tiro Perfurante (Faz o L poderoso)**

Dispara um projétil em formato de L, que muda de direção para atingir um segundo inimigo.

### 7. Matheus — Envenenador

**Função:** Dano em área e enfraquecimento.

**Atributos:** Vida 4, Dano 5, Velocidade 4, Alcance 4, Mobilidade 4.

**Habilidade: Sujeira em Área**

Espalha sujeira em uma região, enfraquecendo todos os inimigos atingidos. O inimigo no centro recebe também envenenamento, perdendo vida gradualmente.

### 8. Helder — Curandeiro

**Função:** Suporte.

**Atributos:** Vida 5, Dano 2, Velocidade 4, Alcance 4, Mobilidade 4.

**Habilidade: Cura (Presença majestosa)**

Sua presença recupera a vida dos aliados próximos, priorizando quem estiver mais ferido.

### 9. Wilian — Congelador

**Função:** Controle.

**Atributos:** Vida 4, Dano 4, Velocidade 3, Alcance 4, Mobilidade 3.

**Habilidade: Congelamento (Dormir no serviço)**

Escolhe um inimigo e o coloca para dormir, impedindo-o de atacar ou se movimentar temporariamente.

### 10. Wender — Autômato

**Função:** Especialista resistente.

**Atributos:** Vida 8, Dano 6, Velocidade 4, Alcance 2, Mobilidade 2.

**Habilidade: Sobrecarga (Tapar buraco)**

Recebe um aumento temporário de velocidade e dano para compensar a ausência de outro personagem.

### 11. Gustavo — Engenheiro

**Função:** Utilidade e invocação.

**Atributos:** Vida 5, Dano 5, Velocidade 4, Alcance 3, Mobilidade 3.

**Habilidade: Mina (Mordida de cavalo)**

Instala uma armadilha que, ao ser ativada, invoca pequenos cavalos que perseguem e mordem os inimigos, causando dano.

### 12. Moço — Apostador

**Função:** Dano imprevisível.

**Atributos:** Vida 5, Dano variável de 2 a 10, Velocidade 5, Alcance 3, Mobilidade 5.

**Habilidade: Roleta (Estagiário)**

Cada ataque possui um resultado aleatório. Pode causar dano excelente, dano medíocre ou simplesmente errar.

# 4. Sistema de sinergias

O sistema de sinergias é a camada estratégica de composição de equipe do jogo. Cada personagem pertence a uma das três sinergias do jogo — Operacional, Gestão ou Caos — e reunir unidades da mesma sinergia no tabuleiro ativa bônus para a equipe.

A característica central do sistema é a rotação bienal: a distribuição das sinergias entre os personagens não é fixa. A cada 2 dias, todas as sinergias são redistribuídas por sorteio, obrigando os jogadores a redescobrir o elenco e a explorar novas combinações a cada rotação.

## 4.1. Regras gerais

- Existem exatamente três sinergias: Operacional, Gestão e Caos.
- Cada personagem possui exatamente uma sinergia por vez.
- A atribuição é coletiva e temporária: a cada 2 dias, todos os personagens são redistribuídos entre as três sinergias.
- A sinergia não altera habilidades, sprites ou comportamentos de combate; concede apenas modificadores de atributos e efeitos especiais fixos (regeneração de vida, recarga de habilidades e amplificação de efeitos positivos).
- Todos os bônus se aplicam à equipe inteira. O campo appliesTo da definição (Seção 4.8) permite restringir um bônus às unidades da própria sinergia, caso o balanceamento futuro exija.
- Os bônus são ativados por contagem de unidades no tabuleiro, no início de cada combate.

## 4.2. As três sinergias

As três sinergias representam três formas de trabalhar no escritório e possuem cor e ícone próprios.

| Sinergia | Tema | Nível 1 (2 unidades) | Nível 2 (4 unidades) |
| -------- | ---- | -------------------- | -------------------- |
| Operacional | Resistência e sobrevivência | +10% resistência; regenera 1,5% da vida máxima a cada 3 segundos | +18% resistência; regenera 3% da vida máxima a cada 3 segundos |
| Gestão | Estratégia e suporte | Recarga de habilidades 15% mais rápida; efeitos positivos 15% mais fortes | Recarga de habilidades 25% mais rápida; efeitos positivos 25% mais fortes |
| Caos | Dano e agressividade | +12% dano; +10% velocidade de ataque | +25% dano; +20% velocidade de ataque |

**Operacional — Resistência e sobrevivência.** Representa quem mantém a empresa funcionando, resolve problemas e segura as pontas. Os personagens da equipe recebem resistência adicional — a redução percentual de dano recebido descrita na Seção 3 — e recuperam uma pequena quantidade de vida periodicamente durante o combate, o que favorece composições resistentes e estratégias de desgaste.

**Gestão — Estratégia e suporte.** Representa planejamento, coordenação e organização. As habilidades especiais recarregam mais rapidamente e seus efeitos positivos são fortalecidos: curas, escudos e bônus concedidos por habilidades são ampliados, beneficiando elencos que dependem do uso repetido de habilidades.

**Caos — Dano e agressividade.** Representa improvisação, criatividade, soluções duvidosas e decisões questionáveis. Aumenta o dano causado e a velocidade de ataque dos personagens, ideal para composições ofensivas que buscam terminar o combate rapidamente.

## 4.3. Ativação por contagem

Os bônus são calculados no início de cada combate, contando apenas as unidades posicionadas no tabuleiro.

| Contagem no tabuleiro | Nível ativo |
| --------------------- | ----------- |
| 2 unidades da mesma sinergia | Nível 1 |
| 4 unidades da mesma sinergia | Nível 2 |

Regras:

- A reserva não conta para a ativação.
- Cada personagem conta como uma unidade de sua sinergia, independentemente do nível de estrela (valor provisório).
- O bônus do nível mais alto substitui o anterior; os níveis não são cumulativos.
- Não existe nível 3. Como o elenco possui 4 personagens por sinergia, o nível 2 é o bônus máximo possível.
- Exemplo: uma equipe com 7 unidades, sendo 2 Operacional, 2 Gestão e 3 Caos, ativa o nível 1 das três sinergias simultaneamente.

## 4.4. Rotação bienal: redistribuição a cada 2 dias

A redistribuição acontece em dias reais, fora da partida. O intervalo padrão é de 2 dias e pode ser ajustado no painel administrativo.

- **Âncora e índice:** a rotação vigente é identificada por índice = floor((agoraUTC - âncora) / 2 dias), com âncora configurável (padrão: 1º de janeiro de 2026, 00:00 UTC). A troca acontece automaticamente a cada fronteira de 2 dias.
- **Redistribuição completa e equilibrada:** a cada rotação, os 12 personagens são reatribuídos em grupos de 4 por sinergia.
- **Sorteio determinístico:** o embaralhamento utiliza um gerador pseudoaleatório semeado por hash(prefixo + índice de rotação). Todos os clientes calculam a mesma distribuição a partir da data atual, sem depender de servidor dedicado — coerente com a abordagem de host da Seção 10.
- **Regra de variedade:** um personagem não pode receber a mesma sinergia em duas rotações consecutivas. Distribuições que violem a regra são descartadas e o sorteio continua, sempre de forma determinística.
- **Partidas em andamento:** uma partida iniciada antes da troca mantém, até o fim, a distribuição vigente no momento em que foi criada. O índice de rotação é registrado no estado da sala (Seção 11).
- **Override administrativo:** o administrador pode fixar manualmente uma distribuição no painel; enquanto o override estiver ativo, ele substitui o sorteio.
- **Contagem regressiva:** a interface exibe o tempo restante até a próxima troca, calculado a partir da próxima fronteira.

Algoritmo de distribuição (pseudocódigo):

```text
função obterDistribuição(agoraUTC):
    índice = floor((agoraUTC - âncora) / (2 dias))
    se override ativo:
        retornar override
    gerador = PRNG(hash(prefixoSemente + índice))
    repetir:
        permutação = embaralhar(12 personagens, gerador)
        distribuição = permutação[0–3]  → Operacional
                        permutação[4–7]  → Gestão
                        permutação[8–11] → Caos
    até nenhum personagem repetir a sinergia da rotação anterior
    retornar distribuição
```

A distribuição da primeira rotação é fixa e definida manualmente (Seção 4.5). A partir daí, cada distribuição depende apenas da anterior e do índice de rotação, o que mantém toda a cadeia determinística e reproduzível.

## 4.5. Distribuição inicial (v1)

A distribuição de lançamento foi montada por afinidade temática entre o arquétipo, a habilidade e a sinergia.

| Personagem | Arquétipo | Sinergia | Justificativa temática |
| ---------- | --------- | -------- | ---------------------- |
| Bixo | Guardião | Operacional | Postura Defensiva: segura as pontas e mantém a operação de pé |
| Wilian | Congelador | Operacional | Congelar: trava o problema até alguém conseguir resolver |
| Wender | Autômato | Operacional | Sobrecarga: mantém a empresa funcionando cobrindo todos os turnos |
| Marquinhos | Vampiro | Operacional | Drenar Vida: sobrevive à custa da própria recuperação |
| Helder | Curandeiro | Gestão | Presença Majestosa: coordena o time e mantém todos em campo |
| João Lucas | Franco-atirador | Gestão | Precisão de quem segue o planejamento à risca, sempre no lugar certo |
| Felipão | Atirador | Gestão | Chuva de Cubo Mágico: automação em massa, processos organizados |
| Gustavo | Engenheiro | Gestão | Engenharia de verdade: planejamento e coordenação técnica |
| Vinícius | Berserker | Caos | Fúria pura: decisões questionáveis executadas com agressividade |
| Leo | Assassino | Caos | Emboscada: deploy na sexta-feira à tarde, clássico da improvisação |
| Matheus | Envenenador | Caos | Dano gradual: solução duvidosa que só faz efeito depois |
| Moço | Apostador | Caos | Roleta: cada decisão é uma aposta duvidosa |

A partir da primeira rotação após o lançamento, essa distribuição deixa de valer e passa a ser regida pelo sorteio determinístico.

## 4.6. Interface e feedback visual

- **Badge de sinergia:** ícone e cor da sinergia exibidos no card da loja, nas unidades do tabuleiro e na reserva.
- **Painel de sinergias:** área da parte inferior da tela listando as três sinergias, com contagem atual, nível ativo e próxima meta (exemplo: "Caos 2/4").
- **Contagem regressiva:** indicação do tempo restante para a próxima redistribuição, junto ao painel de sinergias.
- **Destaque de rotação:** após cada troca, os personagens que mudaram de sinergia recebem um selo de atualização na primeira exibição.
- **Consulta:** clicar em uma unidade mostra a sinergia vigente, o bônus ativo e a explicação da sinergia.

## 4.7. Integração com os sistemas existentes

- **Combate:** os bônus se dividem em dois grupos. Os modificadores estáticos (resistência da Operacional, dano e velocidade de ataque do Caos) são calculados uma única vez, no início da simulação, e aplicados como modificadores de atributos das unidades. Os efeitos dinâmicos (regeneração periódica da Operacional, recarga acelerada e amplificação de efeitos positivos da Gestão) operam durante o combate por meio de gatilhos fixos de tempo simulado e de multiplicadores aplicados pelo sistema de habilidades (Seção 5.6).
- **Fusão:** a sinergia pertence ao personagem e não muda com a fusão; a contagem continua sendo por unidade presente no tabuleiro.
- **Loja:** os cards exibem a sinergia vigente, permitindo planejar compras para a rotação atual.
- **Economia:** sinergias não alteram moedas, custos ou probabilidades da loja.
- **Data-driven:** definições das sinergias, níveis, efeitos e parâmetros da rotação ficam em gameConfig, editáveis no painel administrativo, seguindo os princípios da Seção 7.

## 4.8. Estrutura de dados

Definição das três sinergias:

```json
{
  "id": "operacional",
  "name": "Operacional",
  "fullName": "Operacional — Resistência e sobrevivência",
  "color": "#22C55E",
  "icon": "synergies/operacional.png",
  "appliesTo": "allTeam",
  "tiers": [
    {
      "threshold": 2,
      "effects": [
        { "type": "resistance_bonus", "value": 0.10 },
        { "type": "hp_regen", "value": 0.015, "tickSeconds": 3 }
      ]
    },
    {
      "threshold": 4,
      "effects": [
        { "type": "resistance_bonus", "value": 0.18 },
        { "type": "hp_regen", "value": 0.03, "tickSeconds": 3 }
      ]
    }
  ]
}
```

```json
{
  "id": "gestao",
  "name": "Gestão",
  "fullName": "Gestão — Estratégia e suporte",
  "color": "#3B82F6",
  "icon": "synergies/gestao.png",
  "appliesTo": "allTeam",
  "tiers": [
    {
      "threshold": 2,
      "effects": [
        { "type": "cooldown_reduction", "value": 0.15 },
        { "type": "positive_effect_amplification", "value": 0.15 }
      ]
    },
    {
      "threshold": 4,
      "effects": [
        { "type": "cooldown_reduction", "value": 0.25 },
        { "type": "positive_effect_amplification", "value": 0.25 }
      ]
    }
  ]
}
```

```json
{
  "id": "caos",
  "name": "Caos",
  "fullName": "Caos — Dano e agressividade",
  "color": "#F97316",
  "icon": "synergies/caos.png",
  "appliesTo": "allTeam",
  "tiers": [
    {
      "threshold": 2,
      "effects": [
        { "type": "attribute_multiplier", "attribute": "damage", "value": 1.12 },
        { "type": "attribute_multiplier", "attribute": "attackSpeed", "value": 1.10 }
      ]
    },
    {
      "threshold": 4,
      "effects": [
        { "type": "attribute_multiplier", "attribute": "damage", "value": 1.25 },
        { "type": "attribute_multiplier", "attribute": "attackSpeed", "value": 1.20 }
      ]
    }
  ]
}
```

Tipos de efeito reutilizáveis suportados pelas sinergias:

| Tipo | Parâmetros | Descrição |
| ---- | ---------- | --------- |
| attribute_multiplier | attribute, value | Multiplica um atributo (damage, attackSpeed etc.) |
| resistance_bonus | value | Reduz o dano recebido em value (fração; alimenta a resistência da Seção 3) |
| hp_regen | value, tickSeconds | Recupera value (fração da vida máxima) a cada tickSeconds de tempo simulado |
| cooldown_reduction | value | Reduz o tempo de recarga das habilidades especiais em value (fração) |
| positive_effect_amplification | value | Amplifica em value (fração) os efeitos positivos concedidos por habilidades, como cura, escudo e bônus |

Configuração da rotação:

```json
{
  "intervalDays": 2,
  "anchor": "2026-01-01T00:00:00Z",
  "seedPrefix": "merge-escritorio-rot-",
  "strategy": "deterministic_shuffle",
  "balancedCounts": { "operacional": 4, "gestao": 4, "caos": 4 },
  "noRepeatConsecutive": true,
  "override": null
}
```

Formato do registro da distribuição vigente (exemplo ilustrativo, correspondente à distribuição inicial v1 da Seção 4.5):

```json
{
  "rotationIndex": 0,
  "validFrom": "2026-01-01T00:00:00Z",
  "validUntil": "2026-01-03T00:00:00Z",
  "mapping": {
    "bixo": "operacional",
    "wilian": "operacional",
    "wender": "operacional",
    "marquinhos": "operacional",
    "helder": "gestao",
    "joao_lucas": "gestao",
    "felipao": "gestao",
    "gustavo": "gestao",
    "vinicius": "caos",
    "leo": "caos",
    "matheus": "caos",
    "moco": "caos"
  }
}
```

## 4.9. Balanceamento e extensões futuras

- Todos os percentuais são valores iniciais provisórios, sujeitos a ajuste após testes, como o restante do documento.
- Como os bônus são modificadores genéricos de atributo e efeitos reutilizáveis, qualquer redistribuição permanece equilibrada: nenhuma combinação exige código específico.
- A Operacional e a Gestão são sinergias de sustentação e tendem a alongar o combate; o Caos tende a encurtá-lo. A duração média das partidas com nível 2 de cada sinergia deve ser monitorada durante o balanceamento.
- O nível 2 exige metade do tabuleiro dedicada a uma sinergia; a taxa de vitória de equipes com nível 2 deve ser monitorada durante o balanceamento.
- A contagem por estrela (cada unidade vale 1 ponto) pode evoluir para pesos por estrela após testes.
- Extensões futuras: uma quarta sinergia, patamares adicionais, sinergias temporárias de evento, restrição de escopo por sinergia (unidades próprias em vez da equipe inteira, via campo appliesTo) e pesos por raridade. O mesmo mecanismo de rotação pode ser reaproveitado para eventos especiais.

# 5. Sistema de combate

O combate é inteiramente automático.

O jogador não controla diretamente os personagens durante a batalha.

Cada unidade executa uma rotina de comportamento.

## 5.1. Ciclo de comportamento

A cada atualização de combate, o personagem:

1. Verifica se está vivo.
2. Verifica se possui um alvo válido.
3. Verifica se o alvo está dentro do alcance.
4. Se estiver, executa um ataque quando o tempo de recarga permitir.
5. Caso contrário, procura o inimigo mais próximo.
6. Calcula um caminho até uma posição de ataque.
7. Move-se pelo tabuleiro.
8. Verifica novamente a possibilidade de atacar.

## 5.2. Inteligência artificial

O comportamento deve ser configurável por personagem.

Alguns parâmetros possíveis:

- Prioridade de alvo.
- Distância preferida do inimigo.
- Distância mínima para manter.
- Preferência por alvos com pouca vida.
- Preferência por alvos próximos.
- Tendência a perseguir.
- Tendência a fugir.
- Velocidade de movimentação.
- Intervalo de ataque.

O objetivo é permitir que o administrador ajuste o comportamento de cada personagem sem precisar escrever uma nova inteligência artificial.

## 5.3. Pathfinding

O tabuleiro é hexagonal.

O deslocamento será calculado por um algoritmo de busca em grafo.

A primeira implementação utilizará BFS (Breadth-First Search), suficiente para o tamanho reduzido do tabuleiro.

O sistema deve considerar:

- Casas ocupadas.
- Unidades aliadas.
- Unidades adversárias.
- Obstáculos.
- Posições de ataque válidas.

## 5.4. Habilidades especiais

Cada personagem possui exatamente uma habilidade especial.

As habilidades são executadas automaticamente quando suas condições de ativação são atendidas.

O sistema de habilidades deve permitir configurar:

- Tempo de recarga.
- Condição de ativação.
- Alcance.
- Área de efeito.
- Dano.
- Cura.
- Duração.
- Efeitos negativos.
- Efeitos positivos.
- Quantidade de alvos.

A implementação deve utilizar um sistema de efeitos reutilizáveis, evitando código específico para cada personagem sempre que possível.

## 5.5. Empates

Quando o limite de tempo terminar, vence o jogador com maior percentual de vida restante somada.

Se houver empate:

1. Vence quem tiver mais personagens vivos.
2. Se ainda houver empate, o resultado é empate.

Um empate não causa perda de vida.

## 5.6. Bônus de sinergia

Os bônus de sinergia (Seção 4) fazem parte do estado inicial do combate. O host identifica o índice de rotação vigente, conta as unidades de cada sinergia no tabuleiro, determina os níveis ativos e prepara os efeitos antes do primeiro passo da simulação.

Os efeitos se dividem em duas categorias:

- **Modificadores estáticos:** resistência (Operacional) e os multiplicadores de dano e velocidade de ataque (Caos) são aplicados aos atributos das unidades antes do primeiro passo.
- **Efeitos dinâmicos:** a regeneração periódica de vida (Operacional) opera em gatilhos fixos do tempo simulado, a cada tickSeconds segundos; a redução de recarga e a amplificação de efeitos positivos (Gestão) são multiplicadores consultados pelo sistema de habilidades durante a execução.

Todos os gatilhos dependem apenas do tempo simulado e do estado inicial, sem aleatoriedade própria ou eventos externos. Os efeitos de sinergia continuam previsíveis e reproduzíveis, preservando o determinismo descrito na Seção 9.

# 6. Design visual

## 6.1. Direção artística

O jogo terá uma identidade visual 2D simples, cartunesca e bem-humorada.

A prioridade não é produzir animações complexas, mas criar personagens reconhecíveis e uma batalha fácil de acompanhar.

Referências gerais:

- Jogos auto battler com tabuleiros organizados.
- Sprites 2D de jogos independentes.
- Interface de jogos incrementais e estratégicos.
- Efeitos visuais simples e exagerados.

## 6.2. Personagens

Os personagens serão representados por sprites estáticos.

Não será necessário criar spritesheets completos de caminhada, ataque, idle ou morte.

Cada personagem terá uma imagem principal, preferencialmente em PNG com transparência.

A animação será produzida por código, modificando a apresentação do sprite.

### Animações procedurais

| Efeito | Comportamento                                     |
| ------ | ------------------------------------------------- |
| Wiggle | Pequena rotação lateral contínua                  |
| Idle   | Oscilação vertical suave                          |
| Walk   | Oscilação vertical e inclinação durante movimento |
| Attack | Avanço rápido em direção ao alvo                  |
| Hit    | Pequeno recuo e tremor                            |
| Death  | Rotação, redução de escala e desaparecimento      |
| Skill  | Efeitos visuais específicos da habilidade         |

As animações devem utilizar interpolação suave, como easing, para evitar movimentos bruscos.

### Princípio importante

A posição lógica de um personagem não deve depender da animação visual.

O jogo calcula a posição real da unidade no tabuleiro. O renderizador apenas apresenta o sprite e aplica transformações temporárias.

Isso permite alterar as animações sem afetar a simulação do combate.

## 6.3. Efeitos visuais

Os efeitos serão produzidos preferencialmente por código.

Exemplos:

- Projéteis simples.
- Partículas.
- Explosões.
- Áreas circulares.
- Linhas e trajetórias.
- Números de dano.
- Indicadores de cura.
- Efeitos de congelamento.
- Indicadores de envenenamento.

Não é necessário criar uma imagem para cada efeito.

O sistema deve possuir componentes reutilizáveis de partículas, projéteis, impactos e áreas de efeito.

## 6.4. Interface

A interface deve ser simples e funcional.

### Tela de sala

- Código da sala.
- Lista de jogadores.
- Indicador de conexão.
- Botão para iniciar a partida.
- Opção de copiar convite.

### Tela principal de jogo

A tela será dividida em três áreas:

**Parte superior**

- Vidas dos jogadores.
- Rodada atual.
- Cronômetro.
- Estado da partida.

**Área central**

- Tabuleiro hexagonal.
- Personagens posicionados.
- Indicadores de vida.
- Efeitos de combate.

**Parte inferior**

- Loja de personagens.
- Moedas.
- Botão de atualização.
- Reserva.
- Painel de sinergias ativas, com contagem por sinergia, nível ativo e contagem regressiva para a próxima redistribuição (Seção 4).
- Botão Pronto.

### Interações

- Clique em um personagem para selecioná-lo.
- Clique em uma casa vazia para posicioná-lo.
- Arraste personagens para reorganizá-los.
- Clique em uma unidade para consultar seus atributos, habilidade e sinergia vigente.
- Clique em uma unidade da loja para comprá-la.

# 7. Sistema Data-Driven de personagens

Este é um dos requisitos mais importantes do projeto.

A criação de personagens deve ser independente da implementação do código de combate.

O jogo deverá possuir uma tela administrativa que permita criar, editar, remover e testar personagens.

O administrador não deverá precisar modificar arquivos TypeScript para adicionar um novo personagem.

## 7.1. Painel administrativo

O painel será acessível por uma rota separada, por exemplo:

`/admin`

O acesso deverá ser protegido por autenticação e autorização administrativa.

O painel terá uma lista de personagens cadastrados, um formulário de edição e uma seção dedicada às sinergias e à rotação bienal (Seção 7.8).

### Cadastro de personagem

Campos:

**Identificação**

- ID interno.
- Nome do personagem.
- Nome do arquétipo.
- Descrição.
- Categoria.
- Raridade.
- Status ativo/inativo.
- Sinergia vigente (somente leitura, derivada da rotação da Seção 4).

**Sprite**

- Upload de imagem.
- Pré-visualização.
- Ajuste de escala.
- Ajuste de posição.
- Configuração de ponto de ancoragem.

**Atributos**

- Vida.
- Dano.
- Velocidade de ataque.
- Alcance.
- Mobilidade.

**Comportamento**

- Perfil de movimentação.
- Perfil de alvo.
- Distância preferida.
- Perfil de ataque.
- Prioridade de perseguição.

**Habilidade especial**

- Nome.
- Descrição.
- Tipo de habilidade.
- Condição de ativação.
- Tempo de recarga.
- Alcance.
- Área de efeito.
- Dano, cura ou modificadores.
- Duração.
- Efeitos visuais associados.

**Evolução**

- Multiplicador de atributos por estrela.
- Modificadores de habilidade por nível.

## 7.2. Editor de comportamento

O administrador poderá escolher comportamentos predefinidos.

Exemplos:

| Perfil          | Comportamento                         |
| --------------- | ------------------------------------- |
| Corpo a corpo   | Persegue o inimigo mais próximo       |
| Atirador        | Mantém distância e ataca              |
| Franco-atirador | Procura posições distantes            |
| Tanque          | Avança e permanece na linha de frente |
| Suporte         | Prioriza aliados feridos              |
| Controle        | Prioriza grupos de inimigos           |

O perfil poderá ser complementado com parâmetros numéricos.

A ideia é utilizar configurações, não scripts arbitrários.

## 7.3. Editor de habilidades

O editor deve oferecer uma lista de efeitos disponíveis.

Exemplos de efeitos reutilizáveis:

- Causar dano.
- Causar dano em área.
- Aplicar veneno.
- Aplicar lentidão.
- Aplicar congelamento.
- Recuperar vida.
- Reduzir dano recebido.
- Aumentar velocidade.
- Invocar uma unidade temporária.
- Disparar projétil.
- Perfurar alvos.
- Aplicar efeito de confusão.

Uma habilidade pode combinar vários efeitos.

Por exemplo, a habilidade do Matheus poderia ser configurada com:

1. Criar uma área de sujeira.
2. Aplicar enfraquecimento nos inimigos dentro da área.
3. Identificar o inimigo central.
4. Aplicar envenenamento nesse inimigo.

O painel deverá permitir configurar os parâmetros sem criar uma implementação específica para Matheus.

## 7.4. Exceções de comportamento

Nem toda habilidade poderá ser representada apenas por parâmetros.

Alguns comportamentos especiais, como a trajetória em L do João Lucas ou a aleatoriedade do Moço, podem exigir implementações específicas.

Para esses casos, o sistema deverá utilizar identificadores de comportamento registrados no código.

Exemplo:

- `straight_projectile`
- `piercing_projectile`
- `l_shaped_projectile`
- `random_attack`
- `area_explosion`
- `summon_units`

O administrador seleciona uma implementação disponível e configura seus parâmetros.

Assim, o sistema continua data-driven sem permitir que o painel execute código arbitrário.

## 7.5. Exemplo de estrutura de personagem

Exemplo ilustrativo de configuração:

```json
{
  "id": "guardiao_bixo",
  "name": "Bixo",
  "archetype": "Guardião",
  "rarity": "common",
  "sprite": "characters/bixo.png",
  "stats": {
    "health": 10,
    "damage": 4,
    "attackSpeed": 3,
    "range": 1,
    "mobility": 3
  },
  "behavior": {
    "movement": "frontline",
    "targetPriority": "nearest",
    "preferredDistance": 1
  },
  "ability": {
    "id": "defensive_stance",
    "name": "Descansar, né",
    "activation": "health_threshold",
    "effects": [
      {
        "type": "damage_reduction",
        "value": 0.7,
        "duration": 4
      }
    ]
  },
  "visual": {
    "idleAnimation": "wiggle",
    "walkAnimation": "bounce",
    "attackAnimation": "lunge",
    "hitAnimation": "shake"
  }
}
```

Os valores desse exemplo são ilustrativos. A estrutura deverá ser validada e adaptada às regras definitivas de combate.

## 7.6. Gerenciamento de sprites

As imagens não devem ser armazenadas diretamente no banco de dados.

O painel deverá enviar os arquivos para um serviço de armazenamento de imagens.

O banco guarda apenas o endereço do sprite e seus metadados.

Requisitos:

- PNG com transparência.
- Dimensões padronizadas.
- Pré-visualização no painel.
- Controle de escala.
- Possibilidade de substituir imagens.
- Validação de formato e tamanho.

## 7.7. Pré-visualização e teste

O painel administrativo deverá possuir uma área de teste.

O administrador poderá:

- Visualizar o sprite.
- Testar animações procedurais.
- Simular movimentação.
- Visualizar ataques.
- Ativar a habilidade manualmente.
- Testar os valores dos atributos.

Isso permitirá ajustar personagens sem iniciar uma partida multiplayer.

## 7.8. Editor de sinergias e rotação

O painel administrativo possui uma seção dedicada ao sistema de sinergias (Seção 4), com:

- **Cadastro de sinergias:** nome, descrição, cor, ícone, público de aplicação (equipe inteira ou unidades da própria sinergia) e efeitos de cada nível.
- **Editor de níveis:** limiar de contagem e efeitos de cada nível, utilizando o sistema de efeitos reutilizáveis descrito na Seção 4.8 (attribute_multiplier, resistance_bonus, hp_regen, cooldown_reduction e positive_effect_amplification).
- **Configuração da rotação:** intervalo em dias, âncora, prefixo da semente, regra de não repetição consecutiva e contagens equilibradas por sinergia.
- **Override manual:** fixação de uma distribuição específica, com agendamento de remoção.
- **Pré-visualização:** exibição da distribuição vigente, da próxima distribuição calculada e do histórico das últimas rotações.
- **Publicação:** alterações seguem o fluxo de versões da Seção 12, e partidas em andamento não são afetadas.

# 8. Arquitetura técnica

A arquitetura deve separar claramente a simulação do jogo, a renderização visual e a comunicação multiplayer.

## 8.1. Tecnologias recomendadas

| Tecnologia                 | Responsabilidade                         |
| -------------------------- | ---------------------------------------- |
| TypeScript                 | Linguagem principal                      |
| Phaser 3                   | Renderização 2D e interface do tabuleiro |
| Vite                       | Desenvolvimento e build                  |
| Firebase Authentication    | Autenticação                             |
| Firebase Realtime Database | Salas e sincronização                    |
| Firebase Storage           | Sprites e arquivos                       |
| Vitest                     | Testes automatizados                     |
| GitHub                     | Controle de versão                       |
| Cloudflare Pages           | Hospedagem do frontend                   |

O Firebase e o Cloudflare possuem opções gratuitas, mas os limites e condições podem mudar. O projeto deverá monitorar consumo e custos.

## 8.2. Separação de responsabilidades

A arquitetura será dividida em módulos.

### Core

Responsável pelas regras do jogo.

Não deve depender do Phaser.

Contém:

- Sistema de rodadas.
- Economia.
- Loja.
- Compra e venda.
- Fusão.
- Sinergias e cálculo da rotação bienal.
- Gerenciamento de vidas.
- Regras de vitória e derrota.

### Combat

Responsável pela simulação de combate.

Contém:

- Unidades.
- Movimento.
- Pathfinding.
- Seleção de alvos.
- Ataques.
- Habilidades.
- Efeitos temporários.
- Resolução de combate.

### Rendering

Responsável pela apresentação visual.

Contém:

- Tabuleiro hexagonal.
- Sprites.
- Animações procedurais.
- Partículas.
- Projéteis.
- Indicadores de vida.
- Interface de combate.

### Multiplayer

Responsável pela comunicação entre jogadores.

Contém:

- Criação de salas.
- Entrada e saída de jogadores.
- Estado da partida.
- Sincronização.
- Reconexão.
- Controle de host.
- Resultados dos combates.

### Admin

Responsável pela criação e edição de conteúdo.

Contém:

- Cadastro de personagens.
- Upload de sprites.
- Editor de atributos.
- Editor de habilidades.
- Editor de comportamentos.
- Pré-visualização.
- Publicação de configurações.

## 8.3. Organização de diretórios

```text
src/
├── core/
│   ├── game/
│   ├── economy/
│   ├── shop/
│   ├── fusion/
│   ├── synergies/
│   ├── rounds/
│   └── players/
│
├── combat/
│   ├── engine/
│   ├── units/
│   ├── movement/
│   ├── pathfinding/
│   ├── targeting/
│   ├── attacks/
│   ├── abilities/
│   └── effects/
│
├── rendering/
│   ├── scenes/
│   ├── board/
│   ├── sprites/
│   ├── animations/
│   ├── particles/
│   └── ui/
│
├── multiplayer/
│   ├── rooms/
│   ├── synchronization/
│   ├── host/
│   └── state/
│
├── admin/
│   ├── characters/
│   ├── abilities/
│   ├── behaviors/
│   ├── synergies/
│   ├── sprites/
│   └── preview/
│
├── data/
│   ├── schemas/
│   ├── defaults/
│   └── repositories/
│
└── shared/
    ├── types/
    ├── constants/
    └── utils/
```

# 9. Simulação determinística

A simulação do combate deverá ser independente da renderização.

Isso significa que o jogo deve calcular o resultado do combate sem depender da velocidade de animação ou da taxa de quadros do navegador.

A simulação utilizará:

- Tempo em passos fixos.
- Semente aleatória por combate.
- Regras determinísticas.
- Estado independente da interface.

Por exemplo, um combate pode ser simulado em passos de 50 milissegundos.

O Phaser apenas recebe o estado calculado e apresenta os movimentos correspondentes.

Isso permite que dois computadores reproduzam o mesmo combate a partir do mesmo estado inicial e da mesma semente.

Os bônus de sinergia fazem parte do estado inicial: o índice de rotação vigente (Seção 4.4) define os modificadores aplicados às unidades antes do primeiro passo. Os efeitos dinâmicos de sinergia (regeneração, recarga e amplificação; Seção 5.6) dependem apenas do tempo simulado e de valores fixos, garantindo que todos os clientes calculem exatamente o mesmo combate.

# 10. Multiplayer e sincronização

O jogo utilizará salas privadas.

Cada sala terá:

- Identificador.
- Lista de jogadores.
- Estado atual.
- Configuração da partida.
- Rodada.
- Cronômetro.
- Resultado dos combates.

## 10.1. Estados da partida

```text
WAITING
   |
   v
PREPARATION
   |
   v
COMBAT
   |
   v
RESULT
   |
   v
PREPARATION
   |
   v
FINISHED
```

## 10.2. Host da partida

Para evitar a necessidade de um servidor dedicado, a primeira versão poderá utilizar um dos jogadores como host.

O host será responsável por:

- Coordenar o início das fases.
- Determinar os confrontos.
- Executar as simulações oficiais.
- Publicar os resultados.
- Atualizar o estado da partida.

Os demais clientes poderão reproduzir a simulação localmente para apresentar as animações.

O resultado oficial será aquele publicado pelo host.

Essa abordagem é adequada para um jogo casual entre amigos, mas não é resistente a trapaças.

Para uma versão pública e competitiva, será necessário migrar a autoridade da simulação para um servidor confiável.

## 10.3. Segurança

As regras do Firebase deverão impedir que um jogador altere diretamente os dados de outros jogadores.

O painel administrativo deverá ter permissões exclusivas.

A publicação de personagens e alterações de balanceamento também deverá ser restrita.

A troca de host e a reconexão precisam ser consideradas para evitar que uma desconexão interrompa toda a partida.

# 11. Banco de dados

Uma estrutura inicial no Firebase Realtime Database poderá ser:

```text
rooms/
  ABC123/
    metadata/
      status
      hostId
      currentRound
      createdAt

    players/
      playerId/
        name
        lives
        coins
        ready
        board
        reserve

    match/
      phase
      timer
      pairings
      seed
      synergyRotationIndex

    combat/
      playerA
      playerB
      result

characters/
  characterId/
    name
    archetype
    sprite
    stats
    behavior
    ability

gameConfig/
  economy
  rounds
  shop
  fusion
  synergies
  synergyRotation
```

Os arquivos de sprites ficarão no Firebase Storage ou em outro armazenamento de arquivos.

O banco armazenará apenas referências e configurações.

# 12. Administração e publicação de conteúdo

O painel administrativo será uma ferramenta de desenvolvimento e manutenção do jogo.

Ele deverá permitir alterar o elenco sem precisar publicar uma nova versão do frontend para cada personagem.

Fluxo:

1. Administrador abre `/admin`.
2. Cria um personagem.
3. Define nome e arquétipo.
4. Envia o sprite.
5. Configura os atributos.
6. Seleciona um comportamento.
7. Configura a habilidade especial.
8. Testa o personagem.
9. Salva como rascunho.
10. Publica para utilização nas próximas partidas.

Cada configuração publicada deverá possuir uma versão.

Partidas já iniciadas devem manter a configuração com a qual começaram, evitando que uma edição administrativa altere um combate em andamento.

O mesmo princípio se aplica às definições de sinergias e aos parâmetros de rotação da Seção 4: uma partida iniciada antes de uma troca de rotação ou de uma edição administrativa mantém a distribuição e os valores com os quais começou.

# 13. Ferramentas de desenvolvimento

## Obrigatórias

- Node.js LTS.
- TypeScript.
- Visual Studio Code ou outro editor.
- Git.
- GitHub.
- Phaser 3.
- Vite.
- Firebase.
- Vitest.

## Ferramentas complementares

- **Aseprite:** criação e edição de sprites 2D.
- **LibreSprite:** alternativa gratuita ao Aseprite.
- **Tiled:** criação e visualização de mapas, caso necessário.
- **Figma:** prototipagem de interface.
- **Blockbench:** não é necessário para o jogo inicial, pois o projeto será 2D.

# 14. Plano de desenvolvimento

O desenvolvimento deverá ser incremental.

## Etapa 1 — Protótipo offline

Objetivo: validar o combate.

Implementar:

- Tabuleiro hexagonal.
- 38 casas.
- Dois lados.
- Dois personagens genéricos.
- Movimentação automática.
- Seleção de alvo.
- Ataque.
- Vida.
- Vitória e derrota.
- Animações procedurais básicas.

Não implementar multiplayer ainda.

## Etapa 2 — Sistema de personagens

Implementar:

- Estrutura data-driven.
- Carregamento de personagens.
- Atributos.
- Sprites.
- Perfis de comportamento.
- Sistema de habilidades.
- Efeitos temporários.

Cadastrar os 12 personagens iniciais.

## Etapa 3 — Gameplay completo

Implementar:

- Loja.
- Moedas.
- Compra e venda.
- Reserva.
- Fusão.
- Sistema de sinergias: contagem por sinergia, ativação de níveis e aplicação de bônus estáticos e dinâmicos (Seção 4).
- Rodadas.
- Vidas.
- Eliminação.
- Tela de resultados.

## Etapa 4 — Multiplayer

Implementar:

- Salas privadas.
- Entrada de jogadores.
- Sincronização.
- Sincronização da distribuição de sinergias (índice de rotação vigente).
- Preparação simultânea.
- Pareamento.
- Host.
- Resultados oficiais.
- Reconexão.

## Etapa 5 — Painel administrativo

Implementar:

- Autenticação administrativa.
- Cadastro de personagens.
- Upload de sprites.
- Editor de atributos.
- Editor de habilidades.
- Editor de sinergias e parâmetros da rotação bienal (Seção 7.8).
- Editor de comportamento.
- Pré-visualização.
- Publicação de versões.

## Etapa 6 — Polimento

Implementar:

- Efeitos visuais.
- Sons.
- Melhorias de interface.
- Balanceamento.
- Otimização.
- Testes com jogadores reais.

# 15. Escopo do MVP

A primeira versão jogável deverá conter:

- Quatro jogadores.
- Salas privadas.
- Tabuleiro hexagonal.
- Preparação e combate.
- Loja aleatória.
- Economia.
- Fusão de personagens.
- Eliminação.
- Os 12 personagens iniciais.
- Uma habilidade especial por personagem.
- Sistema de sinergias com as três sinergias iniciais e redistribuição a cada 2 dias.
- Sprites estáticos com animações procedurais.
- Sistema básico de administração de personagens.

Recursos como eventos especiais, equipamentos, estatísticas avançadas, sinergias adicionais além das três iniciais e efeitos de temporada ficam para versões futuras.

# 16. Decisões fundamentais

1. O jogo será 2D e utilizará sprites estáticos.
2. As animações serão realizadas por código.
3. A simulação de combate será independente do renderizador.
4. O jogo terá 12 personagens iniciais.
5. Cada personagem terá exatamente uma habilidade especial.
6. A criação de personagens será data-driven.
7. O painel administrativo permitirá cadastrar personagens sem alterar o código.
8. Habilidades e comportamentos serão compostos por configurações e efeitos reutilizáveis.
9. Exceções especiais poderão utilizar comportamentos previamente implementados no código.
10. O multiplayer utilizará salas privadas e sincronização via Firebase.
11. O protótipo offline será desenvolvido antes da implementação multiplayer.
12. As sinergias são Operacional (resistência e sobrevivência), Gestão (estratégia e suporte) e Caos (dano e agressividade), são ativadas por contagem de unidades no tabuleiro e são redistribuídas entre os personagens a cada 2 dias por sorteio determinístico.

---

**Objetivo final:** criar um auto battler multiplayer leve, divertido e extensível, no qual o conteúdo possa ser facilmente personalizado por meio de um painel administrativo, sem que cada novo personagem exija uma nova implementação de código.
