import * as ort from "onnxruntime-web";

let session: ort.InferenceSession | null = null;

export async function loadModel() {
  if (session) {
    return session;
  }

  console.log("Loading YOLO model...");

  const modelPath = `${import.meta.env.BASE_URL}best.onnx`;
  session = await ort.InferenceSession.create(modelPath);

  console.log("Input name:", session.inputNames[0]);
  console.log("Output name:", session.outputNames[0]);

  console.log("✅ YOLO model loaded");

  return session;
}

export function getSession() {
  return session;
}
