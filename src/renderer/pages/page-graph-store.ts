import { useEffect, useState } from 'react';
import type { PageGraph } from '../../shared/page-links';
export function openPage(id: string) { window.dispatchEvent(new CustomEvent('max:open-page', { detail: id })); }
let pending: Promise<PageGraph> | undefined;
export function usePageGraph() {
  const [graph, setGraph] = useState<PageGraph>({ pages: [], links: [] });
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = () => {
      pending ??= window.maxApi.workspace.getPageGraph().finally(() => { pending = undefined; });
      void pending.then((next) => { if (active) { setGraph(next); setError(false); } }).catch(() => { if (active) setError(true); });
    };
    const refresh = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
    load();
    const events = ['max:workspace-changed', 'max:page-content-changed', 'max:pages-restored'];
    events.forEach((event) => window.addEventListener(event, refresh));
    return () => { active = false; clearTimeout(timer); events.forEach((event) => window.removeEventListener(event, refresh)); };
  }, []);
  return { graph, error };
}
