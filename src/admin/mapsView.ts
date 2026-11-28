/** Aba "Mapas": criar, editar e liberar os mapas das partidas. */
import type { MapBackground, MapDefinition } from '@data/schemas/map';
import { MAXIMUM_MAPS } from '@data/schemas/map';
import { AdminRequestError } from './adminClient';
import { actionButton, el, field } from './dom';
import { getAt, mapBackgroundFields, mapFields, setAt, type FieldSpec } from './fieldSpecs';
import { createMapPreview, type MapPreview } from './mapPreview';
import { mapImageUploadId, newBackground, newMapFrom, type EditableBackgroundType } from './mapsDraft';
import { checkSpriteBytes, MAXIMUM_SPRITE_BYTES, MAXIMUM_SPRITE_DIMENSION } from './spriteFile';

type Json = Record<string, unknown>;

/** O que a aba precisa do restante do painel. */
export interface MapsViewContext {
  readonly draft: () => Json;
  readonly selectedIndex: number;
  readonly select: (index: number) => void;
  readonly renderFields: (specs: readonly FieldSpec[]) => HTMLElement;
  readonly commitAndRender: (next: Json) => void;
  readonly serverUrl: string;
  readonly upload: (uploadId: string, png: Uint8Array) => Promise<string>;
  /** Recebe a prévia criada, para o painel atualizá-la a cada campo alterado. */
  readonly onPreview: (preview: MapPreview) => void;
}

const BACKGROUND_TYPE_LABELS: Readonly<Record<MapBackground['type'], string>> = {
  color: 'Cor lisa',
  gradient: 'Degradê',
  texture: 'Textura desenhada pelo jogo',
  image: 'Imagem enviada',
};

const MAP_IMAGE_REQUIREMENTS_TEXT = `Aceito: somente PNG · até ${MAXIMUM_SPRITE_BYTES / 1024 / 1024} MB · até ${MAXIMUM_SPRITE_DIMENSION} × ${MAXIMUM_SPRITE_DIMENSION} pixels · recomendado: imagem deitada de 1024 × 576. Ela cobre a tela toda e o que sobrar é cortado.`;

export function renderMapsView(context: MapsViewContext): HTMLElement {
  const maps = (getAt(context.draft(), ['maps']) as MapDefinition[] | undefined) ?? [];
  const index = Math.min(context.selectedIndex, maps.length - 1);
  const list = el('div', { className: 'list' });
  maps.forEach((map, position) => {
    const item = actionButton(`${map.name}${map.active ? '' : ' (guardado)'}`, () => context.select(position), `item${position === index ? ' selected' : ''}${map.active ? '' : ' inactive'}`);
    list.append(item);
  });
  const sidebar = el('div', {}, [list]);
  const selected = maps[index];
  if (selected && maps.length < MAXIMUM_MAPS) {
    sidebar.append(
      el('div', { className: 'row spaced' }, [
        actionButton('Novo mapa (copiando o atual)', () => {
          context.commitAndRender(setAt(context.draft(), ['maps', maps.length], newMapFrom(selected, maps)));
          context.select(maps.length);
        }),
      ]),
    );
  }
  return el('div', {}, [
    el('div', {
      className: 'note',
      text: 'Mapas mudam só a aparência. Os liberados podem ser escolhidos por quem cria a sala e entram no sorteio ("Aleatório"). A partida contra bots no navegador usa os mapas que vêm com o jogo.',
    }),
    el('div', { className: 'columns spaced' }, [sidebar, selected ? renderMapForm(context, selected, index, maps.length) : el('div')]),
  ]);
}

function renderMapForm(context: MapsViewContext, map: MapDefinition, index: number, mapCount: number): HTMLElement {
  const path = ['maps', index];
  const preview = createMapPreview(context.serverUrl);
  preview.update(getAt(context.draft(), path));
  context.onPreview(preview);

  const form = el('div', { className: 'form' }, [
    preview.element,
    el('div', { className: 'muted', text: `Id: ${map.id}` }),
    context.renderFields(mapFields(path)),
    el('h3', { text: 'Fundo' }),
    renderBackgroundType(context, map, index),
    context.renderFields(mapBackgroundFields(map.background.type, path)),
    renderImageUpload(context, map, index),
  ]);

  if (mapCount > 1) {
    form.append(
      el('div', { className: 'row spaced' }, [
        actionButton(
          'Apagar mapa',
          () => {
            if (window.confirm(`Apagar o mapa "${map.name}"? A mudança só vale depois de publicar.`)) {
              context.select(0);
              context.commitAndRender(setAt(context.draft(), path, undefined));
            }
          },
          'danger',
        ),
      ]),
    );
  }
  return form;
}

function renderBackgroundType(context: MapsViewContext, map: MapDefinition, index: number): HTMLElement {
  const select = el('select');
  const currentType = map.background.type;
  for (const [type, label] of Object.entries(BACKGROUND_TYPE_LABELS)) {
    // A imagem só entra pelo envio do arquivo, logo abaixo.
    if (type !== 'image' || currentType === 'image') {
      select.append(el('option', { value: type, text: label }));
    }
  }
  select.value = currentType;
  select.addEventListener('change', () => {
    context.commitAndRender(setAt(context.draft(), ['maps', index, 'background'], newBackground(select.value as EditableBackgroundType)));
  });
  return field('Tipo de fundo', select);
}

function renderImageUpload(context: MapsViewContext, map: MapDefinition, index: number): HTMLElement {
  const input = el('input', { type: 'file', attributes: { accept: 'image/png' } });
  const status = el('div', { className: 'muted' });
  const send = async () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const problem = checkSpriteBytes(bytes);
    if (problem) {
      status.className = 'error';
      status.textContent = problem;
      return;
    }
    status.className = 'muted';
    status.textContent = 'Enviando…';
    try {
      const uploadedPath = await context.upload(mapImageUploadId(map.id), bytes);
      context.commitAndRender(setAt(context.draft(), ['maps', index, 'background'], { type: 'image', path: uploadedPath, darken: 0.25 }));
    } catch (failure) {
      status.className = 'error';
      status.textContent = failure instanceof AdminRequestError ? failure.message : 'Não foi possível enviar a imagem.';
    }
  };
  input.addEventListener('change', () => void send());
  return el('div', {}, [
    el('h3', { text: 'Usar uma imagem como fundo' }),
    el('div', { className: 'file-requirements', text: MAP_IMAGE_REQUIREMENTS_TEXT }),
    input,
    status,
  ]);
}
