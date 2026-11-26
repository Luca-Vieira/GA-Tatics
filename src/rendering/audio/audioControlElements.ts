/** Peças HTML dos controles de som. Os alvos de toque têm pelo menos 44px e nada depende de passar o mouse. */

const BUTTON_STYLE = 'border:1px solid #2f3e5c;background:#16213a;color:#e5e7eb;cursor:pointer;font-family:inherit;';
const TOGGLE_BUTTON_STYLE = `${BUTTON_STYLE}width:44px;height:44px;border-radius:22px;font-size:22px;line-height:1;padding:0;`;
const TEXT_BUTTON_STYLE = `${BUTTON_STYLE}min-height:44px;border-radius:6px;font-size:14px;`;
const TOGGLE_ROW_STYLE = 'display:flex;align-items:center;gap:10px;min-height:44px;font-weight:bold;cursor:pointer;';
const VOLUME_ROW_STYLE = 'display:flex;flex-direction:column;color:#94a3b8;';
const CHECKBOX_STYLE = 'width:22px;height:22px;margin:0;accent-color:#2563eb;';
const SLIDER_STYLE = 'width:100%;height:44px;margin:0;accent-color:#2563eb;';

export interface ChannelControls {
  readonly elements: readonly HTMLElement[];
  readonly refresh: (isEnabled: boolean, volume: number) => void;
}

export interface ChannelOptions {
  readonly toggleLabel: string;
  readonly volumeLabel: string;
  readonly onToggle: (isEnabled: boolean) => void;
  readonly onVolume: (volume: number) => void;
  /** Quando o usuário solta o controle deslizante. */
  readonly onVolumeChosen?: () => void;
}

export function createDiv(style: string): HTMLDivElement {
  const div = document.createElement('div');
  div.style.cssText = style;
  return div;
}

export function createTextButton(label: string): HTMLButtonElement {
  return createButton(label, TEXT_BUTTON_STYLE);
}

/** Botão redondo com um símbolo; o nome é lido por leitores de tela. */
export function createToggleButton(symbol: string, accessibleName: string): HTMLButtonElement {
  const button = createButton(symbol, TOGGLE_BUTTON_STYLE);
  button.setAttribute('aria-label', accessibleName);
  button.title = accessibleName;
  return button;
}

/** Um liga/desliga e um volume; música e efeitos têm cada um o seu par. */
export function createChannelControls(options: ChannelOptions): ChannelControls {
  const checkbox = createCheckbox(options.onToggle);
  const toggleRow = createLabelRow(TOGGLE_ROW_STYLE, checkbox, createText(options.toggleLabel));
  const slider = createVolumeSlider(options);
  const volumeText = createText('');
  const volumeRow = createLabelRow(VOLUME_ROW_STYLE, volumeText, slider);

  const refresh = (isEnabled: boolean, volume: number): void => {
    const percentage = Math.round(volume * 100);
    checkbox.checked = isEnabled;
    slider.value = String(percentage);
    volumeText.textContent = `${options.volumeLabel}: ${percentage}%`;
    volumeRow.style.opacity = isEnabled ? '1' : '0.5';
  };
  return { elements: [toggleRow, volumeRow], refresh };
}

function createButton(label: string, style: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = style;
  return button;
}

function createCheckbox(onToggle: (isChecked: boolean) => void): HTMLInputElement {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.style.cssText = CHECKBOX_STYLE;
  checkbox.addEventListener('change', () => onToggle(checkbox.checked));
  return checkbox;
}

function createVolumeSlider(options: ChannelOptions): HTMLInputElement {
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '5';
  slider.setAttribute('aria-label', options.volumeLabel);
  slider.style.cssText = SLIDER_STYLE;
  slider.addEventListener('input', () => options.onVolume(Number(slider.value) / 100));
  slider.addEventListener('change', () => options.onVolumeChosen?.());
  return slider;
}

function createLabelRow(style: string, ...children: HTMLElement[]): HTMLLabelElement {
  const row = document.createElement('label');
  row.style.cssText = style;
  row.append(...children);
  return row;
}

function createText(content: string): HTMLSpanElement {
  const text = document.createElement('span');
  text.textContent = content;
  return text;
}
