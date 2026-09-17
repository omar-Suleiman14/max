// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PageFrontmatter } from './page-frontmatter';
import type { PageProperty } from './page-properties';

afterEach(cleanup);

describe('PageFrontmatter', () => {
  it('shows a toggle when there are no properties to show as YAML', () => {
    render(<PageFrontmatter locale="en" onChange={vi.fn()} properties={[]} />);
    expect(screen.getByRole('button', { name: /View as YAML/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('YAML source for page properties')).not.toBeInTheDocument();
  });

  it('shows the current properties as a --- delimited YAML block when properties exist', () => {
    const properties: PageProperty[] = [{ id: '1', name: 'Priority', type: 'text', value: 'High' }];
    render(<PageFrontmatter locale="en" onChange={vi.fn()} properties={properties} />);
    expect(screen.getByLabelText('YAML source for page properties')).toHaveValue('---\nPriority: High\n---');
  });

  it('applies a valid edit to the property values', () => {
    const properties: PageProperty[] = [{ id: '1', name: 'Priority', type: 'text', value: 'High' }];
    const onChange = vi.fn();
    render(<PageFrontmatter locale="en" onChange={onChange} properties={properties} />);
    fireEvent.change(screen.getByLabelText('YAML source for page properties'), { target: { value: '---\nPriority: Low\n---' } });
    expect(onChange).toHaveBeenCalledWith([{ id: '1', name: 'Priority', type: 'text', value: 'Low', options: undefined }]);
  });

  it('creates a new property from a new key, inferring its type from the value', () => {
    const onChange = vi.fn();
    render(<PageFrontmatter locale="en" onChange={onChange} properties={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /View as YAML/ }));
    fireEvent.change(screen.getByLabelText('YAML source for page properties'), { target: { value: '---\nDone: true\n---' } });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'Done', type: 'checkbox', value: true })]);
  });

  it('shows an error and leaves the property values untouched when the YAML is malformed', () => {
    const properties: PageProperty[] = [{ id: '1', name: 'Priority', type: 'text', value: 'High' }];
    const onChange = vi.fn();
    render(<PageFrontmatter locale="en" onChange={onChange} properties={properties} />);
    const textarea = screen.getByLabelText('YAML source for page properties');
    fireEvent.change(textarea, { target: { value: '---\nthis has no colon\n---' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(textarea).toHaveValue('---\nthis has no colon\n---');
  });

  it('shows an error and keeps the source editable when the closing delimiter is missing', () => {
    render(<PageFrontmatter locale="en" onChange={vi.fn()} properties={[{ id: '1', name: 'Priority', type: 'text', value: 'High' }]} />);
    const textarea = screen.getByLabelText('YAML source for page properties');
    fireEvent.change(textarea, { target: { value: '---\nPriority: High' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(textarea).not.toBeDisabled();
  });

  it('does not delete a property when its key is removed from the YAML text', () => {
    const properties: PageProperty[] = [
      { id: '1', name: 'Priority', type: 'text', value: 'High' },
      { id: '2', name: 'Owner', type: 'text', value: 'Sam' },
    ];
    const onChange = vi.fn();
    render(<PageFrontmatter locale="en" onChange={onChange} properties={properties} />);
    fireEvent.change(screen.getByLabelText('YAML source for page properties'), { target: { value: '---\nPriority: High\n---' } });
    expect(onChange).toHaveBeenCalledWith(properties);
  });

  it('regenerates the YAML source when properties change from the property panel', () => {
    const properties: PageProperty[] = [{ id: '1', name: 'Priority', type: 'text', value: 'High' }];
    const { rerender } = render(<PageFrontmatter locale="en" onChange={vi.fn()} properties={properties} />);
    const updated: PageProperty[] = [{ id: '1', name: 'Priority', type: 'text', value: 'Low' }];
    rerender(<PageFrontmatter locale="en" onChange={vi.fn()} properties={updated} />);
    expect(screen.getByLabelText('YAML source for page properties')).toHaveValue('---\nPriority: Low\n---');
  });

  it('toggles the YAML view open and closed', async () => {
    const user = userEvent.setup();
    render(<PageFrontmatter locale="en" onChange={vi.fn()} properties={[]} />);
    await user.click(screen.getByRole('button', { name: /View as YAML/ }));
    expect(screen.getByLabelText('YAML source for page properties')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Hide/ }));
    expect(screen.queryByLabelText('YAML source for page properties')).not.toBeInTheDocument();
  });
});
