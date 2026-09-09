import { strFromU8, unzipSync } from 'fflate';
import { expect, it } from 'vitest';
import type { WorkspaceProperty, WorkspaceRecord } from '../../shared/property-contract';
import { createExcelWorkbook } from './excel-export';

it('exports typed numbers, Arabic labels, safe text, and more than a screen of rows', () => {
  const properties = [{ id: 'price', name: 'السعر', type: 'number' }, { id: 'state', name: 'State', type: 'select', options: [{ id: 'new', label: 'جديد' }] }] as WorkspaceProperty[];
  const records = Array.from({ length: 251 }, (_, i) => ({ title: i === 0 ? '=HYPERLINK("bad") & <text>' : `صنف ${i}`, properties: { price: 123.45, state: 'new' } })) as unknown as WorkspaceRecord[];
  const files = unzipSync(createExcelWorkbook('Shop/المحل', properties, records, true));
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
  expect(sheet).toContain('r="A252"');
  expect(sheet).toContain('<v>123.45</v>');
  expect(sheet).toContain('جديد');
  expect(sheet).toContain('rightToLeft="1"');
  expect(sheet).toContain('=HYPERLINK(&quot;bad&quot;) &amp; &lt;text&gt;');
  expect(sheet).not.toContain('<f>');
  expect(strFromU8(files['xl/workbook.xml']!)).toContain('name="Shop المحل"');
});
it('exports headers for an empty database', () => {
  const files = unzipSync(createExcelWorkbook('Empty', [], []));
  expect(strFromU8(files['xl/worksheets/sheet1.xml']!)).toContain('Name');
});
