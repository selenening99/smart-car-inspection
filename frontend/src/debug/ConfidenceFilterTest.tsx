import { useEffect, useState } from 'react';
import * as ort from 'onnxruntime-web';
import sampleImageUrl from '../assets/hero.png';
import { runDetector } from '../ai/detector/Detector';
import { filterByConfidence } from '../ai/postprocess/ConfidenceFilter';
import type { RawDetection } from '../ai/postprocess/Decoder';
import { decode } from '../ai/postprocess/Decoder';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';

interface ConfidenceFilterDebugState {
  beforeFilter: number;
  remaining: RawDetection[];
}

const THRESHOLD = 0.25;

/**
 * A standalone verification page for confidence filtering only. It displays
 * decoded raw detections before and after the threshold, without NMS or box
 * coordinate transformations.
 */
export function ConfidenceFilterTest(): React.JSX.Element {
  const [state, setState] = useState<ConfidenceFilterDebugState>();
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
          const remaining = filterByConfidence(decoded.detections, THRESHOLD);

          if (isMounted) {
            setState({ beforeFilter: decoded.detections.length, remaining });
          }
        } catch (caught) {
          if (isMounted) {
            setError(caught instanceof Error ? caught.message : 'The confidence filter test failed.');
          }
        }
      })();
    };

    image.onerror = () => {
      if (isMounted) {
        setError('The confidence filter sample image could not be loaded.');
      }
    };

    image.src = sampleImageUrl;

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 1100, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Confidence filter verification</h1>
      <p>This page applies only a confidence threshold. It does not convert boxes, filter classes, or run NMS.</p>

      {error !== undefined && <p role="alert">{error}</p>}

      {state !== undefined && (
        <section aria-label="Confidence filter results">
          <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content max-content' }}>
            <dt>Before Filter</dt><dd>{state.beforeFilter}</dd>
            <dt>After Filter</dt><dd>{state.remaining.length}</dd>
            <dt>Removed Count</dt><dd>{state.beforeFilter - state.remaining.length}</dd>
            <dt>Threshold</dt><dd>{THRESHOLD}</dd>
          </dl>
          <h2>First 20 remaining detections</h2>
          <pre style={{ background: '#f3f4f6', overflowX: 'auto', padding: 12 }}>
            {JSON.stringify(state.remaining.slice(0, 20), null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
