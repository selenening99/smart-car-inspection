import { useEffect, useState } from 'react';
import * as ort from 'onnxruntime-web';
import sampleImageUrl from '../assets/hero.png';
import { runDetector } from '../ai/detector/Detector';
import { decode } from '../ai/postprocess/Decoder';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';

interface DecoderDebugState {
  decoded: ReturnType<typeof decode>;
}

/**
 * A standalone display of the decoder's raw xywh/class-score extraction.
 * It deliberately omits confidence filtering, box conversion, and NMS.
 */
export function DecoderTest(): React.JSX.Element {
  const [state, setState] = useState<DecoderDebugState>();
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

          if (isMounted) {
            setState({ decoded });
          }
        } catch (caught) {
          if (isMounted) {
            setError(caught instanceof Error ? caught.message : 'The decoder test failed.');
          }
        }
      })();
    };

    image.onerror = () => {
      if (isMounted) {
        setError('The decoder sample image could not be loaded.');
      }
    };

    image.src = sampleImageUrl;

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 1100, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Decoder verification</h1>
      <p>This page displays raw xywh/class-score decoding only. No filtering, box conversion, or NMS is applied.</p>

      {error !== undefined && <p role="alert">{error}</p>}

      {state !== undefined && (
        <section aria-label="Decoded raw detections">
          <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content max-content' }}>
            <dt>Output Shape</dt><dd>[{state.decoded.outputShape.join(', ')}]</dd>
            <dt>Decoded Count</dt><dd>{state.decoded.detections.length}</dd>
          </dl>
          <h2>First 20 detections</h2>
          <pre style={{ background: '#f3f4f6', overflowX: 'auto', padding: 12 }}>
            {JSON.stringify(state.decoded.detections.slice(0, 20), null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
