import { useEffect, useState } from 'react';
import * as ort from 'onnxruntime-web';
import sampleImageUrl from '../assets/hero.png';
import { runDetector } from '../ai/detector/Detector';
import { convertXYWHToXYXY } from '../ai/postprocess/BoxConverter';
import { filterByConfidence } from '../ai/postprocess/ConfidenceFilter';
import { recoverOriginalCoordinates } from '../ai/postprocess/CoordinateMapper';
import { decode } from '../ai/postprocess/Decoder';
import { classWiseNMS } from '../ai/postprocess/NMS';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';

interface CoordinateMapperDebugState {
  scale: number;
  padX: number;
  padY: number;
  originalWidth: number;
  originalHeight: number;
  beforeRecovery: ReturnType<typeof classWiseNMS>;
  afterRecovery: ReturnType<typeof recoverOriginalCoordinates>;
}

const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;

/**
 * A standalone inspection page for inverse letterbox coordinate recovery. The
 * input boxes are confidence-filtered and NMS-selected before mapping only.
 */
export function CoordinateMapperTest(): React.JSX.Element {
  const [state, setState] = useState<CoordinateMapperDebugState>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isMounted = true;
    const image = new Image();

    image.onload = () => {
      void (async () => {
        try {
          const letterboxed = letterbox(image, image.naturalWidth, image.naturalHeight);
          const input = preprocess(letterboxed);
          const session = await ort.InferenceSession.create(`${import.meta.env.BASE_URL}best.onnx`, {
            executionProviders: ['wasm'],
          });
          const output = await runDetector(session, input);
          const decoded = decode(output);
          const confidenceFiltered = filterByConfidence(decoded.detections, CONFIDENCE_THRESHOLD);
          const converted = convertXYWHToXYXY(confidenceFiltered);
          const beforeRecovery = classWiseNMS(converted, IOU_THRESHOLD);
          const afterRecovery = recoverOriginalCoordinates(
            beforeRecovery,
            letterboxed.scale,
            letterboxed.padX,
            letterboxed.padY,
            { width: image.naturalWidth, height: image.naturalHeight },
          );

          if (isMounted) {
            setState({
              scale: letterboxed.scale,
              padX: letterboxed.padX,
              padY: letterboxed.padY,
              originalWidth: image.naturalWidth,
              originalHeight: image.naturalHeight,
              beforeRecovery,
              afterRecovery,
            });
          }
        } catch (caught) {
          if (isMounted) {
            setError(caught instanceof Error ? caught.message : 'The coordinate mapper test failed.');
          }
        }
      })();
    };

    image.onerror = () => {
      if (isMounted) {
        setError('The coordinate mapper sample image could not be loaded.');
      }
    };

    image.src = sampleImageUrl;

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 1400, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Coordinate recovery verification</h1>
      <p>This page reverses only letterbox padding and scale, then clips boxes to the original image bounds.</p>

      {error !== undefined && <p role="alert">{error}</p>}

      {state !== undefined && (
        <>
          <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content max-content' }}>
            <dt>Scale</dt><dd>{state.scale}</dd>
            <dt>PadX</dt><dd>{state.padX}</dd>
            <dt>PadY</dt><dd>{state.padY}</dd>
            <dt>Original Image Size</dt><dd>{state.originalWidth} × {state.originalHeight}</dd>
          </dl>
          <section style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', marginTop: 24 }}>
            <div>
              <h2>First 20 boxes before recovery</h2>
              <pre style={{ background: '#f3f4f6', overflowX: 'auto', padding: 12 }}>
                {JSON.stringify(state.beforeRecovery.slice(0, 20), null, 2)}
              </pre>
            </div>
            <div>
              <h2>First 20 boxes after recovery</h2>
              <pre style={{ background: '#f3f4f6', overflowX: 'auto', padding: 12 }}>
                {JSON.stringify(state.afterRecovery.slice(0, 20), null, 2)}
              </pre>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
