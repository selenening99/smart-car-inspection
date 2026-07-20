import { useContext } from 'react';
import { GuidedCaptureContext, type GuidedCaptureContextValue } from '../context/GuidedCaptureContext';

export function useGuidedCapture(): GuidedCaptureContextValue {
  const context = useContext(GuidedCaptureContext);

  if (context === undefined) {
    throw new Error('useGuidedCapture must be used within GuidedCaptureProvider.');
  }

  return context;
}
