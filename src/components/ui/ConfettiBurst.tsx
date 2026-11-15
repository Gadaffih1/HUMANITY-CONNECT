import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface ParticleSpec {
  id: number;
  xOffset: number;
  yRise: number;
  yFall: number;
  rotate: number;
  size: number;
  colorClass: string;
  delay: number;
  isCircle: boolean;
}

const PARTICLES: ParticleSpec[] = Array.from({ length: 28 }, (_, i) => {
  const angle = ((i / 28) * Math.PI * 2) + ((i % 3) - 1) * 0.14;
  const spread = 85 + (i % 5) * 32;
  const colorClasses = [
    'bg-[#287A59]',
    'bg-[#D9A84E]',
    'bg-[#102E36]',
    'bg-[#E8C174]',
    'bg-[#32946C]',
  ];
  return {
    id: i,
    xOffset: Math.cos(angle) * spread,
    yRise: -55 - (i % 4) * 28,
    yFall: 110 + (i % 5) * 35,
    rotate: (i % 2 === 0 ? 1 : -1) * (140 + (i % 6) * 45),
    size: 6 + (i % 3) * 2,
    colorClass: colorClasses[i % colorClasses.length],
    delay: (i % 7) * 0.025,
    isCircle: i % 3 === 0,
  };
});

export const ConfettiBurst: React.FC<{
  active: boolean;
  onComplete?: () => void;
}> = ({ active, onComplete }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      const t = window.setTimeout(() => onComplete?.(), 400);
      return () => window.clearTimeout(t);
    }
    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [active, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[70] pointer-events-none flex items-center justify-center overflow-hidden"
        >
          <div className="relative w-1 h-1">
            {PARTICLES.map((p) => (
              <motion.span
                key={p.id}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.4, rotate: 0 }}
                animate={{
                  opacity: [0, 1, 0.95, 0],
                  x: [0, p.xOffset * 0.65, p.xOffset],
                  y: [0, p.yRise, p.yFall],
                  scale: [0.4, 1.05, 0.9, 0.7],
                  rotate: p.rotate,
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 2.0,
                  delay: p.delay,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className={`absolute block shadow-xs ${p.colorClass} ${
                  p.isCircle ? 'rounded-full w-2 h-2' : 'rounded-[2px] w-2.5 h-1.5'
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
