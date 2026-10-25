import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import './styles/app.css';
import App from './App';
import { AuthGate } from './auth/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyTheme, getSettings } from './lib/settings';
import { LiveProvider } from './realtime/LiveProvider';
import { SyncProvider } from './sync/SyncProvider';

applyTheme(getSettings().theme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGate>
        <SyncProvider>
          <LiveProvider>
            <App />
          </LiveProvider>
        </SyncProvider>
      </AuthGate>
    </ErrorBoundary>
  </StrictMode>,
);
