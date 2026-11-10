import { describe, it, expect, afterEach } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { i18nStore, t } from '@/i18n';
import { I18nProvider } from './I18nContext';
import { StoreRerender } from './StoreRerender';

afterEach(() => { cleanup(); act(() => i18nStore.set('en')); });

let mounts = 0;
/** Reads the store directly, like every screen does. */
function Title() {
  useEffect(() => { mounts += 1; }, []);
  return <span data-testid="title">{t('settings.title')}</span>;
}

describe('a language change', () => {
  it('reaches a component that reads t() directly, without remounting it', () => {
    act(() => i18nStore.set('en'));
    mounts = 0;
    render(<StoreRerender render={() => <I18nProvider><Title /></I18nProvider>} />);
    expect(screen.getByTestId('title')).toHaveTextContent('Settings');

    act(() => i18nStore.set('ru'));
    expect(screen.getByTestId('title')).toHaveTextContent('Настройки');
    act(() => i18nStore.set('uz'));
    expect(screen.getByTestId('title')).toHaveTextContent('Sozlamalar');
    expect(mounts).toBe(1);
  });

  it('(the bug) a provider alone does not re-render children it was handed', () => {
    act(() => i18nStore.set('en'));
    render(<I18nProvider><Title /></I18nProvider>);
    act(() => i18nStore.set('ru'));
    expect(screen.getByTestId('title')).toHaveTextContent('Settings');
  });
});
