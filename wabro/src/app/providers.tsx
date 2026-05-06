'use client';

import { MotionConfig } from 'motion/react';

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MotionConfig
      transition={{
        duration: 0.3,
        ease: 'easeInOut',
      }}
    >
      {children}
    </MotionConfig>
  );
}
