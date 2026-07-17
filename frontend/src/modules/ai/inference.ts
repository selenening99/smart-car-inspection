import * as ort from "onnxruntime-web";

export async function runInference(
  session: ort.InferenceSession,
  tensor: ort.Tensor
) {
  const outputs = await session.run({
    images: tensor,
  });

  const out = outputs.output0;

  const data = out.data as Float32Array;

  let max = -Infinity;
  let min = Infinity;

  for (let i = 0; i < data.length; i++) {
    if (data[i] > max) max = data[i];
    if (data[i] < min) min = data[i];
  }

  console.log("dims:", out.dims);
  console.log("min:", min);
  console.log("max:", max);

  return outputs;
}