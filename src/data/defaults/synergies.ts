import { synergyRotationConfigSchema, synergySchema, validateSynergyMapping, type SynergyDefinition, type SynergyRotationConfig } from '../schemas/synergy';

export const DEFAULT_SYNERGIES: readonly SynergyDefinition[] = [
  {
    id: 'operacional',
    name: 'Operacional',
    fullName: 'Operacional — Resistência e sobrevivência',
    description: 'Quem mantém a empresa funcionando: a equipe sofre menos dano e regenera vida durante o combate.',
    color: '#22C55E',
    icon: 'synergies/operacional.png',
    appliesTo: 'allTeam',
    tiers: [
      {
        threshold: 2,
        effects: [
          { type: 'resistance_bonus', value: 0.04 },
          { type: 'hp_regen', value: 0.01, tickSeconds: 3 },
        ],
      },
      {
        threshold: 4,
        effects: [
          { type: 'resistance_bonus', value: 0.075 },
          { type: 'hp_regen', value: 0.015, tickSeconds: 3 },
        ],
      },
    ],
  },
  {
    id: 'gestao',
    name: 'Gestão',
    fullName: 'Gestão — Estratégia e suporte',
    description: 'Planejamento e coordenação: habilidades recarregam mais rápido e seus efeitos positivos ficam mais fortes.',
    color: '#3B82F6',
    icon: 'synergies/gestao.png',
    appliesTo: 'allTeam',
    tiers: [
      {
        threshold: 2,
        effects: [
          { type: 'cooldown_reduction', value: 0.15 },
          { type: 'positive_effect_amplification', value: 0.15 },
        ],
      },
      {
        threshold: 4,
        effects: [
          { type: 'cooldown_reduction', value: 0.25 },
          { type: 'positive_effect_amplification', value: 0.25 },
        ],
      },
    ],
  },
  {
    id: 'caos',
    name: 'Caos',
    fullName: 'Caos — Dano e agressividade',
    description: 'Improviso e decisões questionáveis: a equipe causa mais dano e ataca mais rápido.',
    color: '#F97316',
    icon: 'synergies/caos.png',
    appliesTo: 'allTeam',
    tiers: [
      {
        threshold: 2,
        effects: [
          { type: 'attribute_multiplier', attribute: 'damage', value: 1.05 },
          { type: 'attribute_multiplier', attribute: 'attackSpeed', value: 1.03 },
        ],
      },
      {
        threshold: 4,
        effects: [
          { type: 'attribute_multiplier', attribute: 'damage', value: 1.09 },
          { type: 'attribute_multiplier', attribute: 'attackSpeed', value: 1.05 },
        ],
      },
    ],
  },
].map((synergy) => synergySchema.parse(synergy));

/**
 * Rotação 0: distribuição de lançamento, montada por afinidade temática (GDD Seção 4.5). As sinergias não precisam ter o
 * mesmo número de personagens, só o mínimo de 4 cada: o Derson (corpo a corpo que gosta de aparecer) entra em Caos, que fica com 5.
 */
export const INITIAL_SYNERGY_MAPPING: Readonly<Record<string, string>> = {
  bixo: 'operacional',
  wilian: 'operacional',
  wender: 'operacional',
  marquinhos: 'operacional',
  helder: 'gestao',
  joao_lucas: 'gestao',
  felipao: 'gestao',
  gustavo: 'gestao',
  vinicius: 'caos',
  leo: 'caos',
  matheus: 'caos',
  moco: 'caos',
  derson: 'caos',
};

export const DEFAULT_SYNERGY_ROTATION: SynergyRotationConfig = synergyRotationConfigSchema.parse({
  intervalDays: 1,
  anchor: '2026-01-01T00:00:00Z',
  seedPrefix: 'merge-escritorio-rot-',
  override: null,
});

validateSynergyMapping(INITIAL_SYNERGY_MAPPING, DEFAULT_SYNERGIES);
