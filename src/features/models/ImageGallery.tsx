import { useState } from 'react';
import { ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { CoverImage } from '../../components/ui';
import type { Cover } from '../../types/models';
import './ImageGallery.css';

const labels: Record<string, string> = {
  prompt: '正向提示词',
  negativePrompt: '负向提示词',
  steps: '步数',
  sampler: '采样器',
  seed: '随机种子',
  cfgScale: 'CFG 引导系数',
  Size: '图片尺寸',
  Model: '模型',
  'Model hash': '模型哈希',
  'Clip skip': 'CLIP 跳过层数',
};

export function metadataRows(meta?: Cover['meta']) {
  return Object.entries(meta ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key,
      label: labels[key] ?? key,
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
    }));
}

export function ImageGallery({
  images,
  cover,
  name,
  onCopy,
  onSetCover,
  busy,
}: {
  images: Cover[];
  cover?: Cover;
  name: string;
  onCopy: (text: string) => Promise<unknown>;
  onSetCover?: (url: string) => Promise<unknown>;
  busy: boolean;
}) {
  const hasCover = !!(cover?.url || cover?.localPath);
  const gallery =
    hasCover && !images.some((image) => image.url && image.url === cover?.url) ? [cover!, ...images] : images;
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      gallery.findIndex((image) => !!cover?.url && image.url === cover.url),
    ),
  );
  const currentIndex = Math.min(index, Math.max(0, gallery.length - 1));
  const current = gallery[currentIndex];
  const rows = metadataRows(current?.meta);
  const move = (delta: number) => setIndex((currentIndex + delta + gallery.length) % gallery.length);
  return (
    <section className="image-gallery" aria-label="模型示例图">
      <CoverImage className="detail-cover" cover={current} alt={`${name} 示例图 ${currentIndex + 1}`} />
      {gallery.length > 1 && (
        <>
          <div className="gallery-navigation">
            <button aria-label="上一张图片" onClick={() => move(-1)}>
              <ChevronLeft size={18} />
            </button>
            <span aria-live="polite">
              {currentIndex + 1} / {gallery.length}
            </span>
            <button aria-label="下一张图片" onClick={() => move(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="thumbnail-row gallery-thumbnails">
            {gallery.map((image, i) => (
              <button
                key={`${image.url}:${image.localPath}:${i}`}
                className={i === currentIndex ? 'chosen' : ''}
                aria-pressed={i === currentIndex}
                aria-label={`查看图片 ${i + 1}`}
                onClick={() => setIndex(i)}
              >
                <CoverImage cover={image} alt={`示例图 ${i + 1}`} />
              </button>
            ))}
          </div>
        </>
      )}
      {onSetCover && current?.url && images.some((image) => image.url === current.url) && (
        <button className="text-button" disabled={busy} onClick={() => void onSetCover(current.url)}>
          将当前图片设为模型封面
        </button>
      )}
      <section className="image-parameters" aria-label="当前图片生成参数">
        <div className="gallery-navigation">
          <h2>图片提示词与参数</h2>
          {!!rows.length && (
            <button
              aria-label="复制全部图片参数"
              onClick={() => void onCopy(rows.map((r) => `${r.label}: ${r.value}`).join('\n'))}
            >
              <Copy size={15} />
              复制全部
            </button>
          )}
        </div>
        {rows.length ? (
          <dl>
            {rows.map((row) => (
              <div key={row.key}>
                <dt>
                  {row.label}
                  <button
                    className="icon-button"
                    aria-label={`复制${row.label}`}
                    onClick={() => void onCopy(row.value)}
                  >
                    <Copy size={14} />
                  </button>
                </dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="muted">这张图片未提供提示词或生成参数。</p>
        )}
      </section>
    </section>
  );
}
