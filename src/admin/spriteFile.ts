/** Mesmos limites do servidor (`spriteStore.ts`); a checagem aqui só poupa uma ida à rede, o servidor confere de novo. */
export const MAXIMUM_SPRITE_BYTES = 1024 * 1024;
export const MAXIMUM_SPRITE_DIMENSION = 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** `null` se o arquivo parece um PNG aceitável; senão, a explicação para mostrar ao administrador. */
export function checkSpriteBytes(bytes: Uint8Array): string | null {
  if (bytes.length > MAXIMUM_SPRITE_BYTES) {
    return `A imagem tem ${(bytes.length / 1024 / 1024).toFixed(1)} MB; o limite é 1 MB.`;
  }
  const hasSignature = bytes.length >= 33 && PNG_SIGNATURE.every((value, position) => bytes[position] === value);
  if (!hasSignature) {
    return 'O arquivo não é um PNG. Exporte a imagem como PNG (com fundo transparente).';
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < 1 || height < 1 || width > MAXIMUM_SPRITE_DIMENSION || height > MAXIMUM_SPRITE_DIMENSION) {
    return `A imagem tem ${width}×${height} pixels; o máximo é ${MAXIMUM_SPRITE_DIMENSION}×${MAXIMUM_SPRITE_DIMENSION}.`;
  }
  return null;
}
