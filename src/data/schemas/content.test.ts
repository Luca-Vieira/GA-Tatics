import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '../defaults/content';
import { validateGameContent } from './content';

/** Objeto JSON editável nos testes (o conteúdo é validado em tempo de execução, não pelo compilador). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

/** Cópia profunda editável do conteúdo padrão. */
const clone = () => JSON.parse(JSON.stringify(DEFAULT_GAME_CONTENT)) as JsonObject;

function issuesOf(raw: unknown): string[] {
  const result = validateGameContent(raw);
  return result.ok ? [] : [...result.issues];
}

describe('conteúdo do jogo', () => {
  it('o conteúdo padrão é válido', () => {
    expect(validateGameContent(clone()).ok).toBe(true);
  });

  it('recusa campos desconhecidos em qualquer nível', () => {
    const extraTop = clone();
    extraTop.segredo = true;
    expect(issuesOf(extraTop)).not.toEqual([]);

    const extraInCharacter = clone();
    extraInCharacter.characters[0].poderDoMal = 9;
    expect(issuesOf(extraInCharacter)).not.toEqual([]);

    const extraInConfig = clone();
    extraInConfig.config.economy.bonus = 1;
    expect(issuesOf(extraInConfig)).not.toEqual([]);
  });

  it('recusa ids repetidos e o id reservado da torre', () => {
    const repeated = clone();
    repeated.characters[1].id = repeated.characters[0].id;
    expect(issuesOf(repeated).join('\n')).toContain('Id de personagem repetido');

    const reserved = clone();
    reserved.characters[0].id = 'torre';
    expect(issuesOf(reserved).join('\n')).toContain('reservado');
  });

  it('exige exatamente 3 sinergias', () => {
    const content = clone();
    content.synergies.pop();
    expect(issuesOf(content)).not.toEqual([]);
  });

  it('personagem ativo sem sinergia na distribuição é recusado, e inativo não precisa de sinergia', () => {
    const content = clone();
    delete content.initialSynergyMapping.bixo;
    expect(issuesOf(content).join('\n')).toContain('"bixo" não tem sinergia');

    const withInactive = clone();
    withInactive.characters.find((character: { id: string }) => character.id === 'bixo').active = false;
    delete withInactive.initialSynergyMapping.bixo;
    // Sobram 3 personagens em Operacional: menos que o mínimo de 4.
    expect(issuesOf(withInactive).join('\n')).toContain('pelo menos 4');
  });

  it('cada sinergia precisa de pelo menos 4 personagens, mas não de quantidades iguais, e só cita sinergias e personagens que existem', () => {
    const tooFew = clone();
    tooFew.initialSynergyMapping.bixo = 'caos';
    expect(issuesOf(tooFew).join('\n')).toContain('pelo menos 4');

    // 4, 5 e 4 (o padrão é 4, 4 e 5): quantidades diferentes são aceitas.
    const otherSplit = clone();
    otherSplit.initialSynergyMapping.derson = 'gestao';
    expect(validateGameContent(otherSplit).ok).toBe(true);

    const unknownSynergy = clone();
    unknownSynergy.initialSynergyMapping.bixo = 'inexistente';
    expect(issuesOf(unknownSynergy).join('\n')).toContain('sinergia desconhecida');

    const unknownCharacter = clone();
    unknownCharacter.initialSynergyMapping.fantasma = 'caos';
    expect(issuesOf(unknownCharacter).join('\n')).toContain('não existe');
  });

  it('valida o override da rotação com as mesmas regras', () => {
    const content = clone();
    content.rotation.override = { ...content.initialSynergyMapping, bixo: 'caos' };
    expect(issuesOf(content).join('\n')).toContain('pelo menos 4');
    content.rotation.override = { ...content.initialSynergyMapping };
    expect(validateGameContent(content).ok).toBe(true);
  });

  it('valida a configuração da torre', () => {
    const content = clone();
    content.config.tower.offerChancePercent = 150;
    expect(issuesOf(content).join('\n')).toContain('config.tower.offerChancePercent');
  });

  it('mostra o caminho do erro de forma legível', () => {
    const content = clone();
    content.characters[2].stats.health = 99;
    expect(issuesOf(content).some((issue) => issue.startsWith('characters.2.stats.health'))).toBe(true);
  });
});
