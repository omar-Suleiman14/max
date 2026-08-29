import { Check, CheckCircle2, Copy, Download, FileCode, Upload, X } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

import type { Blueprint, BlueprintValidationResult } from '../../shared/blueprint-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { blueprintCopy } from './blueprint-i18n';

type BlueprintDialogProps = Readonly<{
  initialTab?: 'export' | 'import';
  locale: Locale;
  onClose: () => void;
  onImportSuccess?: () => void;
}>;

export function BlueprintDialog({
  initialTab = 'export',
  locale,
  onClose,
  onImportSuccess,
}: BlueprintDialogProps) {
  const [tab, setTab] = useState<'export' | 'import'>(initialTab);
  const [exportedBlueprint, setExportedBlueprint] = useState<Blueprint>();
  const [copied, setCopied] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [validationResult, setValidationResult] = useState<BlueprintValidationResult>();
  const [parsedBlueprint, setParsedBlueprint] = useState<Blueprint>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>();
  const [importSuccess, setImportSuccess] = useState(false);

  useEffect(() => {
    if (tab === 'export') {
      void window.maxApi.blueprints.export().then(setExportedBlueprint);
    }
  }, [tab]);

  async function handleValidate(text: string) {
    setImportJson(text);
    setImportError(undefined);
    setImportSuccess(false);

    if (!text.trim()) {
      setValidationResult(undefined);
      setParsedBlueprint(undefined);
      return;
    }

    try {
      const parsed = JSON.parse(text) as unknown;
      const res = await window.maxApi.blueprints.validate(parsed);
      setValidationResult(res);
      if (res.valid) {
        setParsedBlueprint(parsed as Blueprint);
      } else {
        setParsedBlueprint(undefined);
      }
    } catch {
      setValidationResult({
        issues: [{ message: 'Invalid JSON syntax.', path: '$' }],
        valid: false,
      });
      setParsedBlueprint(undefined);
    }
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await handleValidate(text);
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
    if (!parsedBlueprint) return;

    setImporting(true);
    setImportError(undefined);
    try {
      const res = await window.maxApi.blueprints.import(parsedBlueprint);
      if (res.ok) {
        setImportSuccess(true);
        onImportSuccess?.();
      } else {
        setImportError(res.error.message);
      }
    } catch {
      setImportError(blueprintCopy(locale, 'importError'));
    } finally {
      setImporting(false);
    }
  }

  return (
    <FocusedOverlay className="blueprint-dialog" labelId="blueprint-dialog-title" onClose={onClose}>
      <header className="dialog-header">
        <div>
          <p className="eyebrow">MAX · {blueprintCopy(locale, 'blueprint')}</p>
          <h2 id="blueprint-dialog-title">{blueprintCopy(locale, 'blueprintTitle')}</h2>
        </div>
        <button aria-label={blueprintCopy(locale, 'close')} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <div className="blueprint-tabs" role="tablist">
        <button
          aria-selected={tab === 'export'}
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
        {tab === 'export' && (
          <div className="blueprint-export-pane">
            <p className="step-subtitle">{blueprintCopy(locale, 'exportSubtitle')}</p>

            <div className="blueprint-preview-card">
              <div className="blueprint-preview-card__header">
                <div>
                  <strong>{exportedBlueprint?.name ?? 'Loading…'}</strong>
                  <small>
                    {exportedBlueprint?.properties.item.length ?? 0} {blueprintCopy(locale, 'itemPropertiesCount')} ·{' '}
                    {exportedBlueprint?.properties.person.length ?? 0} {blueprintCopy(locale, 'personPropertiesCount')} ·{' '}
                    {exportedBlueprint?.templates.length ?? 0} {blueprintCopy(locale, 'templatesCount')}
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
            <p className="step-subtitle">{blueprintCopy(locale, 'importSubtitle')}</p>

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
                <input accept=".json,.max-blueprint.json" onChange={(event) => void handleFileSelect(event)} style={{ display: 'none' }} type="file" />
              </label>
            </div>

            <textarea
              className="blueprint-textarea"
              onChange={(e) => void handleValidate(e.target.value)}
              placeholder="Paste JSON blueprint here…"
              rows={8}
              value={importJson}
            />

            {validationResult && !validationResult.valid && (
              <div className="validation-issues">
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
                    <span>{parsedBlueprint.properties.item?.length ?? 0} {blueprintCopy(locale, 'itemPropertiesCount')}</span>
                  </div>
                  <div className="assembly-badge">
                    <CheckCircle2 aria-hidden="true" size={16} />
                    <span>{parsedBlueprint.properties.person?.length ?? 0} {blueprintCopy(locale, 'personPropertiesCount')}</span>
                  </div>
                  <div className="assembly-badge">
                    <CheckCircle2 aria-hidden="true" size={16} />
                    <span>{parsedBlueprint.templates?.length ?? 0} {blueprintCopy(locale, 'templatesCount')}</span>
                  </div>
                </div>
              </div>
            )}

            <footer className="form-footer">
              <Button onClick={onClose}>{blueprintCopy(locale, 'cancel')}</Button>
              <Button
                disabled={!parsedBlueprint || importing || importSuccess}
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
