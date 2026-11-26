import type Phaser from 'phaser';

const FITTED_KEY = 'fittedContent';

/**
 * Escreve o texto abreviando com reticências se passar da largura. (O recorte do Phaser não serve: com textos em alta
 * resolução ele desenha a parte recortada ampliada.) Só recalcula quando o conteúdo ou a largura mudam.
 */
export function setFittedText(text: Phaser.GameObjects.Text, content: string, maximumWidth: number): void {
  const key = `${maximumWidth}|${content}`;
  if (text.getData(FITTED_KEY) === key) {
    return;
  }
  text.setData(FITTED_KEY, key);
  text.setText(content);
  for (let length = content.length - 1; length > 1 && text.width > maximumWidth; length--) {
    text.setText(`${content.slice(0, length).trimEnd()}…`);
  }
}
