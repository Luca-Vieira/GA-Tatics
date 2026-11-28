import type { MapDefinition } from '../schemas/map';

/**
 * Mapas que vêm com o jogo; o painel edita, desliga ou cria outros. Em todos, a metade da esquerda é mais quente e a da
 * direita mais fria (ou o contrário bem marcado), para os dois times continuarem fáceis de separar.
 */
export const DEFAULT_MAPS: readonly MapDefinition[] = [
  {
    id: 'classico',
    name: 'Escritório',
    active: true,
    background: { type: 'color', color: '#0b1220' },
    tiles: { left: '#8a4b22', right: '#2b4a86', variation: 0 },
  },
  {
    id: 'praia',
    name: 'Praia',
    active: true,
    background: { type: 'texture', texture: 'sand', color: '#6b5532', detail: '#1f6f86' },
    tiles: { left: '#a87c3f', right: '#1f7480', variation: 0.08 },
  },
  {
    id: 'vulcao',
    name: 'Vulcão',
    active: true,
    background: { type: 'texture', texture: 'lava', color: '#1c0f0d', detail: '#c2410c' },
    tiles: { left: '#7c2d12', right: '#44344f', variation: 0.14 },
  },
  {
    id: 'campo',
    name: 'Campo',
    active: true,
    background: { type: 'texture', texture: 'grass', color: '#1d3b1f', detail: '#4d7c32' },
    tiles: { left: '#7a5a26', right: '#356b34', variation: 0.1 },
  },
  {
    id: 'lua',
    name: 'Lua',
    active: true,
    background: { type: 'texture', texture: 'moon', color: '#070914', detail: '#9ca3af' },
    tiles: { left: '#7d6f63', right: '#4b5878', variation: 0.12 },
  },
];
