// Polyfills must run before any app module: they patch APIs the bundle
// calls without feature checks on older mobile browsers.
import "./polyfills";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initPwaInstall, initPwaUpdate } from "./lib/pwa";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { AppThemeProvider } from "./components/ThemeProviders";
import "./index.css";
initPwaInstall();
initPwaUpdate();
const queryClient = new QueryClient();
const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <ErrorBoundary label="The admin app">
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider>
          <App />
        </AppThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
