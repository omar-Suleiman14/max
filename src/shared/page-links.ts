export type PageGraph = Readonly<{
  pages: readonly Readonly<{
    id: string;
    title: string;
    icon?: string | null;
    contentWeight?: number;
    parentNodeId?: string | null;
    /** A display-only workspace path, derived from the page tree. */
    path?: string;
    /** Page properties exposed for local graph filtering only. */
    properties?: readonly Readonly<{ name: string; value: string }>[];
    /** Plain page block text exposed for local graph filtering only. */
    text?: string;
  }>[];
  links: readonly Readonly<{ sourceId: string; targetId: string }>[];
}>;

export function pageGraphMetadata(contentJson: string): Readonly<{ properties: readonly Readonly<{ name: string; value: string }>[]; text: string }> {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    const root = !Array.isArray(parsed) && parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined;
    const propertyRows = Array.isArray(root?.properties) ? root.properties : [];
    const properties = propertyRows.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const property = row as Record<string, unknown>;
      if (typeof property.name !== 'string' || property.value === null || property.value === undefined) return [];
      const value = property.value;
      return [{ name: property.name, value: typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value) }];
    });
    const text: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (!value || typeof value !== 'object') return;
      const object = value as Record<string, unknown>;
      for (const key of ['content', 'caption']) {
        const item = object[key];
        if (typeof item === 'string') text.push(item);
      }
      Object.values(object).forEach((item) => { if (item && typeof item === 'object') walk(item); });
    };
    walk(root?.blocks ?? (Array.isArray(parsed) ? parsed : []));
    return { properties, text: text.join('\n').slice(0, 20_000) };
  } catch {
    return { properties: [], text: '' };
  }
}

export function pageLinkTargets(contentJson: string): readonly string[] {
  const targets = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\]\(max-page:([^\s)]+)\)/g)) {
        try { targets.add(decodeURIComponent(match[1]!)); } catch { /* Ignore malformed links. */ }
      }
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      const object = value as Record<string, unknown>;
      if (object.type === 'page-link' && typeof object.pageId === 'string') targets.add(object.pageId);
      Object.values(object).forEach(walk);
    }
  };
  try { walk(JSON.parse(contentJson)); } catch { /* Damaged pages remain editable. */ }
  return [...targets];
}

export function safeWebUrl(value: string): string | null {
  try { const url = new URL(value.trim()); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

/** Content size excludes generated IDs and formatting metadata. */
export function pageContentWeight(contentJson: string): number {
  let weight = 0;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if (typeof object.type === 'string') weight += 20;
    for (const [key, child] of Object.entries(object)) {
      if (['content', 'caption'].includes(key) && typeof child === 'string') weight += child.length;
      else if (typeof child === 'object') walk(child);
    }
  };
  try { walk(JSON.parse(contentJson)); } catch { return 0; }
  return weight;
}
