import { useEffect, useState } from 'react';
import CalibrationPage from './pages/CalibrationPage';
import CameraTestPage from './pages/CameraTestPage';

function currentMode(): 'camera' | 'calibration' {
  return window.location.hash === '#calibration' ? 'calibration' : 'camera';
}

export default function App() {
  const [mode, setMode] = useState(currentMode);

  useEffect(() => {
    const handleHashChange = (): void => setMode(currentMode());
    window.addEventListener('hashchange', handleHashChange);

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return mode === 'calibration' ? <CalibrationPage /> : <CameraTestPage />;
}
