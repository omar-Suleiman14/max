import { Check, CheckCircle2, Copy, Download, FileCode, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import type { BlueprintValidationResult } from '../../shared/blueprint-contract';
import type { WorkspaceTemplateV2 } from '../../shared/template-v2-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { blueprintCopy } from './blueprint-i18n';

function getErrorLineIndex(text: string, errorMessage: string): number | null {
  const posMatch = /at position (\d+)/.exec(errorMessage);
  if (posMatch && posMatch[1]) {
    const pos = parseInt(posMatch[1], 10);
    if (!isNaN(pos)) {
      return text.slice(0, pos).split('\n').length - 1;
    }
  }
  const quoteMatch = /"([^"]+)"/.exec(errorMessage);
  if (quoteMatch && quoteMatch[1]) {
    const term = quoteMatch[1];
    const lines = text.split('\n');
    const index = lines.findIndex(line => line.includes(`"${term}"`));
    if (index !== -1) return index;
  }
  return null;
}

type BlueprintDialogProps = Readonly<{
  initialTab?: 'export' | 'import';
  /** Blueprint text the dialog opens on, from a dropped or chosen file. */
  initialJson?: string;
  locale: Locale;
  onClose: () => void;
  onImportSuccess?: () => void;
}>;

export function BlueprintDialog({
  initialTab = 'export',
  initialJson,
  locale,
  onClose,
  onImportSuccess,
}: BlueprintDialogProps) {
  const [tab, setTab] = useState<'export' | 'import'>(initialTab);
  const [exportedBlueprint, setExportedBlueprint] = useState<WorkspaceTemplateV2>();
  const [copied, setCopied] = useState(false);
  const [importJson, setImportJson] = useState(initialJson ?? '');
  const [validationResult, setValidationResult] = useState<BlueprintValidationResult>();
  const [errorLineIndex, setErrorLineIndex] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const [parsedBlueprint, setParsedBlueprint] = useState<WorkspaceTemplateV2>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>();
  const [importSuccess, setImportSuccess] = useState(false);
  const [validating, setValidating] = useState(false);
  const locked = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    if (errorLineIndex !== null && highlightRef.current && textareaRef.current) {
      const lineHeight = 16.5; // Approx 11px font + 1.5 line height
      const targetScroll = Math.max(0, errorLineIndex * lineHeight - 60);
      textareaRef.current.scrollTop = targetScroll;
      highlightRef.current.scrollTop = targetScroll;
    }
  }, [errorLineIndex]);

  // A file that was dropped or chosen has already been picked out; checking it
  // is what the person wants next, not another button to press first.
  const validateOnOpen = useRef(initialJson);
  useEffect(() => {
    const text = validateOnOpen.current;
    if (!text) return;
    validateOnOpen.current = undefined;
    void handleValidate(text);
  }, []);

  useEffect(() => {
    if (tab === 'export') {
      void window.maxApi.workspace.exportTemplate().then((result) => {
        if (result.ok) setExportedBlueprint(result.value);
        else setImportError(result.error.message);
      }).catch(() => setImportError(blueprintCopy(locale, 'importError')));
    }
  }, [tab, locale]);

  async function handleValidate(text: string) {
    if (locked.current) return;
    locked.current = true;
    const current = ++revision.current;
    setParsedBlueprint(undefined);
    setValidating(true);
    setImportJson(text);
    setImportError(undefined);
    setImportSuccess(false);

    if (!text.trim()) {
      setValidationResult(undefined);
      setParsedBlueprint(undefined);
      setValidating(false);
      locked.current = false;
      return;
    }

    try {
      const parsed = JSON.parse(text) as unknown;
      const result = await window.maxApi.workspace.validateTemplate(parsed);
      if (current !== revision.current) return;
      if (result.ok) {
        setValidationResult({ valid: true, issues: [] });
        setParsedBlueprint(parsed as WorkspaceTemplateV2);
        setErrorLineIndex(null);
      } else {
        setValidationResult({ valid: false, issues: [{ path: '$', message: result.error.message }] });
        setParsedBlueprint(undefined);
        setErrorLineIndex(getErrorLineIndex(text, result.error.message));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid JSON syntax.';
      setValidationResult({
        issues: [{ message: msg, path: '$' }],
        valid: false,
      });
      setErrorLineIndex(getErrorLineIndex(text, msg));
      setParsedBlueprint(undefined);
    } finally {
      locked.current = false;
      if (current === revision.current) setValidating(false);
    }
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const current = ++revision.current;
    try {
      const text = await file.text();
      if (current !== revision.current) return;
      // Check it straight away, the same as a dropped file.
      await handleValidate(text);
    } catch { setImportError(locale === 'ar' ? 'تعذر قراءة الملف.' : 'Could not read the file.'); }
  }

  async function copyToClipboard() {
    if (!exportedBlueprint) return;
    await navigator.clipboard.writeText(JSON.stringify(exportedBlueprint, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadJson() {
    if (!exportedBlueprint) return;
    const blob = new Blob([JSON.stringify(exportedBlueprint, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportedBlueprint.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.max-blueprint.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportSubmit(event: FormEvent) {
    event.preventDefault();
    if (!parsedBlueprint || locked.current || importSuccess) return;
    locked.current = true;

    setImporting(true);
    setImportError(undefined);
    try {
      const res = await window.maxApi.workspace.importTemplate(parsedBlueprint);
      if (res.ok) {
        setImportSuccess(true);
        window.dispatchEvent(new Event('max:workspace-changed'));
        window.dispatchEvent(new Event('max:workspace-imported'));
        onImportSuccess?.();
      } else {
        setImportError(res.error.message);
      }
    } catch {
      setImportError(blueprintCopy(locale, 'importError'));
    } finally {
      locked.current = false;
      setImporting(false);
    }
  }

  return (
    <FocusedOverlay className="blueprint-dialog" labelId="blueprint-dialog-title" onClose={() => { if (!locked.current) onClose(); }}>
      <header className="dialog-header">
        <div>
          <p className="eyebrow">MAX · {blueprintCopy(locale, 'blueprint')}</p>
          <h2 id="blueprint-dialog-title">{blueprintCopy(locale, 'blueprintTitle')}</h2>
        </div>
        <button disabled={importing || validating} aria-label={blueprintCopy(locale, 'close')} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <div className="blueprint-tabs" role="tablist">
        <button
          aria-selected={tab === 'export'}
          disabled={importing || validating}
          className="blueprint-tab"
          data-active={tab === 'export'}
          onClick={() => setTab('export')}
          role="tab"
          type="button"
        >
          <Download aria-hidden="true" size={16} />
          <span>{blueprintCopy(locale, 'exportBlueprint')}</span>
        </button>
        <button
          aria-selected={tab === 'import'}
          disabled={importing || validating}
          className="blueprint-tab"
          data-active={tab === 'import'}
          onClick={() => setTab('import')}
          role="tab"
          type="button"
        >
          <Upload aria-hidden="true" size={16} />
          <span>{blueprintCopy(locale, 'importBlueprint')}</span>
        </button>
      </div>

      <div className="blueprint-tab-content">
        {tab === 'export' && importError && <p className="form-error" role="alert">{importError}</p>}
        {tab === 'export' && (
          <div className="blueprint-export-pane">
            <p className="step-subtitle">{blueprintCopy(locale, 'exportSubtitle')}</p>

            <div className="blueprint-preview-card">
              <div className="blueprint-preview-card__header">
                <div>
                  <strong>{exportedBlueprint?.name ?? 'Loading…'}</strong>
                  <small>
                    {exportedBlueprint?.databases.length ?? 0} {locale === 'ar' ? 'قواعد بيانات' : 'databases'} ·{' '}
                    {exportedBlueprint?.records?.length ?? 0} {locale === 'ar' ? 'سجلات' : 'records'} ·{' '}
                    {exportedBlueprint?.workflows?.length ?? 0} {locale === 'ar' ? 'إجراءات' : 'actions'}
                  </small>
                </div>
                <div className="blueprint-preview-card__actions">
                  <Button
                    icon={copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
                    onClick={() => void copyToClipboard()}
                  >
                    {copied ? blueprintCopy(locale, 'copiedToClipboard') : blueprintCopy(locale, 'copyJson')}
                  </Button>
                  <Button icon={<Download aria-hidden="true" size={16} />} onClick={downloadJson} variant="primary">
                    {blueprintCopy(locale, 'downloadJson')}
                  </Button>
                </div>
              </div>

              <pre className="blueprint-json-preview">
                {exportedBlueprint ? JSON.stringify(exportedBlueprint, null, 2) : 'Loading export preview…'}
              </pre>
            </div>
          </div>
        )}

        {tab === 'import' && (
          <form className="blueprint-import-pane" onSubmit={(event) => void handleImportSubmit(event)}>
            {importError && <p className="form-error" role="alert">{importError}</p>}
            {importSuccess && (
              <p className="form-success" role="status">
                <CheckCircle2 aria-hidden="true" size={16} />
                {blueprintCopy(locale, 'blueprintImportSuccess')}
              </p>
            )}

            <div className="blueprint-import-actions">
              <label className="button button--secondary">
                <FileCode aria-hidden="true" size={16} />
                {blueprintCopy(locale, 'pasteOrUpload')}
                <input disabled={importing || validating} accept=".json,.max-blueprint.json" onChange={(event) => void handleFileSelect(event)} style={{ display: 'none' }} type="file" />
              </label>
            </div>

            <div className="blueprint-textarea-container">
              <pre className="blueprint-textarea-bg" aria-hidden="true" ref={highlightRef}>
                {importJson.split('\n').map((line, i) => (
                  <span key={i} className={errorLineIndex === i ? 'error-line' : ''}>
                    {line || ' '}
                    {'\n'}
                  </span>
                ))}
              </pre>
              <textarea
                ref={textareaRef}
                className="blueprint-textarea"
                disabled={importing || validating}
                aria-label={locale === 'ar' ? 'مخطط JSON' : 'Blueprint JSON'}
                onChange={(e) => { revision.current++; setImportJson(e.target.value); setParsedBlueprint(undefined); setValidationResult(undefined); setImportSuccess(false); setErrorLineIndex(null); }}
                onScroll={(e) => {
                  if (highlightRef.current) {
                    highlightRef.current.scrollTop = e.currentTarget.scrollTop;
                    highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                }}
                placeholder="Paste JSON blueprint here…"
                rows={8}
                value={importJson}
              />
            </div>

            <div className="blueprint-preview-action" style={{ marginBlock: '16px' }}>
              <Button disabled={!importJson.trim() || validating || importing} onClick={() => void handleValidate(importJson)}>{validating ? (locale === 'ar' ? 'جارٍ التحقق…' : 'Validating…') : (locale === 'ar' ? 'معاينة المخطط' : 'Preview blueprint')}</Button>
            </div>

            {validationResult && !validationResult.valid && (
              <div className="validation-issues" style={{ paddingBottom: '16px' }}>
                {validationResult.issues.map((issue, i) => (
                  <p key={i} className="form-error">
                    {issue.path}: {issue.message}
                  </p>
                ))}
              </div>
            )}

            {parsedBlueprint && (
              <div className="blueprint-preview-summary">
                <p className="eyebrow">{blueprintCopy(locale, 'preview')}</p>
                <h3>{parsedBlueprint.name}</h3>
                <div className="assembly-badge-list">
                  <div className="assembly-badge">
                    <CheckCircle2 aria-hidden="true" size={16} />
                    <span>{parsedBlueprint.databases.length} {locale === 'ar' ? 'قواعد بيانات' : 'databases'}</span>
                  </div>
                  <div className="assembly-badge">
                    <CheckCircle2 aria-hidden="true" size={16} />
                    <span>{parsedBlueprint.records?.length ?? 0} {locale === 'ar' ? 'سجلات' : 'records'}</span>
                  </div>
                  <div className="assembly-badge">
                    <CheckCircle2 aria-hidden="true" size={16} />
                    <span>{parsedBlueprint.workflows?.length ?? 0} {locale === 'ar' ? 'إجراءات' : 'actions'}</span>
                  </div>
                </div>
              </div>
            )}

            <footer className="form-footer">
              <Button disabled={importing || validating} onClick={onClose}>{blueprintCopy(locale, 'cancel')}</Button>
              <Button
                disabled={!parsedBlueprint || importing || validating || importSuccess}
                type="submit"
                variant="primary"
              >
                {blueprintCopy(locale, 'importConfirm')}
              </Button>
            </footer>
          </form>
        )}
      </div>
    </FocusedOverlay>
  );
}
