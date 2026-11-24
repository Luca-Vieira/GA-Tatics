const NOTICE_ID = 'aviso-conteudo-novo';

/**
 * Faixa fixa no topo da página (fora do Phaser, então aparece em qualquer tela do jogo) avisando que o administrador
 * publicou conteúdo novo e que é preciso recarregar a página para jogar com ele. Só é criada uma vez.
 */
export function showReloadNotice(): void {
  if (document.getElementById(NOTICE_ID)) {
    return;
  }
  const banner = document.createElement('div');
  banner.id = NOTICE_ID;
  banner.setAttribute('role', 'alert');
  banner.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'z-index:1000',
    'display:flex',
    'gap:14px',
    'align-items:center',
    'justify-content:center',
    'padding:10px 14px',
    'background:#b45309',
    'color:#fff',
    'font-family:Arial,sans-serif',
    'font-size:15px',
    'font-weight:bold',
  ].join(';');

  const message = document.createElement('span');
  message.textContent = 'O jogo recebeu novidades! Recarregue a página para jogar com o conteúdo novo.';

  const button = document.createElement('button');
  button.textContent = 'Recarregar agora';
  button.style.cssText = 'padding:6px 12px;border:0;border-radius:4px;background:#fff;color:#92400e;font-weight:bold;cursor:pointer;';
  button.addEventListener('click', () => window.location.reload());

  const dismiss = document.createElement('button');
  dismiss.textContent = 'Depois';
  dismiss.style.cssText = 'padding:6px 12px;border:1px solid #fff;border-radius:4px;background:transparent;color:#fff;cursor:pointer;';
  dismiss.addEventListener('click', () => banner.remove());

  banner.append(message, button, dismiss);
  document.body.append(banner);
}
