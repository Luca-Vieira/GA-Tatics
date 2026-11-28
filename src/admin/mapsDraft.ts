/** O rascunho da aba "Mapas" e o que se faz com ele. Lógica pura, sem DOM. */
import type { GameContent } from '@data/schemas/content';
import { MAXIMUM_MAPS, mapSchema, type MapBackground, type MapDefinition } from '@data/schemas/map';
import { z } from 'zod';

type Json = Record<string, unknown>;

const mapsDraftSchema = z.strictObject({ maps: z.array(mapSchema).min(1).max(MAXIMUM_MAPS) });

export function mapsDraftOf(content: GameContent): Json {
  return structuredClone({ maps: content.maps }) as unknown as Json;
}

export type MapsResult = { readonly ok: true; readonly content: GameContent } | { readonly ok: false; readonly issues: readonly string[] };

export function applyMapsDraft(content: GameContent, draft: Json): MapsResult {
  const parsed = mapsDraftSchema.safeParse(draft);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  }
  return { ok: true, content: { ...content, maps: parsed.data.maps } };
}

/** Cópia de um mapa, desligada e com id e nome que ainda não existem. */
export function newMapFrom(source: MapDefinition, existing: readonly { readonly id: string; readonly name: string }[]): MapDefinition {
  const takenIds = new Set(existing.map((map) => map.id));
  const takenNames = new Set(existing.map((map) => map.name));
  let number = 1;
  while (takenIds.has(`mapa_${number}`) || takenNames.has(`Mapa ${number}`)) {
    number++;
  }
  return { ...structuredClone(source), id: `mapa_${number}`, name: `Mapa ${number}`, active: false };
}

export type EditableBackgroundType = Exclude<MapBackground['type'], 'image'>;

/** Fundo novo de cada tipo, ao trocar o tipo. A imagem só entra pelo envio do arquivo. */
export function newBackground(type: EditableBackgroundType): MapBackground {
  switch (type) {
    case 'color':
      return { type, color: '#0b1220' };
    case 'gradient':
      return { type, from: '#1e3a5f', to: '#0b1220', direction: 'vertical' };
    case 'texture':
      return { type, texture: 'dots', color: '#111827', detail: '#64748b' };
  }
}

/** Nome com que a imagem de fundo é enviada ao servidor. */
export function mapImageUploadId(mapId: string): string {
  return `mapa_${mapId}`.slice(0, 40);
}
