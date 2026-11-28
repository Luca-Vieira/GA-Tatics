import { z } from 'zod';
import { auxiliarySpriteSlotsOf } from '@data/auxiliarySprites';
import { statusKindSchema, TERRAIN_STATUS_KINDS } from '@data/schemas/ability';
import { attackSchema, DEFAULT_ATTACK } from '@data/schemas/attack';
import { characterSchema } from '@data/schemas/character';
import { MAXIMUM_SYNERGY_COUNT, MINIMUM_SYNERGY_COUNT, type GameContent } from '@data/schemas/content';
import { towerVariantSchema } from '@data/schemas/gameConfig';
import { MAP_TEXTURES, MAXIMUM_MAPS, mapSchema } from '@data/schemas/map';
import { MINIMUM_CHARACTERS_PER_SYNERGY, synergySchema } from '@data/schemas/synergy';
import { DEFAULT_COMBAT_TIME_LIMIT_MS } from '@combat/engine/constants';
import { HEALTH_PER_POINT, STAR_MULTIPLIERS, toCombatStats } from '@combat/units/stats';
import { ATTACK_SHAPES, attackShapeLabel, describeAttackArea } from '@shared/utils/attackArea';
import { BOARD_COLUMNS, BOARD_ROWS } from '@shared/constants/board';
import { MAXIMUM_SPRITE_BYTES, MAXIMUM_SPRITE_DIMENSION } from './spriteFile';
import { newActivation, newEffect, newRegisteredBehavior, newSynergyEffect, newSynergyTier, SYNERGY_EFFECT_TYPE_OPTIONS, type EffectType, type SynergyEffectType } from './fieldSpecs';

/** Personagens do elenco padrão usados como exemplos completos (os que existirem no conteúdo atual). */
const EXAMPLE_CHARACTER_IDS = ['bixo', 'gustavo', 'derson', 'wender'];

const STATUS_DESCRIPTIONS: Readonly<Record<z.infer<typeof statusKindSchema>, { description: string; usesValue: string; needs?: string }>> = {
  poison: { description: 'Dano contínuo a cada pulso, que ignora resistência e reduções.', usesValue: 'Dano por pulso, em fração do dano do personagem (0.35 = 35% do dano por pulso).', needs: 'tickSeconds' },
  drain: { description: 'Como o veneno, mas parte do dano causado volta como cura para quem aplicou. Para se o alvo se afastar demais.', usesValue: 'Dano por pulso, em fração do dano do personagem.', needs: 'tickSeconds (e healRatio opcional: fração do dano que vira cura)' },
  slow: { description: 'Deixa o alvo mais lento: reduz a velocidade de movimento e a de ataque.', usesValue: 'Fração da redução (0.3 = 30% mais lento).' },
  sleep: { description: 'O alvo dorme: não ataca, não anda e não usa habilidades enquanto durar.', usesValue: 'Não usa.' },
  weaken: { description: 'Enfraquece o alvo: ele causa menos dano.', usesValue: 'Fração da redução do dano causado (0.2 = 20% menos).' },
  confuse: { description: 'O alvo erra ataques: cada ataque tem uma chance de errar, por um número de ataques.', usesValue: 'Chance de errar (0 a 1).', needs: 'charges opcional: quantos ataques ficam sujeitos ao erro (padrão 1).' },
  damage_reduction: { description: 'O alvo recebe menos dano (soma com a resistência). Efeito positivo: a sinergia Gestão o amplifica.', usesValue: 'Fração do dano que deixa de ser recebido (0.7 = 70% menos).' },
  speed_boost: { description: 'Acelera o alvo: aumenta a velocidade de movimento e de ataque. Efeito positivo.', usesValue: 'Fração do aumento (0.3 = 30% mais rápido).' },
  damage_boost: { description: 'O alvo causa mais dano. Efeito positivo.', usesValue: 'Fração do aumento (0.25 = 25% mais dano).' },
  resting: { description: 'O alvo descansa: não ataca, não anda e não usa habilidades (usado por quem se protege).', usesValue: 'Não usa.' },
};

