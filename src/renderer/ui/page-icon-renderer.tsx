import type { CSSProperties } from 'react';

import { PAGE_ICON_COMPONENTS } from './page-icon-registry';

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
    const IconComponent = PAGE_ICON_COMPONENTS[iconName ?? ''];

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
