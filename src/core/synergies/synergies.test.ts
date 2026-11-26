import { describe, expect, it } from 'vitest';
import { DEFAULT_SYNERGIES, DEFAULT_SYNERGY_ROTATION, INITIAL_SYNERGY_MAPPING } from '@data/defaults/synergies';
import { charactersWithChangedSynergy, millisecondsUntilNextRotation, rotationIndexAt, rotationStartMs, synergyMappingForIndex } from './rotation';
import { computeBonusesForUnit, summarizeSynergies } from './synergies';

const SYNERGY_IDS = DEFAULT_SYNERGIES.map((synergy) => synergy.id);
const statusOf = (statuses: ReturnType<typeof summarizeSynergies>, id: string) => statuses.find((status) => status.synergy.id === id)!;

describe('contagem e níveis', () => {
  it('2 unidades ativam o nível 1 e 4 ativam o nível 2 (substitui, não acumula)', () => {
    const level1 = summarizeSynergies(['bixo', 'wilian', 'helder'], INITIAL_SYNERGY_MAPPING, DEFAULT_SYNERGIES);
    expect(statusOf(level1, 'operacional')).toMatchObject({ count: 2, activeTierIndex: 0, nextThreshold: 4 });
    expect(statusOf(level1, 'gestao')).toMatchObject({ count: 1, activeTierIndex: -1, nextThreshold: 2 });

    const level2 = summarizeSynergies(['bixo', 'wilian', 'wender', 'marquinhos'], INITIAL_SYNERGY_MAPPING, DEFAULT_SYNERGIES);
    expect(statusOf(level2, 'operacional')).toMatchObject({ count: 4, activeTierIndex: 1, nextThreshold: null });
    expect(computeBonusesForUnit(level2, 'operacional').resistance).toBeCloseTo(0.08);
  });

  it('3 unidades continuam no nível 1', () => {
    const statuses = summarizeSynergies(['vinicius', 'leo', 'matheus'], INITIAL_SYNERGY_MAPPING, DEFAULT_SYNERGIES);
    expect(statusOf(statuses, 'caos')).toMatchObject({ count: 3, activeTierIndex: 0 });
  });

  it('exemplo do GDD: 2 Operacional, 2 Gestão e 3 Caos ativam o nível 1 das três', () => {
    const team = ['bixo', 'wilian', 'helder', 'gustavo', 'vinicius', 'leo', 'moco'];
    const statuses = summarizeSynergies(team, INITIAL_SYNERGY_MAPPING, DEFAULT_SYNERGIES);
    expect(statuses.map((status) => status.activeTierIndex)).toEqual([0, 0, 0]);
  });

  it('cada unidade vale 1, qualquer que seja a estrela (a contagem é por personagem no tabuleiro)', () => {
    const statuses = summarizeSynergies(['bixo', 'bixo'], INITIAL_SYNERGY_MAPPING, DEFAULT_SYNERGIES);
    expect(statusOf(statuses, 'operacional').count).toBe(2);
  });
});

describe('bônus resolvidos', () => {
  it('Operacional: resistência e regeneração', () => {
    const statuses = summarizeSynergies(['bixo', 'wilian'], INITIAL_SYNERGY_MAPPING, DEFAULT_SYNERGIES);
    const bonuses = computeBonusesForUnit(statuses, undefined);
    expect(bonuses.resistance).toBeCloseTo(0.04);
    expect(bonuses.regenFraction).toBeCloseTo(0.01);
    expect(bonuses.regenIntervalMs).toBe(3000);
  });

  it('Gestão: recarga e efeitos positivos', () => {
    const statuses = summarizeSynergies(['helder', 'gustavo', 'felipao', 'joao_lucas'], INITIAL_SYNERGY_MAPPING, DEFAULT_SYNERGIES);
    const bonuses = computeBonusesForUnit(statuses, undefined);
    expect(bonuses.cooldownReduction).toBeCloseTo(0.25);
    expect(bonuses.positiveEffectAmplification).toBeCloseTo(0.25);
  });

  it('Caos: multiplicadores de dano e velocidade de ataque', () => {
    const statuses = summarizeSynergies(['vinicius', 'leo'], INITIAL_SYNERGY_MAPPING, DEFAULT_SYNERGIES);
    const bonuses = computeBonusesForUnit(statuses, undefined);
    expect(bonuses.damageMultiplier).toBeCloseTo(1.05);
    expect(bonuses.attackSpeedMultiplier).toBeCloseTo(1.03);
  });

  it('sem sinergia ativa não há bônus nenhum', () => {
    const statuses = summarizeSynergies(['bixo', 'helder', 'leo'], INITIAL_SYNERGY_MAPPING, DEFAULT_SYNERGIES);
    expect(computeBonusesForUnit(statuses, 'operacional')).toMatchObject({ resistance: 0, damageMultiplier: 1, cooldownReduction: 0, regenIntervalMs: 0 });
  });

  it('"appliesTo: ownSynergy" restringe o bônus às unidades da própria sinergia', () => {
    const restricted = DEFAULT_SYNERGIES.map((synergy) => (synergy.id === 'caos' ? { ...synergy, appliesTo: 'ownSynergy' as const } : synergy));
    const statuses = summarizeSynergies(['vinicius', 'leo'], INITIAL_SYNERGY_MAPPING, restricted);
    expect(computeBonusesForUnit(statuses, 'caos').damageMultiplier).toBeCloseTo(1.05);
    expect(computeBonusesForUnit(statuses, 'gestao').damageMultiplier).toBe(1);
  });
});

