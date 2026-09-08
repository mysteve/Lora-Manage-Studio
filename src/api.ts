import { invoke, isTauri, convertFileSrc } from '@tauri-apps/api/core';
import { open, confirm } from '@tauri-apps/plugin-dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
export const desktop = isTauri();
export const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview');
export async function call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (desktop) return invoke<T>(command, args);
  if (preview) {
    const { previewCall } = await import('./preview');
    return previewCall(command, args) as Promise<T>;
  }
  throw new Error('请在 LoRA Studio 桌面窗口中使用。浏览器仅用于前端开发。');
}
export const asset = (path: string) => (desktop ? convertFileSrc(path) : path);
export async function copy(text: string) {
  if (desktop) await writeText(text);
  else await navigator.clipboard.writeText(text);
}
export async function chooseDirectory() {
  return desktop
    ? await open({ directory: true, multiple: false, title: '选择 ComfyUI 根目录（或便携版文件夹）' })
    : null;
}
export async function chooseImage() {
  return desktop
    ? await open({
        multiple: false,
        title: '选择模型封面',
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      })
    : null;
}
export async function ask(message: string) {
  return desktop
    ? await confirm(message, { title: 'LoRA Studio', kind: 'warning', okLabel: '确认', cancelLabel: '取消' })
    : window.confirm(message);
}
export async function external(url: string) {
  if (!/^https:\/\/civitai\.(red|com)\//.test(url)) throw new Error('外部链接不受支持');
  if (desktop) await openUrl(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
export async function reveal(path: string) {
  if (desktop) await revealItemInDir(path);
}
