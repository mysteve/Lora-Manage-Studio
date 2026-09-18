import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp } from 'lucide-react';
import { useReducedMotion } from '../lib/useReducedMotion';
import './BackToTop.css';

export function BackToTop({ enabled }: { enabled: boolean }) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setVisible(Math.max(window.scrollY, document.scrollingElement?.scrollTop ?? 0) > 400);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [enabled]);
  if (!enabled || !visible) return null;
  return createPortal(
    <button className="back-to-top" aria-label="回到顶部" title="回到顶部" onClick={() => {
      // Move keyboard focus away from the bottom without interrupting smooth scrolling.
      document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
    }}><ArrowUp size={21} /></button>,
    document.body,
  );
}
