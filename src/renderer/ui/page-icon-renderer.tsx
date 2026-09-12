import type { CSSProperties } from 'react';

import { PAGE_ICON_COMPONENTS } from './page-icon-registry';

type PageIconRendererProps = Readonly<{
  className?: string;
  fallback?: string;
  icon?: string;
  size?: number;
  style?: CSSProperties;
}>;

/**
 * A page, database or action icon: either an emoji or a named Lucide glyph.
 *
 * The registry is a curated subset of Lucide, so a blueprint is free to name a
 * glyph that is not bundled. Such a name falls back to the default icon rather
 * than being printed: an action whose icon was `lucide:Plus` used to appear in
 * the quick action header with the literal text "lucide:Plus" beside its name.
 */
export function PageIconRenderer({
  className,
  fallback = 'lucide:FileText',
  icon,
  size = 20,
  style,
}: PageIconRendererProps) {
  const named = (value: string | undefined) => value?.startsWith('lucide:') ? value.slice(7).split('#') : undefined;
  const [iconName, colorHex] = named(icon) ?? [];
  const Component = PAGE_ICON_COMPONENTS[iconName ?? '']
    ?? (icon && !icon.startsWith('lucide:') ? undefined : PAGE_ICON_COMPONENTS[named(fallback)?.[0] ?? '']);

  if (Component) {
    return <Component className={className} size={size} strokeWidth={1.8} style={{ color: colorHex ? `#${colorHex}` : undefined, ...style }} />;
  }

  // An emoji, or a fallback that is itself not a bundled glyph.
  return <span className={className} style={style}>{icon ?? fallback}</span>;
}
