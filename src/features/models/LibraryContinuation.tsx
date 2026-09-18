import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import './LibraryContinuation.css';

export function LibraryScrollRestore({ top, children }: { top: number; children: ReactNode }) {
  useLayoutEffect(() => { window.scrollTo({ top, behavior: 'instant' }); }, []); // Restore only when returning to the mounted list.
  return <>{children}</>;
}

export function LibraryContinuation({ loading, error, hasMore, count, onLoad }: {
  loading: boolean;
  error: string;
  hasMore: boolean;
  count: number;
  onLoad: () => Promise<void>;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || loading || error || !sentinel.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void onLoad();
    }, { rootMargin: '240px 0px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, loading, error, count, onLoad]);
  return (
    <div className="library-continuation" ref={sentinel}>
      {error ? <><p role="alert">加载模型失败：{error}</p><button onClick={() => void onLoad()}>重试加载</button></> :
        loading ? <p role="status">正在加载模型…</p> :
          hasMore ? <button onClick={() => void onLoad()}>加载更多模型</button> :
            count > 0 ? <p className="muted" role="status">已显示全部 {count} 个模型</p> : null}
    </div>
  );
}
