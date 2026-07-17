import { useEffect, useRef, useState } from "react";
import { loadModel } from "../ai/detector";
import { preprocess } from "../ai/preprocess";
import { runInference } from "../ai/inference";
import { decoder } from "../ai/decoder";
import { nonMaximumSuppression } from "../ai/nms";
import { drawDetections } from "../ai/draw";
import { estimateVehiclePose } from "../pose";
import type { PoseResult } from "../pose";
import { DebugHUD } from "../../components/DebugHUD";

const INPUT_SIZE = 640;

export default function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [fps, setFps] = useState(0);
  const [inferenceTime, setInferenceTime] = useState(0);
  const [detectionCount, setDetectionCount] = useState(0);
  const [pose, setPose] = useState<PoseResult>({ pose: "unknown", confidence: 0 });

  useEffect(() => {
    let rafId: number | undefined;
    let isMounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
          },
          audio: false,
        });

        if (!videoRef.current) return;

        videoRef.current.srcObject = stream;

        videoRef.current.onloadedmetadata = async () => {
          if (!videoRef.current) return;

          await videoRef.current.play();

          const session = await loadModel();
          const processCanvas = processCanvasRef.current;
          const overlayCanvas = overlayCanvasRef.current;

          if (!processCanvas || !overlayCanvas) return;

          processCanvas.width = INPUT_SIZE;
          processCanvas.height = INPUT_SIZE;

          overlayCanvas.width = videoRef.current.videoWidth;
          overlayCanvas.height = videoRef.current.videoHeight;

          let previousTime = performance.now();

          async function inferFrame() {
            if (!isMounted) return;

            const video = videoRef.current;
            if (!video) return;

            const pCanvas = processCanvasRef.current;
            if (!pCanvas) return;

            const pCtx = pCanvas.getContext("2d");
            if (!pCtx) return;

            // draw video frame into processing canvas synchronously
            pCtx.drawImage(video, 0, 0, INPUT_SIZE, INPUT_SIZE);

            const tensor = preprocess(pCanvas);
            const inferenceStart = performance.now();
            const output = await runInference(session, tensor);
            const inferenceEnd = performance.now();

            const detections = decoder(output, INPUT_SIZE, 0.25);
            const finalDetections = nonMaximumSuppression(detections, 0.45);
            console.log("After NMS:", finalDetections.length);

            const oCanvas = overlayCanvasRef.current;
            if (!oCanvas) return;

            const oCtx = oCanvas.getContext("2d");
            if (!oCtx) return;

            const xScale = oCanvas.width / INPUT_SIZE;
            const yScale = oCanvas.height / INPUT_SIZE;

            const scaledDetections = finalDetections.map((det) => ({
              ...det,
              x: det.x * xScale,
              y: det.y * yScale,
              width: det.width * xScale,
              height: det.height * yScale,
            }));
            const poseResult = estimateVehiclePose(scaledDetections, {
              width: oCanvas.width,
              height: oCanvas.height,
            });

            oCtx.clearRect(0, 0, oCanvas.width, oCanvas.height);
            drawDetections(oCanvas, scaledDetections);

            const currentTime = performance.now();
            const currentFps = 1000 / (currentTime - previousTime);
            previousTime = currentTime;

            setFps(currentFps);
            setInferenceTime(inferenceEnd - inferenceStart);
            setDetectionCount(scaledDetections.length);
            setPose(poseResult);

            rafId = window.requestAnimationFrame(inferFrame);
          }

          rafId = window.requestAnimationFrame(inferFrame);
        };
      } catch (err) {
        console.error(err);
        alert("Cannot open camera");
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      if (rafId !== undefined) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      <DebugHUD
        fps={fps}
        inferenceTimeMs={inferenceTime}
        detectionCount={detectionCount}
        pose={pose}
      />

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      <canvas
        ref={overlayCanvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />

      <canvas ref={processCanvasRef} style={{ display: "none" }} width={INPUT_SIZE} height={INPUT_SIZE} />
    </div>
  );
}
