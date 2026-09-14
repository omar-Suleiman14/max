// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Onboarding } from './onboarding';

afterEach(cleanup);

describe('Onboarding component', () => {
  it('defaults to English, allows Enter to advance to step 2, and handles Tab to Arabic', () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<Onboarding initialLocale="en" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));

    // Step 1: Language
    const englishBtn = screen.getByRole('radio', { name: /English/i });
    const arabicBtn = screen.getByRole('radio', { name: /العربية/i });

    expect(englishBtn).toHaveAttribute('data-selected', 'true');
    expect(arabicBtn).toHaveAttribute('data-selected', 'false');

    // Verify traffic lights and step dots are removed
    expect(document.querySelector('.macos-traffic-lights')).toBeNull();
    expect(document.querySelector('.onboarding-steps-indicator')).toBeNull();

    // Button should be centered and have class apple-button
    const continueBtn = screen.getByRole('button', { name: /Continue/i });
    expect(continueBtn).toHaveClass('apple-button');

    // Pressing Enter on English advances to step 2
    fireEvent.keyDown(englishBtn, { key: 'Enter' });

    // Step 2 asks for a workspace name, never a shop or a store name.
    expect(screen.getByRole('heading', { name: 'Workspace name' })).toBeInTheDocument();
    expect(screen.getByText('Give this workspace a name. You can change it later.')).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText('My workspace');
    expect(nameInput).toBeInTheDocument();

    // Typing a workspace name and pressing Enter advances to Step 3
    fireEvent.change(nameInput, { target: { value: 'Reading notes' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    // Step 3 (Workspace structure) should now be visible with only Blank setup
    expect(screen.getByText(/Workspace structure/i)).toBeInTheDocument();
    expect(screen.getByText(/Blank setup/i)).toBeInTheDocument();
    expect(screen.queryByText(/Phone Shop/i)).toBeNull();
    expect(screen.getByText(/Import blueprint/i)).toBeInTheDocument();
  });

  it('shows the workspace name validation message and blocks the step until a name is entered', () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<Onboarding initialLocale="en" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.keyDown(screen.getByRole('radio', { name: /English/i }), { key: 'Enter' });

    const nameInput = screen.getByPlaceholderText('My workspace');
    expect(screen.queryByRole('alert')).toBeNull();

    // Typing and clearing the field surfaces the validation message verbatim.
    fireEvent.change(nameInput, { target: { value: 'Notes' } });
    fireEvent.change(nameInput, { target: { value: '   ' } });

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Enter a workspace name between 1 and 120 characters.');
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');

    // A blank name cannot advance the wizard.
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    expect(screen.queryByText(/Workspace structure/i)).toBeNull();

    fireEvent.change(nameInput, { target: { value: 'Notes' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    expect(screen.getByText(/Workspace structure/i)).toBeInTheDocument();
  });

  it('selects Arabic when navigated with keyboard and Enter', () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<Onboarding initialLocale="en" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));

    const arabicBtn = screen.getByRole('radio', { name: /العربية/i });

    // Press Enter on Arabic button
    fireEvent.keyDown(arabicBtn, { key: 'Enter' });

    // Should now be on step 2 in Arabic, asking for a workspace rather than a shop.
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { name: 'اسم مساحة العمل' })).toBeInTheDocument();
    expect(screen.queryByText(/متجر/)).toBeNull();
  });
});
