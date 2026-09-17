import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './index.css';

// Phase 1 bootstrap. Registering the service worker, opening Dexie, loading the content
// package and folding the review log all land here in later tickets (what.md §7.1).
const container = document.getElementById('root');
if (!container) throw new Error('KL_BOOT_NO_ROOT');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
