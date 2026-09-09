import { describe, expect, it } from 'vitest';
import { settingsForTab } from './settingsTabs';
import type { Settings } from '../../types/models';

const saved: Settings = {
  comfyRoot: 'D:/ComfyUI',
  loraDir: 'D:/ComfyUI/models/loras',
  setupDismissed: true,
  proxyMode: 'system',
  proxyUrl: '',
  safeContent: true,
};
const draft: Settings = {
  ...saved,
  comfyRoot: 'E:/ComfyUI',
  proxyMode: 'manual',
  proxyUrl: 'http://localhost:7890',
  safeContent: false,
};

describe('设置分类保存', () => {
  it('保存工作空间时不提交网站草稿', () => {
    expect(settingsForTab(saved, draft, 'workspace')).toEqual({ ...saved, comfyRoot: draft.comfyRoot });
  });
  it('保存网站时不提交工作空间草稿', () => {
    expect(settingsForTab(saved, draft, 'website')).toEqual({ ...draft, comfyRoot: saved.comfyRoot });
  });
  it('应用保存结果时保留另一个分类的未保存输入', () => {
    const result = settingsForTab(draft, saved, 'website');
    expect(result.comfyRoot).toBe(draft.comfyRoot);
    expect(result.proxyMode).toBe(saved.proxyMode);
  });
});
