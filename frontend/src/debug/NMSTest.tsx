import { useEffect, useState } from 'react';
import * as ort from 'onnxruntime-web';
import sampleImageUrl from '../assets/hero.png';
import { runDetector } from '../ai/detector/Detector';
import { convertXYWHToXYXY } from '../ai/postprocess/BoxConverter';
import { filterByConfidence } from '../ai/postprocess/ConfidenceFilter';
import { decode } from '../ai/postprocess/Decoder';
import { classWiseNMS } from '../ai/postprocess/NMS';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';

interface NmsDebugState {
  decodedCount: number;
  afterConfidenceFilter: number;
  afterNms: ReturnType<typeof classWiseNMS>;
}

const IOU_THRESHOLD = 0.45;
const CONFIDENCE_THRESHOLD = 0.25;

/**
 * A standalone comparison of decoded detections after confidence filtering and
 * class-wise NMS. It does not clip, scale, or recover box coordinates.
 */
export function NMSTest(): React.JSX.Element {
  const [state, setState] = useState<NmsDebugState>();
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
          const afterNms = classWiseNMS(converted, IOU_THRESHOLD);

          if (isMounted) {
            setState({
              decodedCount: decoded.detections.length,
              afterConfidenceFilter: confidenceFiltered.length,
              afterNms,
            });
          }
        } catch (caught) {
          if (isMounted) {
            setError(caught instanceof Error ? caught.message : 'The NMS test failed.');
          }
        }
      })();
    };

    image.onerror = () => {
      if (isMounted) {
        setError('The NMS sample image could not be loaded.');
      }
    };

    image.src = sampleImageUrl;

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 1100, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Class-wise NMS verification</h1>
      <p>This page runs confidence filtering, box conversion, and class-wise NMS. It does not clip, scale, or recover image coordinates.</p>

      {error !== undefined && <p role="alert">{error}</p>}

      {state !== undefined && (
        <section aria-label="NMS results">
          <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content max-content' }}>
            <dt>Decoded Count</dt><dd>{state.decodedCount}</dd>
            <dt>After Confidence Filter</dt><dd>{state.afterConfidenceFilter}</dd>
            <dt>After NMS</dt><dd>{state.afterNms.length}</dd>
            <dt>Removed by Confidence Filter</dt><dd>{state.decodedCount - state.afterConfidenceFilter}</dd>
            <dt>Removed by NMS</dt><dd>{state.afterConfidenceFilter - state.afterNms.length}</dd>
            <dt>IoU Threshold</dt><dd>{IOU_THRESHOLD}</dd>
            <dt>Confidence Threshold</dt><dd>{CONFIDENCE_THRESHOLD}</dd>
          </dl>
          <h2>First 20 remaining detections</h2>
          <pre style={{ background: '#f3f4f6', overflowX: 'auto', padding: 12 }}>
            {JSON.stringify(state.afterNms.slice(0, 20), null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
