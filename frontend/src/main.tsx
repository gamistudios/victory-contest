import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installDevTelegramMock } from './lib/devTelegramMock';

if (import.meta.env.DEV && import.meta.env.VITE_MOCK_TELEGRAM === "true") {
  installDevTelegramMock();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
