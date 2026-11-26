/** Folha de estilo da galeria; vive dentro do próprio painel, então some junto com ele. */
export const GALLERY_CSS = `
.galeria { position: fixed; inset: 0; z-index: 950; display: flex; flex-direction: column; background: #0b1220; color: #e5e7eb;
  font-family: Arial, sans-serif; font-size: 14px; line-height: 1.4; touch-action: manipulation; }
.galeria * { box-sizing: border-box; }
.galeria h2, .galeria h3, .galeria p { margin: 0; }
.galeria h2 { font-size: 18px; }
.galeria h3 { font-size: 15px; }
.galeria-barra { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border-bottom: 1px solid #2f3e5c; background: #111a2e;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) calc(env(safe-area-inset-right, 0px) + 10px) 8px calc(env(safe-area-inset-left, 0px) + 10px); }
.galeria-barra h2 { flex: 1 1 auto; }
.galeria button, .galeria select { min-height: 44px; border: 1px solid #3b4d73; border-radius: 8px; background: #16213a; color: #e5e7eb;
  padding: 6px 12px; font: inherit; cursor: pointer; }
.galeria button:focus-visible, .galeria select:focus-visible { outline: 2px solid #3b82f6; outline-offset: 1px; }
.galeria button[aria-pressed="true"] { background: #2563eb; border-color: #3b82f6; }
.galeria button:disabled { opacity: 0.5; cursor: default; }
.galeria-conteudo { flex: 1 1 auto; overflow-y: auto; touch-action: pan-y; overscroll-behavior: contain;
  padding: 10px calc(env(safe-area-inset-right, 0px) + 10px) calc(env(safe-area-inset-bottom, 0px) + 16px) calc(env(safe-area-inset-left, 0px) + 10px); }
.galeria-secao { margin: 14px 0 8px; }
.galeria-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.galeria-cartao { display: flex; flex-direction: column; gap: 6px; border: 1px solid #2f3e5c; border-top: 4px solid; border-radius: 10px;
  background: #111a2e; padding: 8px; min-width: 0; }
.galeria .galeria-abrir { display: flex; flex-direction: column; align-items: center; gap: 4px; border: 0; background: transparent; padding: 4px; }
.galeria-nome { font-weight: bold; font-size: 15px; }
.galeria-apagado { color: #94a3b8; font-size: 12px; }
.galeria-retrato { display: flex; justify-content: center; align-items: flex-end; width: 64px; height: 80px; }
.galeria-retrato img { max-width: 100%; max-height: 100%; object-fit: contain; }
.galeria-retrato svg { width: 100%; height: 100%; }
.galeria-retrato-pequeno { width: 40px; height: 50px; }
.galeria-etiqueta { display: inline-block; border: 1px solid; border-radius: 999px; padding: 1px 8px; font-size: 12px; }
.galeria-barras { display: flex; flex-direction: column; gap: 5px; }
.galeria-atributo { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 8px; font-size: 12px; }
.galeria-trilho { grid-column: 1 / -1; height: 7px; border-radius: 4px; background: #1e293b; overflow: hidden; }
.galeria-preenchimento { height: 100%; background: #3b82f6; }
.galeria-atributo.galeria-maior .galeria-preenchimento { background: #4ade80; }
.galeria-atributo.galeria-maior .galeria-valor { color: #4ade80; font-weight: bold; }
.galeria-detalhe { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; align-items: start; }
.galeria-bloco { display: flex; flex-direction: column; gap: 6px; border: 1px solid #2f3e5c; border-radius: 10px; background: #111a2e; padding: 10px; min-width: 0; }
.galeria-cabecalho { display: flex; gap: 10px; align-items: center; }
.galeria-mapa { width: 100%; max-width: 460px; height: auto; align-self: center; }
.galeria-casa-vazia { fill: #0f1a30; stroke: #2f3e5c; }
.galeria-casa-area { fill: #b45309; stroke: #fbbf24; }
.galeria-casa-origem { fill: #2563eb; stroke: #e5e7eb; stroke-width: 2; }
.galeria-mapa text { fill: #ffffff; font-weight: bold; font-size: 14px; }
.galeria-caracteristica { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid #1e293b; padding: 3px 0; }
.galeria-caracteristica span:last-child { text-align: right; }
.galeria-comparacao { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-items: start; }
@media (max-height: 480px) {
  .galeria button, .galeria select { min-height: 40px; }
  .galeria-barra { padding-top: calc(env(safe-area-inset-top, 0px) + 4px); padding-bottom: 4px; gap: 6px; }
  .galeria h2 { font-size: 16px; }
}
@media (max-width: 480px) {
  .galeria-grade { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .galeria-comparacao .galeria-bloco { padding: 7px; }
  .galeria-comparacao .galeria-caracteristica { flex-direction: column; gap: 0; }
  .galeria-comparacao .galeria-caracteristica span:last-child { text-align: left; }
}
`;
