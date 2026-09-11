import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, BookOpen } from 'lucide-react';
import { Modal } from '../../components/ui';
import { ask } from '../../lib/api';
import { normalizeTerm, searchTerms, type PromptTerm } from './terms';

const emptyTerm = (): PromptTerm => ({
  id: crypto.randomUUID(),
  text: '',
  translation: '',
  category: '自定义',
  aliases: '',
  kind: 'both',
  enabled: true,
});
export function PromptLibrary({
  terms,
  error,
  ready,
  mutate,
  onClose,
}: {
  terms: PromptTerm[];
  error: string;
  ready: boolean;
  mutate: (update: (latest: PromptTerm[]) => PromptTerm[]) => boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<PromptTerm | null>(null);
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const categories = useMemo(() => [...new Set(terms.map((term) => term.category))], [terms]);
  const rows = useMemo(
    () => searchTerms(terms, query).filter((term) => !category || term.category === category),
    [terms, query, category],
  );
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages - 1);
  const visibleRows = rows.slice(currentPage * 50, (currentPage + 1) * 50);
  const close = async () => {
    if (!editing || (await ask('放弃当前未保存的词条编辑？'))) onClose();
  };
  const update = (patch: Partial<PromptTerm>) => {
    if (editing) setEditing({ ...editing, ...patch });
  };
  return (
    <Modal title="提示词词库" wide onClose={() => void close()} className="prompt-library-modal">
      <p className="prompt-library-intro">
        <BookOpen size={17} />
        维护英文词句、中文翻译和搜索别名，保存后立即用于输入补全。
      </p>
      {error && (
        <p role="alert" className="prompt-library-error">
          {error}
        </p>
      )}
      <div className="prompt-library-toolbar">
        <input
          aria-label="搜索词库"
          placeholder="搜索英文、中文或别名"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
            setMessage('');
          }}
        />
        <select
          aria-label="词库分类筛选"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(0);
            setMessage('');
          }}
        >
          <option value="">全部分类</option>
          {categories.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <button
          className="primary"
          disabled={!ready || !!editing}
          onClick={() => {
            setEditing(emptyTerm());
            setValidation('');
          }}
        >
          <Plus size={16} />
          新增词条
        </button>
      </div>
      {editing && (
        <form
          className="prompt-term-form"
          onSubmit={(event) => {
            event.preventDefault();
            const term = {
              ...editing,
              text: editing.text.trim(),
              translation: editing.translation.trim(),
              category: editing.category.trim(),
              aliases: editing.aliases.trim(),
            };
            if (!term.text || !term.category) {
              setValidation('请填写英文词句和分类。');
              return;
            }
            const saved = mutate((latest) => {
              if (
                latest.some(
                  (item) => item.id !== term.id && normalizeTerm(item.text) === normalizeTerm(term.text),
                )
              )
                throw new Error('相同英文词句已存在，请编辑已有词条');
              return latest.some((item) => item.id === term.id)
                ? latest.map((item) => (item.id === term.id ? term : item))
                : [...latest, term];
            });
            if (saved) {
              setEditing(null);
              setMessage('词条已保存');
            }
          }}
        >
          <h3>{terms.some((term) => term.id === editing.id) ? '编辑词条' : '新增词条'}</h3>
          <label>
            英文词句
            <input
              required
              maxLength={500}
              value={editing.text}
              onChange={(event) => update({ text: event.target.value })}
            />
          </label>
          <label>
            中文翻译
            <input
              placeholder="暂无翻译，可手动补充"
              maxLength={500}
              value={editing.translation}
              onChange={(event) => update({ translation: event.target.value })}
            />
          </label>
          <label>
            分类
            <input
              required
              maxLength={40}
              value={editing.category}
              onChange={(event) => update({ category: event.target.value })}
            />
          </label>
          <label>
            适用范围
            <select
              value={editing.kind}
              onChange={(event) => update({ kind: event.target.value as PromptTerm['kind'] })}
            >
              <option value="both">正向与负向</option>
              <option value="positive">正向提示词</option>
              <option value="negative">负向提示词</option>
            </select>
          </label>
          <label className="prompt-term-aliases">
            搜索别名
            <input
              maxLength={500}
              placeholder="可填写同义词或常用缩写，以空格分隔"
              value={editing.aliases}
              onChange={(event) => update({ aliases: event.target.value })}
            />
          </label>
          {validation && <p role="alert">{validation}</p>}
          <div className="prompt-term-form-actions">
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setValidation('');
              }}
            >
              取消
            </button>
            <button className="primary" disabled={!ready}>
              保存词条
            </button>
          </div>
        </form>
      )}
      <div className="prompt-library-count" role="status">
        {message || (ready ? `共 ${terms.length} 条，匹配 ${rows.length} 条` : '正在加载词库…')}
      </div>
      <div className="prompt-library-list">
        {rows.length === 0 && <p className="prompt-empty">没有匹配的词条，可调整搜索或新增词条。</p>}
        {visibleRows.map((term) => (
          <article key={term.id} className={`prompt-library-row${term.enabled ? '' : ' is-disabled'}`}>
            <div className="prompt-library-term">
              <strong>{term.text}</strong>
              <span>{term.translation}</span>
              {term.aliases && (
                <small className="prompt-library-aliases" title={term.aliases}>
                  别名：{term.aliases}
                </small>
              )}
              <small>
                {term.category} ·{' '}
                {term.kind === 'both' ? '正向与负向' : term.kind === 'positive' ? '正向' : '负向'}
                {term.source ? ` · ${term.source}` : term.id.startsWith('builtin-') ? ' · 内置' : ' · 自定义'}
              </small>
            </div>
            <div className="prompt-library-actions">
              <button
                role="switch"
                aria-checked={term.enabled}
                aria-label={`启用词条 ${term.text}`}
                disabled={!ready || busy || !!editing}
                onClick={() => {
                  if (
                    mutate((latest) =>
                      latest.map((item) =>
                        item.id === term.id ? { ...item, enabled: !item.enabled } : item,
                      ),
                    )
                  )
                    setMessage(term.enabled ? '词条已停用' : '词条已启用');
                }}
              >
                {term.enabled ? '已启用' : '已停用'}
              </button>
              <button
                className="icon-button"
                aria-label={`编辑词条 ${term.text}`}
                disabled={!ready || busy || !!editing}
                onClick={() => {
                  setEditing({ ...term });
                  setValidation('');
                }}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={`删除词条 ${term.text}`}
                disabled={!ready || busy || !!editing}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (await ask(`删除词条 ${term.text}？`)) {
                      if (mutate((latest) => latest.filter((item) => item.id !== term.id)))
                        setMessage('词条已删除');
                    }
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {pages > 1 && (
        <div className="prompt-library-pagination">
          <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
            上一页
          </button>
          <span>
            {currentPage + 1} / {pages}
          </span>
          <button disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>
            下一页
          </button>
        </div>
      )}
    </Modal>
  );
}
