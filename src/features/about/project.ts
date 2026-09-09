import appConfig from '../../../src-tauri/tauri.conf.json';
export const APP_VERSION = appConfig.version;
export const PROJECT_URL = 'https://github.com/mysteve/Lora-Manage-Studio';
export const RELEASES_URL = `${PROJECT_URL}/releases`;

// 正式发布使用三段版本号；无法识别的标签交由用户在发布页核对。
export function compareRelease(latest: string, current: string): number | null {
  const parse = (value: string) => {
    const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\da-zA-Z.-]+)?$/.exec(value.trim());
    return match ? match.slice(1, 4).map(BigInt) : null;
  };
  const a = parse(latest),
    b = parse(current);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}
