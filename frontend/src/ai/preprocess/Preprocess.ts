import * as ort from 'onnxruntime-web';
import type { LetterboxResult } from './Letterbox';

/**
 * Converts a letterboxed browser canvas into the exact input tensor layout used
 * by `preprocess_for_onnx()` in `ai/scripts/verify_export.py`.
 *
 * This function stops after tensor creation. It does not load a model or run
 * inference.
 */
export function preprocess(letterboxed: LetterboxResult): ort.Tensor {
  const { canvas } = letterboxed;
  const width = canvas.width;
  const height = canvas.height;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Could not create a 2D canvas context for preprocessing.');
  }

  // Python: image_rgb = cv2.cvtColor(letterboxed, cv2.COLOR_BGR2RGB)
  // Canvas ImageData is exposed as RGBA, whose first three values are already
  // RGB. Copying those three values discards only the browser-only alpha channel.
  const rgba = context.getImageData(0, 0, width, height).data;
  const imageRgb = new Uint8ClampedArray(width * height * 3);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const rgbaOffset = pixel * 4;
    const rgbOffset = pixel * 3;
    imageRgb[rgbOffset] = rgba[rgbaOffset];
    imageRgb[rgbOffset + 1] = rgba[rgbaOffset + 1];
    imageRgb[rgbOffset + 2] = rgba[rgbaOffset + 2];
  }

  // Python: tensor = image_rgb.astype(np.float32)
  const float32Rgb = new Float32Array(imageRgb.length);
  for (let index = 0; index < imageRgb.length; index += 1) {
    float32Rgb[index] = imageRgb[index];
  }

  // Python: tensor = tensor / 255.0
  for (let index = 0; index < float32Rgb.length; index += 1) {
    float32Rgb[index] /= 255.0;
  }

  // Python: tensor = np.transpose(tensor, (2, 0, 1))[None]
  const chw = new Float32Array(3 * height * width);
  const channelSize = height * width;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const rgbOffset = pixel * 3;

      chw[pixel] = float32Rgb[rgbOffset];
      chw[channelSize + pixel] = float32Rgb[rgbOffset + 1];
      chw[channelSize * 2 + pixel] = float32Rgb[rgbOffset + 2];
    }
  }

  // Python's leading `[None]` dimension becomes batch size 1: [1, 3, H, W].
  return new ort.Tensor('float32', chw, [1, 3, height, width]);
}
