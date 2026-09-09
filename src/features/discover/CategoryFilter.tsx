import { useEffect, useId, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { call } from '../../lib/api';

export function CategoryFilter({
  value,
  onChange,
  reloadKey,
}: {
  value: string;
  onChange: (value: string) => void;
  reloadKey: string;
}) {
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const statusId = useId();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      void call<string[]>('get_model_tags', { query })
        .then((items) => {
          if (active) setTags(items);
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, reloadKey, attempt]);

  return (
    <div className="base-model-filter category-filter">
      <div className="base-model-filter-controls">
        <label className="inline-label">
          内容分类
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-busy={loading}
            aria-describedby={statusId}
            disabled={loading && tags.length === 0 && !value}
          >
            <option value="">全部</option>
            {value && !tags.includes(value) && <option value={value}>{value}</option>}
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          aria-label="刷新内容分类"
          title="刷新内容分类"
          disabled={loading}
          onClick={() => setAttempt((current) => current + 1)}
        >
          <RefreshCw size={15} className={loading ? 'spin' : undefined} />
        </button>
      </div>
      <input
        className="category-search"
        aria-label="查找网站内容分类"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="查找分类，如 clothes、base model"
      />
      <p id={statusId} role="status" className={error ? 'base-model-filter-error' : 'category-filter-hint'}>
        {error
          ? `分类加载失败：${error}。请点击刷新重试。`
          : loading
            ? '正在加载网站分类…'
            : tags.length === 0
              ? '未找到相关分类，请换个关键词。'
              : '按网站标签分类，选择后点击搜索。'}
      </p>
    </div>
  );
}
