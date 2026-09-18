export const outputZoomShortcuts = 'Shift + 方向键平移放大图片；+ / = 放大，- 缩小（1–8 倍）；0 复位';

export const outputEditableSelector =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"], [role="slider"]';

interface OutputKey {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
}

type OutputKeyAction =
  | { type: 'navigate'; direction: -1 | 1 }
  | { type: 'pan'; x: number; y: number }
  | { type: 'zoom'; delta: -0.25 | 0.25 }
  | { type: 'reset' };

export function outputKeyAction(event: OutputKey, editable = false): OutputKeyAction | null {
  if (
    editable ||
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return null;
  if (event.shiftKey) {
    switch (event.key) {
      case 'ArrowLeft':
        return { type: 'pan', x: -80, y: 0 };
      case 'ArrowRight':
        return { type: 'pan', x: 80, y: 0 };
      case 'ArrowUp':
        return { type: 'pan', x: 0, y: -80 };
      case 'ArrowDown':
        return { type: 'pan', x: 0, y: 80 };
      case '+':
        return { type: 'zoom', delta: 0.25 };
      default:
        return null;
    }
  }
  switch (event.key) {
    case 'ArrowLeft':
      return { type: 'navigate', direction: -1 };
    case 'ArrowRight':
      return { type: 'navigate', direction: 1 };
    case '+':
    case '=':
      return { type: 'zoom', delta: 0.25 };
    case '-':
      return { type: 'zoom', delta: -0.25 };
    case '0':
      return { type: 'reset' };
    default:
      return null;
  }
}

export function clampOutputScale(value: number) {
  return Math.max(1, Math.min(8, value));
}

export function clampOutputOffset(
  x: number,
  y: number,
  scale: number,
  width: number,
  height: number,
  naturalWidth: number,
  naturalHeight: number,
) {
  if (width <= 0 || height <= 0 || naturalWidth <= 0 || naturalHeight <= 0) return { x: 0, y: 0 };
  const fit = Math.min(width / naturalWidth, height / naturalHeight);
  const maxX = Math.max(0, (naturalWidth * fit * scale - width) / 2);
  const maxY = Math.max(0, (naturalHeight * fit * scale - height) / 2);
  return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
}
