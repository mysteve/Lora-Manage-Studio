import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { wheelNavigation, wheelPixels, wheelScale } from './outputWheel';

export function ZoomableOutput({
  src,
  name,
  onMove,
}: {
  src: string;
  name: string;
  onMove: (direction: -1 | 1) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const scale = useRef(1);
  const navigateWheel = useRef(wheelNavigation());
  const wheelPause = useRef(0);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  useLayoutEffect(() => {
    setZoomed(false);
    setFailed(false);
    scale.current = 1;
    drag.current = null;
    offset.current = { x: 0, y: 0 };
    if (image.current) image.current.style.transform = '';
  }, [src]);
  const position = (x: number, y: number) => {
    const box = button.current;
    const img = image.current;
    if (!box || !img) return;
    const fit = Math.min(box.clientWidth / img.naturalWidth, box.clientHeight / img.naturalHeight);
    const maxX = Math.max(0, (img.naturalWidth * fit * scale.current - box.clientWidth) / 2);
    const maxY = Math.max(0, (img.naturalHeight * fit * scale.current - box.clientHeight) / 2);
    offset.current = { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
    img.style.transform = `translate(${offset.current.x}px, ${offset.current.y}px) scale(${scale.current})`;
  };
  useEffect(() => {
    const el = button.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (el.closest('[inert]') || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      const delta = wheelPixels(event.deltaY, event.deltaMode);
      if (!delta) return;
      const now = performance.now();
      if (scale.current > 1 && image.current?.naturalWidth) {
        const next = wheelScale(scale.current, delta);
        const ratio = next / scale.current;
        const rect = el.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        scale.current = next;
        position(offset.current.x * ratio + x * (1 - ratio), offset.current.y * ratio + y * (1 - ratio));
        if (next === 1) {
          setZoomed(false);
          wheelPause.current = now + 450;
        }
      } else if (now >= wheelPause.current) {
        const direction = navigateWheel.current(delta, now);
        if (direction) moveRef.current(direction);
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [failed]);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (zoomed) position(offset.current.x, offset.current.y);
    });
    if (button.current) observer.observe(button.current);
    return () => observer.disconnect();
  }, [zoomed]);
  if (failed) return <span className="output-image-error">图片无法读取，请刷新后重试</span>;
  return (
    <button
      ref={button}
      className={`output-zoom${zoomed ? ' is-zoomed' : ''}`}
      aria-label={zoomed ? '缩小图片' : '放大图片'}
      aria-pressed={zoomed}
      onClick={(event) => {
        if (drag.current?.moved) {
          drag.current = null;
          return;
        }
        if (!image.current?.naturalWidth) return;
        if (zoomed) {
          scale.current = 1;
          image.current.style.transform = '';
          offset.current = { x: 0, y: 0 };
        } else {
          scale.current = 2;
          const rect = event.currentTarget.getBoundingClientRect();
          position(
            event.detail ? rect.width / 2 - (event.clientX - rect.left) : 0,
            event.detail ? rect.height / 2 - (event.clientY - rect.top) : 0,
          );
        }
        setZoomed(!zoomed);
      }}
      onPointerDown={(event) => {
        if (!zoomed || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, moved: false };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!zoomed || !start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 4) return;
        start.moved = true;
        position(offset.current.x + dx, offset.current.y + dy);
        start.x = event.clientX;
        start.y = event.clientY;
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <img ref={image} src={src} alt={name} draggable={false} onError={() => setFailed(true)} />
    </button>
  );
}
