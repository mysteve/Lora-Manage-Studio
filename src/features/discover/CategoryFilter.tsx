import { useEffect, useId, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { call } from '../../lib/api';
import { categoryLabel, modelCategories } from './categories';

export function CategoryFilter({
  value,
  onChange,
  reloadKey,
  baseModel,
}: {
  value: string;
  onChange: (value: string) => void;
  reloadKey: string;
  baseModel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const statusId = useId();

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    setLoading(true);
    setError('');
    setTags([]);
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
  }, [query, reloadKey, attempt, expanded]);

  return (
    <div className="base-model-filter category-filter">
      <div className="category-heading">
        <span>内容分类</span>
        <span className="category-filter-hint">
          {baseModel ? `${baseModel} · LoRA` : '全部基础模型 · LoRA'} · 选择后自动搜索
        </span>
      </div>
      <div className="category-options" role="group" aria-label="LoRA 内容分类">
        {[{ value: '', label: '全部' }, ...modelCategories].map((category) => (
          <button
            key={category.value}
            type="button"
            aria-pressed={value === category.value}
            onClick={() => onChange(category.value)}
            title={category.value || '全部内容分类'}
          >
            {category.label}
          </button>
        ))}
      </div>
      {value && !modelCategories.some((category) => category.value === value) && (
        <p className="category-filter-hint">当前标签：{value}</p>
      )}
      <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>查找其他标签</summary>
        <div className="base-model-filter-controls">
          <label className="inline-label">
            网站标签
            <select
              value={value}
              onChange={(event) => onChange(event.target.value)}
              aria-busy={loading}
              aria-describedby={statusId}
              disabled={loading && tags.length === 0 && !value}
            >
              <option value="">全部</option>
              {value && !tags.includes(value) && <option value={value}>{categoryLabel(value)}</option>}
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {categoryLabel(tag)}
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
          aria-label="查找网站标签"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入英文标签，如 scenery、lighting"
        />
        <p id={statusId} role="status" className={error ? 'base-model-filter-error' : 'category-filter-hint'}>
          {error
            ? `分类加载失败：${error}。请点击刷新重试。`
            : loading
              ? '正在加载网站分类…'
              : tags.length === 0
                ? '未找到相关分类，请换个关键词。'
                : '选择标签会替换当前内容分类，并保留基础模型条件。'}
        </p>
      </details>
    </div>
  );
}
