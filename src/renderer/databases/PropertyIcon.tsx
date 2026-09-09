import { PageIconRenderer } from '../ui/page-icon-renderer';
import {
  AlignLeft, Hash, Calendar, CircleDot, Sparkles, CheckSquare,
  Link2, Sigma, List, ArrowUpRight, Search, AtSign, Phone,
  Clock, Paperclip, User, Type,
} from 'lucide-react';
import type { PropertyType } from '../../shared/property-contract';

export function PropertyIcon({ type, icon }: { type: PropertyType; icon?: string }) {
  if (icon) return <PageIconRenderer icon={icon} size={14} />;
  const icons: Partial<Record<PropertyType, typeof Type>> = {
    title: Type,
    text: AlignLeft,
    number: Hash,
    date: Calendar,
    select: CircleDot,
    status: Sparkles,
    multi_select: List,
    checkbox: CheckSquare,
    url: Link2,
    email: AtSign,
    phone: Phone,
    relation: ArrowUpRight,
    rollup: Search,
    formula: Sigma,
    user: User,
    created_time: Clock,
    last_edited_time: Clock,
    auto_id: Hash,
    file: Paperclip,
  };
  const Icon = icons[type] ?? Type;
  return <Icon aria-hidden="true" size={14} strokeWidth={1.65} />;
}
