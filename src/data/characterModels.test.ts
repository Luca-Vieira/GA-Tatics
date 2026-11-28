import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { importCharacters } from '../admin/editorState';
import { DEFAULT_GAME_CONTENT } from './defaults/content';
import { validateGameContent } from './schemas/content';

/** Os modelos de `modelos/personagens` não fazem parte do jogo, mas precisam continuar importáveis. */
const folder = new URL('../../modelos/personagens/', import.meta.url);
const files = readdirSync(fileURLToPath(folder)).filter((file) => file.endsWith('.json'));
const textOf = (file: string) => readFileSync(new URL(file, folder), 'utf8');

describe('modelos de personagem do repositório', () => {
  it('há modelos, e o guia da pasta cita todos', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
    const guide = readFileSync(new URL('../README.md', folder), 'utf8');
    for (const file of files) {
      expect(guide, file).toContain(`(personagens/${file})`);
    }
  });

  it.each(files)('%s pode ser importado e entra guardado', (file) => {
    const result = importCharacters(DEFAULT_GAME_CONTENT, textOf(file), { asInactive: false, replaceExisting: false });
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.content.characters.at(-1)!.active).toBe(false);
    expect(validateGameContent(result.content).ok).toBe(true);
  });

  it('dá para importar todos de uma vez', () => {
    const together = `[${files.map(textOf).join(',')}]`;
    const result = importCharacters(DEFAULT_GAME_CONTENT, together, { asInactive: true, replaceExisting: false });
    expect(result.ok && result.added).toHaveLength(files.length);
  });
});
