import type { WorkspaceProperty } from '../../shared/property-contract';
import { OptionValue } from './OptionValue';
export function MultiSelectValue({ property, value, onChange }: { property: WorkspaceProperty; value: unknown; onChange: (value: string[]) => void }) { return <OptionValue property={property} value={value} multiple onChange={(next) => onChange(Array.isArray(next) ? next : next ? [next] : [])} />; }
