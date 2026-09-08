import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image as ImageIcon, X, Loader2, AlertCircle, Layers, Search } from 'lucide-react';
import { asset, call } from './api';
import type { Cover } from './types';

const imagePromises = new Map<string, Promise<Cover>>();
export function CoverImage({
  cover,
  alt,
  className = '',
}: {
  cover?: Cover;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSrc('');
    setFailed(false);
    let alive = true;
    if (cover?.localPath) {
      setSrc(asset(cover.localPath));
      return;
    }
    if (!cover?.url) {
      setFailed(true);
      return;
    }
    const fetch = () => {
      let promise = imagePromises.get(cover.url);
      if (!promise) {
        promise = call<Cover>('cache_cover', { url: cover.url });
        imagePromises.set(cover.url, promise);
      }
      promise
        .then((c) => {
          if (alive) setSrc(asset(c.localPath));
        })
        .catch(() => {
          imagePromises.delete(cover.url);
          if (alive) setFailed(true);
        });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fetch();
          observer.disconnect();
        }
      },
      { rootMargin: '180px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [cover?.url, cover?.localPath]);
  return (
    <div ref={ref} className={`cover-image ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => {
            setFailed(true);
          }}
        />
      ) : (
        <div className="cover-placeholder">
          <ImageIcon size={30} strokeWidth={1} />
          <span>{failed ? '暂无封面' : '载入封面'}</span>
        </div>
      )}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <Layers size={32} strokeWidth={1.4} />}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading({ text = '正在读取模型资料…' }: { text?: string }) {
  return (
    <div className="loading">
      <Loader2 className="spin" size={22} />
      <span>{text}</span>
    </div>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box">
      <AlertCircle size={18} />
      <span>{message}</span>
      {retry && <button onClick={retry}>重试</button>}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>('input,button,select,textarea')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && el) {
        const nodes = Array.from(
          el.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,textarea,[tabindex="0"]'),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = '搜索模型、标签或触发词',
  onSubmit,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}) {
  return (
    <div className="search-input">
      <Search size={19} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit?.();
        }}
      />
      {value && (
        <button className="icon-button" aria-label="清除搜索" onClick={() => onChange('')}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