const EFFECT_DESCRIPTIONS: Readonly<Record<EffectType, { description: string; fields: Record<string, string> }>> = {
  damage: {
    description: 'Causa dano direto aos alvos. Dano = dano do personagem × multiplier (e os bônus/redutores do momento).',
    fields: {
      targets: 'center_unit | enemies_in_area | allies_in_area | self — quem recebe, em relação ao ponto central da habilidade (ver "origemDaHabilidade").',
      maxTargets: '(opcional) máximo de alvos afetados, inteiro ≥ 1.',
      prioritize: '(opcional) nearest | lowest_health_ratio — quem entra primeiro quando há mais alvos que maxTargets.',
      multiplier: 'número > 0: multiplicador do dano do personagem.',
    },
  },
  heal: {
    description: 'Cura os alvos. Cura = vida máxima do alvo × fractionOfMaxHealth × amplificação de efeitos positivos (sinergia Gestão).',
    fields: {
      targets: 'igual ao efeito damage.',
      maxTargets: '(opcional) inteiro ≥ 1.',
      prioritize: '(opcional) nearest | lowest_health_ratio.',
      fractionOfMaxHealth: 'número entre 0 (exclusive) e 1: fração da vida máxima recuperada.',
    },
  },
  status: {
    description: 'Aplica um estado temporário (ver "estados"). Reaplicar renova a duração e fica com a maior intensidade, sem acumular.',
    fields: {
      targets: 'igual ao efeito damage.',
      maxTargets: '(opcional) inteiro ≥ 1.',
      prioritize: '(opcional) nearest | lowest_health_ratio.',
      status: 'um dos estados listados em "estados".',
      durationSeconds: 'número > 0.',
      value: 'intensidade (obrigatória, exceto em sleep e resting): ver "estados".',
      tickSeconds: 'intervalo do pulso em segundos (obrigatório em poison e drain).',
      charges: '(opcional) só confuse.',
      healRatio: '(opcional) só drain.',
    },
  },
  place_trap: {
    description: 'Planta uma armadilha numa casa livre ao alcance. Quando um inimigo chega perto, ela some e invoca criaturas que perseguem e atacam por um tempo. As invocações escalam com a estrela de quem plantou e não seguram o combate.',
    fields: {
      triggerRadius: 'inteiro ≥ 0: distância (casas) em que um inimigo dispara a armadilha.',
      armingSeconds: 'número ≥ 0: tempo até a armadilha ficar ativa.',
      lifetimeSeconds: 'número > 0: tempo até a armadilha desaparecer sozinha.',
      summon: '{ name, stats (mesma escala 1–10 dos personagens), count (inteiro ≥ 1), lifetimeSeconds (> 0) }.',
    },
  },
  summon: {
    description: 'Invoca criaturas na hora, nas casas livres junto de quem usou a habilidade. Elas perseguem e atacam por um tempo, escalam com a estrela de quem invocou e não seguram o combate. O sprite de cada invocação é enviado no painel (sprites auxiliares).',
    fields: {
      summon: '{ name, stats (mesma escala 1–10 dos personagens), count (inteiro ≥ 1), lifetimeSeconds (> 0) }.',
    },
  },
  summon_decoy: {
    description: 'Cria um clone provocador perto de quem usou a habilidade (na casa livre mais próxima do alvo). O clone não ataca nem anda, mas os inimigos que estiverem a até tauntRadius casas dele passam a atacá-lo. Dura lifetimeSeconds ou até ser destruído; não segura o combate.',
    fields: {
      name: 'texto: nome do clone.',
      health: 'número de 1 a 10 (mesma escala de vida; cresce com a estrela de quem invocou).',
      lifetimeSeconds: 'número > 0.',
      tauntRadius: 'inteiro ≥ 1: raio de provocação em casas.',
      placementRange: 'inteiro ≥ 1 (padrão 2): distância máxima, a partir de quem usou, até a casa do clone.',
    },
  },
  create_terrain: {
    description: 'Cria um terreno nas casas em torno do ponto central da habilidade (definido por cast.target). Por um tempo, quem passa ou fica em cima recebe um estado, que continua por lingerSeconds depois de sair. Cada personagem em campo mantém no máximo maximumPerOwner terrenos de mesmo nome: ao criar mais um, o mais antigo some. O mesmo estado vindo de dois terrenos não soma.',
    fields: {
      name: 'texto: nome do terreno.',
      affects: '(opcional, padrão enemies) enemies | allies | everyone, em relação a quem criou.',
      status: `um destes estados: ${TERRAIN_STATUS_KINDS.join(' | ')}.`,
      value: 'intensidade, como no efeito status (no poison, dano por pulso em fração do dano do personagem).',
      tickSeconds: 'intervalo do pulso em segundos (obrigatório em poison).',
      lingerSeconds: '(opcional, padrão 1; mínimo 0,5) quanto o estado ainda vale depois de sair do terreno.',
      radius: '(opcional, padrão 0) 0 a 2 casas em torno do ponto central: 0 = 1 casa, 1 = 7, 2 = 19.',
      durationSeconds: 'número > 0: tempo que o terreno fica no chão.',
      maximumPerOwner: '(opcional, padrão 2) 1 a 6 terrenos por personagem ao mesmo tempo.',
      color: 'cor das casas, no formato #rrggbb.',
      icon: '(opcional) letra ou emoji desenhado na casa central.',
    },
  },
  registered: {
    description: 'Comportamento especial com código próprio (ver "comportamentosEspeciais"). Os que atuam continuamente usam activation "passive".',
    fields: { behavior: 'objeto com "id" e os parâmetros daquele comportamento.' },
  },
};

