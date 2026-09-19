import type { CSSProperties } from 'react';
import './workspace-media.css';

/** Twelve fading spokes, with no layout shift and a static reduced-motion state. */
export function ActivitySpinner({ size = 16 }: { size?: number }) {
  return <span className="activity-spinner update-spinner" aria-hidden="true" style={{ width: size, height: size }}>{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ '--spoke': index } as CSSProperties} />)}</span>;
}
