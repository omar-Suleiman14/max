import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Locale } from '../../app/i18n';
import type {
  ChaosApi,
  ChaosConnectionStatus,
  ChaosError,
  ChaosItem,
  ChaosItemKind,
  ChaosLinkView,
  ChaosLocalDefinition,
  ChaosPendingOperation,
  ChaosTemplateCopy,
} from '../../../shared/chaos-integration-contract';
import { buildDraftRequest, CHAOS_NOT_SENT_NOTES, diffDefinitions } from '../../../shared/chaos-field-mapping';
import { Button } from '../../ui/button';
import { FocusedOverlay } from '../../ui/focused-overlay';
import { ChaosDefinitionEditor } from './chaos-definition-editor';
import {
  chaosCopy, errorMessage, fieldTypeLabel, formatFetchedAt, kindLabel, linkStateLabel, responseCountLabel, statusLabel,
} from './chaos-copy';
import './chaos.css';

type Dialog =
  | { type: 'create'; kind: ChaosItemKind; definition: ChaosLocalDefinition; template?: ChaosTemplateCopy }
  | { type: 'link' }
  | { type: 'edit'; link: ChaosLinkView; definition: ChaosLocalDefinition; stage: 'edit' | 'preview' }
  | { type: 'conflict'; link: ChaosLinkView; definition: ChaosLocalDefinition; error: ChaosError }
  | { type: 'unlink'; link: ChaosLinkView };

const EMPTY: ChaosLocalDefinition = { fields: [], title: '' };

function openUrl(url: string | null) {
  if (url) void window.maxApi.workspace.openExternal(url);
}

/**
 * Chaos forms and quizzes linked to a page. Shows cached status and
 * privacy-safe summaries with the time they were fetched, refreshes on open,
 * and never needs Chaos to be reachable to render.
 */
