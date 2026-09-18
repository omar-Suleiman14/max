import type { MapPoint } from '../../shared/map-contract';

export function parseMapPoint(value: unknown): MapPoint | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length !== 2 || parts.some((part) => part === '')) return null;
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}
