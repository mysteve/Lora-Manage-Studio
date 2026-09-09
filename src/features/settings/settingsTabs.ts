import type { Settings } from '../../types/models';

export type GeneralSettingsTab = 'workspace' | 'website';

// 仅合并当前分类，保留其他分类已保存的配置或尚未保存的草稿。
export function settingsForTab(base: Settings, source: Settings, tab: GeneralSettingsTab): Settings {
  return tab === 'workspace'
    ? { ...base, comfyRoot: source.comfyRoot, loraDir: source.loraDir, setupDismissed: source.setupDismissed }
    : { ...base, proxyMode: source.proxyMode, proxyUrl: source.proxyUrl, safeContent: source.safeContent };
}
