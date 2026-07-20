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
import CalibrationPage from './pages/CalibrationPage';
import CameraPage from './pages/CameraPage';
import CameraTestPage from './pages/CameraTestPage';
import InspectionCamera from './pages/InspectionCamera';
import './App.css';

type AppRoute =
  | 'dev'
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

interface DeveloperLink {
  href: string;
  title: string;
  description: string;
}

const engineeringLinks: readonly DeveloperLink[] = [
  {
    href: '#camera-test',
    title: 'Camera Test',
    description: 'Production-style AI camera validation page.',
  },
  {
    href: '#calibration',
    title: 'Calibration',
    description: 'Internal calibration capture and layout generation page.',
  },
  {
    href: '#inspection-camera',
    title: 'Inspection Camera',
    description: 'Engineering integration page for inspection workflow testing.',
  },
  {
    href: '#debug',
    title: 'Debug',
    description: 'Module-level AI pipeline and guidance debug tools.',
  },
];

const debugLinks: readonly DeveloperLink[] = [
  {
    href: '#debug-letterbox',
    title: 'Letterbox',
    description: 'Verify resize and padding behavior.',
  },
  {
    href: '#debug-preprocess',
    title: 'Preprocess',
    description: 'Inspect tensor creation and normalization.',
  },
  {
    href: '#debug-detector',
    title: 'Detector',
    description: 'Inspect raw ONNX output.',
  },
  {
    href: '#debug-decoder',
    title: 'Decoder',
    description: 'Inspect decoded raw detections.',
  },
  {
    href: '#debug-confidence-filter',
    title: 'Confidence Filter',
    description: 'Verify confidence filtering.',
  },
  {
    href: '#debug-box-converter',
    title: 'Box Converter',
    description: 'Verify xywh to xyxy conversion.',
  },
  {
    href: '#debug-nms',
    title: 'NMS',
    description: 'Verify class-wise non-maximum suppression.',
  },
  {
    href: '#debug-coordinate-mapper',
    title: 'Coordinate Mapper',
    description: 'Verify recovered original-image coordinates.',
  },
  {
    href: '#debug-guidance-engine',
    title: 'Guidance Engine',
    description: 'Inspect guidance state and scores.',
  },
  {
    href: '#debug-guide-overlay',
    title: 'Guide Overlay',
    description: 'Inspect guide geometry.',
  },
  {
    href: '#debug-calibration-tool',
    title: 'Calibration Tool',
    description: 'Internal single-image calibration tool.',
  },
  {
    href: '#debug-dataset-calibration',
    title: 'Dataset Calibration',
    description: 'Dataset calibration prototype.',
  },
  {
    href: '#debug-dataset-calibration-v2',
    title: 'Dataset Calibration V2',
    description: 'Vehicle-specific dataset calibration prototype.',
  },
];

function currentRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, '');

  if (hash === 'dev') {
    return 'dev';
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

  if (hash === 'debug') {
    return 'debug';
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

  return 'dev';
}

function DeveloperMenu({
  title,
  subtitle,
  links,
}: {
  title: string;
  subtitle: string;
  links: readonly DeveloperLink[];
}): JSX.Element {
  return (
    <main className="developer-menu">
      <section className="developer-menu__panel">
        <header className="developer-menu__header">
          <p className="developer-menu__eyebrow">Developer Mode</p>
          <h1 className="developer-menu__title">{title}</h1>
          <p className="developer-menu__subtitle">{subtitle}</p>
        </header>

        <div className="developer-menu__grid">
          {links.map((link) => (
            <a className="developer-menu__card" href={link.href} key={link.href}>
              <span className="developer-menu__card-title">{link.title}</span>
              <span className="developer-menu__card-description">{link.description}</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
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

  return (
    <DeveloperMenu
      links={debugLinks}
      subtitle="Open a module-level test tool without changing the engineering workflow."
      title="Debug Tools"
    />
  );
}

function renderRoute(route: AppRoute): JSX.Element {
  if (route === 'dev') {
    return (
      <DeveloperMenu
        links={engineeringLinks}
        subtitle="Engineering pages for camera, calibration, inspection, and module debugging."
        title="Engineering Pages"
      />
    );
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

  return (
    <DeveloperMenu
      links={engineeringLinks}
      subtitle="Engineering pages for camera, calibration, inspection, and module debugging."
      title="Engineering Pages"
    />
  );
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
