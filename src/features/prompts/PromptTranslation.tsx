import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { call } from '../../lib/api';
import type { PromptTerm } from './terms';
import { translateFromLibrary } from './translation';

export interface AiTranslationStatus {
  available: boolean;
  reason: string;
  model: string;
}
export const PromptTranslation = memo(function PromptTranslation({
  value,
  terms,
  ai,
}: {
  value: string;
  terms: PromptTerm[];
  ai: AiTranslationStatus | null;
}) {
  const [result, setResult] = useState<{ source: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    generation.current++;
    pending.current = false;
    setBusy(false);
    setResult(null);
    setError('');
    return () => {
      generation.current++;
    };
  }, [value]);
  const parts = useMemo(() => translateFromLibrary(value, terms), [value, terms]);
  const translated = result?.source === value ? result.text : '';
  if (!value.trim()) return null;
  const translate = async () => {
    if (pending.current || !ai?.available) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const request = ++generation.current;
    try {
      const text = await call<string>('translate_prompt', { text: value });
      if (request === generation.current) setResult({ source: value, text });
    } catch (reason) {
      if (request === generation.current) setError(String(reason));
    } finally {
      if (request === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <div className="prompt-translation">
      <div className="prompt-translation-header">
        <span>{translated ? '中文 · AI 翻译' : '中文'}</span>
        {ai?.available && (
          <button
            type="button"
            disabled={busy || value.length > 6000}
            onClick={() => void translate()}
            title={`使用 ${ai.model} 翻译当前片段`}
          >
            {busy ? <Loader2 size={13} className="spin" /> : <Bot size={13} />}
            {busy ? '翻译中…' : translated ? '重新翻译' : 'AI 翻译'}
          </button>
        )}
      </div>
      <div className="prompt-translation-text" aria-live="polite">
        {translated ||
          parts.map((part, index) => (
            <span
              key={index}
              className={part.missing ? 'prompt-translation-missing' : undefined}
              title={part.missing ? '词库暂无对应翻译' : undefined}
            >
              {part.text}
            </span>
          ))}
      </div>
      {ai?.available && value.length > 6000 && (
        <small className="prompt-translation-note">AI 翻译每次最多支持 6000 个字符，请拆分片段。</small>
      )}
      {error && (
        <p className="prompt-translation-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
