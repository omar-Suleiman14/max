import { strToU8, zipSync } from 'fflate';
import type { WorkspaceProperty, WorkspaceRecord } from '../../shared/property-contract';

// XML 1.0 excludes these control characters; user text is always encoded as inline strings.
// eslint-disable-next-line no-control-regex
const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
function column(index: number): string { let result = ''; do { result = String.fromCharCode(65 + index % 26) + result; index = Math.floor(index / 26) - 1; } while (index >= 0); return result; }
function displayValue(value: unknown, property: WorkspaceProperty): unknown {
  if (Array.isArray(value)) return value.map((entry) => displayValue(entry, property)).join(', ');
  if (property.options && typeof value === 'string') return property.options.find((option) => option.id === value)?.label ?? value;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

/** Inline strings deliberately never become Excel formulas, including =, + and @ prefixes. */
export function createExcelWorkbook(title: string, properties: readonly WorkspaceProperty[], records: readonly WorkspaceRecord[], rtl = false): Uint8Array {
  const fields = properties.filter((property) => property.type !== 'title' && !property.archivedAt);
  const rows = [[rtl ? 'الاسم' : 'Name', ...fields.map((property) => property.name)], ...records.map((record) => [record.title, ...fields.map((property) => displayValue(record.properties[property.id], property))])];
  return createExcelTable(title, rows, rtl);
}

export function createExcelTable(title: string, rows: readonly (readonly unknown[])[], rtl = false): Uint8Array {
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 1);
  if (rows.length > 1_048_576 || columnCount > 16_384) throw new Error('The export exceeds Excel worksheet limits.');
  const data = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, index) => {
    const ref = `${column(index)}${rowIndex + 1}`;
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
    if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
    const text = typeof value === 'string' ? value : value === null || value === undefined ? '' : JSON.stringify(value);
    if (text.length > 32767) throw new Error('A cell exceeds Excel’s 32,767-character limit.');
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const name = xml(title.replace(/[\\/?*[\]:]/g, ' ').replace(/^'+|'+$/g, '').slice(0, 31) || 'Max');
  const files: Record<string, string> = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="${rtl ? 1 : 0}"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${data}</sheetData><autoFilter ref="A1:${column(columnCount - 1)}${rows.length}"/></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + contents)])));
}

export function downloadExcel(bytes: Uint8Array, title: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  // eslint-disable-next-line no-control-regex
  link.download = `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 100) || 'Max'}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
