import { describe, expect, it } from 'vitest';
import { buildNewsFeed, formatNewsDate } from '@core/news/newsFeed';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import type { GameContent } from '@data/schemas/content';
import type { PatchNote } from '@data/schemas/patchNote';
import { RELEASE_NOTES } from '@data/releaseNotes';
import { summarizeContentChanges } from './changeSummary';

const changed = (change: (content: GameContent) => void): string[] => {
  const next = structuredClone(DEFAULT_GAME_CONTENT);
  change(next);
  return summarizeContentChanges(DEFAULT_GAME_CONTENT, next);
};

describe('rascunho da nota de atualização', () => {
  it('sem mudanças, fica vazio; trocar só o sprite não gera nota', () => {
    expect(changed(() => undefined)).toEqual([]);
    expect(changed((content) => (content.characters[0]!.sprite = { path: '/sprites/bixo-000000000000.png', scale: 1, offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 1 }))).toEqual([]);
  });

  it('descreve atributos, raridade e habilidade de um personagem', () => {
    const lines = changed((content) => {
      const bixo = content.characters.find((character) => character.id === 'bixo')!;
      bixo.stats.health += 1;
      bixo.rarity = 'rare';
      bixo.ability.cooldownSeconds += 1;
    });
    const before = DEFAULT_GAME_CONTENT.characters.find((character) => character.id === 'bixo')!.stats.health;
    expect(lines).toEqual([`Bixo: vida ${before} → ${before + 1}, raridade comum → raro, habilidade ajustada.`]);
  });

  it('avisa quem entrou e quem saiu do jogo, e ignora o que continua guardado', () => {
    const lines = changed((content) => {
      content.characters.find((character) => character.id === 'bixo')!.active = false;
      content.config.tower.variants[0]!.active = true;
      content.config.tower.variants[1]!.cost = 9;
      content.maps[1]!.tiles.left = '#000000';
      content.config.shop.refreshCost = 2;
    });
    expect(lines).toEqual([
      'Personagem fora do jogo: Bixo.',
      'Torre no jogo: Máquina de café.',
      'Praia: visual novo.',
      'Regras de economia, loja ou rodadas ajustadas.',
    ]);
  });
});

describe('Novidades', () => {
  const note: PatchNote = { id: '2-1', title: 'Equilíbrio', text: '- Bixo mais forte\n\n• Mapa novo', publishedAt: '2026-11-30T12:00:00.000Z', contentVersion: 2 };

  it('junta as duas fontes da mais nova para a mais antiga, com uma linha por mudança', () => {
    const feed = buildNewsFeed(RELEASE_NOTES, [note]);
    expect(feed[0]).toEqual({ source: 'server', noteId: '2-1', date: '2026-11-30', title: 'Equilíbrio', lines: ['Bixo mais forte', 'Mapa novo'] });
    expect(feed).toHaveLength(RELEASE_NOTES.length + 1);
    expect([...feed].map((entry) => entry.date)).toEqual([...feed].map((entry) => entry.date).sort().reverse());
  });

  it('mostra a data no formato daqui', () => {
    expect(formatNewsDate('2026-11-28')).toBe('28/11/2026');
  });
});
