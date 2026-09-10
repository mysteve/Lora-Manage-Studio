import { describe, expect, it } from 'vitest';
import { compareRelease, PROJECT_URL, RELEASES_URL } from './project';
import desktopCapability from '../../../src-tauri/capabilities/default.json';
import { isAllowedExternalUrl } from '../../lib/urls';

describe('版本更新', () => {
  it('桌面外链权限同时允许项目仓库与发布页面', () => {
    const opener = desktopCapability.permissions.find(
      (permission) => typeof permission === 'object' && permission.identifier === 'opener:allow-open-url',
    );
    expect(opener).toBeDefined();
    const allowed = typeof opener === 'object' ? opener.allow.map((entry) => entry.url) : [];
    for (const url of [PROJECT_URL, RELEASES_URL]) {
      expect(isAllowedExternalUrl(url)).toBe(true);
      expect(allowed).toContain(url);
    }
    expect(allowed.filter((url) => url.includes('github.com'))).toEqual([PROJECT_URL, RELEASES_URL]);
  });
  it('按数字比较正式版本，不按字符串排序', () => {
    expect(compareRelease('v0.10.0', '0.9.0')).toBe(1);
    expect(compareRelease('v0.1.0', '0.1.0')).toBe(0);
    expect(compareRelease('0.1.0', '0.2.0')).toBe(-1);
    expect(compareRelease('v1.0.0+build.1', '1.0.0')).toBe(0);
  });
  it('无法识别的标签不误报为最新版本', () => {
    for (const tag of ['nightly', 'v1.0.0-beta.1', '01.2.3', '1.2'])
      expect(compareRelease(tag, '0.1.0')).toBeNull();
  });
  it('仅允许项目仓库和发布页面链接', () => {
    expect(isAllowedExternalUrl('https://github.com/mysteve/Lora-Manage-Studio')).toBe(true);
    expect(isAllowedExternalUrl('https://github.com/mysteve/Lora-Manage-Studio/releases')).toBe(true);
    for (const url of [
      'https://github.com/other/repo',
      'https://github.com.evil.test/mysteve/Lora-Manage-Studio',
      'https://user@github.com/mysteve/Lora-Manage-Studio',
      'https://github.com/mysteve/Lora-Manage-Studio-evil',
    ])
      expect(isAllowedExternalUrl(url)).toBe(false);
  });
});
