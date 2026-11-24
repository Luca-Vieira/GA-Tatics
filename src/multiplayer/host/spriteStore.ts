import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Tamanho máximo do arquivo e das dimensões aceitas (o jogo desenha os personagens bem pequenos). */
export const MAXIMUM_SPRITE_BYTES = 1024 * 1024;
export const MAXIMUM_SPRITE_DIMENSION = 1024;

/** Caminho público de um sprite: `/sprites/<id do personagem>-<12 primeiros caracteres do hash>.png`. */
export const SPRITE_PATH_PATTERN = /^\/sprites\/([a-z0-9_]{1,40})-([0-9a-f]{12})\.png$/;
const CHARACTER_ID_PATTERN = /^[a-z0-9_]{1,40}$/;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_END = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const IHDR_LENGTH = 13;

export type SpriteSaveResult = { readonly ok: true; readonly path: string } | { readonly ok: false; readonly error: 'invalid_character_id' | 'too_large' | 'not_png' | 'bad_dimensions' };

export interface PngInfo {
  readonly width: number;
  readonly height: number;
}

/**
 * Confere, sem decodificar, que os bytes são mesmo um PNG: assinatura, cabeçalho IHDR logo no início e o fim (IEND).
 * Devolve as dimensões, ou `null` se não for um PNG íntegro.
 */
export function inspectPng(bytes: Buffer): PngInfo | null {
  const headerEnd = PNG_SIGNATURE.length + 8 + IHDR_LENGTH;
  if (bytes.length < headerEnd + 4 + PNG_END.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return null;
  }
  const chunkLength = bytes.readUInt32BE(PNG_SIGNATURE.length);
  const chunkType = bytes.subarray(PNG_SIGNATURE.length + 4, PNG_SIGNATURE.length + 8).toString('latin1');
  if (chunkLength !== IHDR_LENGTH || chunkType !== 'IHDR') {
    return null;
  }
  if (!bytes.subarray(bytes.length - PNG_END.length).equals(PNG_END)) {
    return null;
  }
  const width = bytes.readUInt32BE(PNG_SIGNATURE.length + 8);
  const height = bytes.readUInt32BE(PNG_SIGNATURE.length + 12);
  return { width, height };
}

/**
 * Sprites dos personagens, guardados no servidor (uma pasta; sem pasta, só em memória). O nome do arquivo é montado
 * pelo servidor com o id do personagem e o hash do conteúdo: nada do que vem da rede vira caminho de arquivo, e
 * versões antigas continuam disponíveis para partidas em andamento.
 */
export class SpriteStore {
  private readonly inMemory = new Map<string, Buffer>();

  constructor(private readonly directory?: string) {
    if (directory) {
      mkdirSync(directory, { recursive: true });
    }
  }

  save(characterId: string, bytes: Buffer): SpriteSaveResult {
    if (!CHARACTER_ID_PATTERN.test(characterId)) {
      return { ok: false, error: 'invalid_character_id' };
    }
    if (bytes.length > MAXIMUM_SPRITE_BYTES) {
      return { ok: false, error: 'too_large' };
    }
    const info = inspectPng(bytes);
    if (!info) {
      return { ok: false, error: 'not_png' };
    }
    const isSizeValid = info.width >= 1 && info.height >= 1 && info.width <= MAXIMUM_SPRITE_DIMENSION && info.height <= MAXIMUM_SPRITE_DIMENSION;
    if (!isSizeValid) {
      return { ok: false, error: 'bad_dimensions' };
    }
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const fileName = `${characterId}-${hash}.png`;
    if (this.directory) {
      const finalPath = join(this.directory, fileName);
      const temporaryPath = `${finalPath}.tmp`;
      writeFileSync(temporaryPath, bytes);
      renameSync(temporaryPath, finalPath);
    } else {
      this.inMemory.set(fileName, Buffer.from(bytes));
    }
    return { ok: true, path: `/sprites/${fileName}` };
  }

  /** Há um sprite guardado para este caminho público? */
  has(publicPath: string): boolean {
    const fileName = this.fileNameOf(publicPath);
    if (!fileName) {
      return false;
    }
    return this.directory ? existsSync(join(this.directory, fileName)) : this.inMemory.has(fileName);
  }

  /** Bytes do sprite, ou `null` se o caminho for inválido ou não existir. */
  read(publicPath: string): Buffer | null {
    const fileName = this.fileNameOf(publicPath);
    if (!fileName) {
      return null;
    }
    if (!this.directory) {
      return this.inMemory.get(fileName) ?? null;
    }
    try {
      return readFileSync(join(this.directory, fileName));
    } catch {
      return null;
    }
  }

  /** Só nomes no formato exato gerado por `save` viram arquivo (impede `..`, barras e qualquer outro caminho). */
  private fileNameOf(publicPath: string): string | null {
    const match = SPRITE_PATH_PATTERN.exec(publicPath);
    return match ? `${match[1]}-${match[2]}.png` : null;
  }
}
