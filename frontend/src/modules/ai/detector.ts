import * as ort from "onnxruntime-web";

let session: ort.InferenceSession | null = null;

export async function loadModel() {
  if (session) {
    return session;
  }

  console.log("Loading YOLO model...");

  session = await ort.InferenceSession.create("/best.onnx");

  console.log("Input name:", session.inputNames[0]);
  console.log("Output name:", session.outputNames[0]);

  console.log("✅ YOLO model loaded");

  return session;
}

export function getSession() {
  return session;
}