import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectPng, MAXIMUM_SPRITE_BYTES, SpriteStore } from './spriteStore';
import { TINY_PNG } from './testPng';


/** Troca as dimensões escritas no cabeçalho (o resto do arquivo continua igual; a inspeção não decodifica a imagem). */
function withDimensions(width: number, height: number): Buffer {
  const copy = Buffer.from(TINY_PNG);
  copy.writeUInt32BE(width, 16);
  copy.writeUInt32BE(height, 20);
  return copy;
}

describe('inspeção de PNG', () => {
  it('lê as dimensões de um PNG íntegro', () => {
    expect(inspectPng(TINY_PNG)).toEqual({ width: 1, height: 1 });
    expect(inspectPng(withDimensions(300, 200))).toEqual({ width: 300, height: 200 });
  });

  it('recusa o que não é PNG, PNG cortado e arquivo com nome de PNG mas outro conteúdo', () => {
    expect(inspectPng(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(inspectPng(Buffer.from('GIF89a'))).toBeNull();
    expect(inspectPng(TINY_PNG.subarray(0, 30))).toBeNull();
    expect(inspectPng(Buffer.concat([TINY_PNG, Buffer.from('lixo no fim')]))).toBeNull();
    expect(inspectPng(Buffer.alloc(0))).toBeNull();
  });
});

describe('armazenamento de sprites', () => {
  let directory: string | null = null;
  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = null;
  });

  it('guarda com nome montado pelo servidor (id + hash) e devolve os mesmos bytes', () => {
    const store = new SpriteStore();
    const result = store.save('bixo', TINY_PNG);
    expect(result).toMatchObject({ ok: true });
    const path = result.ok ? result.path : '';
    expect(path).toMatch(/^\/sprites\/bixo-[0-9a-f]{12}\.png$/);
    expect(store.has(path)).toBe(true);
    expect(store.read(path)?.equals(TINY_PNG)).toBe(true);
    // O mesmo conteúdo dá o mesmo caminho; conteúdo diferente, outro.
    expect(store.save('bixo', TINY_PNG)).toEqual(result);
    const other = store.save('bixo', withDimensions(2, 2));
    expect(other.ok && other.path).not.toBe(path);
  });

  it('recusa id inválido, arquivo que não é PNG, grande demais e dimensões fora do limite', () => {
    const store = new SpriteStore();
    expect(store.save('../segredo', TINY_PNG)).toEqual({ ok: false, error: 'invalid_character_id' });
    expect(store.save('Bixo', TINY_PNG)).toEqual({ ok: false, error: 'invalid_character_id' });
    expect(store.save('bixo', Buffer.from('não sou png'))).toEqual({ ok: false, error: 'not_png' });
    expect(store.save('bixo', Buffer.concat([TINY_PNG, Buffer.alloc(MAXIMUM_SPRITE_BYTES)]))).toEqual({ ok: false, error: 'too_large' });
    expect(store.save('bixo', withDimensions(5000, 10))).toEqual({ ok: false, error: 'bad_dimensions' });
    expect(store.save('bixo', withDimensions(0, 10))).toEqual({ ok: false, error: 'bad_dimensions' });
  });

  it('só caminhos no formato exato viram arquivo (nada de .., barras ou nomes inventados)', () => {
    directory = mkdtempSync(join(tmpdir(), 'merge-sprites-'));
    const store = new SpriteStore(directory);
    const saved = store.save('leo', TINY_PNG);
    const path = saved.ok ? saved.path : '';
    expect(store.read(path)?.equals(TINY_PNG)).toBe(true);
    for (const bad of ['/sprites/../content.json', '/sprites/leo-abc.png', '/sprites/leo-0123456789ab.png/../x', '/etc/passwd', '/sprites/LEO-0123456789ab.png', '/sprites/leo-0123456789ab.png%00']) {
      expect(store.read(bad)).toBeNull();
      expect(store.has(bad)).toBe(false);
    }
    expect(store.has('/sprites/leo-000000000000.png')).toBe(false);
  });

  it('em disco, grava de forma atômica e um armazenamento novo enxerga os arquivos', () => {
    directory = mkdtempSync(join(tmpdir(), 'merge-sprites-'));
    const first = new SpriteStore(directory);
    const saved = first.save('helder', TINY_PNG);
    expect(readdirSync(directory).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    const second = new SpriteStore(directory);
    expect(saved.ok && second.has(saved.path)).toBe(true);
  });
});
