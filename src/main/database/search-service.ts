import type { DatabaseSync } from 'node:sqlite';

import type { SearchResult } from '../../shared/views-search-contract';

export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    // Strip Arabic diacritics / tashkeel
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Normalize Arabic letters
    .replace(/[أإآآٱ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .trim();
}

export class SearchService {
  constructor(private readonly database: DatabaseSync) {}

  query(searchTerm: string, limit = 20): readonly SearchResult[] {
    const rawTerm = searchTerm.trim();
    if (!rawTerm) return [];

    const normTerm = normalizeSearchText(rawTerm);
    const results: SearchResult[] = [];

    // 1. Search Records (Items & People)
    const records = this.database
      .prepare(`
        SELECT r.id, r.label, r.object_kind, r.created_at,
          COALESCE(GROUP_CONCAT(v.value_json, ' '), '') AS prop_values
        FROM object_records r
        LEFT JOIN object_property_values v ON v.record_id = r.id AND v.active = 1
        WHERE r.archived_at IS NULL
        GROUP BY r.id
      `)
      .all() as { created_at: string; id: string; label: string; object_kind: 'item' | 'person'; prop_values: string }[];

    for (const r of records) {
      const normLabel = normalizeSearchText(r.label);
      const normProps = normalizeSearchText(r.prop_values);

      if (normLabel.includes(normTerm) || normProps.includes(normTerm)) {
        const score = normLabel === normTerm ? 100 : normLabel.startsWith(normTerm) ? 80 : normLabel.includes(normTerm) ? 60 : 30;
        results.push({
          id: r.id,
          kind: r.object_kind,
          matchScore: score,
          metadata: r.object_kind === 'person' ? 'Customer / Person' : 'Catalog Item',
          subtitle: r.object_kind === 'person' ? `Customer · ${r.label}` : `Product · ${r.label}`,
          title: r.label,
        });
      }
    }

    // 2. Search Accounts
    const accounts = this.database
      .prepare('SELECT id, name, account_type FROM shop_accounts WHERE archived_at IS NULL')
      .all() as { account_type: string; id: string; name: string }[];

    for (const a of accounts) {
      const normName = normalizeSearchText(a.name);
      if (normName.includes(normTerm)) {
        const score = normName === normTerm ? 95 : normName.startsWith(normTerm) ? 75 : 50;
        results.push({
          id: a.id,
          kind: 'account',
          matchScore: score,
          metadata: `Account · ${a.account_type}`,
          subtitle: `${a.account_type.toUpperCase()} account`,
          title: a.name,
        });
      }
    }

    // 3. Search Transactions (by Note, type, or ID)
    const transactions = this.database
      .prepare(`
        SELECT id, transaction_type, total_amount, paid_amount, payment_status, note, created_at
        FROM shop_transactions
        WHERE archived_at IS NULL
        ORDER BY created_at DESC
        LIMIT 100
      `)
      .all() as {
        created_at: string;
        id: string;
        note: string | null;
        paid_amount: number;
        payment_status: string;
        total_amount: number;
        transaction_type: string;
      }[];

    for (const tx of transactions) {
      const note = tx.note || '';
      const normNote = normalizeSearchText(note);
      const normId = normalizeSearchText(tx.id);

      if (normNote.includes(normTerm) || normId.includes(normTerm) || String(tx.total_amount).includes(rawTerm)) {
        results.push({
          id: tx.id,
          kind: 'transaction',
          matchScore: normNote.startsWith(normTerm) ? 70 : 40,
          metadata: `Transaction · ${tx.payment_status}`,
          subtitle: `${tx.transaction_type.toUpperCase()} · ${tx.total_amount.toFixed(2)} (${tx.payment_status})`,
          title: tx.note || `Transaction #${tx.id.slice(0, 8)}`,
        });
      }
    }

    // 4. Search Saved Views
    const views = this.database
      .prepare('SELECT id, name, target_kind FROM shop_saved_views WHERE archived_at IS NULL')
      .all() as { id: string; name: string; target_kind: string }[];

    for (const v of views) {
      const normName = normalizeSearchText(v.name);
      if (normName.includes(normTerm)) {
        results.push({
          id: v.id,
          kind: 'view',
          matchScore: 65,
          metadata: `Saved View · ${v.target_kind}`,
          subtitle: `Saved View for ${v.target_kind}`,
          title: v.name,
        });
      }
    }

    // 5. Search Custom Pages
    const pages = this.database
      .prepare('SELECT id, name, icon FROM shop_custom_pages WHERE archived_at IS NULL')
      .all() as { icon: string | null; id: string; name: string }[];

    for (const p of pages) {
      const normName = normalizeSearchText(p.name);
      if (normName.includes(normTerm)) {
        results.push({
          id: p.id,
          kind: 'page',
          matchScore: 65,
          metadata: 'Custom Page',
          subtitle: 'Dashboard / Page',
          title: p.name,
        });
      }
    }

    // Sort by match score descending
    results.sort((a, b) => b.matchScore - a.matchScore);
    return results.slice(0, limit);
  }
}
