import * as ort from "onnxruntime-web";

export function preprocess(canvas: HTMLCanvasElement): ort.Tensor {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Cannot get canvas context");
  }

  const size = 640;

  const imageData = ctx.getImageData(0, 0, size, size);

  const { data } = imageData;

  const float32Data = new Float32Array(3 * size * size);

  let r = 0;
  let g = size * size;
  let b = size * size * 2;

  for (let i = 0; i < data.length; i += 4) {
    float32Data[r++] = data[i] / 255;
    float32Data[g++] = data[i + 1] / 255;
    float32Data[b++] = data[i + 2] / 255;
  }

  return new ort.Tensor(
    "float32",
    float32Data,
    [1, 3, size, size]
  );
}