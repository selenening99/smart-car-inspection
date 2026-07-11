import * as ort from "onnxruntime-web";

export async function loadModel() {
  try {
    console.log("開始載入模型...");

    const session = await ort.InferenceSession.create("/best.onnx");

    console.log("✅ Model loaded!");
    return session;
  } catch (err) {
    console.error("模型載入失敗：", err);
  }
}