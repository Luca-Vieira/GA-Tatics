import { z } from 'zod';

/** Notas de atualização que o administrador escreve ao publicar conteúdo. As do próprio jogo ficam em `releaseNotes.ts`. */

export const MAXIMUM_PATCH_NOTES = 50;
export const MAXIMUM_PATCH_NOTE_TITLE_LENGTH = 80;
export const MAXIMUM_PATCH_NOTE_TEXT_LENGTH = 3000;

export const patchNoteInputSchema = z.strictObject({
  title: z.string().trim().min(1, 'Dê um título à nota.').max(MAXIMUM_PATCH_NOTE_TITLE_LENGTH),
  /** Uma mudança por linha. */
  text: z.string().trim().min(1, 'Escreva o que mudou.').max(MAXIMUM_PATCH_NOTE_TEXT_LENGTH),
});
export type PatchNoteInput = z.infer<typeof patchNoteInputSchema>;

export const patchNoteSchema = z.strictObject({
  ...patchNoteInputSchema.shape,
  id: z.string().min(1).max(40),
  publishedAt: z.iso.datetime(),
  /** Versão do conteúdo que a publicação criou. */
  contentVersion: z.number().int().min(1),
});
export type PatchNote = z.infer<typeof patchNoteSchema>;
