import { z } from 'zod';
import { baseStatsSchema } from './stats';

/**
 * Habilidades como dados: composições de efeitos reutilizáveis.
 * Exceções que não cabem em parâmetros usam `registered`, que aponta para uma implementação do código (Seção 7.4 do GDD).
 */

export const statusKindSchema = z.enum([
  'poison',
  'drain',
  'slow',
  'sleep',
  'weaken',
  'confuse',
  'damage_reduction',
  'speed_boost',
  'damage_boost',
  'resting',
]);
export type StatusKind = z.infer<typeof statusKindSchema>;

/** Estados que causam dano ou cura periodicamente e, por isso, exigem `tickSeconds`. */
export const PERIODIC_STATUS_KINDS: readonly StatusKind[] = ['poison', 'drain'];
/** Estados que não usam `value`. */
export const VALUELESS_STATUS_KINDS: readonly StatusKind[] = ['sleep', 'resting'];

const targetSelectionShape = {
  /** Quem recebe o efeito, em relação ao ponto central da habilidade. */
  targets: z.enum(['center_unit', 'enemies_in_area', 'allies_in_area', 'self']),
  maxTargets: z.number().int().positive().optional(),
  prioritize: z.enum(['nearest', 'lowest_health_ratio']).optional(),
};

const damageEffectSchema = z.strictObject({
  type: z.literal('damage'),
  ...targetSelectionShape,
  /** Dano = dano do personagem × multiplicador. */
  multiplier: z.number().positive(),
});

const healEffectSchema = z.strictObject({
  type: z.literal('heal'),
  ...targetSelectionShape,
  /** Fração da vida máxima do alvo recuperada. */
  fractionOfMaxHealth: z.number().positive().max(1),
});

const statusEffectSchema = z.strictObject({
  type: z.literal('status'),
  ...targetSelectionShape,
  status: statusKindSchema,
  durationSeconds: z.number().positive(),
  /**
   * Intensidade. Redução, bônus e lentidão: fração (0,3 = 30%). Confusão: chance de errar.
   * Veneno e drenagem: dano por pulso, em fração do dano do personagem.
   */
  value: z.number().positive().optional(),
  tickSeconds: z.number().positive().optional(),
  /** Confusão: quantos ataques ficam sujeitos ao erro. */
  charges: z.number().int().positive().optional(),
  /** Drenagem: fração do dano causado que volta como cura ao autor. */
  healRatio: z.number().min(0).optional(),
});

const summonDefinitionSchema = z.strictObject({
  name: z.string().min(1),
  stats: baseStatsSchema,
  count: z.number().int().positive(),
  lifetimeSeconds: z.number().positive(),
});

const placeTrapEffectSchema = z.strictObject({
  type: z.literal('place_trap'),
  /** Distância (em casas) até a armadilha em que um inimigo a dispara. */
  triggerRadius: z.number().int().min(0),
  armingSeconds: z.number().min(0),
  lifetimeSeconds: z.number().positive(),
  summon: summonDefinitionSchema,
});

/** Clone provocador: não ataca nem se move, mas os inimigos próximos passam a atacá-lo enquanto ele durar. */
const summonDecoyEffectSchema = z.strictObject({
  type: z.literal('summon_decoy'),
  name: z.string().min(1),
  /** Vida do clone na escala de atributos (1 a 10); ela também cresce com a estrela de quem o invoca. */
  health: z.number().min(1).max(10),
  lifetimeSeconds: z.number().positive(),
  /** Inimigos a até esta distância (em casas) do clone o escolhem como alvo. */
  tauntRadius: z.number().int().min(1),
  /** Distância máxima (em casas) de quem invoca até a casa onde o clone aparece. */
  placementRange: z.number().int().min(1).default(2),
});

