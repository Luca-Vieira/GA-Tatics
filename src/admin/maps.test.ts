import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { DEFAULT_MAPS } from '@data/defaults/maps';
import { validateGameContent } from '@data/schemas/content';
import type { MapDefinition } from '@data/schemas/map';
import { applyMapsDraft, mapsDraftOf, newBackground, newMapFrom } from './mapsDraft';
import { mapBackgroundFields, mapFields, getAt, setAt } from './fieldSpecs';
import { tilePaletteOf } from '@shared/scenery/mapPainting';
import { pickMap } from '@core/maps/pickMap';

const withActive = (activeIds: readonly string[]): MapDefinition[] => DEFAULT_MAPS.map((map) => ({ ...map, active: activeIds.includes(map.id) }));

describe('mapas', () => {
  it('o jogo vem com o simples e os quatro temas, todos liberados', () => {
    expect(DEFAULT_GAME_CONTENT.maps.map((map) => map.id)).toEqual(['classico', 'praia', 'vulcao', 'campo', 'lua']);
    expect(DEFAULT_GAME_CONTENT.maps.every((map) => map.active)).toBe(true);
  });

  it('um conteúdo publicado antes de existirem mapas continua válido e ganha os mapas do jogo', () => {
    const { maps: _maps, ...old } = structuredClone(DEFAULT_GAME_CONTENT);
    void _maps;
    const result = validateGameContent(old);
    expect(result.ok && result.content.maps).toHaveLength(DEFAULT_MAPS.length);
  });

  it('recusa conteúdo sem nenhum mapa liberado ou com id repetido', () => {
    const none = validateGameContent({ ...DEFAULT_GAME_CONTENT, maps: withActive([]) });
    expect(!none.ok && none.issues.join(' ')).toContain('Libere ao menos um mapa');
    const repeated = validateGameContent({ ...DEFAULT_GAME_CONTENT, maps: [DEFAULT_MAPS[0]!, DEFAULT_MAPS[0]!] });
    expect(!repeated.ok && repeated.issues.join(' ')).toContain('Id de mapa repetido');
  });

  it('usa o mapa escolhido quando ele está liberado', () => {
    expect(pickMap(DEFAULT_MAPS, 'lua', 'qualquer').id).toBe('lua');
  });

  it('sem escolha, sorteia só entre os liberados, e a mesma semente dá o mesmo mapa', () => {
    const maps = withActive(['praia', 'campo']);
    const drawn = new Set(Array.from({ length: 60 }, (_, index) => pickMap(maps, null, `semente-${index}`).id));
    expect([...drawn].sort()).toEqual(['campo', 'praia']);
    expect(pickMap(maps, null, 'mesma').id).toBe(pickMap(maps, null, 'mesma').id);
    expect(['praia', 'campo']).toContain(pickMap(maps, 'lua', 'x').id);
  });

  it('as casas variam de tom só quando o mapa pede, sempre do mesmo jeito', () => {
    const cell = { q: 1, r: 2 };
    const flat = { left: '#808080', right: '#404040', variation: 0 };
    expect(tilePaletteOf(flat, 'left', cell).top).toBe(0x808080);
    const varied = { ...flat, variation: 0.3 };
    expect(tilePaletteOf(varied, 'left', cell)).toEqual(tilePaletteOf(varied, 'left', cell));
    expect(tilePaletteOf(varied, 'left', cell).top).not.toBe(tilePaletteOf(varied, 'left', { q: 3, r: 4 }).top);
  });
});

describe('aba Mapas', () => {
  it('um mapa novo é uma cópia desligada com id e nome livres, e entra no conteúdo', () => {
    const created = newMapFrom(DEFAULT_MAPS[1]!, [...DEFAULT_MAPS, { id: 'mapa_1', name: 'Mapa 1' }]);
    expect(created).toMatchObject({ id: 'mapa_2', name: 'Mapa 2', active: false, tiles: DEFAULT_MAPS[1]!.tiles });
    const result = applyMapsDraft(DEFAULT_GAME_CONTENT, setAt(mapsDraftOf(DEFAULT_GAME_CONTENT), ['maps', DEFAULT_MAPS.length], created));
    expect(result.ok && validateGameContent(result.content).ok).toBe(true);
  });

  it.each(['color', 'gradient', 'texture'] as const)('o fundo novo do tipo %s é válido e todos os campos dele existem', (type) => {
    const draft = setAt(mapsDraftOf(DEFAULT_GAME_CONTENT), ['maps', 0, 'background'], newBackground(type));
    expect(applyMapsDraft(DEFAULT_GAME_CONTENT, draft).ok).toBe(true);
    for (const spec of [...mapFields(['maps', 0]), ...mapBackgroundFields(type, ['maps', 0])]) {
      expect(getAt(draft, spec.path), spec.path.join('.')).toBeDefined();
    }
  });

  it('uma cor inválida não entra no conteúdo', () => {
    const result = applyMapsDraft(DEFAULT_GAME_CONTENT, setAt(mapsDraftOf(DEFAULT_GAME_CONTENT), ['maps', 0, 'tiles', 'left'], 'azul'));
    expect(result.ok).toBe(false);
  });
});
