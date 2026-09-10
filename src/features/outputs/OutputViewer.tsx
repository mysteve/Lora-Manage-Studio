import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, FolderOpen, Info } from 'lucide-react';
import { Modal } from '../../components/ui';
import './OutputViewer.css';

export function OutputViewer({
  name,
  position,
  total,
  busy,
  canPrevious,
  canNext,
  onMove,
  onClose,
  onReveal,
  children,
  metadata,
}: {
  name: string;
  position: number;
  total: number;
  busy: boolean;
  canPrevious: boolean;
  canNext: boolean;
  onMove: (direction: -1 | 1) => void;
  onClose: () => void;
  onReveal: () => void;
  children: ReactNode;
  metadata: ReactNode;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (!dialogs[dialogs.length - 1]?.contains(ref.current) || ref.current?.closest('[inert]')) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      if (!busy) onMove(event.key === 'ArrowLeft' ? -1 : 1);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [busy, onMove]);
  return (
    <Modal title={name} onClose={onClose} className="output-viewer">
      <div ref={ref} className={`output-viewer-body${showInfo ? ' with-info' : ''}`}>
        <div className="output-viewer-stage" aria-busy={busy}>
          {children}
          <button
            className="output-viewer-arrow previous"
            aria-label="上一张图片"
            aria-keyshortcuts="ArrowLeft"
            disabled={busy || !canPrevious}
            onClick={() => onMove(-1)}
          >
            <ChevronLeft size={30} />
          </button>
          <button
            className="output-viewer-arrow next"
            aria-label="下一张图片"
            aria-keyshortcuts="ArrowRight"
            disabled={busy || !canNext}
            onClick={() => onMove(1)}
          >
            <ChevronRight size={30} />
          </button>
        </div>
        {showInfo && (
          <aside className="output-viewer-info" aria-label="生成参数">
            {metadata}
          </aside>
        )}
      </div>
      <footer className="output-viewer-toolbar">
        <span aria-live="polite">{position > 0 ? `${position} / ${total}` : '正在读取图片列表…'}</span>
        <div className="output-actions">
          <button
            aria-label="显示生成参数"
            aria-pressed={showInfo}
            onClick={() => setShowInfo((value) => !value)}
          >
            <Info size={17} />
            生成参数
          </button>
          <button onClick={onReveal}>
            <FolderOpen size={17} />
            在文件夹中定位
          </button>
        </div>
      </footer>
    </Modal>
  );
}
