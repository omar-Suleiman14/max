import { useEffect, useState } from 'react';

type Feature = 'graph' | 'connections';
const eventName = 'max:workspace-display-changed';
function read(feature: Feature) { return localStorage.getItem(`max.workspace.display.${feature}`) !== 'false'; }
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
