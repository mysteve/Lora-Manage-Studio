import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { easeOut } from '../../components/Motion';
import { CoverImage } from '../../components/ui';
import { useReducedMotion } from '../../lib/useReducedMotion';
import type { Cover } from '../../types/models';
import './ImageGallery.css';
import { coverSafety, useContentSafety } from '../../lib/contentSafety';

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
  const [direction, setDirection] = useState(1);
  const reduced = useReducedMotion();
  const current = gallery[currentIndex];
  const safety = coverSafety(current, useContentSafety());
  const rows = metadataRows(safety === 'visible' ? current?.meta : undefined);
  const move = (delta: number) => {
    setDirection(delta);
    setIndex(
      (previous) => (Math.min(previous, gallery.length - 1) + delta + gallery.length) % gallery.length,
    );
  };
  return (
    <section className="image-gallery" aria-label="模型示例图">
      <div className="detail-cover gallery-stage">
        <AnimatePresence initial={false} custom={reduced ? 0 : direction}>
          <motion.div
            key={`${current?.url}:${current?.localPath}:${currentIndex}`}
            className="gallery-slide"
            custom={reduced ? 0 : direction}
            variants={{
              enter: (offset: number) => ({ opacity: offset ? 0 : 1, x: offset * 20 }),
              exit: (offset: number) => ({ opacity: offset ? 0 : 1, x: offset * -20 }),
            }}
            initial="enter"
            animate={{ opacity: 1, x: 0 }}
            exit="exit"
            transition={{ duration: reduced ? 0 : 0.2, ease: easeOut }}
          >
            <CoverImage cover={current} alt={`${name} 示例图 ${currentIndex + 1}`} />
          </motion.div>
        </AnimatePresence>
      </div>
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
                onClick={() => {
                  setDirection(i > currentIndex ? 1 : -1);
                  setIndex(i);
                }}
              >
                <CoverImage cover={image} alt={`示例图 ${i + 1}`} />
              </button>
            ))}
          </div>
        </>
      )}
      {safety === 'visible' &&
        onSetCover &&
        current?.url &&
        images.some((image) => image.url === current.url) && (
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
          <p className="muted">
            {safety === 'hidden'
              ? '安全审查已隐藏该图片的提示词与参数。'
              : safety === 'unknown'
                ? '封面分级更新后显示图片提示词与参数。'
                : '这张图片未提供提示词或生成参数。'}
          </p>
        )}
      </section>
    </section>
  );
}
