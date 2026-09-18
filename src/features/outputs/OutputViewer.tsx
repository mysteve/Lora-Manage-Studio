import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, FolderOpen, Info } from 'lucide-react';
import { Modal } from '../../components/ui';
import { outputEditableSelector, outputKeyAction, outputZoomShortcuts } from './outputKeyboard';
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
      const action = outputKeyAction(
        event,
        event.target instanceof Element && !!event.target.closest(outputEditableSelector),
      );
      if (action?.type !== 'navigate') return;
      event.preventDefault();
      if (!busy && (action.direction === -1 ? canPrevious : canNext)) onMove(action.direction);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [busy, canPrevious, canNext, onMove]);
  return (
    <Modal title={name} onClose={onClose} className="output-viewer" animation="fade">
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
      <p className="output-viewer-shortcuts">← / → 翻图；{outputZoomShortcuts}；Esc 返回</p>
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
