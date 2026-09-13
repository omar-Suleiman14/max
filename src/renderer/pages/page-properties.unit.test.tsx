// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PageProperties, type PageProperty } from './page-properties';

afterEach(cleanup);

function addProperty(name: string, typeLabel: string) {
  const onChange = vi.fn();
  render(<PageProperties createdAt="2026-09-01T08:30:00.000Z" locale="en" onChange={onChange} properties={[]} updatedAt="2026-09-12T21:15:00.000Z" />);
  return { onChange, typeLabel, name };
}

describe('the property types a page offers', () => {
  it('offers every type a page can answer for itself', async () => {
    render(<PageProperties locale="en" onChange={vi.fn()} properties={[]} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add a property' }));

    const offered = screen.getAllByRole('button').map((button) => button.textContent).filter(Boolean);
    for (const type of ['Text', 'Number', 'Select', 'Multi-select', 'Status', 'Date', 'Checkbox', 'URL', 'Email', 'Phone', 'File', 'Created time', 'Last edited time']) {
      expect(offered).toContain(type);
    }
  });

  it('creates a status with the three choices it starts life with', async () => {
    const { onChange } = addProperty('Stage', 'Status');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Add a property' }));
    await user.type(screen.getByLabelText('New property name'), 'Stage');
    await user.click(screen.getByRole('button', { name: 'Status' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'Stage', options: ['Not started', 'In progress', 'Done'], type: 'status' })]);
  });

  it('starts a multi-select holding nothing rather than holding null', async () => {
    const { onChange } = addProperty('Tags', 'Multi-select');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Add a property' }));
    await user.type(screen.getByLabelText('New property name'), 'Tags');
    await user.click(screen.getByRole('button', { name: 'Multi-select' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'Tags', type: 'multi_select', value: [] })]);
  });
});

describe('the values those types hold', () => {
  const property = (over: Partial<PageProperty>): PageProperty => ({ id: 'p1', name: 'Field', type: 'text', value: null, ...over });

  it('reads the page’s own timestamps for created and last edited', () => {
    render(<PageProperties createdAt="2026-09-01T08:30:00.000Z" locale="en" onChange={vi.fn()} properties={[property({ name: 'Created', type: 'created_time' }), property({ id: 'p2', name: 'Edited', type: 'last_edited_time' })]} updatedAt="2026-09-12T21:15:00.000Z" />);

    expect(screen.getByLabelText('Created')).toHaveAttribute('datetime', '2026-09-01T08:30:00.000Z');
    expect(screen.getByLabelText('Edited')).toHaveAttribute('datetime', '2026-09-12T21:15:00.000Z');
  });

  it('picks several choices in a multi-select and lets one go again', async () => {
    const onChange = vi.fn();
    render(<PageProperties locale="en" onChange={onChange} properties={[property({ options: ['Repair', 'Sale'], type: 'multi_select', value: ['Repair'] })]} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Field' }));
    await user.click(screen.getByRole('option', { name: 'Sale' }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ value: ['Repair', 'Sale'] })]);

    await user.click(screen.getByRole('option', { name: 'Repair' }));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ value: [] })]);
  });

  it('gives email, phone and url the keyboard each one needs', () => {
    render(<PageProperties locale="en" onChange={vi.fn()} properties={[
      property({ id: 'a', name: 'Mail', type: 'email' }),
      property({ id: 'b', name: 'Ring', type: 'phone' }),
      property({ id: 'c', name: 'Site', type: 'url' }),
    ]} />);

    expect(screen.getByLabelText('Mail')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Ring')).toHaveAttribute('type', 'tel');
    expect(screen.getByLabelText('Site')).toHaveAttribute('type', 'url');
  });
});

describe('a file kept on a page', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'maxApi', {
      configurable: true,
      value: {
        assets: {
          importAttachment: vi.fn().mockResolvedValue({ ok: true, value: { url: 'max://attachment/abc.pdf' } }),
          importImage: vi.fn(),
          openAttachment: vi.fn().mockResolvedValue({ ok: true, value: null }),
        },
      },
    });
  });

  it('stores what was chosen and opens it again by name', async () => {
    const onChange = vi.fn();
    render(<PageProperties locale="en" onChange={onChange} properties={[{ id: 'f', name: 'Receipt', type: 'file', value: null }]} />);

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Receipt'), new File(['%PDF'], 'invoice.pdf', { type: 'application/pdf' }));

    expect(window.maxApi.assets.importAttachment).toHaveBeenCalledWith(expect.any(Uint8Array), 'invoice.pdf');
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ value: { name: 'invoice.pdf', url: 'max://attachment/abc.pdf' } })]);

    cleanup();
    render(<PageProperties locale="en" onChange={onChange} properties={[{ id: 'f', name: 'Receipt', type: 'file', value: { name: 'invoice.pdf', url: 'max://attachment/abc.pdf' } }]} />);
    await user.click(screen.getByRole('button', { name: 'Open invoice.pdf' }));

    expect(window.maxApi.assets.openAttachment).toHaveBeenCalledWith('max://attachment/abc.pdf');
  });
});