describe('rotação diária', () => {
  const config = DEFAULT_SYNERGY_ROTATION;
  const day = 24 * 60 * 60 * 1000;
  const anchor = Date.parse(config.anchor);

  it('o índice muda a cada dia a partir da âncora', () => {
    expect(rotationIndexAt(anchor, config)).toBe(0);
    expect(rotationIndexAt(anchor + day - 1, config)).toBe(0);
    expect(rotationIndexAt(anchor + day, config)).toBe(1);
    expect(rotationIndexAt(Date.parse('2026-11-24T12:00:00Z'), config)).toBe(327);
  });

  it('antes da âncora vale a rotação 0', () => {
    expect(rotationIndexAt(anchor - 5 * day, config)).toBe(0);
  });

  it('a contagem regressiva chega à próxima fronteira', () => {
    expect(millisecondsUntilNextRotation(anchor + day / 4, config)).toBe((day * 3) / 4);
    expect(rotationStartMs(3, config)).toBe(anchor + 3 * day);
  });

  it('a rotação 0 é a distribuição de lançamento', () => {
    expect(synergyMappingForIndex(0, config, INITIAL_SYNERGY_MAPPING, SYNERGY_IDS)).toEqual(INITIAL_SYNERGY_MAPPING);
  });

  it('é determinística: mesmo índice, mesmo mapa', () => {
    const first = synergyMappingForIndex(37, config, INITIAL_SYNERGY_MAPPING, SYNERGY_IDS);
    const second = synergyMappingForIndex(37, config, INITIAL_SYNERGY_MAPPING, SYNERGY_IDS);
    expect(first).toEqual(second);
  });

  it('em toda rotação: cada sinergia tem ao menos 4 personagens, todos são distribuídos e ninguém repete a sinergia anterior', () => {
    let previous = synergyMappingForIndex(0, config, INITIAL_SYNERGY_MAPPING, SYNERGY_IDS);
    const totalCharacters = Object.keys(INITIAL_SYNERGY_MAPPING).length;
    for (let index = 1; index <= 200; index++) {
      const current = synergyMappingForIndex(index, config, INITIAL_SYNERGY_MAPPING, SYNERGY_IDS);
      expect(Object.keys(current).sort()).toEqual(Object.keys(INITIAL_SYNERGY_MAPPING).sort());
      for (const synergyId of SYNERGY_IDS) {
        expect(Object.values(current).filter((id) => id === synergyId).length).toBeGreaterThanOrEqual(4);
      }
      expect(charactersWithChangedSynergy(previous, current)).toHaveLength(totalCharacters);
      previous = current;
    }
  });

  describe('sinergias de tamanhos diferentes', () => {
    /** Monta uma distribuição com os tamanhos pedidos (personagens p0, p1, ... em ordem). */
    const mappingOfSizes = (sizes: readonly number[]) => {
      const mapping: Record<string, string> = {};
      let serial = 0;
      sizes.forEach((size, group) => {
        for (let member = 0; member < size; member++) mapping[`p${serial++}`] = SYNERGY_IDS[group] as string;
      });
      return mapping;
    };
    const sizesOf = (mapping: Readonly<Record<string, string>>) => SYNERGY_IDS.map((id) => Object.values(mapping).filter((value) => value === id).length);

    it('o tamanho de cada sinergia nunca cai abaixo de 4, e o total e a regra "ninguém repete" se mantêm', () => {
      for (const sizes of [[5, 4, 4], [6, 4, 4], [5, 5, 4], [8, 4, 4], [7, 5, 4]]) {
        const initial = mappingOfSizes(sizes);
        let previous = initial;
        for (let index = 1; index <= 120; index++) {
          const current = synergyMappingForIndex(index, config, initial, SYNERGY_IDS);
          expect(Math.min(...sizesOf(current)), sizes.join(',')).toBeGreaterThanOrEqual(4);
          expect(Object.keys(current)).toHaveLength(sizes.reduce((total, size) => total + size, 0));
          expect(charactersWithChangedSynergy(previous, current)).toHaveLength(Object.keys(initial).length);
          previous = current;
        }
      }
    });

    it('os tamanhos variam ao longo do tempo quando há folga, e a rotação é determinística', () => {
      const initial = mappingOfSizes([7, 5, 4]);
      const seen = new Set(Array.from({ length: 80 }, (_, index) => sizesOf(synergyMappingForIndex(index + 1, config, initial, SYNERGY_IDS)).join(',')));
      expect(seen.size).toBeGreaterThan(2);
      expect(synergyMappingForIndex(41, config, initial, SYNERGY_IDS)).toEqual(synergyMappingForIndex(41, config, initial, SYNERGY_IDS));
    });

    it('sinergias do mesmo tamanho continuam do mesmo tamanho (comportamento original)', () => {
      const initial = mappingOfSizes([4, 4, 4]);
      for (let index = 1; index <= 60; index++) {
        expect(new Set(sizesOf(synergyMappingForIndex(index, config, initial, SYNERGY_IDS))).size).toBe(1);
      }
    });

    it('com o mínimo exato em todas (4, 4 e 5 a rotação sempre acha uma troca válida)', () => {
      const initial = mappingOfSizes([4, 4, 5]);
      for (let index = 1; index <= 300; index++) {
        const mapping = synergyMappingForIndex(index, config, initial, SYNERGY_IDS);
        expect(Math.min(...sizesOf(mapping))).toBeGreaterThanOrEqual(4);
      }
    });
  });

  it('distribuições diferentes aparecem ao longo do tempo', () => {
    const distinct = new Set(Array.from({ length: 20 }, (_, index) => JSON.stringify(synergyMappingForIndex(index + 1, config, INITIAL_SYNERGY_MAPPING, SYNERGY_IDS))));
    expect(distinct.size).toBeGreaterThan(10);
  });

  it('o override administrativo substitui o sorteio', () => {
    const override = { ...INITIAL_SYNERGY_MAPPING, bixo: 'caos', leo: 'operacional' };
    expect(synergyMappingForIndex(5, { ...config, override }, INITIAL_SYNERGY_MAPPING, SYNERGY_IDS)).toEqual(override);
  });
});

