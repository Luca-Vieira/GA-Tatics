import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { ContentStore } from './contentStore';

/** Objeto JSON editável nos testes (o conteúdo é validado em tempo de execução, não pelo compilador). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

const clone = () => JSON.parse(JSON.stringify(DEFAULT_GAME_CONTENT)) as JsonObject;

describe('armazenamento do conteúdo', () => {
  let directory: string;
  let filePath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'merge-conteudo-'));
    filePath = join(directory, 'dados', 'content.json');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('começa com o conteúdo padrão na versão 1', () => {
    const store = new ContentStore({ filePath });
    expect(store.snapshot.version).toBe(1);
    expect(store.snapshot.content).toEqual(DEFAULT_GAME_CONTENT);
  });

  it('publicar valida, sobe a versão, grava no arquivo e avisa os ouvintes', () => {
    const store = new ContentStore({ filePath });
    const heard: number[] = [];
    store.onChange((snapshot) => heard.push(snapshot.version));
    const edited = clone();
    edited.config.rounds.startingLives = 5;
    expect(store.update(edited)).toEqual({ ok: true, version: 2 });
    expect(store.snapshot.content.config.rounds.startingLives).toBe(5);
    expect(heard).toEqual([2]);
    const saved = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(saved.version).toBe(2);
    expect(saved.content.config.rounds.startingLives).toBe(5);
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it('conteúdo inválido não muda nada, não grava e não avisa', () => {
    const store = new ContentStore({ filePath });
    const heard: number[] = [];
    store.onChange((snapshot) => heard.push(snapshot.version));
    const broken = clone();
    broken.characters[0].stats.health = 99;
    const result = store.update(broken);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.join('\n')).toContain('characters.0.stats.health');
    expect(store.snapshot.version).toBe(1);
    expect(heard).toEqual([]);
    expect(existsSync(filePath)).toBe(false);
  });

  it('um servidor novo recarrega o que foi publicado', () => {
    const first = new ContentStore({ filePath });
    const edited = clone();
    edited.config.rounds.startingLives = 4;
    first.update(edited);
    const second = new ContentStore({ filePath });
    expect(second.snapshot.version).toBe(2);
    expect(second.snapshot.content.config.rounds.startingLives).toBe(4);
  });

  it('arquivo corrompido ou inválido cai no padrão sem apagar o arquivo', () => {
    const store = new ContentStore({ filePath });
    store.update(clone());
    writeFileSync(filePath, '{ isto não é json', 'utf8');
    const logs: string[] = [];
    const recovered = new ContentStore({ filePath, log: (line) => logs.push(line) });
    expect(recovered.snapshot.version).toBe(1);
    expect(logs.join('\n')).toContain('usando o conteúdo padrão');
    expect(readFileSync(filePath, 'utf8')).toBe('{ isto não é json');

    writeFileSync(filePath, JSON.stringify({ version: 7, content: { characters: [] } }), 'utf8');
    expect(new ContentStore({ filePath }).snapshot.version).toBe(1);
  });

  it('publicar com nota guarda a nota (mais nova primeiro), e sem nota não cria nada', () => {
    let nowMs = Date.parse('2026-11-30T12:00:00.000Z');
    const store = new ContentStore({ filePath, nowMs: () => nowMs });
    store.update(clone(), undefined, { title: '  Primeira  ', text: 'Bixo mais forte' });
    store.update(clone());
    nowMs += 1000;
    store.update(clone(), undefined, { title: 'Segunda', text: 'Mapa novo' });
    expect(store.patchNotes.map((note) => [note.title, note.contentVersion])).toEqual([
      ['Segunda', 4],
      ['Primeira', 2],
    ]);
    expect(new ContentStore({ filePath }).patchNotes).toEqual(store.patchNotes);
  });

  it('uma nota vazia recusa a publicação inteira', () => {
    const store = new ContentStore({ filePath });
    const result = store.update(clone(), undefined, { title: 'Sem texto', text: '   ' });
    expect(!result.ok && result.issues.join(' ')).toContain('nota de atualização');
    expect(store.snapshot.version).toBe(1);
    expect(store.patchNotes).toEqual([]);
  });

  it('guarda no máximo 50 notas e apaga a que for pedida', () => {
    const store = new ContentStore();
    for (let publication = 0; publication < 55; publication++) {
      store.update(clone(), undefined, { title: `Nota ${publication}`, text: 'x' });
    }
    expect(store.patchNotes).toHaveLength(50);
    const [newest] = store.patchNotes;
    expect(store.removePatchNote(newest!.id)).toBe(true);
    expect(store.removePatchNote(newest!.id)).toBe(false);
    expect(store.patchNotes).toHaveLength(49);
  });
});

