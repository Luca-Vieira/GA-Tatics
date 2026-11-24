import type { Rarity } from '@data/schemas/character';

/** Cores, textos e profundidades da interface, sem dependência do Phaser (assim também servem aos testes). */
export const COLORS = {
  panel: 0x16213a,
  panelBorder: 0x2f3e5c,
  slot: 0x0f1a30,
  slotBorder: 0x3b4d73,
  button: 0x2563eb,
  buttonHover: 0x3b82f6,
  buttonDisabled: 0x334155,
  go: 0x16a34a,
  goHover: 0x22c55e,
  danger: 0xdc2626,
} as const;

export const TEXT_COLORS = {
  main: '#e5e7eb',
  muted: '#94a3b8',
  gold: '#fbbf24',
  good: '#4ade80',
  bad: '#f87171',
} as const;

export const RARITY_COLORS: Readonly<Record<Rarity, number>> = { common: 0x94a3b8, rare: 0x60a5fa, special: 0xf59e0b };
export const RARITY_LABELS: Readonly<Record<Rarity, string>> = { common: 'Comum', rare: 'Raro', special: 'Especial' };

/** Fundos de painéis ficam acima do tabuleiro e abaixo de qualquer unidade (a profundidade de uma unidade é a altura dos seus pés). */
export const PANEL_DEPTH = -500;
/** Textos e botões de interface ficam acima das unidades e dos efeitos de combate. */
export const UI_DEPTH = 25_000;
/** Telas por cima de tudo: resultado da rodada e fim de partida. */
export const SCREEN_DEPTH = 35_000;

export const FONT_FAMILY = 'Arial';

export function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
