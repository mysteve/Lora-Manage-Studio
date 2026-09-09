import { useEffect, useId, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { call } from '../../lib/api';

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
  const errorId = useId();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void call<string[]>('get_base_models')
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
        <label className="inline-label">
          基础模型
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-busy={loading}
            aria-describedby={error ? errorId : undefined}
            disabled={loading && models.length === 0 && !value}
          >
            <option value="">{loading && models.length === 0 ? '加载分类中…' : '全部'}</option>
            {value && !models.includes(value) && <option value={value}>{value}</option>}
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
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
