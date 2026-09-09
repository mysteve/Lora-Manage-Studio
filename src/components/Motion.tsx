import type { ReactNode } from 'react';
import { motion, useIsPresent } from 'motion/react';
import { useReducedMotion } from '../lib/useReducedMotion';
import { MorphIcon } from 'morphicons/react';
import { Eye, EyeOff, Pause, Play, RotateCw, Check, X } from 'lucide';

export const easeOut = [0.22, 1, 0.36, 1] as const;

export function PageTransition({ children, detail }: { children: ReactNode; detail: boolean }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  return (
    <motion.div
      className="page-transition"
      inert={!present}
      initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : detail ? 16 : -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : detail ? 12 : -6 }}
      transition={{ duration: reduced ? 0 : 0.2, ease: easeOut }}
    >
      {children}
    </motion.div>
  );
}

export function NavIndicator() {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      className="nav-indicator"
      layoutId="main-navigation"
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 480, damping: 38 }}
    />
  );
}

const icons = { eye: Eye, eyeOff: EyeOff, pause: Pause, play: Play, retry: RotateCw, check: Check, close: X };

export function StateIcon({ name, size = 18 }: { name: keyof typeof icons; size?: number }) {
  return <MorphIcon icon={icons[name]} size={size} strokeWidth={2} reducedMotion="user" />;
}
