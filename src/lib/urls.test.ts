import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl } from './urls';

describe('external website and authorization links', () => {
  it('allows account pages and the official device authorization page', () => {
    expect(isAllowedExternalUrl('https://civitai.red/user/account')).toBe(true);
    expect(isAllowedExternalUrl('https://civitai.com/models/1')).toBe(true);
    expect(isAllowedExternalUrl('https://auth.civitai.com/login/oauth/device?code=ABCD')).toBe(true);
  });
  it('rejects deceptive origins, credentials, ports and other auth endpoints', () => {
    for (const url of [
      'http://civitai.com/user/account',
      'https://civitai.com.evil.test/',
      'https://civitai.com@evil.test/',
      'https://user:password@civitai.com/',
      'https://civitai.com:8080/',
      'https://auth.civitai.com/api/auth/oauth/token',
      'javascript:alert(1)',
    ]) {
      expect(isAllowedExternalUrl(url)).toBe(false);
    }
  });
});
