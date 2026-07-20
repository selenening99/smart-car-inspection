import { createOverlayState } from '../guide/GuideOverlay';

const IMAGE_WIDTH = 640;
const IMAGE_HEIGHT = 480;
const overlay = createOverlayState(IMAGE_WIDTH, IMAGE_HEIGHT);

/** A fixed-coordinate SVG inspection page for guide-frame geometry only. */
export function GuideOverlayTest(): React.JSX.Element {
  return (
    <main style={{ color: '#111827', fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 900, padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Guide overlay verification</h1>
      <p>This SVG shows only computed guide geometry; no AI or camera is used.</p>

      <svg
        aria-label="Guide overlay geometry"
        style={{ background: '#111827', display: 'block', height: 'auto', maxWidth: '100%' }}
        viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
      >
        <rect
          fill="none"
          height={overlay.frameHeight}
          stroke="#22c55e"
          strokeWidth="4"
          width={overlay.frameWidth}
          x={overlay.frameLeft}
          y={overlay.frameTop}
        />
        <line
          stroke="#facc15"
          strokeDasharray="10 8"
          strokeWidth="2"
          x1={overlay.centerX}
          x2={overlay.centerX}
          y1="0"
          y2={IMAGE_HEIGHT}
        />
        <line
          stroke="#facc15"
          strokeDasharray="10 8"
          strokeWidth="2"
          x1="0"
          x2={IMAGE_WIDTH}
          y1={overlay.centerY}
          y2={overlay.centerY}
        />
      </svg>

      <dl style={{ display: 'grid', gap: 8, gridTemplateColumns: 'max-content max-content', marginTop: 24 }}>
        <dt>Frame Width</dt><dd>{overlay.frameWidth}</dd>
        <dt>Frame Height</dt><dd>{overlay.frameHeight}</dd>
        <dt>Center X</dt><dd>{overlay.centerX}</dd>
        <dt>Center Y</dt><dd>{overlay.centerY}</dd>
      </dl>
    </main>
  );
}
