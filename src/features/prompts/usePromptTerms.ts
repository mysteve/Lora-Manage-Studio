import { useEffect, useRef, useState } from 'react';
import { preview } from '../../lib/api';
import { builtInTerms, readTerms, termStorageKey, writeTerms, type PromptTerm } from './terms';
import { loadPromptVocabulary } from './vocabulary';
import { prepareTranslationDictionary } from './translation';

export function usePromptTerms() {
  const [terms, setTerms] = useState<PromptTerm[]>(builtInTerms);
  const [defaults, setDefaults] = useState<PromptTerm[]>(builtInTerms);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const generation = useRef(0);
  const key = preview ? `${termStorageKey}.preview` : termStorageKey;
  const publish = async (next: PromptTerm[], request: number) => {
    await prepareTranslationDictionary(next);
    if (request !== generation.current) return;
    setTerms(next);
    setError('');
    setReady(true);
  };
  useEffect(() => {
    let alive = true;
    let base = builtInTerms;
    let loaded = false;
    const reload = () => {
      if (!alive || !loaded) return;
      const request = ++generation.current;
      setReady(false);
      try {
        void publish(readTerms(localStorage, key, base), request);
      } catch {
        setError('词库读取失败，暂用已有词库，已禁止修改以保护原数据。');
      }
    };
    void loadPromptVocabulary()
      .then((value) => {
        if (!alive) return;
        base = value;
        loaded = true;
        setDefaults(value);
        reload();
      })
      .catch(() => {
        if (alive) setError('扩展词库加载失败，请重新打开页面；原有词条数据未修改。');
      });
    const changed = (event: StorageEvent) => {
      if (event.key === key || event.key === null) reload();
    };
    window.addEventListener('storage', changed);
    return () => {
      alive = false;
      generation.current++;
      window.removeEventListener('storage', changed);
    };
  }, [key]);
  const mutate = (update: (latest: PromptTerm[]) => PromptTerm[]) => {
    if (!ready) return false;
    try {
      const next = update(readTerms(localStorage, key, defaults));
      writeTerms(localStorage, next, key, defaults);
      setReady(false);
      void publish(next, ++generation.current);
      return true;
    } catch (reason) {
      setError(`词库保存失败：${String(reason)}`);
      return false;
    }
  };
  return { terms, error, ready, mutate };
}