const REGISTERED_DESCRIPTIONS = {
  l_shaped_projectile: 'Projétil em L: acerta o alvo e, se houver outro inimigo perto do primeiro (redirectRange casas), redireciona e acerta também. Parâmetros: primaryMultiplier, secondaryMultiplier (× dano), redirectRange (inteiro ≥ 1). Usa activation por recarga com alvo (current_target).',
  random_attack: 'Cada ataque sorteia um resultado de "outcomes" ({ chance, minDamage, maxDamage }); as chances somam 1 e o dano está na escala de atributos (1 a 10, vira dano de jogo ×10). Passivo: activation "passive".',
  missing_health_haste: 'Quanto menos vida, mais rápido ataca (até maxAttackSpeedBonus); abaixo de furyBelowFraction da vida ganha furyDamageBonus de dano. Parâmetros: maxAttackSpeedBonus, furyBelowFraction (0–1], furyDamageBonus. Passivo: activation "passive".',
} as const;

function statConversionTable(): Record<string, Record<string, number>> {
  const table: Record<string, Record<string, number>> = {};
  for (let value = 1; value <= 10; value++) {
    const stats = toCombatStats({ health: value, damage: value, attackSpeed: value, range: value, mobility: value });
    table[String(value)] = {
      vidaDeJogo: stats.maxHealth,
      danoDeJogo: stats.damage,
      ataquesPorSegundo: Number(stats.attacksPerSecond.toFixed(2)),
      casasPorSegundo: Number(stats.hexesPerSecond.toFixed(2)),
    };
  }
  return table;
}

/** Alcance usado só para descrever cada formato de ataque. */
const EXAMPLE_ATTACK_RANGE = 3;

function basicAttackReference(): Record<string, unknown> {
  return {
    campo: 'attack (opcional): { shape, maxTargets, splashDamageFraction, poisonOnHit }. Sem ele, o personagem ataca em círculo, um inimigo por golpe.',
    orientacao: 'O ataque se vira para o alvo, para a esquerda ou para a direita do tabuleiro; o comprimento da área é o alcance dos atributos.',
    formatos: Object.fromEntries(ATTACK_SHAPES.map((shape) => [shape, { nome: attackShapeLabel(shape), descricao: describeAttackArea(shape, EXAMPLE_ATTACK_RANGE) }])),
    maxTargets: 'inteiro de 1 a 6: quantos inimigos dentro da área cada golpe acerta (o alvo é o primeiro).',
    splashDamageFraction: 'de 0 a 1: fração do dano que cada inimigo além do alvo recebe.',
    poisonOnHit: '(opcional) chance de veneno no ataque comum: { chance (maior que 0, até 1), damageFraction (padrão 0.2: dano por pulso em fração do dano do personagem), tickSeconds (padrão 1), durationSeconds (padrão 3) }. Venenos não somam: vale o de maior dano por segundo.',
    padrao: DEFAULT_ATTACK,
    jsonSchema: z.toJSONSchema(attackSchema),
  };
}

