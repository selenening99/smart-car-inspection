import * as ort from "onnxruntime-web";

export async function runInference(
  session: ort.InferenceSession,
  tensor: ort.Tensor
) {
  console.log("① runInference started");

  const outputs = await session.run({
    images: tensor,
  });

  console.log("② session.run finished");

  console.log("===== OUTPUT0 =====");
  console.log(outputs.output0);

  return outputs;
}