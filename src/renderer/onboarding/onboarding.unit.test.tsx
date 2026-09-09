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

    // Step 2 should now be visible (Shop name input)
    const shopInput = screen.getByPlaceholderText(/my workspace/i);
    expect(shopInput).toBeInTheDocument();

    // Typing shop name and pressing Enter advances to Step 3
    fireEvent.change(shopInput, { target: { value: 'My Mac Shop' } });
    fireEvent.keyDown(shopInput, { key: 'Enter' });

    // Step 3 (Workspace template) should now be visible with only Blank setup
    expect(screen.getByText(/Shop structure/i)).toBeInTheDocument();
    expect(screen.getByText(/Blank setup/i)).toBeInTheDocument();
    expect(screen.queryByText(/Phone Shop/i)).toBeNull();
    expect(screen.getByText(/Import blueprint/i)).toBeInTheDocument();
  });

  it('selects Arabic when navigated with keyboard and Enter', () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<Onboarding initialLocale="en" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));

    const arabicBtn = screen.getByRole('radio', { name: /العربية/i });

    // Press Enter on Arabic button
    fireEvent.keyDown(arabicBtn, { key: 'Enter' });

    // Should now be on step 2 in Arabic
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByText(/اسم المتجر/i)).toBeInTheDocument();
  });
});