function boardAndMatchReference(content: GameContent): Record<string, unknown> {
  const { shop, rounds, tower } = content.config;
  return {
    tabuleiro: `Deitado na tela: ${BOARD_ROWS} casas de comprimento (${BOARD_ROWS / 2} por lado) por ${BOARD_COLUMNS} de largura.`,
    tempoLimiteDoCombate: `${DEFAULT_COMBAT_TIME_LIMIT_MS / 1000} segundos (modificadores de sala podem aumentar).`,
    loja: `${shop.offerSize} ofertas por vez; reserva com ${rounds.benchSize} vagas.`,
    torre: `A básica custa ${tower.cost} moedas e rende ${tower.incomePerRound} por rodada enquanto está de pé no tabuleiro. Se for destruída, some e paga ${tower.compensationOnLoss} moedas uma única vez, no início da rodada seguinte. Há também as torres personalizadas (ver "torres").`,
  };
}

function mapReference(content: GameContent): Record<string, unknown> {
  return {
    descricao: 'Só a aparência do tabuleiro e do fundo; não mudam regras. Edite na aba "Mapas", que mostra a prévia. Os liberados ("active") podem ser escolhidos por quem cria a sala e entram no sorteio; é preciso ao menos um liberado. A partida contra bots no navegador usa os mapas que vêm com o jogo.',
    limites: `Até ${MAXIMUM_MAPS} mapas.`,
    casas: 'tiles: { left (cor da metade do seu time), right (metade do adversário), variation (0 a 0,35: diferença de tom entre as casas) }.',
    fundos: {
      color: '{ type: "color", color }',
      gradient: '{ type: "gradient", from, to, direction: vertical | horizontal | radial }',
      texture: `{ type: "texture", texture: ${MAP_TEXTURES.join(' | ')}, color (base), detail (desenhos) }`,
      image: `{ type: "image", path (gerado pelo envio no painel), darken (0 a 0,85) }: PNG até ${MAXIMUM_SPRITE_BYTES / 1024 / 1024} MB e ${MAXIMUM_SPRITE_DIMENSION}×${MAXIMUM_SPRITE_DIMENSION}; recomendado 1024×576.`,
    },
    jsonSchema: z.toJSONSchema(mapSchema),
    atuais: structuredClone(content.maps),
  };
}

function towerReference(content: GameContent): Record<string, unknown> {
  return {
    descricao:
      'Estruturas compradas na loja: não atacam, não ocupam vaga de lutador, podem ser destruídas (e então somem). Ficam em config.tower: os campos soltos descrevem a torre básica e "variants" são as personalizadas. Edite na aba "Torres e minions" ou no JSON da aba "Configuração".',
    regrasDaLoja: 'offerChancePercent: chance de cada vaga sorteada virar torre; havendo várias ativas, o tipo é sorteado com a mesma chance. maximumOwned: máximo de torres, somando todos os tipos.',
    propriedades: {
      cost: 'inteiro ≥ 1: preço na loja.',
      health: '1 a 10 (mesma escala de vida dos personagens).',
      incomePerRound: 'inteiro ≥ 0: moedas por rodada de pé no tabuleiro.',
      compensationOnLoss: '(padrão 2) moedas pagas uma vez se a torre for destruída.',
      buffs: '(opcional, até 4) bônus aos lutadores do time: { radius (opcional, 1 a 12 casas; sem ele, o time inteiro), effect (um bônus de sinergia: ver "sinergias.tiposDeBonus") }. Calculados no começo do combate, pela posição no tabuleiro.',
      color: '(opcional) #rrggbb do desenho provisório.',
      description: '(opcional) frase de apresentação; regras e bônus são descritos sozinhos.',
    },
    soNasPersonalizadas: 'id (começa com "torre_"), name (diferente das outras) e active (se aparece na loja). Até 8.',
    jsonSchemaDeUmaPersonalizada: z.toJSONSchema(towerVariantSchema),
    atuais: structuredClone(content.config.tower),
  };
}

