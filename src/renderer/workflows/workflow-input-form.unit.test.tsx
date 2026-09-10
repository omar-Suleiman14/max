// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowInputForm } from './workflow-input-form';
import { inputDefaults } from './input-defaults';
import type { WorkflowInputField } from '../../shared/workflow-contract';
afterEach(cleanup);
const fields: readonly WorkflowInputField[] = [{ key: 'rows', label: 'Rows', type: 'collection', minItems: 1, maxItems: 2, fields: [
  { key: 'record', label: 'Node', type: 'record', databaseId: 'nodes', required: true },
  { key: 'quantity', label: 'Quantity', type: 'number', required: true, defaultValue: 1 },
  { key: 'rate', label: 'Rate', type: 'number', prefill: { inputKey: 'record', databaseId: 'nodes', propertyId: 'factor' } },
] }];
function Form() { const [values, setValues] = useState(inputDefaults(fields)); return <><WorkflowInputForm fields={fields} values={values} onChange={setValues} disabled={false} locale="en"/><output data-testid="values">{JSON.stringify(values)}</output></>; }
describe('Repeated workflow inputs', () => {
  it('adds/removes rows, preserves edits, selects records and prefills the correct row', async () => {
    Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: { queryDatabase: vi.fn().mockResolvedValue({ records: [{ id: 'a', title: 'Alpha', properties: { factor: 3 } }, { id: 'b', title: 'Beta', properties: { factor: 5 } }] }) } } });
    const user = userEvent.setup(); render(<Form/>);
    // Each row hides its optional inputs until asked for them.
    const revealOptionalFields = async () => {
      for (const toggle of screen.queryAllByRole('button', { name: /optional field/, expanded: false })) await user.click(toggle);
    };
    await revealOptionalFields();
    expect(screen.getByRole('button', { name: 'Remove row 1' })).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: 'Node' })); await user.click(await screen.findByRole('option', { name: 'Alpha' }));
    await waitFor(() => expect(screen.getByLabelText('Rate')).toHaveValue(3));
    await user.click(screen.getByRole('button', { name: '+ Add row' }));
    await revealOptionalFields();
    expect(screen.getByRole('button', { name: '+ Add row' })).toBeDisabled();
    await user.click(screen.getAllByRole('combobox', { name: 'Node' })[1]!); await user.click(await screen.findByRole('option', { name: 'Beta' }));
    expect(screen.getAllByLabelText('Rate')[1]).toHaveValue(5);
    await user.clear(screen.getAllByLabelText('Quantity *')[1]!); await user.type(screen.getAllByLabelText('Quantity *')[1]!, '4');
    await user.click(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(screen.getByLabelText('Rate')).toHaveValue(5); expect(screen.getByLabelText('Quantity *')).toHaveValue(4);
    expect(screen.getByTestId('values')).toHaveTextContent('"record":"b"');
  });
});
