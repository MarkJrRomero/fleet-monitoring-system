import { ReactNode } from 'react';

type StatusBadgeProps = {
  label: string;
  className?: string;
  dotClassName?: string;
  icon?: ReactNode;
};

export function StatusBadge({ label, className = '', dotClassName, icon }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${className}`.trim()}
    >
      {icon ? icon : dotClassName ? <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`.trim()} /> : null}
      <span>{label}</span>
    </span>
  );
}
