import { useEffect, useState, type JSX } from 'react';
import { BoxConverterTest } from './debug/BoxConverterTest';
import { CalibrationTool } from './debug/CalibrationTool';
import { ConfidenceFilterTest } from './debug/ConfidenceFilterTest';
import { CoordinateMapperTest } from './debug/CoordinateMapperTest';
import { DatasetCalibration } from './debug/DatasetCalibration';
import { DatasetCalibrationV2 } from './debug/DatasetCalibrationV2';
import { DecoderTest } from './debug/DecoderTest';
import { DetectorTest } from './debug/DetectorTest';
import { GuidanceEngineTest } from './debug/GuidanceEngineTest';
import { GuideOverlayTest } from './debug/GuideOverlayTest';
import { LetterboxTest } from './debug/LetterboxTest';
import { NMSTest } from './debug/NMSTest';
import { PreprocessTest } from './debug/PreprocessTest';
import GuidedCaptureFlow from './features/guided-capture/GuidedCaptureFlow';
import CalibrationPage from './pages/CalibrationPage';
import CameraPage from './pages/CameraPage';
import CameraTestPage from './pages/CameraTestPage';
import InspectionCamera from './pages/InspectionCamera';
import './App.css';

type AppRoute =
  | 'production'
  | 'camera-test'
  | 'calibration'
  | 'inspection-camera'
  | 'legacy-camera'
  | 'debug'
  | 'debug-letterbox'
  | 'debug-preprocess'
  | 'debug-detector'
  | 'debug-decoder'
  | 'debug-confidence-filter'
  | 'debug-box-converter'
  | 'debug-nms'
  | 'debug-coordinate-mapper'
  | 'debug-guidance-engine'
  | 'debug-guide-overlay'
  | 'debug-calibration-tool'
  | 'debug-dataset-calibration'
  | 'debug-dataset-calibration-v2';

function currentRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, '');

  if (
    hash === 'app'
    || hash === 'app/capture'
    || hash === 'app/review'
    || hash === 'app/complete'
  ) {
    return 'production';
  }

  if (hash === 'camera' || hash === 'camera-test') {
    return 'camera-test';
  }

  if (hash === 'calibration') {
    return 'calibration';
  }

  if (hash === 'inspection-camera') {
    return 'inspection-camera';
  }

  if (hash === 'legacy-camera') {
    return 'legacy-camera';
  }

  if (
    hash === 'debug-letterbox'
    || hash === 'debug-preprocess'
    || hash === 'debug-detector'
    || hash === 'debug-decoder'
    || hash === 'debug-confidence-filter'
    || hash === 'debug-box-converter'
    || hash === 'debug-nms'
    || hash === 'debug-coordinate-mapper'
    || hash === 'debug-guidance-engine'
    || hash === 'debug-guide-overlay'
    || hash === 'debug-calibration-tool'
    || hash === 'debug-dataset-calibration'
    || hash === 'debug-dataset-calibration-v2'
  ) {
    return hash;
  }

  return 'production';
}

function renderDebugRoute(route: AppRoute): JSX.Element {
  if (route === 'debug-letterbox') {
    return <LetterboxTest />;
  }

  if (route === 'debug-preprocess') {
    return <PreprocessTest />;
  }

  if (route === 'debug-detector') {
    return <DetectorTest />;
  }

  if (route === 'debug-decoder') {
    return <DecoderTest />;
  }

  if (route === 'debug-confidence-filter') {
    return <ConfidenceFilterTest />;
  }

  if (route === 'debug-box-converter') {
    return <BoxConverterTest />;
  }

  if (route === 'debug-nms') {
    return <NMSTest />;
  }

  if (route === 'debug-coordinate-mapper') {
    return <CoordinateMapperTest />;
  }

  if (route === 'debug-guidance-engine') {
    return <GuidanceEngineTest />;
  }

  if (route === 'debug-guide-overlay') {
    return <GuideOverlayTest />;
  }

  if (route === 'debug-calibration-tool') {
    return <CalibrationTool />;
  }

  if (route === 'debug-dataset-calibration') {
    return <DatasetCalibration />;
  }

  if (route === 'debug-dataset-calibration-v2') {
    return <DatasetCalibrationV2 />;
  }

  return <GuidedCaptureFlow />;
}

function renderRoute(route: AppRoute): JSX.Element {
  if (route === 'production') {
    return <GuidedCaptureFlow />;
  }

  if (route === 'camera-test') {
    return <CameraTestPage />;
  }

  if (route === 'calibration') {
    return <CalibrationPage />;
  }

  if (route === 'inspection-camera') {
    return <InspectionCamera />;
  }

  if (route === 'legacy-camera') {
    return <CameraPage />;
  }

  if (route.startsWith('debug')) {
    return renderDebugRoute(route);
  }

  return <GuidedCaptureFlow />;
}

export default function App(): JSX.Element {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const handleRouteChange = (): void => {
      setRoute(currentRoute());
    };

    window.addEventListener('hashchange', handleRouteChange);

    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
    };
  }, []);

  return renderRoute(route);
}
