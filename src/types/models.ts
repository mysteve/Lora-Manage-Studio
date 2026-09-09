export interface Settings {
  loraDir: string;
  comfyRoot: string;
  setupDismissed: boolean;
  proxyMode: string;
  proxyUrl: string;
  safeContent: boolean;
}
export interface Cover {
  nsfwLevel?: number | null;
  meta?: Record<string, unknown> | null;
  url: string;
  localPath: string;
}
export interface SourceFile {
  id: number;
  name: string;
  sizeKb: number;
  downloadUrl: string;
  sha256: string;
  format: string;
  primary: boolean;
}
export interface ModelVersion {
  id: number;
  modelId: number;
  name: string;
  baseModel: string;
  description: string;
  trainedWords: string[];
  files: SourceFile[];
  images: Cover[];
  imagesClassified?: boolean;
  availability: string;
}
export interface RemoteModel {
  id: number;
  name: string;
  author: string;
  description: string;
  tags: string[];
  downloads: number;
  versions: ModelVersion[];
}
export interface TriggerPreview {
  id: string;
  name: string;
  triggerWords: string[];
  image: Cover;
  notes: string;
}
export interface LibraryEntry {
  id: string;
  path: string;
  size: number;
  modified: number;
  sha256: string;
  name: string;
  triggerWords: string[];
  triggerPreviews: TriggerPreview[];
  author: string;
  baseModel: string;
  tags: string[];
  notes: string;
  favorite: boolean;
  missing: boolean;
  verified: boolean;
  cover: Cover;
  customCover: boolean;
  modelId: number | null;
  version: ModelVersion | null;
  createdAt: number;
}
export interface Recipe {
  id: string;
  owner: string;
  name: string;
  positive: string;
  negative: string;
  modelWeight: number;
  clipWeight: number;
  notes: string;
}
export interface DownloadTask {
  id: string;
  model: RemoteModel;
  version: ModelVersion;
  file: SourceFile;
  destination: string;
  status: string;
  downloaded: number;
  total: number;
  speed: number;
  error: string;
  createdAt: number;
}
export interface SearchResult {
  items: RemoteModel[];
  nextCursor: string | null;
}
export interface ScanProgress {
  running: boolean;
  processed: number;
  matched: number;
  current: string;
  errors: string[];
}
export type Page = 'library' | 'discover' | 'downloads' | 'favorites' | 'recipes' | 'settings';
