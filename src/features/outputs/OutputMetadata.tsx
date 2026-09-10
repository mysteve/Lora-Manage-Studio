import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { call, copy } from '../../lib/api';
import { ErrorBox, Loading } from '../../components/ui';
import { generationGroups, type ImageMetadata } from './generationMetadata';
import '../models/ImageGallery.css';
import type { LibraryEntry } from '../../types/models';
import { AssociatedLoras } from './AssociatedLoras';

export function OutputMetadata({
  path,
  notify,
  library,
  loraDir,
  onOpenEntry,
}: {
  path: string;
  library: LibraryEntry[];
  loraDir: string;
  onOpenEntry: (entry: LibraryEntry) => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setMetadata(null);
    setError('');
    void call<ImageMetadata>('output_image_metadata', { path })
      .then((result) => {
        if (active) setMetadata(result);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  const copyValue = (value: string) =>
    void copy(value)
      .then(() => notify('已复制'))
      .catch((e) => notify(String(e), true));
  if (error) return <ErrorBox message={error} retry={() => setRevision((value) => value + 1)} />;
  if (!metadata) return <Loading text="正在读取图片生成信息…" />;
  const groups = generationGroups(metadata);
  const raw = Object.entries(metadata.text);
  return (
    <section className="output-metadata" aria-label="图片生成信息">
      <div className="gallery-navigation">
        <h2>图片生成信息</h2>
        <span className="muted">
          {metadata.width} × {metadata.height}
        </span>
      </div>
      <p className="field-help">
        以下信息来自图片内嵌记录。多次采样或多个输出分支会分别列出，未识别的节点可在原始记录中查看。
      </p>
      {groups.map((group, index) => (
        <section className="image-parameters" key={index}>
          <div className="gallery-navigation">
            <h2>{group.title}</h2>
            <button
              aria-label={`复制${group.title}全部参数`}
              onClick={() => copyValue(group.rows.map((row) => `${row.label}: ${row.value}`).join('\n'))}
            >
              <Copy size={14} />
              复制全部
            </button>
          </div>
          <AssociatedLoras names={group.loras} library={library} loraDir={loraDir} onOpen={onOpenEntry} />
          <dl>
            {group.rows.map((row, i) => (
              <div key={i}>
                <dt>
                  {row.label}
                  <button
                    className="icon-button"
                    aria-label={`复制${row.label}`}
                    onClick={() => copyValue(row.value)}
                  >
                    <Copy size={14} />
                  </button>
                </dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {!groups.length && (
        <p className="muted">
          {raw.length
            ? '未识别到可整理的生成参数，可以展开原始记录查看工作流或自定义节点信息。'
            : '这张图片没有保存可读取的模型、提示词和生成参数。关闭元数据保存或图片转存后，生成信息可能缺失。'}
        </p>
      )}
      {!!raw.length && (
        <details className="image-parameters">
          <summary>原始记录</summary>
          <dl>
            {raw.map(([key, value]) => (
              <div key={key}>
                <dt>
                  {key}
                  <button
                    className="icon-button"
                    aria-label={`复制原始${key}`}
                    onClick={() => copyValue(value)}
                  >
                    <Copy size={14} />
                  </button>
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}
