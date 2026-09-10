// Adapted from React Bits ProfileCard. See README.md and LICENSE.md in this directory.
import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../lib/useReducedMotion';
import './ProfileCard.css';

export default function ProfileCard({ avatarUrl, alt }: { avatarUrl: string; alt: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || reducedMotion) return;

    let frame = 0;
    let lastTime = 0;
    let currentX = 50;
    let currentY = 50;
    let targetX = 50;
    let targetY = 50;
    const clamp = (value: number) => Math.min(100, Math.max(0, value));
    const setVars = () => {
      const properties: Record<string, string> = {
        '--pointer-x': `${currentX}%`,
        '--pointer-y': `${currentY}%`,
        '--background-x': `${35 + currentX * 0.3}%`,
        '--background-y': `${35 + currentY * 0.3}%`,
        '--rotate-x': `${-(currentX - 50) / 5}deg`,
        '--rotate-y': `${(currentY - 50) / 4}deg`,
      };
      for (const [key, value] of Object.entries(properties)) wrapper.style.setProperty(key, value);
    };
    const step = (time: number) => {
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.064) : 1 / 60;
      lastTime = time;
      const smoothing = 1 - Math.exp(-dt / 0.14);
      currentX += (targetX - currentX) * smoothing;
      currentY += (targetY - currentY) * smoothing;
      const settled = Math.abs(targetX - currentX) + Math.abs(targetY - currentY) < 0.05;
      if (settled) {
        currentX = targetX;
        currentY = targetY;
      }
      setVars();
      frame = settled ? 0 : requestAnimationFrame(step);
      if (settled) lastTime = 0;
    };
    const animate = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const rect = wrapper.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      targetX = clamp(((event.clientX - rect.left) / rect.width) * 100);
      targetY = clamp(((event.clientY - rect.top) / rect.height) * 100);
      wrapper.classList.add('active');
      animate();
    };
    const reset = () => {
      wrapper.classList.remove('active');
      targetX = targetY = 50;
      animate();
    };
    const visibility = () => {
      if (document.hidden) reset();
    };
    wrapper.addEventListener('pointerenter', move);
    wrapper.addEventListener('pointermove', move);
    wrapper.addEventListener('pointerleave', reset);
    wrapper.addEventListener('pointercancel', reset);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame);
      wrapper.removeEventListener('pointerenter', move);
      wrapper.removeEventListener('pointermove', move);
      wrapper.removeEventListener('pointerleave', reset);
      wrapper.removeEventListener('pointercancel', reset);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', visibility);
      wrapper.classList.remove('active');
      currentX = currentY = 50;
      setVars();
    };
  }, [reducedMotion]);

  return (
    <div ref={wrapperRef} className="profile-card-wrapper">
      <div className="profile-card-behind" aria-hidden="true" />
      <div className="profile-card-surface">
        <img src={avatarUrl} width={192} height={192} alt={alt} draggable={false} />
        <div className="profile-card-effects" style={{ maskImage: `url("${avatarUrl}")` }} aria-hidden="true">
          <div className="profile-card-shine" />
          <div className="profile-card-glare" />
        </div>
      </div>
    </div>
  );
}
