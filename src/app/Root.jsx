/* ════════════════════════════════════════════════════════════════
   Root — composition root. Wraps App in the Theme + i18n providers (the
   single re-render seams for the global stores) and renders it as a
   centred, tablet-width surface on the backdrop.

   The prototype's dev-only "Tweaks" panel / iPhone-frame toggle has been
   dropped — it was a design-tool harness, not part of the product.
   ════════════════════════════════════════════════════════════════ */

import { ThemeProvider } from '@/contexts/ThemeContext';
import { I18nProvider } from '@/contexts/I18nContext';
import { App } from './App';

export function Root() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%' }}>
          <div style={{ width: '100%', height: '100%', maxWidth: 1024, position: 'relative',
            boxShadow: '0 0 0 1px rgba(255,255,255,.04), 0 30px 90px rgba(0,0,0,.5)' }}>
            <App />
          </div>
        </div>
      </I18nProvider>
    </ThemeProvider>
  );
}
