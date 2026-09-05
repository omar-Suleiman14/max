// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollOutline } from './scroll-outline';
import { findContentSections } from './scroll-sections';

describe('ScrollOutline & findContentSections', () => {
  let containerEl: HTMLDivElement;

  beforeEach(() => {
    containerEl = document.createElement('div');
    containerEl.id = 'main-content';
    document.body.appendChild(containerEl);
  });

  afterEach(() => {
    cleanup();
    containerEl.remove();
    vi.restoreAllMocks();
  });

  it('discovers the exact number of sections on a structured Notion page', () => {
    containerEl.innerHTML = `
      <div class="notion-editor-canvas">
        <div class="notion-block-row" data-scroll-kind="callout">
          <p>Welcome to Max</p>
        </div>
        <div class="notion-block-row" data-scroll-kind="divider"></div>
        <div class="notion-block-row" data-scroll-kind="h1">
          <h2>Main Chapter 1</h2>
        </div>
        <div class="notion-block-row" data-scroll-kind="text">
          <p>Some paragraph text here that should not be a separate section.</p>
        </div>
        <div class="notion-block-row" data-scroll-kind="bullet">
          <p>Bullet item 1</p>
        </div>
        <div class="notion-block-row" data-scroll-kind="h2">
          <h3>Sub-chapter 1.1</h3>
        </div>
        <div class="notion-block-row" data-scroll-kind="database-view" data-scroll-label="Sales Database">
          <div>Embedded Table</div>
        </div>
        <div class="notion-block-row" data-scroll-kind="h2">
          <h3>Conclusion</h3>
        </div>
      </div>
    `;

    const sections = findContentSections(containerEl, 'en');
    // Callout (1) + H1 (1) + H2 (1) + Database View (1) + H2 (1) = 5 sections
    expect(sections).toHaveLength(5);
    expect(sections[0]?.title).toBe('Welcome to Max');
    expect(sections[1]?.title).toBe('Main Chapter 1');
    expect(sections[2]?.title).toBe('Sub-chapter 1.1');
    expect(sections[3]?.title).toBe('Sales Database');
    expect(sections[4]?.title).toBe('Conclusion');
  });

  it('discovers exactly 5 sections on Settings page', () => {
    containerEl.innerHTML = `
      <div class="settings-page">
        <section class="settings-scroll-section" data-scroll-label="General">
          <h2>General Settings</h2>
        </section>
        <section class="settings-scroll-section" data-scroll-label="Pricing">
          <h2>Pricing Configuration</h2>
        </section>
        <section class="settings-scroll-section" data-scroll-label="Appearance">
          <h2>Appearance</h2>
        </section>
        <section class="settings-scroll-section" data-scroll-label="Backup">
          <h2>Data & Backup</h2>
        </section>
        <section class="settings-scroll-section" data-scroll-label="Archive">
          <h2>Trash & Workspace</h2>
        </section>
      </div>
    `;

    const sections = findContentSections(containerEl, 'en');
    expect(sections).toHaveLength(5);
    expect(sections.map((s) => s.title)).toEqual([
      'General',
      'Pricing',
      'Appearance',
      'Backup',
      'Archive',
    ]);
  });

  it('dynamically renders the exact number of marks based on page sections and supports navigation', async () => {
    const user = userEvent.setup();

    containerEl.innerHTML = `
      <div class="notion-editor-canvas">
        <div class="notion-block-row" data-scroll-kind="h1">
          <h2>Overview</h2>
        </div>
        <div class="notion-block-row" data-scroll-kind="h2">
          <h3>Methodology</h3>
        </div>
        <div class="notion-block-row" data-scroll-kind="h2">
          <h3>Results</h3>
        </div>
        <div class="notion-block-row" data-scroll-kind="h2">
          <h3>Next Steps</h3>
        </div>
      </div>
    `;

    const scrollIntoViewMocks: ReturnType<typeof vi.fn>[] = [];
    containerEl.querySelectorAll('.notion-block-row').forEach((el) => {
      const mock = vi.fn();
      el.scrollIntoView = mock;
      scrollIntoViewMocks.push(mock);
    });

    render(<ScrollOutline locale="en" pageKey="custom-page-1" />);

    // Wait for the animation frame collection
    const marks = await screen.findAllByRole('button');
    expect(marks).toHaveLength(4);
    expect(marks[0]).toHaveAttribute('aria-label', 'Overview');
    expect(marks[1]).toHaveAttribute('aria-label', 'Methodology');
    expect(marks[2]).toHaveAttribute('aria-label', 'Results');
    expect(marks[3]).toHaveAttribute('aria-label', 'Next Steps');

    // Click on the 3rd mark (Results)
    const thirdMark = marks[2];
    expect(thirdMark).toBeDefined();
    if (thirdMark) {
      await user.click(thirdMark);
    }
    expect(scrollIntoViewMocks[2]).toHaveBeenCalled();
  });

  it('renders localized labels in Arabic RTL', async () => {
    containerEl.innerHTML = `
      <div class="settings-page">
        <section class="settings-scroll-section" data-scroll-label="عام">
          <h2>إعدادات عامة</h2>
        </section>
        <section class="settings-scroll-section" data-scroll-label="التسعير">
          <h2>ملف التسعير</h2>
        </section>
      </div>
    `;

    render(<ScrollOutline locale="ar" pageKey="settings" />);

    const marks = await screen.findAllByRole('button');
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveAttribute('aria-label', 'عام');
    expect(marks[1]).toHaveAttribute('aria-label', 'التسعير');

    const nav = screen.getByRole('navigation', { name: 'موضع القراءة وأقسام الصفحة' });
    expect(nav).toBeInTheDocument();
  });
});
