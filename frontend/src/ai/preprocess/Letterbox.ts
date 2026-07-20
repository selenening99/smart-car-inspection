/** The browser canvas and geometry produced by the Python `letterbox()` equivalent. */
export interface LetterboxResult {
  canvas: HTMLCanvasElement;
  scale: number;
  padX: number;
  padY: number;
}

/** Values reported by the manually callable letterbox dimensional self-test. */
export interface LetterboxSelfTestResult {
  originalWidth: number;
  originalHeight: number;
  resizedWidth: number;
  resizedHeight: number;
  scale: number;
  padX: number;
  padY: number;
}

/**
 * Python's built-in `round()` uses ties-to-even rounding, while `Math.round()`
 * does not. This preserves the rounding used by `verify_export.py` for resized
 * dimensions and for the asymmetric one-pixel padding split.
 */
function pythonRound(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;

  if (fraction < 0.5) {
    return floor;
  }

  if (fraction > 0.5) {
    return floor + 1;
  }

  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Resize a browser image with linear interpolation and add a constant border.
 *
 * This is a line-by-line translation of `letterbox()` in
 * `ai/scripts/verify_export.py`. It deliberately performs no colour conversion,
 * normalization, or tensor creation. Browser canvas pixels are already RGB, so
 * the Python constant border `(114, 114, 114)` is RGB(114, 114, 114) here.
 */
export function letterbox(
  image: CanvasImageSource,
  originalWidth: number,
  originalHeight: number,
  newShape: number = 640,
): LetterboxResult {
  // height, width = image.shape[:2]
  const height = originalHeight;
  const width = originalWidth;

  // scale = min(new_shape / height, new_shape / width)
  const scale = Math.min(newShape / height, newShape / width);

  // resized_width = round(width * scale)
  const resizedWidth = pythonRound(width * scale);

  // resized_height = round(height * scale)
  const resizedHeight = pythonRound(height * scale);

  // pad_width = new_shape - resized_width
  const padWidth = newShape - resizedWidth;

  // pad_height = new_shape - resized_height
  const padHeight = newShape - resizedHeight;

  // pad_left = pad_width / 2
  const padLeft = padWidth / 2;

  // pad_top = pad_height / 2
  const padTop = padHeight / 2;

  // if (width, height) != (resized_width, resized_height): cv2.resize(..., INTER_LINEAR)
  let resizedImage: CanvasImageSource = image;
  if (width !== resizedWidth || height !== resizedHeight) {
    const resizeCanvas = document.createElement('canvas');
    resizeCanvas.width = resizedWidth;
    resizeCanvas.height = resizedHeight;

    const resizeContext = resizeCanvas.getContext('2d');
    if (resizeContext === null) {
      throw new Error('Could not create a 2D canvas context for letterbox resizing.');
    }

    // Canvas image smoothing is the browser equivalent of cv2.INTER_LINEAR.
    resizeContext.imageSmoothingEnabled = true;
    resizeContext.drawImage(image, 0, 0, width, height, 0, 0, resizedWidth, resizedHeight);
    resizedImage = resizeCanvas;
  }

  // top = round(pad_top - 0.1)
  const top = pythonRound(padTop - 0.1);

  // bottom = round(pad_top + 0.1)
  const bottom = pythonRound(padTop + 0.1);

  // left = round(pad_left - 0.1)
  const left = pythonRound(padLeft - 0.1);

  // right = round(pad_left + 0.1)
  const right = pythonRound(padLeft + 0.1);

  // cv2.copyMakeBorder(..., BORDER_CONSTANT, value=(114, 114, 114))
  const canvas = document.createElement('canvas');
  canvas.width = left + resizedWidth + right;
  canvas.height = top + resizedHeight + bottom;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Could not create a 2D canvas context for letterbox padding.');
  }

  // Fill the entire output first so every border pixel is RGB(114, 114, 114).
  context.fillStyle = 'rgb(114, 114, 114)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(resizedImage, left, top, resizedWidth, resizedHeight);

  // return image, scale, (pad_left, pad_top)
  return { canvas, scale, padX: padLeft, padY: padTop };
}

/**
 * Runs a fixed 1280 × 720 input through `letterbox()` and verifies every
 * requested dimension and geometry value. Call this manually in a browser,
 * for example from a development console.
 */
export function runLetterboxSelfTest(): LetterboxSelfTestResult {
  const originalWidth = 1280;
  const originalHeight = 720;
  const source = document.createElement('canvas');
  source.width = originalWidth;
  source.height = originalHeight;

  const result = letterbox(source, originalWidth, originalHeight);
  const resizedWidth = pythonRound(originalWidth * result.scale);
  const resizedHeight = pythonRound(originalHeight * result.scale);
  const expectedScale = 0.5;
  const expectedPadX = 0;
  const expectedPadY = 140;

  if (
    source.width !== originalWidth ||
    source.height !== originalHeight ||
    resizedWidth !== 640 ||
    resizedHeight !== 360 ||
    result.scale !== expectedScale ||
    result.padX !== expectedPadX ||
    result.padY !== expectedPadY
  ) {
    throw new Error('Letterbox self-test failed.');
  }

  return {
    originalWidth,
    originalHeight,
    resizedWidth,
    resizedHeight,
    scale: result.scale,
    padX: result.padX,
    padY: result.padY,
  };
}
