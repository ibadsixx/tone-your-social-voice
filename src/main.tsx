import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

window.addEventListener('error', (event) => {
  console.error('[Global error]', event.error?.message || event.message, event.error?.stack || '');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled promise rejection]', event.reason?.message || event.reason, event.reason?.stack || '');
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
