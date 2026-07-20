export const IMAGE_SIZE = 640;

export interface BgrImage {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export type LetterboxResult = readonly [
  image: BgrImage,
  scale: number,
  pad: readonly [padLeft: number, padTop: number],
];

function round(value: number): number {
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

function resizeInterLinear(image: BgrImage, width: number, height: number): BgrImage {
  const resized = new Uint8ClampedArray(width * height * 3);
  const xScale = image.width / width;
  const yScale = image.height / height;

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(Math.max((y + 0.5) * yScale - 0.5, 0), image.height - 1);
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(image.height - 1, y0 + 1);
    const yWeight = sourceY - y0;

    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(Math.max((x + 0.5) * xScale - 0.5, 0), image.width - 1);
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(image.width - 1, x0 + 1);
      const xWeight = sourceX - x0;

      for (let channel = 0; channel < 3; channel += 1) {
        const topLeft = image.data[(y0 * image.width + x0) * 3 + channel];
        const topRight = image.data[(y0 * image.width + x1) * 3 + channel];
        const bottomLeft = image.data[(y1 * image.width + x0) * 3 + channel];
        const bottomRight = image.data[(y1 * image.width + x1) * 3 + channel];
        const top = topLeft + (topRight - topLeft) * xWeight;
        const bottom = bottomLeft + (bottomRight - bottomLeft) * xWeight;

        resized[(y * width + x) * 3 + channel] = round(top + (bottom - top) * yWeight);
      }
    }
  }

  return { data: resized, width, height };
}

function copyMakeBorder(
  image: BgrImage,
  top: number,
  bottom: number,
  left: number,
  right: number,
): BgrImage {
  const width = image.width + left + right;
  const height = image.height + top + bottom;
  const bordered = new Uint8ClampedArray(width * height * 3);

  for (let index = 0; index < bordered.length; index += 3) {
    bordered[index] = 114;
    bordered[index + 1] = 114;
    bordered[index + 2] = 114;
  }

  for (let y = 0; y < image.height; y += 1) {
    const sourceOffset = y * image.width * 3;
    const destinationOffset = ((y + top) * width + left) * 3;
    bordered.set(image.data.subarray(sourceOffset, sourceOffset + image.width * 3), destinationOffset);
  }

  return { data: bordered, width, height };
}

export function letterbox(image: BgrImage, newShape: number = IMAGE_SIZE): LetterboxResult {
  const { height, width } = image;
  const scale = Math.min(newShape / height, newShape / width);

  const resizedWidth = round(width * scale);
  const resizedHeight = round(height * scale);
  const padWidth = newShape - resizedWidth;
  const padHeight = newShape - resizedHeight;

  const padLeft = padWidth / 2;
  const padTop = padHeight / 2;

  if (width !== resizedWidth || height !== resizedHeight) {
    image = resizeInterLinear(image, resizedWidth, resizedHeight);
  }

  const top = round(padTop - 0.1);
  const bottom = round(padTop + 0.1);
  const left = round(padLeft - 0.1);
  const right = round(padLeft + 0.1);

  image = copyMakeBorder(image, top, bottom, left, right);

  return [image, scale, [padLeft, padTop]];
}
