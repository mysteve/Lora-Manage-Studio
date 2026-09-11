import { useEffect, useState } from 'react';
import { preview } from '../../lib/api';
import { builtInTerms, readTerms, termStorageKey, writeTerms, type PromptTerm } from './terms';

export function usePromptTerms() {
  const [terms, setTerms] = useState<PromptTerm[]>(builtInTerms);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const key = preview ? `${termStorageKey}.preview` : termStorageKey;
  useEffect(() => {
    const reload = () => {
      try {
        setTerms(readTerms(localStorage, key));
        setError('');
        setReady(true);
      } catch {
        setError('词库读取失败，暂用内置词库，已禁止修改以保护原数据。');
        setReady(false);
      }
    };
    reload();
    const changed = (event: StorageEvent) => {
      if (event.key === key || event.key === null) reload();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [key]);
  const mutate = (update: (latest: PromptTerm[]) => PromptTerm[]) => {
    if (!ready) return false;
    try {
      const next = update(readTerms(localStorage, key));
      writeTerms(localStorage, next, key);
      setTerms(next);
      setError('');
      return true;
    } catch (reason) {
      setError(`词库保存失败：${String(reason)}`);
      return false;
    }
  };
  return { terms, error, ready, mutate };
}
