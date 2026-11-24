import { describe, expect, it } from 'vitest';
import { defaultHttpAddress, defaultSocketAddress } from './serverAddress';

const https = { protocol: 'https:', hostname: 'jogo.exemplo.com', host: 'jogo.exemplo.com' };
const httpWithPort = { protocol: 'http:', hostname: '203.0.113.5', host: '203.0.113.5:8080' };
const localDev = { protocol: 'http:', hostname: 'localhost', host: 'localhost:5173' };

describe('endereço do servidor sugerido pelo jogo e pelo painel', () => {
  it('em desenvolvimento aponta para a porta 8787 da máquina da página', () => {
    expect(defaultSocketAddress({ isDevelopment: true, page: localDev })).toBe('ws://localhost:8787');
    expect(defaultHttpAddress({ isDevelopment: true, page: localDev })).toBe('http://localhost:8787');
    expect(defaultSocketAddress({ isDevelopment: true, page: { protocol: 'http:', hostname: '192.168.0.10', host: '192.168.0.10:5173' } })).toBe('ws://192.168.0.10:8787');
    expect(defaultSocketAddress({ isDevelopment: true, page: { protocol: 'file:', hostname: '', host: '' } })).toBe('ws://localhost:8787');
  });

  it('na página publicada usa o mesmo endereço dela, com /ws e conexão segura quando a página é https', () => {
    expect(defaultSocketAddress({ isDevelopment: false, page: https })).toBe('wss://jogo.exemplo.com/ws');
    expect(defaultHttpAddress({ isDevelopment: false, page: https })).toBe('https://jogo.exemplo.com');
    expect(defaultSocketAddress({ isDevelopment: false, page: httpWithPort })).toBe('ws://203.0.113.5:8080/ws');
    expect(defaultHttpAddress({ isDevelopment: false, page: httpWithPort })).toBe('http://203.0.113.5:8080');
  });

  it('o endereço definido no build vale sobre os outros', () => {
    const options = { isDevelopment: false, page: https, configuredUrl: ' wss://servidor.exemplo.com/ws/ ' };
    expect(defaultSocketAddress(options)).toBe('wss://servidor.exemplo.com/ws');
    expect(defaultHttpAddress(options)).toBe('https://servidor.exemplo.com');
    expect(defaultSocketAddress({ isDevelopment: false, page: https, configuredUrl: '   ' })).toBe('wss://jogo.exemplo.com/ws');
  });
});
