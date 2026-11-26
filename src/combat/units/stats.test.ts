import { describe, expect, it } from 'vitest';
import { calculateDamageTaken, MAXIMUM_DAMAGE_REDUCTION } from './damage';
import { HEALTH_PER_POINT, toCombatStats } from './stats';

describe('toCombatStats', () => {
  it('converte a escala 1–10 conforme as fórmulas da decisão de design', () => {
    const bixo = toCombatStats({ health: 10, damage: 4, attackSpeed: 3, range: 1, mobility: 3 });
    expect(bixo.maxHealth).toBe(10 * HEALTH_PER_POINT);
    expect(bixo.damage).toBe(40);
    expect(bixo.attacksPerSecond).toBeCloseTo(0.85);
    expect(bixo.range).toBe(1);
    expect(bixo.hexesPerSecond).toBeCloseTo(1.7);
  });

  it('atinge os extremos citados no documento (Leo e João Lucas)', () => {
    const leo = toCombatStats({ health: 3, damage: 9, attackSpeed: 9, range: 1, mobility: 10 });
    expect(leo.attacksPerSecond).toBeCloseTo(1.75);
    expect(leo.hexesPerSecond).toBeCloseTo(3.8);
    const joaoLucas = toCombatStats({ health: 3, damage: 10, attackSpeed: 2, range: 6, mobility: 2 });
    expect(joaoLucas.attacksPerSecond).toBeCloseTo(0.7);
    expect(joaoLucas.hexesPerSecond).toBeCloseTo(1.4);
  });

  it('aplica o multiplicador de estrela só a vida e dano', () => {
    const base = { health: 5, damage: 5, attackSpeed: 5, range: 2, mobility: 5 };
    const umaEstrela = toCombatStats(base, 1);
    const tresEstrelas = toCombatStats(base, 3);
    expect(tresEstrelas.maxHealth).toBe(umaEstrela.maxHealth * 6);
    expect(tresEstrelas.damage).toBe(umaEstrela.damage * 6);
    expect(tresEstrelas.attacksPerSecond).toBe(umaEstrela.attacksPerSecond);
    expect(tresEstrelas.hexesPerSecond).toBe(umaEstrela.hexesPerSecond);
    expect(toCombatStats(base, 2).maxHealth).toBe(umaEstrela.maxHealth * 2.5);
  });
});

describe('calculateDamageTaken', () => {
  it('não reduz o dano sem resistência', () => {
    expect(calculateDamageTaken(100, 0)).toBe(100);
  });

  it('combina resistência e redução de habilidade de forma multiplicativa', () => {
    expect(calculateDamageTaken(100, 0.1, 0.5)).toBeCloseTo(100 * 0.9 * 0.5);
  });

  it('limita a redução total ao teto de 80%', () => {
    expect(calculateDamageTaken(100, 0.5, 0.9)).toBeCloseTo(100 * (1 - MAXIMUM_DAMAGE_REDUCTION));
  });
});
