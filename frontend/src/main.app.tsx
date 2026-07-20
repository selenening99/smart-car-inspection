import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import GuidedCaptureFlow from './features/guided-capture/GuidedCaptureFlow';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GuidedCaptureFlow routeMode="memory" />
  </StrictMode>,
);
