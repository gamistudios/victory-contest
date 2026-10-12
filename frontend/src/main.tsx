import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installDevTelegramMock } from './lib/devTelegramMock';

// Outside Telegram there is no WebApp user, so dev builds fake one and the app
// runs in a plain browser by default. Opt out with VITE_MOCK_TELEGRAM=false.
if (import.meta.env.DEV && import.meta.env.VITE_MOCK_TELEGRAM !== "false") {
  installDevTelegramMock();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="The app">
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
