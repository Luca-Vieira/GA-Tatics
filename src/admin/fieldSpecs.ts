/**
 * Descrição dos campos do formulário de personagem. O formulário trabalha sobre um objeto JSON simples (o "rascunho"):
 * cada campo diz onde o valor mora (`path`), e a validação de verdade é sempre a do esquema do jogo (`characterSchema`).
 */
import { DEFAULT_ATTACK } from '@data/schemas/attack';
import { ATTACK_SHAPES, attackShapeLabel } from '@shared/utils/attackArea';

export type FieldKind = 'text' | 'textarea' | 'number' | 'integer' | 'select' | 'checkbox' | 'color';
export type PathStep = string | number;

export interface FieldOption {
  readonly value: string;
  readonly label: string;
}

export interface FieldSpec {
  readonly path: readonly PathStep[];
  readonly label: string;
  readonly kind: FieldKind;
  readonly options?: readonly FieldOption[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Campo opcional: vazio remove o valor do rascunho. */
  readonly optional?: boolean;
  /** O que o jogo usa quando o rascunho não tem o valor; é o que o campo mostra nesse caso. */
  readonly fallback?: string | number;
  readonly help?: string;
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

export function getAt(root: unknown, path: readonly PathStep[]): unknown {
  let current: unknown = root;
  for (const step of path) {
    if (Array.isArray(current) && typeof step === 'number') {
      current = current[step];
    } else if (isRecord(current) && typeof step === 'string') {
      current = current[step];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Devolve uma cópia de `root` com o valor trocado (ou removido, se `undefined`), criando os níveis que faltarem. */
export function setAt<Root>(root: Root, path: readonly PathStep[], value: unknown): Root {
  const copy = structuredClone(root) as unknown;
  let current: unknown = copy;
  path.forEach((step, position) => {
    const isLast = position === path.length - 1;
    const container = current as Json | unknown[];
    if (isLast) {
      if (value === undefined) {
        if (Array.isArray(container)) container.splice(step as number, 1);
        else delete (container as Json)[step as string];
      } else {
        (container as Json)[step as string] = value;
      }
      return;
    }
    const existing = (container as Json)[step as string];
    if (typeof existing !== 'object' || existing === null) {
      (container as Json)[step as string] = typeof path[position + 1] === 'number' ? [] : {};
    }
    current = (container as Json)[step as string];
  });
  return copy as Root;
}

const option = (value: string, label: string): FieldOption => ({ value, label });

export const RARITY_OPTIONS = [option('common', 'Comum'), option('rare', 'Raro'), option('special', 'Especial')];

export const BASIC_FIELDS: readonly FieldSpec[] = [
  { path: ['name'], label: 'Nome', kind: 'text' },
  { path: ['archetype'], label: 'Arquétipo', kind: 'text' },
  { path: ['category'], label: 'Categoria', kind: 'text', help: 'Texto livre (ex.: tank, melee, utility).' },
  { path: ['rarity'], label: 'Raridade', kind: 'select', options: RARITY_OPTIONS, help: 'Define o custo na loja.' },
  { path: ['active'], label: 'Ativo (aparece na loja)', kind: 'checkbox' },
  { path: ['description'], label: 'Descrição', kind: 'textarea' },
];

export const STAT_FIELDS: readonly FieldSpec[] = [
  { path: ['stats', 'health'], label: 'Vida (1–10)', kind: 'number', min: 1, max: 10, step: 0.5 },
  { path: ['stats', 'damage'], label: 'Dano (1–10)', kind: 'number', min: 1, max: 10, step: 0.5 },
  { path: ['stats', 'attackSpeed'], label: 'Velocidade de ataque (1–10)', kind: 'number', min: 1, max: 10, step: 0.5 },
  { path: ['stats', 'range'], label: 'Alcance em casas (1–10)', kind: 'integer', min: 1, max: 10 },
  { path: ['stats', 'mobility'], label: 'Mobilidade (1–10)', kind: 'number', min: 1, max: 10, step: 0.5 },
];

export const BEHAVIOR_FIELDS: readonly FieldSpec[] = [
  {
    path: ['behavior', 'movement'],
    label: 'Movimento',
    kind: 'select',
    options: [option('chase', 'Persegue o inimigo'), option('frontline', 'Segura a linha de frente'), option('kite', 'Mantém distância')],
  },
  {
    path: ['behavior', 'targetPriority'],
    label: 'Prioridade de alvo',
    kind: 'select',
    options: [option('nearest', 'Mais próximo'), option('farthest', 'Mais distante'), option('lowest_health', 'Menos vida'), option('cluster', 'Maior grupo')],
  },
  { path: ['behavior', 'preferredDistance'], label: 'Distância preferida (casas)', kind: 'integer', min: 1, max: 10 },
];

export const ATTACK_SHAPE_OPTIONS: readonly FieldOption[] = ATTACK_SHAPES.map((shape) => option(shape, attackShapeLabel(shape)));

export const ATTACK_FIELDS: readonly FieldSpec[] = [
  { path: ['attack', 'shape'], label: 'Formato da área', kind: 'select', options: ATTACK_SHAPE_OPTIONS, fallback: DEFAULT_ATTACK.shape, help: 'O comprimento da área é o alcance (em Atributos).' },
  { path: ['attack', 'maxTargets'], label: 'Inimigos por golpe', kind: 'integer', min: 1, max: 6, fallback: DEFAULT_ATTACK.maxTargets },
  {
    path: ['attack', 'splashDamageFraction'],
    label: 'Dano nos inimigos extras (0–1)',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.05,
    fallback: DEFAULT_ATTACK.splashDamageFraction,
    help: 'Fração do dano que cada inimigo além do alvo recebe (só vale com 2 ou mais por golpe).',
  },
];

export const ABILITY_FIELDS: readonly FieldSpec[] = [
  { path: ['ability', 'name'], label: 'Nome da habilidade', kind: 'text' },
  { path: ['ability', 'description'], label: 'Descrição da habilidade', kind: 'textarea' },
  { path: ['ability', 'cooldownSeconds'], label: 'Recarga (segundos)', kind: 'number', min: 0, step: 0.5 },
];

export const ACTIVATION_TYPE_OPTIONS = [
  option('cooldown', 'Por recarga'),
  option('health_threshold', 'Uma vez, com pouca vida'),
  option('first_hit_on_target', 'No primeiro golpe em cada alvo'),
  option('passive', 'Passiva'),
];

export const ACTIVATION_FIELDS: Readonly<Record<string, readonly FieldSpec[]>> = {
  cooldown: [
    {
      path: ['ability', 'activation', 'requires'],
      label: 'Condição',
      kind: 'select',
      options: [option('always', 'Sempre'), option('ally_wounded', 'Há aliado ferido'), option('ally_fallen', 'Há aliado derrotado')],
    },
  ],
  health_threshold: [{ path: ['ability', 'activation', 'belowFraction'], label: 'Usa abaixo desta fração da vida (0–1)', kind: 'number', min: 0.05, max: 1, step: 0.05 }],
  first_hit_on_target: [],
  passive: [],
};

export const CAST_FIELDS: readonly FieldSpec[] = [
  {
    path: ['ability', 'cast', 'target'],
    label: 'Ponto de origem',
    kind: 'select',
    options: [option('self', 'O próprio personagem'), option('current_target', 'Alvo atual'), option('nearest_enemy', 'Inimigo mais próximo'), option('enemy_cluster', 'Centro do maior grupo de inimigos')],
  },
  { path: ['ability', 'cast', 'range'], label: 'Alcance (casas)', kind: 'integer', min: 0, max: 20 },
  { path: ['ability', 'cast', 'areaRadius'], label: 'Raio da área (casas)', kind: 'integer', min: 0, max: 10 },
  { path: ['ability', 'cast', 'castTimeMs'], label: 'Tempo de uso (ms)', kind: 'integer', min: 0, step: 50 },
  {
    path: ['ability', 'visual', 'kind'],
    label: 'Efeito visual',
    kind: 'select',
    options: [option('burst', 'Explosão'), option('projectile', 'Projétil'), option('rain', 'Chuva'), option('aura', 'Aura'), option('none', 'Nenhum')],
  },
  { path: ['ability', 'visual', 'color'], label: 'Cor do efeito', kind: 'color' },
  { path: ['ability', 'visual', 'icon'], label: 'Ícone da habilidade', kind: 'text', optional: true, help: 'Letra, número ou emoji (até 8 caracteres).' },
  { path: ['ability', 'visual', 'projectileIcon'], label: 'Ícone do projétil', kind: 'text', optional: true, help: 'Desenhado no lugar do disparo. Vazio = sem ícone.' },
];

export const EVOLUTION_FIELDS: readonly FieldSpec[] = [
  { path: ['evolution', 'starMultipliers', '2'], label: 'Multiplicador de 2 estrelas', kind: 'number', min: 1, step: 0.1, optional: true, help: 'Vazio = padrão (2,5×). Preencha os dois ou nenhum.' },
  { path: ['evolution', 'starMultipliers', '3'], label: 'Multiplicador de 3 estrelas', kind: 'number', min: 1, step: 0.1, optional: true, help: 'Vazio = padrão (6×).' },
];

export const SPRITE_FIELDS: readonly FieldSpec[] = [
  { path: ['sprite', 'scale'], label: 'Escala', kind: 'number', min: 0.1, max: 5, step: 0.05, help: 'Multiplica o tamanho padrão (a altura da imagem é ajustada à do personagem provisório).' },
  { path: ['sprite', 'offsetX'], label: 'Deslocamento X', kind: 'number', step: 1 },
  { path: ['sprite', 'offsetY'], label: 'Deslocamento Y', kind: 'number', step: 1 },
  { path: ['sprite', 'anchorX'], label: 'Âncora X (0–1)', kind: 'number', min: 0, max: 1, step: 0.05, help: 'Ponto da imagem que fica sobre os pés. Padrão: 0,5.' },
  { path: ['sprite', 'anchorY'], label: 'Âncora Y (0–1)', kind: 'number', min: 0, max: 1, step: 0.05, help: 'Padrão: 1 (a base da imagem).' },
];

// --- Efeitos da habilidade -------------------------------------------------------------------------

export type EffectType = 'damage' | 'heal' | 'status' | 'place_trap' | 'summon' | 'summon_decoy' | 'registered';

export const EFFECT_TYPE_OPTIONS: readonly FieldOption[] = [
  option('damage', 'Dano'),
  option('heal', 'Cura'),
  option('status', 'Estado (veneno, sono, lentidão...)'),
  option('summon', 'Invocação direta'),
  option('place_trap', 'Armadilha que invoca'),
  option('summon_decoy', 'Clone provocador'),
  option('registered', 'Comportamento especial'),
];

const TARGET_OPTIONS = [option('center_unit', 'Unidade central'), option('enemies_in_area', 'Inimigos na área'), option('allies_in_area', 'Aliados na área'), option('self', 'O próprio personagem')];
const PRIORITY_OPTIONS = [option('nearest', 'Mais próximo'), option('lowest_health_ratio', 'Menor proporção de vida')];
const STATUS_OPTIONS = ['poison', 'drain', 'slow', 'sleep', 'weaken', 'confuse', 'damage_reduction', 'speed_boost', 'damage_boost', 'resting'].map((status) => option(status, status));

const targetingFields = (effectPath: readonly PathStep[]): FieldSpec[] => [
  { path: [...effectPath, 'targets'], label: 'Quem recebe', kind: 'select', options: TARGET_OPTIONS },
  { path: [...effectPath, 'maxTargets'], label: 'Máximo de alvos', kind: 'integer', min: 1, optional: true },
  { path: [...effectPath, 'prioritize'], label: 'Prioridade', kind: 'select', options: PRIORITY_OPTIONS, optional: true },
];

/** Campos da criatura invocada, comuns à invocação direta e à armadilha. */
function summonFields(effectPath: readonly PathStep[]): FieldSpec[] {
  const at = (...rest: PathStep[]): PathStep[] => [...effectPath, 'summon', ...rest];
  return [
    { path: at('name'), label: 'Nome da invocação', kind: 'text', help: 'O sprite dela é enviado na aba Sprites.' },
    { path: at('count'), label: 'Quantidade invocada', kind: 'integer', min: 1 },
    { path: at('lifetimeSeconds'), label: 'Duração da invocação (s)', kind: 'number', min: 0.5, step: 0.5 },
    { path: at('stats', 'health'), label: 'Invocação: vida (1–10)', kind: 'number', min: 1, max: 10, step: 0.5 },
    { path: at('stats', 'damage'), label: 'Invocação: dano (1–10)', kind: 'number', min: 1, max: 10, step: 0.5 },
    { path: at('stats', 'attackSpeed'), label: 'Invocação: velocidade de ataque', kind: 'number', min: 1, max: 10, step: 0.5 },
    { path: at('stats', 'range'), label: 'Invocação: alcance', kind: 'integer', min: 1, max: 10 },
    { path: at('stats', 'mobility'), label: 'Invocação: mobilidade', kind: 'number', min: 1, max: 10, step: 0.5 },
  ];
}

/** Campos de um efeito. `effectPath` aponta para o efeito dentro do rascunho (ex.: `['ability', 'effects', 0]`). */
export function effectFields(effect: unknown, effectPath: readonly PathStep[]): readonly FieldSpec[] {
  const type = getAt(effect, ['type']);
  const at = (...rest: PathStep[]): PathStep[] => [...effectPath, ...rest];
  switch (type) {
    case 'damage':
      return [...targetingFields(effectPath), { path: at('multiplier'), label: 'Multiplicador do dano', kind: 'number', min: 0.1, step: 0.1 }];
    case 'heal':
      return [...targetingFields(effectPath), { path: at('fractionOfMaxHealth'), label: 'Fração da vida máxima curada (0–1)', kind: 'number', min: 0.01, max: 1, step: 0.01 }];
    case 'status':
      return [
        ...targetingFields(effectPath),
        { path: at('status'), label: 'Estado', kind: 'select', options: STATUS_OPTIONS },
        { path: at('durationSeconds'), label: 'Duração (s)', kind: 'number', min: 0.1, step: 0.5 },
        { path: at('value'), label: 'Intensidade', kind: 'number', step: 0.05, optional: true, help: 'Fração (0,3 = 30%); no veneno e na drenagem, dano por pulso em fração do dano.' },
        { path: at('tickSeconds'), label: 'Intervalo do pulso (s)', kind: 'number', min: 0.1, step: 0.5, optional: true, help: 'Obrigatório para veneno e drenagem.' },
        { path: at('charges'), label: 'Cargas (confusão)', kind: 'integer', min: 1, optional: true },
        { path: at('healRatio'), label: 'Cura sobre o dano (drenagem)', kind: 'number', min: 0, step: 0.05, optional: true },
      ];
    case 'place_trap':
      return [
        { path: at('triggerRadius'), label: 'Raio que dispara a armadilha (casas)', kind: 'integer', min: 0 },
        { path: at('armingSeconds'), label: 'Tempo para armar (s)', kind: 'number', min: 0, step: 0.5 },
        { path: at('lifetimeSeconds'), label: 'Duração da armadilha (s)', kind: 'number', min: 0.5, step: 0.5 },
        ...summonFields(effectPath),
      ];
    case 'summon':
      return summonFields(effectPath);
    case 'summon_decoy':
      return [
        { path: at('name'), label: 'Nome do clone', kind: 'text' },
        { path: at('health'), label: 'Vida do clone (1–10)', kind: 'number', min: 1, max: 10, step: 0.5 },
        { path: at('lifetimeSeconds'), label: 'Duração (s)', kind: 'number', min: 0.5, step: 0.5 },
        { path: at('tauntRadius'), label: 'Raio de provocação (casas)', kind: 'integer', min: 1 },
        { path: at('placementRange'), label: 'Distância em que aparece (casas)', kind: 'integer', min: 1 },
      ];
    case 'registered':
      return registeredFields(getAt(effect, ['behavior', 'id']), effectPath);
    default:
      return [];
  }
}

const REGISTERED_OPTIONS = [option('l_shaped_projectile', 'Projétil em L'), option('random_attack', 'Ataque aleatório'), option('missing_health_haste', 'Fúria com pouca vida')];

function registeredFields(behaviorId: unknown, effectPath: readonly PathStep[]): FieldSpec[] {
  const at = (...rest: PathStep[]): PathStep[] => [...effectPath, 'behavior', ...rest];
  const idField: FieldSpec = { path: at('id'), label: 'Comportamento', kind: 'select', options: REGISTERED_OPTIONS };
  switch (behaviorId) {
    case 'l_shaped_projectile':
      return [
        idField,
        { path: at('primaryMultiplier'), label: 'Dano no primeiro alvo (×)', kind: 'number', min: 0.1, step: 0.1 },
        { path: at('secondaryMultiplier'), label: 'Dano no segundo alvo (×)', kind: 'number', min: 0.1, step: 0.1 },
        { path: at('redirectRange'), label: 'Alcance do redirecionamento (casas)', kind: 'integer', min: 1 },
      ];
    case 'missing_health_haste':
      return [
        idField,
        { path: at('maxAttackSpeedBonus'), label: 'Bônus máximo de velocidade de ataque', kind: 'number', min: 0.1, step: 0.1 },
        { path: at('furyBelowFraction'), label: 'Fúria abaixo desta fração da vida', kind: 'number', min: 0.05, max: 1, step: 0.05 },
        { path: at('furyDamageBonus'), label: 'Bônus de dano na fúria', kind: 'number', min: 0, step: 0.1 },
      ];
    default:
      // "random_attack" tem uma lista de resultados possíveis: ela é editada no JSON avançado.
      return [idField];
  }
}

/** Modelos de efeito novos, já válidos (o administrador só ajusta os números). */
export function newEffect(type: EffectType): Json {
  switch (type) {
    case 'damage':
      return { type: 'damage', targets: 'center_unit', multiplier: 1.5 };
    case 'heal':
      return { type: 'heal', targets: 'self', fractionOfMaxHealth: 0.2 };
    case 'status':
      return { type: 'status', targets: 'center_unit', status: 'slow', durationSeconds: 3, value: 0.3 };
    case 'place_trap':
      return {
        type: 'place_trap',
        triggerRadius: 1,
        armingSeconds: 0.5,
        lifetimeSeconds: 15,
        summon: { name: 'Invocação', stats: { health: 2, damage: 3, attackSpeed: 5, range: 1, mobility: 5 }, count: 1, lifetimeSeconds: 6 },
      };
    case 'summon':
      return { type: 'summon', summon: { name: 'Invocação', stats: { health: 2, damage: 2, attackSpeed: 5, range: 1, mobility: 6 }, count: 1, lifetimeSeconds: 6 } };
    case 'summon_decoy':
      return { type: 'summon_decoy', name: 'Clone', health: 3, lifetimeSeconds: 4, tauntRadius: 3, placementRange: 2 };
    case 'registered':
      return { type: 'registered', behavior: { id: 'missing_health_haste', maxAttackSpeedBonus: 1, furyBelowFraction: 0.3, furyDamageBonus: 0.2 } };
  }
}

/** Valores novos de uma ativação, ao trocar o tipo. */
export function newActivation(type: string): Json {
  switch (type) {
    case 'health_threshold':
      return { type, belowFraction: 0.5 };
    case 'cooldown':
      return { type, requires: 'always' };
    default:
      return { type };
  }
}

/** Valores novos de um comportamento registrado, ao trocar o id. */
export function newRegisteredBehavior(id: string): Json {
  switch (id) {
    case 'l_shaped_projectile':
      return { id, primaryMultiplier: 1, secondaryMultiplier: 0.5, redirectRange: 2 };
    case 'random_attack':
      return { id, outcomes: [{ chance: 1, minDamage: 1, maxDamage: 5 }] };
    default:
      return { id, maxAttackSpeedBonus: 1, furyBelowFraction: 0.3, furyDamageBonus: 0.2 };
  }
}

/** Valor digitado → valor do rascunho. Vazio vira `undefined` (campo opcional) ou `null` (o esquema acusa o erro). */
export function parseFieldInput(spec: FieldSpec, raw: string | boolean): unknown {
  switch (spec.kind) {
    case 'checkbox':
      return Boolean(raw);
    case 'number':
    case 'integer': {
      const text = String(raw).trim().replace(',', '.');
      if (text === '') {
        return spec.optional ? undefined : null;
      }
      const value = Number(text);
      return Number.isFinite(value) ? value : null;
    }
    case 'select':
      return raw === '' && spec.optional ? undefined : String(raw);
    default:
      return spec.optional && String(raw).trim() === '' ? undefined : String(raw);
  }
}

// --- Sinergias -------------------------------------------------------------------------------------

export const SYNERGY_FIELDS: readonly FieldSpec[] = [
  { path: ['name'], label: 'Nome', kind: 'text' },
  { path: ['fullName'], label: 'Nome completo', kind: 'text' },
  { path: ['color'], label: 'Cor', kind: 'color' },
  { path: ['icon'], label: 'Ícone (caminho)', kind: 'text', help: 'Texto livre; o jogo ainda não desenha ícones de sinergia.' },
  {
    path: ['appliesTo'],
    label: 'Quem recebe o bônus',
    kind: 'select',
    options: [option('allTeam', 'A equipe inteira'), option('ownSynergy', 'Só os personagens da própria sinergia')],
  },
  { path: ['description'], label: 'Descrição', kind: 'textarea' },
];

export type SynergyEffectType = 'attribute_multiplier' | 'resistance_bonus' | 'hp_regen' | 'cooldown_reduction' | 'positive_effect_amplification';

export const SYNERGY_EFFECT_TYPE_OPTIONS: readonly FieldOption[] = [
  option('attribute_multiplier', 'Multiplica dano ou velocidade de ataque'),
  option('resistance_bonus', 'Resistência (menos dano recebido)'),
  option('hp_regen', 'Regeneração de vida'),
  option('cooldown_reduction', 'Recarga mais rápida das habilidades'),
  option('positive_effect_amplification', 'Efeitos positivos mais fortes'),
];

/** Campos de um efeito de sinergia. `effectPath` aponta para o efeito (ex.: `['tiers', 0, 'effects', 1]`). */
export function synergyEffectFields(effect: unknown, effectPath: readonly PathStep[]): readonly FieldSpec[] {
  const at = (...rest: PathStep[]): PathStep[] => [...effectPath, ...rest];
  switch (getAt(effect, ['type'])) {
    case 'attribute_multiplier':
      return [
        { path: at('attribute'), label: 'Atributo', kind: 'select', options: [option('damage', 'Dano'), option('attackSpeed', 'Velocidade de ataque')] },
        { path: at('value'), label: 'Multiplicador', kind: 'number', min: 0.01, step: 0.01, help: '1,06 = +6%; 1,12 = +12%.' },
      ];
    case 'resistance_bonus':
      return [{ path: at('value'), label: 'Redução do dano recebido (0–1)', kind: 'number', min: 0, max: 1, step: 0.01, help: '0,05 = 5%.' }];
    case 'hp_regen':
      return [
        { path: at('value'), label: 'Fração da vida máxima por pulso (0–1)', kind: 'number', min: 0.001, max: 1, step: 0.005, help: '0,01 = 1% da vida.' },
        { path: at('tickSeconds'), label: 'Intervalo do pulso (s)', kind: 'number', min: 0.1, step: 0.5 },
      ];
    case 'cooldown_reduction':
      return [{ path: at('value'), label: 'Redução da recarga (0–0,9)', kind: 'number', min: 0, max: 0.9, step: 0.01, help: '0,15 = 15% mais rápido.' }];
    case 'positive_effect_amplification':
      return [{ path: at('value'), label: 'Aumento dos efeitos positivos (≥ 0)', kind: 'number', min: 0, step: 0.01, help: '0,15 = 15% mais fortes (curas e estados benéficos).' }];
    default:
      return [];
  }
}

export function newSynergyEffect(type: SynergyEffectType): Json {
  switch (type) {
    case 'attribute_multiplier':
      return { type, attribute: 'damage', value: 1.06 };
    case 'resistance_bonus':
      return { type, value: 0.05 };
    case 'hp_regen':
      return { type, value: 0.01, tickSeconds: 3 };
    case 'cooldown_reduction':
      return { type, value: 0.15 };
    case 'positive_effect_amplification':
      return { type, value: 0.15 };
  }
}

/** Nível novo de sinergia, já válido. */
export function newSynergyTier(threshold: number): Json {
  return { threshold, effects: [newSynergyEffect('attribute_multiplier')] };
}
