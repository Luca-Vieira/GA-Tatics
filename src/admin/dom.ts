/** Criação de elementos da página do painel. O texto entra sempre como texto (nunca como HTML). */

export interface ElementProps {
  className?: string;
  text?: string;
  type?: string;
  value?: string;
  disabled?: boolean;
  attributes?: Record<string, string>;
}

export function el<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, props: ElementProps = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  if (props.className) element.className = props.className;
  if (props.text !== undefined) element.textContent = props.text;
  if (props.type) element.setAttribute('type', props.type);
  if (props.value !== undefined) (element as unknown as HTMLInputElement).value = props.value;
  if (props.disabled) (element as unknown as HTMLButtonElement).disabled = true;
  for (const [name, value] of Object.entries(props.attributes ?? {})) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

export function actionButton(label: string, onClick: () => void, className = '', disabled = false): HTMLButtonElement {
  const created = el('button', { text: label, className, disabled, type: 'button' });
  created.addEventListener('click', onClick);
  return created;
}

export function field(label: string, input: HTMLElement, help?: string): HTMLElement {
  return el('label', {}, [label, input, ...(help ? [el('span', { className: 'help', text: help })] : [])]);
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function svgEl<Tag extends keyof SVGElementTagNameMap>(tag: Tag, attributes: Record<string, string | number> = {}, children: Node[] = []): SVGElementTagNameMap[Tag] {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  element.append(...children);
  return element;
}
