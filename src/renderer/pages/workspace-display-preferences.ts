import { useEffect, useState } from 'react';

type Feature = 'graph' | 'connections';
const eventName = 'max:workspace-display-changed';
/**
 * Page connections start switched off: a fresh workspace has nothing to link
 * to, so the section only ever drew an empty box under every page until the
 * owner asked for it. The graph button keeps its old default.
 */
function read(feature: Feature) {
  const stored = localStorage.getItem(`max.workspace.display.${feature}`);
  return stored === null ? feature === 'graph' : stored !== 'false';
}
export function useWorkspaceDisplay(feature: Feature) {
  const [enabled, setEnabled] = useState(() => read(feature));
  useEffect(() => {
    const refresh = () => setEnabled(read(feature));
    window.addEventListener(eventName, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(eventName, refresh); window.removeEventListener('storage', refresh); };
  }, [feature]);
  const save = (value: boolean) => {
    localStorage.setItem(`max.workspace.display.${feature}`, String(value));
    window.dispatchEvent(new Event(eventName));
  };
  return [enabled, save] as const;
}
