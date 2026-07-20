import { useEffect, useState } from 'react';
import * as ort from 'onnxruntime-web';
import sampleImageUrl from '../assets/hero.png';
import { runDetector } from '../ai/detector/Detector';
import { convertXYWHToXYXY } from '../ai/postprocess/BoxConverter';
import { decode } from '../ai/postprocess/Decoder';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';

interface BoxConverterDebugState {
  rawDetections: ReturnType<typeof decode>['detections'];
  boxDetections: ReturnType<typeof convertXYWHToXYXY>;
}

/**
 * A standalone visual comparison of raw center/size detections and their
 * converted corner-coordinate boxes. No filtering, scaling, or NMS is applied.
 */
export function BoxConverterTest(): React.JSX.Element {
  const [state, setState] = useState<BoxConverterDebugState>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isMounted = true;
    const image = new Image();

    image.onload = () => {
      void (async () => {
        try {
          const letterboxed = letterbox(image, image.naturalWidth, image.naturalHeight);
          const input = preprocess(letterboxed);
          const session = await ort.InferenceSession.create('/best.onnx', {
            executionProviders: ['wasm'],
          });
          const output = await runDetector(session, input);
          const decoded = decode(output);
          const boxDetections = convertXYWHToXYXY(decoded.detections);

          if (isMounted) {
            setState({ rawDetections: decoded.detections, boxDetections });
          }
        } catch (caught) {
          if (isMounted) {
            setError(caught instanceof Error ? caught.message : 'The box converter test failed.');
          }
        }
      })();
    };

    image.onerror = () => {
      if (isMounted) {
        setError('The box converter sample image could not be loaded.');
      }
    };

    image.src = sampleImageUrl;

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 1400, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Box conversion verification</h1>
      <p>This page converts center/size boxes to corner coordinates only. It does not clip, scale, or apply NMS.</p>

      {error !== undefined && <p role="alert">{error}</p>}

      {state !== undefined && (
        <section style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
          <div>
            <h2>Before Conversion (first 20 RawDetection)</h2>
            <pre style={{ background: '#f3f4f6', overflowX: 'auto', padding: 12 }}>
              {JSON.stringify(state.rawDetections.slice(0, 20), null, 2)}
            </pre>
          </div>
          <div>
            <h2>After Conversion (first 20 BoxDetection)</h2>
            <pre style={{ background: '#f3f4f6', overflowX: 'auto', padding: 12 }}>
              {JSON.stringify(state.boxDetections.slice(0, 20), null, 2)}
            </pre>
          </div>
        </section>
      )}
    </main>
  );
}