function auxiliarySpriteReference(content: GameContent): Record<string, unknown> {
  return {
    descricao: 'Sprites do que não é personagem: a torre, as invocações e os clones. A chave vem do nome da invocação (sem acentos, minúsculas).',
    comoEnviar: 'Pela aba "Sprites e ícones" do painel. Sem sprite, o jogo usa o desenho provisório.',
    chavesDoConteudoAtual: auxiliarySpriteSlotsOf(content.characters, content.config.tower.variants),
  };
}

/** Cópia JSON de um personagem do conteúdo, para servir de exemplo (sem sprite). */
function exampleCharacter(content: GameContent, id: string): unknown {
  const character = content.characters.find((candidate) => candidate.id === id);
  if (!character) {
    return null;
  }
  const { sprite: _sprite, ...withoutSprite } = structuredClone(character);
  void _sprite;
  return withoutSprite;
}

/**
 * Guia de referência exportável: tudo o que é possível criar num personagem (campos, limites, tipos de habilidade, efeitos,
 * estados) e como isso funciona no jogo, mais exemplos prontos para copiar. O JSON Schema sai direto do esquema usado pelo
 * jogo, então não fica desatualizado em relação às regras.
 */
export function buildReferenceGuide(content: GameContent, generatedAt: Date = new Date()): Record<string, unknown> {
  const effectTypes = Object.keys(EFFECT_DESCRIPTIONS) as EffectType[];
  return {
    formato: 'merge-do-escritorio/referencia-de-conteudo',
    versao: 1,
    geradoEm: generatedAt.toISOString(),
    resumo:
      'Referência do que dá para criar no Merge do Escritório (personagens, sinergias, torres e mapas) e do que cada parte faz. Para criar um personagem, escreva um JSON no formato de "personagem.jsonSchema" (veja "exemplos") e cole em Importar personagens; para uma sinergia, use "sinergias.jsonSchema" e Importar sinergias, no painel de administração.',
    comoCriarUmPersonagem: [
      '1. Copie um dos "exemplos.personagens" ou o "exemplos.modeloMinimo" e mude os valores (o "id" só aceita letras minúsculas, números e "_", e não pode repetir nem ser "torre").',
      '2. No painel (aba Personagens), abra "Importar personagens (JSON)", cole o texto e importe. Aceita um personagem, uma lista deles ou { "characters": [ ... ] }.',
      '3. Por padrão o personagem entra inativo (não aparece na loja). Ajuste atributos e habilidade no formulário e envie o sprite (PNG).',
      '4. Para ele aparecer na loja: marque "Ativo" e coloque-o numa sinergia em "Rotação e distribuição" (initialSynergyMapping). Cada sinergia precisa de pelo menos 4 personagens ativos (as quantidades não precisam ser iguais).',
      '5. Publique. Quem estiver conectado recebe o aviso para recarregar a página. Partidas em andamento terminam com o conteúdo antigo.',
      '6. Meça o balanceamento (npm test e npm run sim): vitórias por personagem devem ficar entre 42% e 58% (times de 5).',
    ],
    personagem: {
      descricao: 'Objeto estrito: campos desconhecidos são recusados. Campos opcionais: sprite, active (padrão true), attack, visual, evolution.',
      jsonSchema: z.toJSONSchema(characterSchema),
    },
    atributos: {
      escala: 'Vida, dano, velocidade de ataque e mobilidade vão de 1 a 10 (aceita decimais). Alcance é inteiro de 1 a 10 (em casas; 1 = corpo a corpo).',
      formulas: {
        vidaDeJogo: `${HEALTH_PER_POINT} × vida × multiplicador da estrela`,
        danoDeJogo: '10 × dano × multiplicador da estrela',
        ataquesPorSegundo: '0,4 + 0,15 × velocidade de ataque',
        casasPorSegundo: '0,8 + 0,3 × mobilidade',
        alcance: 'comprimento, em casas, da área de ataque; o formato dela vem de "ataqueBasico" (é a área que o jogo destaca ao selecionar a unidade)',
      },
      multiplicadoresDeEstrela: STAR_MULTIPLIERS,
      tabela: statConversionTable(),
    },
    comportamento: {
      movement: { chase: 'persegue o inimigo mais próximo', frontline: 'avança até a linha de frente', kite: 'mantém distância (usa preferredDistance)' },
      targetPriority: {
        nearest: 'o inimigo mais próximo do campo todo (padrão)',
        farthest: 'o inimigo mais distante do campo todo (só troca por um mais ao alcance depois de alcançá-lo)',
        lowest_health: 'entre os inimigos a até alcance + 2 casas, o de menor vida',
        cluster: 'entre os inimigos a até alcance + 2 casas, o que tem mais inimigos em volta',
      },
      preferredDistance: 'inteiro ≥ 1: distância que tenta manter do inimigo mais próximo (recua se estiver mais perto).',
      observacao: 'Um clone provocador (efeito summon_decoy) inimigo por perto tem prioridade sobre qualquer escolha de alvo. Enquanto houver inimigo vivo, ninguém fica parado sem alvo: se o alvo fica fora de alcance ou sem caminho, o personagem troca de alvo ou se aproxima o máximo possível.',
    },
    ataqueBasico: basicAttackReference(),
    tabuleiroEPartida: boardAndMatchReference(content),
    habilidade: {
      campos: 'ability: { id, name, description, activation, cooldownSeconds, cast, effects (ao menos 1), visual }.',
      ativacao: {
        cooldown: `Usa sempre que a recarga acabar e a condição valer. Condições (requires): always | ally_wounded (algum aliado com menos de 90% da vida dentro do raio da área) | ally_fallen (algum aliado já caiu). Exemplo: ${JSON.stringify(newActivation('cooldown'))}. cooldownSeconds precisa ser > 0.`,
        health_threshold: `Usa uma única vez quando a vida cai abaixo de belowFraction (0–1]. Exemplo: ${JSON.stringify(newActivation('health_threshold'))}. cooldownSeconds precisa ser > 0.`,
        first_hit_on_target: `Dispara junto com o primeiro golpe que acerta em cada alvo novo. Exemplo: ${JSON.stringify(newActivation('first_hit_on_target'))}.`,
        passive: `Sem ativação: os efeitos "registered" atuam continuamente. Exemplo: ${JSON.stringify(newActivation('passive'))}.`,
      },
      origemDaHabilidade: {
        campo: 'cast: { target, range (casas), areaRadius (casas, padrão 0), castTimeMs (padrão 300) }',
        target: {
          self: 'a partir do próprio personagem',
          current_target: 'a partir do alvo atual (precisa estar dentro de range)',
          nearest_enemy: 'a partir do inimigo mais próximo dentro de range',
          enemy_cluster: 'a partir do inimigo dentro de range que tem mais inimigos em volta (raio areaRadius)',
        },
        castTimeMs: 'tempo em que o personagem fica ocupado (sem atacar nem andar) ao usar a habilidade.',
      },
      visual: {
        campo: 'visual: { kind: burst | projectile | rain | aura | none, color: "#RRGGBB", icon (opcional), projectileIcon (opcional) }',
        icon: 'letra, número ou emoji (até 8 caracteres) mostrado ao usar a habilidade e nas fichas.',
        projectileIcon: 'letra, número ou emoji (até 8 caracteres) desenhado no lugar do projétil.',
      },
      efeitos: Object.fromEntries(
        effectTypes.map((type) => [type, { ...EFFECT_DESCRIPTIONS[type], exemplo: newEffect(type) }]),
      ),
      estados: Object.fromEntries(statusKindSchema.options.map((kind) => [kind, STATUS_DESCRIPTIONS[kind]])),
      comportamentosEspeciais: Object.fromEntries(
        (Object.keys(REGISTERED_DESCRIPTIONS) as (keyof typeof REGISTERED_DESCRIPTIONS)[]).map((id) => [id, { descricao: REGISTERED_DESCRIPTIONS[id], exemplo: newRegisteredBehavior(id) }]),
      ),
    },
    sinergias: {
      descricao:
        'Cada personagem ativo pertence a uma sinergia. Os bônus dependem de quantos personagens da sinergia estão no tabuleiro e mexem direto nos atributos (dano, velocidade de ataque, resistência, regeneração, recarga). A distribuição (initialSynergyMapping) é o ponto de partida; depois ela rotaciona por sorteio a cada intervalo, e todo personagem muda de sinergia a cada rotação.',
      limites: [
        `O jogo aceita de ${MINIMUM_SYNERGY_COUNT} a ${MAXIMUM_SYNERGY_COUNT} sinergias.`,
        `Cada sinergia precisa de pelo menos ${MINIMUM_CHARACTERS_PER_SYNERGY} personagens ativos na distribuição; as quantidades não precisam ser iguais.`,
        'Todo personagem ativo precisa estar na distribuição; o id da sinergia na distribuição precisa existir.',
        'Cada sinergia tem ao menos um nível; cada nível tem ao menos um bônus.',
        'Os níveis não se acumulam: vale o nível mais alto alcançado (ex.: 2 e 4 unidades; com 3 vale o de 2).',
      ],
      comoCriar: [
        '1. Copie um dos "exemplos.sinergias" ou use "exemplos.modeloMinimo" e mude id, nome, cor e bônus (o id usa letras minúsculas, números e "_").',
        '2. No painel (aba Sinergias), abra "Importar sinergias (JSON)", cole o texto e importe. Aceita uma sinergia, uma lista ou { "synergies": [ ... ] }.',
        `3. Na aba "Rotação e distribuição", coloque pelo menos ${MINIMUM_CHARACTERS_PER_SYNERGY} personagens ativos na sinergia nova (mova de outras que tenham mais). Se faltarem personagens, crie ou ative mais.`,
        '4. Publique. Meça o balanceamento (npm test): o nível 1 de cada sinergia deve vencer entre 54% e 63% e o nível 2 entre 60% e 72%, e o nível 2 deve ser maior que o 1.',
      ],
      campos: 'Sinergia: { id, name, fullName, description, color "#RRGGBB", icon, appliesTo (allTeam | ownSynergy), tiers: [ { threshold, effects: [ ... ] } ] }.',
      appliesTo: { allTeam: 'o bônus vale para a equipe inteira', ownSynergy: 'o bônus vale só para os personagens da própria sinergia' },
      jsonSchema: z.toJSONSchema(synergySchema),
      tiposDeBonus: {
        attribute_multiplier: {
          descricao: 'Multiplica a vida máxima, o dano ou a velocidade de ataque (os multiplicadores de várias fontes se multiplicam).',
          campos: 'attribute: health | damage | attackSpeed; value > 0 (1.06 = +6%).',
          exemplo: newSynergyEffect('attribute_multiplier'),
        },
        resistance_bonus: {
          descricao: 'Reduz o dano recebido (soma com a resistência de outras fontes).',
          campos: 'value de 0 a 1 (0.05 = 5%).',
          exemplo: newSynergyEffect('resistance_bonus'),
        },
        hp_regen: {
          descricao: 'Regenera vida durante o combate. Várias regenerações viram uma taxa só.',
          campos: 'value: fração da vida máxima por pulso (> 0, até 1); tickSeconds > 0.',
          exemplo: newSynergyEffect('hp_regen'),
        },
        cooldown_reduction: {
          descricao: 'Reduz a recarga das habilidades (a soma tem teto de 90%).',
          campos: 'value de 0 a 0.9 (0.15 = 15%).',
          exemplo: newSynergyEffect('cooldown_reduction'),
        },
        positive_effect_amplification: {
          descricao: 'Fortalece os efeitos positivos das habilidades (curas e estados benéficos).',
          campos: 'value ≥ 0 (0.15 = 15% mais fortes).',
          exemplo: newSynergyEffect('positive_effect_amplification'),
        },
      } satisfies Record<SynergyEffectType, unknown>,
      tiposDisponiveis: SYNERGY_EFFECT_TYPE_OPTIONS.map((option) => option.value),
      atuais: content.synergies.map((synergy) => ({
        id: synergy.id,
        nome: synergy.name,
        cor: synergy.color,
        niveis: synergy.tiers.map((tier) => tier.threshold),
        personagens: Object.entries(content.initialSynergyMapping)
          .filter(([, synergyId]) => synergyId === synergy.id)
          .map(([characterId]) => characterId)
          .sort(),
      })),
      formatoDeImportacao: ['Uma sinergia: { "id": "...", ... }', 'Uma lista: [ { ... }, { ... } ]', 'Com envoltório: { "synergies": [ { ... } ] }'],
      exemplos: {
        modeloMinimo: {
          id: 'minha_sinergia',
          name: 'Minha sinergia',
          fullName: 'Minha sinergia — o que ela faz',
          description: 'Texto curto que aparece ao consultar a sinergia.',
          color: '#a855f7',
          icon: 'synergies/minha_sinergia.png',
          appliesTo: 'allTeam',
          tiers: [newSynergyTier(2), { threshold: 4, effects: [{ type: 'attribute_multiplier', attribute: 'damage', value: 1.12 }, { type: 'resistance_bonus', value: 0.08 }] }],
        },
        sinergias: content.synergies.map((synergy) => structuredClone(synergy)),
      },
    },
    raridadeECusto: { common: content.config.shop.costByRarity.common, rare: content.config.shop.costByRarity.rare, special: content.config.shop.costByRarity.special, observacao: 'O custo na loja vem da raridade.' },
    sprite: {
      formato: `PNG com fundo transparente, até ${MAXIMUM_SPRITE_BYTES / 1024 / 1024} MB e ${MAXIMUM_SPRITE_DIMENSION}×${MAXIMUM_SPRITE_DIMENSION} pixels.`,
      comoEnviar: 'Pelo painel (campo Sprite do personagem). O campo "sprite" não pode ser escrito à mão no JSON importado: o caminho é gerado pelo servidor (/sprites/<id>-<hash>.png).',
      orientacao: 'A arte deve ser de perfil, olhando para a DIREITA; o jogo a espelha para a esquerda. Arte desenhada olhando para a esquerda: use "Espelhar a imagem" no painel (sprite.mirrored: true).',
      ajustes: 'scale (multiplica o tamanho padrão; a altura da imagem é ajustada à do personagem provisório), offsetX/offsetY (pixels), anchorX/anchorY (0–1: ponto da imagem sobre os pés; padrão 0.5 e 1). A aba "Sprites e ícones" mostra a prévia ao vivo.',
    },
    torres: towerReference(content),
    mapas: mapReference(content),
    publicacao: {
      notas: 'Ao publicar, o painel pergunta se a mudança leva nota de atualização. Com nota (título e uma mudança por linha, rascunhada a partir do que mudou), ela aparece em "Novidades" no jogo, junto das atualizações do próprio jogo. Sem nota, a publicação é silenciosa. A aba "Notas" lista e apaga as publicadas.',
    },
    spritesAuxiliares: auxiliarySpriteReference(content),
    limites: [
      'O id é fixo depois de criado e não pode ser "torre" nem começar com "torre_" (reservados).',
      'Personagem ativo precisa estar na distribuição de sinergias; cada sinergia precisa de pelo menos 4 personagens.',
      'Toda habilidade precisa de ao menos um efeito.',
      'Veneno e drenagem exigem tickSeconds; estados com intensidade exigem value (exceto sleep e resting).',
      'Habilidades por recarga ou limiar de vida exigem cooldownSeconds > 0.',
    ],
    formatoDeImportacao: [
      'Um personagem: { "id": "...", ... }',
      'Uma lista: [ { ... }, { ... } ]',
      'Com envoltório: { "characters": [ { ... } ] }',
    ],
    exemplos: {
      modeloMinimo: {
        id: 'meu_personagem',
        name: 'Meu Personagem',
        archetype: 'Lutador',
        description: 'Descrição curta do papel dele no jogo.',
        category: 'melee',
        rarity: 'common',
        active: false,
        stats: { health: 6, damage: 5, attackSpeed: 4, range: 1, mobility: 4 },
        behavior: { movement: 'chase', targetPriority: 'nearest', preferredDistance: 1 },
        attack: { shape: 'semicircle', maxTargets: 1 },
        ability: {
          id: 'meu_golpe',
          name: 'Meu golpe',
          description: 'Causa dano forte no alvo atual.',
          activation: { type: 'cooldown', requires: 'always' },
          cooldownSeconds: 10,
          cast: { target: 'current_target', range: 1 },
          effects: [{ type: 'damage', targets: 'center_unit', multiplier: 2 }],
          visual: { kind: 'burst', color: '#f97316', icon: '💥' },
        },
      },
      personagens: EXAMPLE_CHARACTER_IDS.map((id) => exampleCharacter(content, id)).filter((character) => character !== null),
    },
  };
}
