export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (url.hostname === 'civitai.com' || url.hostname === 'civitai.red') return true;
    return url.hostname === 'auth.civitai.com' && url.pathname === '/login/oauth/device';
  } catch {
    return false;
  }
}
