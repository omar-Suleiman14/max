import * as LucideIcons from 'lucide-react';
import type { ComponentType, CSSProperties } from 'react';

type PageIconRendererProps = Readonly<{
  className?: string;
  fallback?: string;
  icon?: string;
  size?: number;
  style?: CSSProperties;
}>;

export function PageIconRenderer({
  className,
  fallback = 'lucide:FileText',
  icon,
  size = 20,
  style,
}: PageIconRendererProps) {
  if (!icon) {
    return (
      <span className={className} style={style}>
        {fallback}
      </span>
    );
  }

  if (icon.startsWith('lucide:')) {
    const raw = icon.slice(7);
    const [iconName, colorHex] = raw.split('#');
    const IconComponent = (LucideIcons as Record<string, unknown>)[iconName ?? ''] as
      | ComponentType<{ className?: string; size?: number; strokeWidth?: number; style?: CSSProperties }>
      | undefined;

    if (IconComponent) {
      const iconStyle: CSSProperties = {
        color: colorHex ? `#${colorHex}` : undefined,
        ...style,
      };
      return <IconComponent className={className} size={size} strokeWidth={1.8} style={iconStyle} />;
    }
  }

  return (
    <span className={className} style={style}>
      {icon}
    </span>
  );
}