/** Comportamentos com implementação própria no código; o painel escolhe um e configura os parâmetros. */
export const registeredBehaviorSchema = z.discriminatedUnion('id', [
  z.strictObject({
    id: z.literal('l_shaped_projectile'),
    primaryMultiplier: z.number().positive(),
    secondaryMultiplier: z.number().positive(),
    /** Alcance, em casas a partir do primeiro alvo, para encontrar o segundo. */
    redirectRange: z.number().int().positive(),
  }),
  z.strictObject({
    id: z.literal('random_attack'),
    /** Resultados possíveis de cada ataque. Dano na escala de atributos (1 a 10); as chances somam 1. */
    outcomes: z
      .array(z.strictObject({ chance: z.number().positive().max(1), minDamage: z.number().min(0), maxDamage: z.number().min(0) }))
      .min(1),
  }),
  z.strictObject({
    id: z.literal('missing_health_haste'),
    /** Bônus de velocidade de ataque com a vida em zero; cresce linearmente conforme a vida cai. */
    maxAttackSpeedBonus: z.number().positive(),
    furyBelowFraction: z.number().positive().max(1),
    furyDamageBonus: z.number().min(0),
  }),
]);
export type RegisteredBehavior = z.infer<typeof registeredBehaviorSchema>;

const registeredEffectSchema = z.strictObject({
  type: z.literal('registered'),
  behavior: registeredBehaviorSchema,
});

export const effectSchema = z.discriminatedUnion('type', [
  damageEffectSchema,
  healEffectSchema,
  statusEffectSchema,
  placeTrapEffectSchema,
  summonDecoyEffectSchema,
  registeredEffectSchema,
]);
export type EffectDefinition = z.infer<typeof effectSchema>;

export const activationSchema = z.discriminatedUnion('type', [
  /** Usa sempre que a recarga terminar e a condição (opcional) valer. */
  z.strictObject({
    type: z.literal('cooldown'),
    requires: z.enum(['always', 'ally_wounded', 'ally_fallen']).default('always'),
  }),
  /** Usa uma única vez, quando a vida cai abaixo da fração. */
  z.strictObject({ type: z.literal('health_threshold'), belowFraction: z.number().positive().max(1) }),
  /** Dispara junto com o primeiro golpe que o personagem acerta em cada alvo. */
  z.strictObject({ type: z.literal('first_hit_on_target') }),
  /** Sem ativação: os efeitos registrados atuam continuamente. */
  z.strictObject({ type: z.literal('passive') }),
]);
export type Activation = z.infer<typeof activationSchema>;

const castSchema = z.strictObject({
  /** De onde sai o efeito: do próprio personagem, do alvo atual, do inimigo mais próximo ou do centro do maior grupo de inimigos. */
  target: z.enum(['self', 'current_target', 'nearest_enemy', 'enemy_cluster']),
  /** Alcance, em casas, até o ponto central. */
  range: z.number().int().min(0),
  /** Raio, em casas, em torno do ponto central. */
  areaRadius: z.number().int().min(0).default(0),
  /** Tempo em que o personagem fica ocupado ao usar a habilidade. */
  castTimeMs: z.number().int().min(0).default(300),
});

export const abilityVisualSchema = z.strictObject({
  kind: z.enum(['burst', 'projectile', 'rain', 'aura', 'none']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const abilitySchema = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    activation: activationSchema,
    cooldownSeconds: z.number().min(0),
    cast: castSchema.default({ target: 'self', range: 0, areaRadius: 0, castTimeMs: 300 }),
    effects: z.array(effectSchema).min(1),
    visual: abilityVisualSchema,
  })
  .superRefine((ability, context) => {
    ability.effects.forEach((effect, position) => {
      if (effect.type !== 'status') {
        return;
      }
      const path = ['effects', position];
      if (!VALUELESS_STATUS_KINDS.includes(effect.status) && effect.value === undefined) {
        context.addIssue({ code: 'custom', path: [...path, 'value'], message: `O estado "${effect.status}" exige "value".` });
      }
      if (PERIODIC_STATUS_KINDS.includes(effect.status) && effect.tickSeconds === undefined) {
        context.addIssue({ code: 'custom', path: [...path, 'tickSeconds'], message: `O estado "${effect.status}" exige "tickSeconds".` });
      }
    });
    const usesCooldown = ability.activation.type === 'cooldown' || ability.activation.type === 'health_threshold';
    if (usesCooldown && ability.cooldownSeconds <= 0) {
      context.addIssue({ code: 'custom', path: ['cooldownSeconds'], message: 'Habilidades por recarga ou limiar de vida precisam de recarga maior que zero.' });
    }
  });
export type AbilityDefinition = z.infer<typeof abilitySchema>;
