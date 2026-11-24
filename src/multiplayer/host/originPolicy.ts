/**
 * Política de origem das conexões WebSocket. Uma página aberta no navegador de alguém da rede pode tentar
 * conectar ao servidor; por isso, conexões de navegador só valem se vierem de uma página servida de
 * máquina local ou de rede privada. Clientes que não são navegadores (sem cabeçalho Origin) são aceitos.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (origin === undefined) {
    return true;
  }
  try {
    return isLocalOrPrivateHost(new URL(origin).hostname);
  } catch {
    return false;
  }
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
