import { useId, useRef, useState } from 'react';
import { completeTerm, promptToken, searchTerms, type PromptTerm } from './terms';

export function PromptInput({
  id,
  label,
  value,
  kind,
  terms,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  kind: 'positive' | 'negative';
  terms: PromptTerm[];
  onChange: (text: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [active, setActive] = useState(0);
  const query = promptToken(value, caret).query;
  const matches = query ? searchTerms(terms, query, kind).slice(0, 8) : [];
  const shown = open && !composing && matches.length > 0;
  const selected = Math.min(active, matches.length - 1);
  const select = (term: PromptTerm) => {
    const result = completeTerm(value, caret, term.text);
    onChange(result.text);
    setOpen(false);
    requestAnimationFrame(() => {
      input.current?.focus({ preventScroll: true });
      input.current?.setSelectionRange(result.caret, result.caret);
      setCaret(result.caret);
    });
  };
  return (
    <div className="prompt-autocomplete">
      <textarea
        ref={input}
        data-editor={id}
        aria-label={label}
        rows={2}
        value={value}
        aria-autocomplete="list"
        aria-controls={shown ? listId : undefined}
        aria-activedescendant={shown ? `${listId}-${selected}` : undefined}
        placeholder="输入中文或英文搜索词库…"
        onBlur={() => setOpen(false)}
        onFocus={(event) => {
          setCaret(event.currentTarget.selectionStart);
          setOpen(true);
        }}
        onClick={(event) => {
          setCaret(event.currentTarget.selectionStart);
          setActive(0);
          setOpen(true);
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(event) => {
          setComposing(false);
          setCaret(event.currentTarget.selectionStart);
          setOpen(true);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (composing || event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (!shown) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next = (selected + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
            setActive(next);
            const row = document.getElementById(`${listId}-${next}`);
            if (row?.parentElement) row.parentElement.scrollTop = row.offsetTop - row.parentElement.offsetTop;
          } else if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
            event.preventDefault();
            select(matches[selected]);
          }
        }}
      />
      {shown && (
        <div className="prompt-suggestions">
          <div id={listId} role="listbox" aria-label="提示词建议" className="prompt-suggestion-list">
            {matches.map((term, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === selected}
                tabIndex={-1}
                id={`${listId}-${index}`}
                key={term.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(term)}
              >
                <span>
                  <strong>{term.text}</strong>
                  <small>{term.translation}</small>
                </span>
                <span className="prompt-term-category">{term.category}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
