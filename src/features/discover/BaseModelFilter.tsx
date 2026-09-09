import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { call } from '../../lib/api';
import { filterBaseModels } from './baseModelSearch';
import './BaseModelFilter.css';

export function BaseModelFilter({
  value,
  onChange,
  reloadKey,
}: {
  value: string;
  onChange: (value: string) => void;
  reloadKey: string;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const lastAttempt = useRef(0);
  const errorId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const available = value && !models.includes(value) ? [value, ...models] : models;
  const matches = filterBaseModels(available, query);
  const options = query.trim() ? matches : ['', ...matches];
  const activeIndex = Math.min(highlight, options.length - 1);
  const choose = (model: string) => {
    setOpen(false);
    setQuery('');
    onChange(model);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const forceRefresh = attempt !== lastAttempt.current;
    lastAttempt.current = attempt;
    void call<string[]>('get_base_models', { forceRefresh })
      .then((items) => {
        if (active) setModels(items);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey, attempt]);

  return (
    <div className="base-model-filter">
      <div className="base-model-filter-controls">
        <div className="inline-label">
          <label htmlFor={`${listId}-input`}>基础模型</label>
          <div
            className="base-model-combobox"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setOpen(false);
                setQuery('');
              }
            }}
          >
            <div className="base-model-input-wrap">
              <input
                id={`${listId}-input`}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
                aria-busy={loading}
                aria-describedby={error ? errorId : undefined}
                value={open ? query : value}
                placeholder={open ? '输入名称，如 SDXL、Flux' : '全部'}
                onClick={() => {
                  if (!open) {
                    setOpen(true);
                    setQuery('');
                    setHighlight(0);
                  }
                }}
                onFocus={() => {
                  setOpen(true);
                  setQuery('');
                  setHighlight(0);
                }}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOpen(true);
                  setHighlight(0);
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setOpen(false);
                    setQuery('');
                  }
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (!open) {
                      setOpen(true);
                      setQuery('');
                      setHighlight(0);
                    } else
                      setHighlight(
                        Math.max(
                          0,
                          Math.min(options.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)),
                        ),
                      );
                  }
                  if (event.key === 'Enter' && open) {
                    event.preventDefault();
                    if (activeIndex >= 0) choose(options[activeIndex]);
                  }
                }}
              />
              <ChevronDown size={15} aria-hidden="true" />
            </div>
            {open && (
              <div className="base-model-popup">
                <div role="listbox" id={listId} aria-label="基础模型候选项">
                  {options.map((model, index) => (
                    <div
                      role="option"
                      id={`${listId}-${index}`}
                      key={model}
                      aria-selected={model === value}
                      className={index === activeIndex ? 'highlighted' : ''}
                      ref={(element) => {
                        if (element && index === activeIndex) {
                          const parent = element.parentElement!;
                          if (element.offsetTop < parent.scrollTop) parent.scrollTop = element.offsetTop;
                          else if (
                            element.offsetTop + element.offsetHeight >
                            parent.scrollTop + parent.clientHeight
                          )
                            parent.scrollTop = element.offsetTop + element.offsetHeight - parent.clientHeight;
                        }
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(model)}
                    >
                      {model || '全部'}
                    </div>
                  ))}
                </div>
                {options.length === 0 && (
                  <p role="status">{loading ? '正在加载分类…' : '没有匹配的基础模型'}</p>
                )}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={error ? '重试加载基础模型分类' : '刷新基础模型分类'}
          title={error ? '重试加载基础模型分类' : '刷新基础模型分类'}
          disabled={loading}
          onClick={() => setAttempt((current) => current + 1)}
        >
          <RefreshCw size={15} className={loading ? 'spin' : undefined} />
        </button>
      </div>
      {error && (
        <p className="base-model-filter-error" id={errorId} role="status">
          分类加载失败：{error}。可继续搜索，或点击刷新按钮重试。
        </p>
      )}
    </div>
  );
}