describe('rotação com 4 ou 5 sinergias', () => {
  const config = DEFAULT_SYNERGY_ROTATION;
  const idsOf = (count: number) => Array.from({ length: count }, (_, index) => `s${index + 1}`);
  const mappingOfSizes = (ids: readonly string[], sizes: readonly number[]) => {
    const mapping: Record<string, string> = {};
    let serial = 0;
    sizes.forEach((size, group) => {
      for (let member = 0; member < size; member++) mapping[`p${serial++}`] = ids[group] as string;
    });
    return mapping;
  };
  const sizesOf = (ids: readonly string[], mapping: Readonly<Record<string, string>>) => ids.map((id) => Object.values(mapping).filter((value) => value === id).length);

  it.each([
    [4, [4, 4, 4, 4]],
    [4, [6, 5, 4, 4]],
    [5, [4, 4, 4, 4, 4]],
    [5, [6, 5, 5, 4, 4]],
  ])('com %i sinergias de %j personagens: mínimo de 4, todos distribuídos e ninguém repete', (count, sizes) => {
    const ids = idsOf(count);
    const initial = mappingOfSizes(ids, sizes);
    let previous = initial;
    for (let index = 1; index <= 150; index++) {
      const current = synergyMappingForIndex(index, config, initial, ids);
      expect(Object.keys(current).sort()).toEqual(Object.keys(initial).sort());
      expect(Math.min(...sizesOf(ids, current)), `rotação ${index}`).toBeGreaterThanOrEqual(4);
      expect(charactersWithChangedSynergy(previous, current)).toHaveLength(Object.keys(initial).length);
      previous = current;
    }
  });

  it('é determinística e varia ao longo do tempo quando há folga', () => {
    const ids = idsOf(4);
    const initial = mappingOfSizes(ids, [6, 6, 5, 5]);
    expect(synergyMappingForIndex(30, config, initial, ids)).toEqual(synergyMappingForIndex(30, config, initial, ids));
    const distinct = new Set(Array.from({ length: 30 }, (_, index) => JSON.stringify(synergyMappingForIndex(index + 1, config, initial, ids))));
    expect(distinct.size).toBeGreaterThan(20);
  });

  it('uma rotação sem solução por sorteio ainda devolve uma distribuição completa (divisão cíclica)', () => {
    const ids = idsOf(5);
    // Exatamente 4 por sinergia: o sorteio quase nunca acerta, mas toda rotação tem de ser válida mesmo assim.
    const initial = mappingOfSizes(ids, [4, 4, 4, 4, 4]);
    const mapping = synergyMappingForIndex(1, config, initial, ids);
    expect(Math.min(...sizesOf(ids, mapping))).toBeGreaterThanOrEqual(4);
  });
});

