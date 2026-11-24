/**
 * Política de origem das conexões (WebSocket e API do painel). Uma página aberta no navegador de alguém pode tentar
 * conectar ao servidor; por isso, conexões de navegador só valem se vierem de uma página servida de máquina local ou de
 * rede privada, ou de um endereço **liberado na configuração** (a página publicada do jogo). Clientes que não são
 * navegadores (sem cabeçalho Origin) são aceitos: a política protege os navegadores das pessoas, não é um login.
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[] = []): boolean {
  if (origin === undefined) {
    return true;
  }
  try {
    const url = new URL(origin);
    return isLocalOrPrivateHost(url.hostname) || allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}

/**
 * Lê a lista de origens liberadas (separadas por vírgula), como `https://usuario.github.io,https://jogo.web.app`.
 * Cada item tem de ser só o endereço da página: protocolo, domínio e porta, sem caminho (o navegador envia a origem
 * sem caminho, então `https://usuario.github.io/GA-Tatics` nunca bateria). Não há curingas.
 */
export function parseAllowedOrigins(text: string): string[] {
  const entries = text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.map((entry) => {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(`Origem inválida: "${entry}". Use o endereço completo, como https://usuario.github.io`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(`Origem inválida: "${entry}". Só http e https são aceitos.`);
    }
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') {
      throw new Error(`Origem inválida: "${entry}". Informe só o endereço (sem caminho): use ${url.origin}`);
    }
    return url.origin;
  });
}

export function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.localhost')) {
    return true;
  }
  return isPrivateIpv4(host);
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  const isIpv4 = parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  if (!isIpv4) {
    return false;
  }
  const [first, second] = parts as [number, number, number, number];
  const isLoopback = first === 127;
  const isTenNetwork = first === 10;
  const isCarrierPrivate = first === 172 && second >= 16 && second <= 31;
  const isHomeNetwork = first === 192 && second === 168;
  return isLoopback || isTenNetwork || isCarrierPrivate || isHomeNetwork;
}