export function ChaosPagePanel({ locale, pageId, pageTitle }: Readonly<{ locale: Locale; pageId: string; pageTitle: string }>) {
  const copy = chaosCopy(locale);
  const [status, setStatus] = useState<ChaosConnectionStatus>();
  const [links, setLinks] = useState<readonly ChaosLinkView[]>([]);
  const [pending, setPending] = useState<readonly ChaosPendingOperation[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChaosError>();
  const [notice, setNotice] = useState<{ text: string; warnings?: readonly string[] }>();

  const loadLocal = useCallback(async () => {
    const [linkResult, pendingResult] = await Promise.all([window.maxApi.chaos.listLinks(pageId), window.maxApi.chaos.listPendingOperations(pageId)]);
    if (linkResult.ok) setLinks(linkResult.value);
    if (pendingResult.ok) setPending(pendingResult.value);
  }, [pageId]);

  const refresh = useCallback(async (force: boolean) => {
    const result = await window.maxApi.chaos.refreshLinks(pageId, force);
    if (result.ok) setLinks(result.value.links); else if (force) setError(result.error);
  }, [pageId]);

  useEffect(() => {
    let active = true;
    setError(undefined); setNotice(undefined); setDialog(null);
    // Absent in the browser preview and in shell tests: the panel then stays hidden.
    if (!(window.maxApi.chaos as ChaosApi | undefined)) return;
    void window.maxApi.chaos.getStatus().then((next) => { if (active) setStatus(next); }).catch(() => undefined);
    void loadLocal().then(() => (active ? refresh(false) : undefined)).catch(() => undefined);
    return () => { active = false; };
  }, [loadLocal, refresh]);

  const connected = status?.state === 'connected';
  const can = (scope: string) => connected && (status?.scopes as readonly string[] | undefined)?.includes(scope);

  async function run<T>(work: () => Promise<{ ok: true; value: T } | { ok: false; error: ChaosError }>, onOk: (value: T) => void) {
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      const result = await work();
      if (result.ok) onOk(result.value); else setError(result.error);
    } finally {
      setBusy(false);
      void loadLocal();
    }
  }

  if (!status || status.state === 'none' && links.length === 0) {
    // Nothing to show until a connection exists; Settings explains how to connect.
    return null;
  }

  return (
    <section className="chaos-panel" aria-labelledby={`chaos-panel-${pageId}`}>
      <div className="chaos-panel__heading">
        <h2 id={`chaos-panel-${pageId}`}>{copy.panelTitle}</h2>
        <div className="chaos-actions">
          {links.length > 0 && <Button variant="ghost" disabled={busy || !connected} onClick={() => void run(() => window.maxApi.chaos.refreshLinks(pageId, true), (value) => setLinks(value.links))}>{copy.refresh}</Button>}
          {can('items:read') && <Button variant="ghost" disabled={busy} onClick={() => setDialog({ type: 'link' })}>{copy.link}</Button>}
          {can('drafts:create') && <Button disabled={busy} onClick={() => setDialog({ definition: { ...EMPTY, title: pageTitle.slice(0, 200) }, kind: 'form', type: 'create' })}>{copy.createInChaos}</Button>}
        </div>
      </div>
      {!connected && <p className="chaos-panel__empty">{copy.notConnected}</p>}
      {connected && links.length === 0 && pending.length === 0 && <p className="chaos-panel__empty">{copy.empty}</p>}
      {error && !dialog && <p className="form-error" role="alert">{errorMessage(locale, error)}</p>}
      {notice && (
        <div className="chaos-note" role="status">
          {notice.text}
          {notice.warnings?.length ? <><br /><strong>{copy.warnings}</strong><ul>{notice.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></> : null}
        </div>
      )}

      {pending.map((operation) => (
        <div className="chaos-note chaos-note--warning" key={operation.id} role="status">
          <p style={{ margin: 0 }}>{operation.kind === 'create_draft' ? copy.pendingCreate : copy.pendingUpdate} <bdi>{operation.title}</bdi></p>
          <p style={{ margin: '4px 0' }}>{copy.pendingRetryNote}</p>
          <div className="chaos-actions">
            <Button disabled={busy} onClick={() => void run(() => window.maxApi.chaos.retryOperation(operation.id), (value) => setNotice({ text: copy.created, warnings: value.warnings }))}>{copy.retry}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void run(() => window.maxApi.chaos.discardOperation(operation.id), () => undefined)}>{copy.discard}</Button>
          </div>
        </div>
      ))}

      {links.length > 0 && (
        <ul className="chaos-cards">
          {links.map((link) => <LinkCard key={link.id} link={link} locale={locale} busy={busy} canCopy={!!can('definitions:read')} canUpdate={!!can('drafts:update')}
            onEdit={() => {
              if (link.localDefinition) { setDialog({ definition: link.localDefinition, link, stage: 'edit', type: 'edit' }); return; }
              void run(() => window.maxApi.chaos.adoptChaosDefinition(link.id), (view) => setDialog({ definition: view.localDefinition ?? view.syncedDefinition ?? EMPTY, link: view, stage: 'edit', type: 'edit' }));
            }}
            onCopyTemplate={() => void run(() => window.maxApi.chaos.copyTemplate(link.itemId), (template) => setDialog({ definition: template.definition, kind: template.kind, template, type: 'create' }))}
            onUnlink={() => setDialog({ link, type: 'unlink' })}
          />)}
        </ul>
      )}

      {dialog?.type === 'create' && (
        <FocusedOverlay className="chaos-dialog" labelId="chaos-create-title" onClose={() => { if (!busy) setDialog(null); }}>
          <h3 id="chaos-create-title">{dialog.template ? copy.useTemplate : copy.create}</h3>
          <p className="chaos-note">{copy.createNote}</p>
          {dialog.template && <Compatibility locale={locale} template={dialog.template} />}
          {!dialog.template && (
            <fieldset className="chaos-actions" style={{ border: 0, padding: 0 }}>
              <legend className="sr-only">{copy.kind}</legend>
              {(['form', 'quiz'] as const).map((kind) => (
                <label key={kind} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="radio" name="chaos-kind" checked={dialog.kind === kind} onChange={() => setDialog({ ...dialog, kind, definition: { ...dialog.definition, fields: [] } })} />
                  {kindLabel(locale, kind)}
                </label>
              ))}
            </fieldset>
          )}
          <ChaosDefinitionEditor locale={locale} kind={dialog.kind} definition={dialog.definition} onChange={(definition) => setDialog({ ...dialog, definition })} />
          <details>
            <summary>{copy.preview}</summary>
            <ul className="chaos-note">{CHAOS_NOT_SENT_NOTES.map((note) => <li key={note}>{note}</li>)}</ul>
            <pre className="chaos-preview">{JSON.stringify(buildDraftRequest(dialog.kind, dialog.definition, pageTitle), null, 2)}</pre>
            <p className="chaos-panel__empty">{copy.sourceLabel}: <bdi>{pageTitle}</bdi></p>
          </details>
          {error && <ErrorBox error={error} locale={locale} />}
          <div className="chaos-actions">
            <Button variant="primary" disabled={busy || !dialog.definition.title.trim()} aria-busy={busy}
              onClick={() => void run(() => window.maxApi.chaos.createDraft(pageId, buildDraftRequest(dialog.kind, dialog.definition, pageTitle)), (outcome) => {
                setDialog(null);
                setNotice({ text: copy.created, warnings: outcome.warnings });
              })}>{copy.create}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>{copy.cancel}</Button>
          </div>
        </FocusedOverlay>
      )}

      {dialog?.type === 'link' && <LinkDialog locale={locale} linked={links} busy={busy} error={error}
        onClose={() => setDialog(null)}
        onLink={(itemId) => void run(() => window.maxApi.chaos.linkExisting(pageId, itemId), () => setDialog(null))} />}

      {dialog?.type === 'edit' && (() => {
        const before = dialog.link.syncedDefinition ?? EMPTY;
        const changes = diffDefinitions(before, dialog.definition);
        return (
          <FocusedOverlay className="chaos-dialog" labelId="chaos-edit-title" onClose={() => { if (!busy) setDialog(null); }}>
            <h3 id="chaos-edit-title">{copy.editFields}: <bdi>{dialog.link.item?.title ?? dialog.link.itemId}</bdi></h3>
            {dialog.stage === 'edit' ? (
              <ChaosDefinitionEditor locale={locale} kind={dialog.link.kind} definition={dialog.definition} onChange={(definition) => setDialog({ ...dialog, definition })} />
            ) : (
              <>
                <h4>{copy.changePreview}</h4>
                {changes.length === 0 ? <p className="chaos-panel__empty">—</p> : (
                  <ul className="chaos-diff">
                    {changes.map((change, index) => (
                      <li key={index} data-kind={change.kind}>
                        {change.kind === 'added' && <>+ <bdi>{change.field.label}</bdi> ({fieldTypeLabel(locale, change.field.type)})</>}
                        {change.kind === 'removed' && <>− <bdi>{change.field.label}</bdi></>}
                        {change.kind === 'changed' && <>~ <bdi>{change.after.label}</bdi>: {change.changes.join(', ')}</>}
                        {(change.kind === 'title' || change.kind === 'description') && <>~ {change.kind}: <bdi>{change.before || '—'}</bdi> → <bdi>{change.after || '—'}</bdi></>}
                        {change.kind === 'order' && <>~ order</>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {error && <ErrorBox error={error} locale={locale} />}
            <div className="chaos-actions">
              {dialog.stage === 'edit' ? (
                <>
                  <Button disabled={busy} onClick={() => void run(() => window.maxApi.chaos.saveLocalDefinition(dialog.link.id, dialog.definition), () => setDialog(null))}>{copy.save}</Button>
                  {can('drafts:update') && <Button variant="primary" disabled={busy || !dialog.definition.title.trim()} onClick={() => setDialog({ ...dialog, stage: 'preview' })}>{copy.sendUpdate}</Button>}
                </>
              ) : (
                <>
                  <Button variant="primary" disabled={busy || changes.length === 0} aria-busy={busy}
                    onClick={() => void (async () => {
                      setBusy(true); setError(undefined);
                      try {
                        const result = await window.maxApi.chaos.updateDraft(dialog.link.id, dialog.definition);
                        if (result.ok) { setDialog(null); setNotice({ text: copy.updated, warnings: result.value.warnings }); }
                        else if (result.error.code === 'REVISION_CONFLICT') setDialog({ definition: dialog.definition, error: result.error, link: dialog.link, type: 'conflict' });
                        else setError(result.error);
                      } finally { setBusy(false); void loadLocal(); }
                    })()}>{copy.update}</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setDialog({ ...dialog, stage: 'edit' })}>{copy.editFields}</Button>
                </>
              )}
              <Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>{copy.cancel}</Button>
            </div>
          </FocusedOverlay>
        );
      })()}

      {dialog?.type === 'conflict' && (
        <FocusedOverlay className="chaos-dialog" labelId="chaos-conflict-title" onClose={() => { if (!busy) setDialog(null); }}>
          <h3 id="chaos-conflict-title">{copy.conflictTitle}</h3>
          <p className="chaos-note chaos-note--warning">{copy.conflictBody}</p>
          <div className="chaos-compare">
            <div><h4>{copy.mine}</h4><FieldList definition={dialog.definition} locale={locale} /></div>
            <div><h4>{copy.chaosSide}</h4>{dialog.error.currentDefinition
              ? <FieldList definition={dialog.error.currentDefinition} locale={locale} />
              : <p className="chaos-panel__empty">{dialog.error.currentItem ? <bdi>{dialog.error.currentItem.title}</bdi> : '—'}</p>}</div>
          </div>
          {error && <ErrorBox error={error} locale={locale} />}
          <div className="chaos-actions">
            {can('definitions:read') && <Button disabled={busy} onClick={() => void run(() => window.maxApi.chaos.adoptChaosDefinition(dialog.link.id), () => setDialog(null))}>{copy.adoptChaos}</Button>}
            <Button variant="consequential" disabled={busy || !dialog.error.currentItem}
              onClick={() => void run(() => window.maxApi.chaos.updateDraft(dialog.link.id, dialog.definition, dialog.error.currentItem?.revision), (outcome) => { setDialog(null); setNotice({ text: copy.updated, warnings: outcome.warnings }); })}>
              {copy.overwrite}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>{copy.cancel}</Button>
          </div>
        </FocusedOverlay>
      )}

      {dialog?.type === 'unlink' && (
        <FocusedOverlay className="settings-delete-dialog" labelId="chaos-unlink-title" onClose={() => { if (!busy) setDialog(null); }}>
          <h3 id="chaos-unlink-title">{copy.unlinkTitle}</h3>
          <p>{copy.unlinkBody}</p>
          <button className="settings-delete-confirm" type="button" disabled={busy} onClick={() => void run(() => window.maxApi.chaos.unlink(dialog.link.id), () => setDialog(null))}>{copy.unlink}</button>
          <button data-autofocus="true" type="button" disabled={busy} onClick={() => setDialog(null)}>{copy.cancel}</button>
        </FocusedOverlay>
      )}
    </section>
  );
}

function ErrorBox({ error, locale }: Readonly<{ error: ChaosError; locale: Locale }>) {
  const copy = chaosCopy(locale);
  return (
    <div className="form-error" role="alert">
      {error.code === 'NOT_A_DRAFT' ? copy.notDraft : errorMessage(locale, error)}
      {error.problems?.length ? <ul>{error.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul> : null}
    </div>
  );
}

function FieldList({ definition, locale }: Readonly<{ definition: Readonly<{ title: string; fields: ChaosLocalDefinition['fields'] }>; locale: Locale }>) {
  return (
    <>
      <p style={{ margin: '4px 0', fontWeight: 600 }}><bdi>{definition.title}</bdi></p>
      <ol>{definition.fields.map((field) => <li key={field.id}><bdi>{field.label || '—'}</bdi> <small>({fieldTypeLabel(locale, field.type)})</small></li>)}</ol>
    </>
  );
}

function Compatibility({ locale, template }: Readonly<{ locale: Locale; template: ChaosTemplateCopy }>) {
  const copy = chaosCopy(locale);
  const { droppedByChaos, droppedByMax, notes } = template.compatibility;
  if (!droppedByChaos.length && !droppedByMax.length && !notes.length) return null;
  return (
    <div className="chaos-note" role="status">
      <strong>{copy.compatibility}</strong>
      <ul>
        {[...droppedByChaos, ...droppedByMax].map((item) => <li key={item}>{copy.dropped}: <bdi>{item}</bdi></li>)}
        {notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </div>
  );
}

function LinkCard({ link, locale, busy, canCopy, canUpdate, onEdit, onCopyTemplate, onUnlink }: Readonly<{
  link: ChaosLinkView; locale: Locale; busy: boolean; canCopy: boolean; canUpdate: boolean;
  onEdit: () => void; onCopyTemplate: () => void; onUnlink: () => void;
}>) {
  const copy = chaosCopy(locale);
  const [copied, setCopied] = useState(false);
  const item: ChaosItem | null = link.item;
  const count = responseCountLabel(locale, link.summary);
  const questions = (link.summary?.questions ?? []).filter((question) => question.distribution?.length).slice(0, 2);
  return (
    <li className="chaos-card">
      <div className="chaos-card__top">
        <p className="chaos-card__title"><bdi>{item?.title ?? link.itemId}</bdi></p>
        {item && <span className="chaos-pill" data-state={item.status}>{statusLabel(locale, item.status)}</span>}
      </div>
      <p className="chaos-card__meta">
        {kindLabel(locale, link.kind)}{count ? ` · ${count}` : ''}
        {link.summary?.averageScorePercent !== null && link.summary?.averageScorePercent !== undefined ? ` · ${Math.round(link.summary.averageScorePercent)}%` : ''}
        {item?.hasUnpublishedChanges ? ` · ${statusLabel(locale, 'draft')}*` : ''}
        {link.localChanges ? ` · ${copy.localChanges}` : ''}
      </p>
      {link.state !== 'ok' && <p className="chaos-card__state">{linkStateLabel(locale, link.state)}</p>}
      {questions.length > 0 && (
        <ul className="chaos-summary">
          {questions.map((question) => {
            const total = question.answeredCount ?? 0;
            return (
              <li key={question.fieldId}>
                <bdi>{question.label}</bdi>
                {question.distribution!.slice(0, 4).map((bucket) => (
                  <span key={bucket.option}>
                    <small><bdi>{bucket.option}</bdi>{bucket.count !== null ? ` · ${bucket.count}` : ''}</small>
                    {bucket.count !== null && total > 0 && <span className="chaos-bar"><span style={{ width: `${Math.round((bucket.count / total) * 100)}%` }} /></span>}
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      <p className="chaos-card__meta">{copy.lastUpdated(formatFetchedAt(locale, link.summaryFetchedAt ?? link.itemFetchedAt))}</p>
      <div className="chaos-card__actions">
        {item && (item.editUrl
          ? <button type="button" onClick={() => openUrl(item.editUrl)}>{copy.open}</button>
          : <span className="chaos-card__meta">{copy.openPath(item.editPath)}</span>)}
        {item?.resultsUrl && <button type="button" onClick={() => openUrl(item.resultsUrl)}>{copy.results}</button>}
        {item?.shareUrl && <button type="button" onClick={() => void navigator.clipboard?.writeText(item.shareUrl!).then(() => setCopied(true))}>{copied ? copy.copied : copy.copyShare}</button>}
        {canUpdate && link.connected && item?.status === 'draft' && <button type="button" disabled={busy} onClick={onEdit}>{copy.editFields}</button>}
        {canCopy && link.connected && <button type="button" disabled={busy} onClick={onCopyTemplate}>{copy.copyTemplate}</button>}
        <button type="button" disabled={busy} onClick={onUnlink}>{copy.unlink}</button>
      </div>
    </li>
  );
}

function LinkDialog({ locale, linked, busy, error, onClose, onLink }: Readonly<{
  locale: Locale; linked: readonly ChaosLinkView[]; busy: boolean; error?: ChaosError; onClose: () => void; onLink: (itemId: string) => void;
}>) {
  const copy = chaosCopy(locale);
  const [items, setItems] = useState<readonly ChaosItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ChaosError>();
  const [manualId, setManualId] = useState('');
  const linkedIds = useMemo(() => new Set(linked.map((link) => link.itemId)), [linked]);

  const load = useCallback(async (next?: string) => {
    setLoading(true);
    const result = await window.maxApi.chaos.listItems(undefined, next);
    if (result.ok) { setItems((previous) => (next ? [...previous, ...result.value.items] : result.value.items)); setCursor(result.value.nextCursor); }
    else setLoadError(result.error);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <FocusedOverlay className="chaos-dialog" labelId="chaos-link-title" onClose={() => { if (!busy) onClose(); }}>
      <h3 id="chaos-link-title">{copy.linkTitle}</h3>
      {loadError && <p className="form-error" role="alert">{errorMessage(locale, loadError)}</p>}
      {!loading && !items.length && !loadError && <p className="chaos-panel__empty">{copy.noItems}</p>}
      <ul className="chaos-items">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" disabled={busy || linkedIds.has(item.id)} onClick={() => onLink(item.id)}>
              <span><bdi>{item.title}</bdi></span>
              <small>{kindLabel(locale, item.kind)} · {statusLabel(locale, item.status)}</small>
            </button>
          </li>
        ))}
      </ul>
      {cursor && <Button variant="ghost" disabled={loading} onClick={() => void load(cursor)}>{copy.loadMore}</Button>}
      <form className="chaos-form" onSubmit={(event) => { event.preventDefault(); if (manualId.trim()) onLink(manualId.trim()); }}>
        <label><span>{copy.linkByIdLabel}</span><input dir="ltr" value={manualId} onChange={(event) => setManualId(event.target.value)} placeholder="form_…" /></label>
        <div className="chaos-actions"><Button type="submit" disabled={busy || !manualId.trim()}>{copy.attach}</Button><Button variant="ghost" onClick={onClose}>{copy.close}</Button></div>
      </form>
      {error && <p className="form-error" role="alert">{errorMessage(locale, error)}</p>}
    </FocusedOverlay>
  );
}
