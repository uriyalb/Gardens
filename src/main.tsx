import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Small debugging/automation hook (read-only use in tests and console).
import { useProject } from './store/projectStore';
import { useUI } from './store/uiStore';
import { generatedPlants } from './render/scene';
(window as unknown as { avs: unknown }).avs = { useProject, useUI, generatedPlants };
