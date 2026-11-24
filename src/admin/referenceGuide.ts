import { z } from 'zod';
import { statusKindSchema } from '@data/schemas/ability';
import { characterSchema } from '@data/schemas/character';
import { MAXIMUM_SYNERGY_COUNT, MINIMUM_SYNERGY_COUNT, type GameContent } from '@data/schemas/content';
import { MINIMUM_CHARACTERS_PER_SYNERGY, synergySchema } from '@data/schemas/synergy';
import { HEALTH_PER_POINT, STAR_MULTIPLIERS, toCombatStats } from '@combat/units/stats';
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
      'Referência do que dá para criar no Merge do Escritório (personagens e sinergias) e do que cada parte faz. Para criar um personagem, escreva um JSON no formato de "personagem.jsonSchema" (veja "exemplos") e cole em Importar personagens; para uma sinergia, use "sinergias.jsonSchema" e Importar sinergias, no painel de administração.',
    comoCriarUmPersonagem: [
      '1. Copie um dos "exemplos.personagens" ou o "exemplos.modeloMinimo" e mude os valores (o "id" só aceita letras minúsculas, números e "_", e não pode repetir nem ser "torre").',
      '2. No painel (aba Personagens), abra "Importar personagens (JSON)", cole o texto e importe. Aceita um personagem, uma lista deles ou { "characters": [ ... ] }.',
      '3. Por padrão o personagem entra inativo (não aparece na loja). Ajuste atributos e habilidade no formulário e envie o sprite (PNG).',
      '4. Para ele aparecer na loja: marque "Ativo" e coloque-o numa sinergia em "Rotação e distribuição" (initialSynergyMapping). Cada sinergia precisa de pelo menos 4 personagens ativos (as quantidades não precisam ser iguais).',
      '5. Publique. Quem estiver conectado recebe o aviso para recarregar a página. Partidas em andamento terminam com o conteúdo antigo.',
      '6. Meça o balanceamento (npm test e npm run sim): vitórias por personagem devem ficar entre 42% e 58% (times de 5).',
    ],
    personagem: {
      descricao: 'Objeto estrito: campos desconhecidos são recusados. Campos opcionais: sprite, active (padrão true), visual, evolution.',
      jsonSchema: z.toJSONSchema(characterSchema),
    },
    atributos: {
      escala: 'Vida, dano, velocidade de ataque e mobilidade vão de 1 a 10 (aceita decimais). Alcance é inteiro de 1 a 10 (em casas; 1 = corpo a corpo).',
      formulas: {
        vidaDeJogo: `${HEALTH_PER_POINT} × vida × multiplicador da estrela`,
        danoDeJogo: '10 × dano × multiplicador da estrela',
        ataquesPorSegundo: '0,4 + 0,15 × velocidade de ataque',
        casasPorSegundo: '0,5 + 0,25 × mobilidade',
        alcance: 'distância em casas ≤ alcance (a mesma área que o jogo destaca ao selecionar a unidade)',
      },
      multiplicadoresDeEstrela: STAR_MULTIPLIERS,
      tabela: statConversionTable(),
    },
    comportamento: {
      movement: { chase: 'persegue o inimigo mais próximo', frontline: 'avança até a linha de frente', kite: 'mantém distância (usa preferredDistance)' },
      targetPriority: {
        nearest: 'o inimigo mais próximo',
        lowest_health: 'entre os inimigos a até alcance + 2 casas, o de menor vida',
        cluster: 'entre os inimigos a até alcance + 2 casas, o que tem mais inimigos em volta',
      },
      preferredDistance: 'inteiro ≥ 1: distância que tenta manter do inimigo mais próximo (recua se estiver mais perto).',
      observacao: 'Um clone provocador (efeito summon_decoy) inimigo por perto tem prioridade sobre qualquer escolha de alvo.',
    },
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
        campo: 'visual: { kind: burst | projectile | rain | aura | none, color: "#RRGGBB" }',
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
          descricao: 'Multiplica o dano ou a velocidade de ataque (os multiplicadores de várias sinergias se multiplicam).',
          campos: 'attribute: damage | attackSpeed; value > 0 (1.06 = +6%).',
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
      ajustes: 'scale (multiplica o tamanho padrão; a altura da imagem é ajustada à do personagem provisório), offsetX/offsetY (pixels), anchorX/anchorY (0–1: ponto da imagem sobre os pés; padrão 0.5 e 1).',
    },
    limites: [
      'O id é fixo depois de criado e não pode ser "torre" (reservado).',
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
        ability: {
          id: 'meu_golpe',
          name: 'Meu golpe',
          description: 'Causa dano forte no alvo atual.',
          activation: { type: 'cooldown', requires: 'always' },
          cooldownSeconds: 10,
          cast: { target: 'current_target', range: 1 },
          effects: [{ type: 'damage', targets: 'center_unit', multiplier: 2 }],
          visual: { kind: 'burst', color: '#f97316' },
        },
      },
      personagens: EXAMPLE_CHARACTER_IDS.map((id) => exampleCharacter(content, id)).filter((character) => character !== null),
    },
  };
}
