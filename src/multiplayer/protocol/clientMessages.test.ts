import { describe, expect, it } from 'vitest';
import { MAXIMUM_MESSAGE_BYTES, MAXIMUM_PLAYER_NAME_LENGTH, parseClientMessage } from './clientMessages';

const parse = (message: unknown) => parseClientMessage(JSON.stringify(message));

describe('leitura das mensagens do cliente', () => {
  it('aceita cada tipo de mensagem válida', () => {
    expect(parse({ type: 'create_room', playerName: 'Ana' })).toMatchObject({ ok: true });
    expect(parse({ type: 'join_room', roomCode: 'ABCD', playerName: 'Beto' })).toMatchObject({ ok: true });
    expect(parse({ type: 'leave_room' })).toMatchObject({ ok: true });
    expect(parse({ type: 'start_match' })).toMatchObject({ ok: true });
    expect(parse({ type: 'buy', shopSlot: 2 })).toMatchObject({ ok: true });
    expect(parse({ type: 'refresh_shop' })).toMatchObject({ ok: true });
    expect(parse({ type: 'toggle_freeze', shopSlot: 1 })).toMatchObject({ ok: true });
    expect(parse({ type: 'sell', unitId: 'p1-u3' })).toMatchObject({ ok: true });
    expect(parse({ type: 'set_ready', ready: true })).toMatchObject({ ok: true });
    expect(parse({ type: 'move', unitId: 'p1-u1', destination: { kind: 'board', cell: { q: 1, r: 2 } } })).toMatchObject({ ok: true });
    expect(parse({ type: 'move', unitId: 'p1-u1', destination: { kind: 'bench', slot: 1 } })).toMatchObject({ ok: true });
  });

  it('normaliza o código da sala e apara o nome', () => {
    const result = parse({ type: 'join_room', roomCode: ' abcd ', playerName: '  Ana  ' });
    expect(result).toEqual({ ok: true, message: { type: 'join_room', roomCode: 'ABCD', playerName: 'Ana' } });
  });

  it('recusa texto que não é JSON', () => {
    expect(parseClientMessage('{não é json')).toEqual({ ok: false, reason: 'invalid_json' });
  });

  it('recusa mensagens grandes demais antes de interpretar', () => {
    const padding = 'x'.repeat(MAXIMUM_MESSAGE_BYTES);
    expect(parse({ type: 'create_room', playerName: 'Ana', padding })).toEqual({ ok: false, reason: 'message_too_large' });
  });

  it('recusa tipos desconhecidos, campos extras e campos faltando', () => {
    expect(parse({ type: 'apagar_tudo' })).toEqual({ ok: false, reason: 'invalid_message' });
    expect(parse({ type: 'buy', shopSlot: 1, extra: true })).toEqual({ ok: false, reason: 'invalid_message' });
    expect(parse({ type: 'buy' })).toEqual({ ok: false, reason: 'invalid_message' });
    expect(parse({ type: 'toggle_freeze', shopSlot: 99 })).toEqual({ ok: false, reason: 'invalid_message' });
    expect(parse(['buy'])).toEqual({ ok: false, reason: 'invalid_message' });
    expect(parse(null)).toEqual({ ok: false, reason: 'invalid_message' });
  });

  it('recusa valores fora do limite ou do tipo', () => {
    expect(parse({ type: 'buy', shopSlot: -1 })).toMatchObject({ ok: false });
    expect(parse({ type: 'buy', shopSlot: 1.5 })).toMatchObject({ ok: false });
    expect(parse({ type: 'buy', shopSlot: '1' })).toMatchObject({ ok: false });
    expect(parse({ type: 'set_ready', ready: 'sim' })).toMatchObject({ ok: false });
    expect(parse({ type: 'move', unitId: 'u', destination: { kind: 'board', cell: { q: 9999, r: 0 } } })).toMatchObject({ ok: false });
    expect(parse({ type: 'move', unitId: 'u', destination: { kind: 'bench', slot: -2 } })).toMatchObject({ ok: false });
    expect(parse({ type: 'join_room', roomCode: 'ABCDE', playerName: 'Ana' })).toMatchObject({ ok: false });
    expect(parse({ type: 'join_room', roomCode: '12AB', playerName: 'Ana' })).toMatchObject({ ok: false });
  });

  it('recusa nomes vazios, longos ou com caracteres de controle', () => {
    expect(parse({ type: 'create_room', playerName: '   ' })).toMatchObject({ ok: false });
    expect(parse({ type: 'create_room', playerName: 'a'.repeat(MAXIMUM_PLAYER_NAME_LENGTH + 1) })).toMatchObject({ ok: false });
    expect(parse({ type: 'create_room', playerName: 'Ana\u0000\u001b[31m' })).toMatchObject({ ok: false });
  });

  it('não deixa passar propriedades perigosas do protótipo', () => {
    expect(parseClientMessage('{"type":"leave_room","__proto__":{"polluted":true}}')).toMatchObject({ ok: false });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
