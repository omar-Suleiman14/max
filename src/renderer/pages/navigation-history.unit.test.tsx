// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNavigationHistory, NavigationHistory } from './navigation-history';

afterEach(cleanup);

describe('navigation history', () => {
  it('follows a link, goes back and forward, and drops the forward trail on a new visit', () => {
    const history = createNavigationHistory();
    history.visit('a');
    history.visit('b');
    expect(history.canGoBack()).toBe(true);
    expect(history.go(-1)).toBe('a');
    history.visit('a');
    expect(history.canGoForward()).toBe(true);
    expect(history.go(1)).toBe('b');
    history.visit('b');
    history.go(-1);
    history.visit('a');
    history.visit('c');
    expect(history.canGoForward()).toBe(false);
    expect(history.go(-1)).toBe('a');
    history.visit('a');
    expect(history.go(-1)).toBeUndefined();
  });

  it('opens the previous page from the Back button and the next one with Alt+Right', () => {
    const onNavigate = vi.fn();
    const { rerender } = render(<NavigationHistory locale="en" onNavigate={onNavigate} page="first" />);
    rerender(<NavigationHistory locale="en" onNavigate={onNavigate} page="second" />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onNavigate).toHaveBeenLastCalledWith('first');
    rerender(<NavigationHistory locale="en" onNavigate={onNavigate} page="first" />);
    fireEvent.keyDown(document, { altKey: true, key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenLastCalledWith('second');
  });
});
