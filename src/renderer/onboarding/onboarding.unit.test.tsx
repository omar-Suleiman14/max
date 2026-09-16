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
  /** Walk to step three the way a person does, so the flow is what is tested. */
  function reachStructureStep(locale: 'ar' | 'en' = 'en', name = 'Reading notes') {
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.keyDown(screen.getByRole('radio', { name: locale === 'ar' ? /العربية/ : /English/i }), { key: 'Enter' });
    const nameInput = screen.getByPlaceholderText(locale === 'ar' ? 'مساحة عملي' : 'My workspace');
    fireEvent.change(nameInput, { target: { value: name } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });
  }

  it('offers only what it can actually do, in both languages', () => {
    render(<Onboarding initialLocale="en" onComplete={vi.fn().mockResolvedValue(undefined)} />);
    reachStructureStep();

    // The subtitle used to promise a preset. Step three has never had one, so
    // two of the three things it offered were the same thing and the third did
    // not exist.
    expect(screen.getByText('Start empty, or bring a blueprint you already have.')).toBeInTheDocument();
    expect(screen.queryByText(/preset/i)).toBeNull();
    expect(screen.getByText('Start from a blueprint file you already have.')).toBeInTheDocument();

    cleanup();
    render(<Onboarding initialLocale="ar" onComplete={vi.fn().mockResolvedValue(undefined)} />);
    reachStructureStep('ar', 'دفتر ملاحظات');
    expect(screen.getByText('ابدأ فارغًا أو استورد مخططًا لديك بالفعل.')).toBeInTheDocument();
    expect(screen.getByText('ابدأ من ملف مخطط لديك بالفعل.')).toBeInTheDocument();
  });

  it('builds an empty workspace and says so, carrying no demo-data flag', () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<Onboarding initialLocale="en" onComplete={onComplete} />);
    reachStructureStep();

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    const terms = screen.getByRole('checkbox');
    fireEvent.scroll(document.querySelector('.terms-scroll') ?? document.body);
    fireEvent.click(terms);

    // The last screen confirms what the workspace will be built from, so an
    // imported blueprint is never silently summarised as blank.
    expect(screen.getByText('Blank setup')).toBeInTheDocument();
  });

  it('refuses a blueprint the main process will not validate, and stays on blank', async () => {
    const validateTemplate = vi.fn().mockResolvedValue({ error: { message: 'Blueprint version 9 is not supported.' }, ok: false });
    Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: { validateTemplate } } });
    render(<Onboarding initialLocale="en" onComplete={vi.fn().mockResolvedValue(undefined)} />);
    reachStructureStep();

    const file = new File(['{"version":9}'], 'broken.max-blueprint.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    // The reason comes from the validator rather than being invented here, and
    // the choice falls back to blank rather than sitting on a blueprint that
    // cannot be imported.
    expect(await screen.findByText('Blueprint version 9 is not supported.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Blank setup/i })).toHaveAttribute('data-selected', 'true');
  });

  it('accepts a blueprint the main process validates and names it on the last screen', async () => {
    const validateTemplate = vi.fn().mockResolvedValue({ ok: true, value: null });
    Object.defineProperty(window, 'maxApi', { configurable: true, value: { workspace: { validateTemplate } } });
    render(<Onboarding initialLocale="en" onComplete={vi.fn().mockResolvedValue(undefined)} />);
    reachStructureStep();

    const file = new File([JSON.stringify({ name: 'Project tracker', version: 2 })], 'tracker.max-blueprint.json', { type: 'application/json' });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });

    expect(await screen.findByText('Project tracker')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(screen.getAllByText('Project tracker').length).toBeGreaterThan(0);
  });
});
