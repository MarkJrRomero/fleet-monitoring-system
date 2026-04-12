import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap: Record<NonNullable<GlassCardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6'
};

export function GlassCard({ children, className = '', padding = 'md' }: GlassCardProps) {
  return (
    <div
      className={`rounded-2xl border border-white/60 bg-white/80 shadow-sm backdrop-blur-xl ${paddingMap[padding]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
