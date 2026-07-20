import { useEffect, useRef, useState } from "react";
import { loadModel } from "../ai/detector";
import { preprocess } from "../ai/preprocess";
import { runInference } from "../ai/inference";
import { decoder } from "../ai/decoder";
import { nonMaximumSuppression } from "../ai/nms";
import { drawDetections } from "../ai/draw";
import { drawGuideFrame, estimateVehiclePose } from "../pose";
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
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  useEffect(() => {
    let rafId: number | undefined;
    let isMounted = true;
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
          audio: false,
        });

        const currentVideo = videoRef.current;
        if (!isMounted || !currentVideo) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video = currentVideo;

        const [cameraTrack] = stream.getVideoTracks();
        console.log("camera stream active:", stream.active);
        console.log("camera track:", {
          label: cameraTrack?.label,
          readyState: cameraTrack?.readyState,
          settings: cameraTrack?.getSettings(),
        });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((device) => device.kind === "videoinput");
        console.table(
          videoInputs.map((device) => ({
            label: device.label,
            deviceId: device.deviceId,
          }))
        );
        console.log("selected camera device:", cameraTrack?.getSettings().deviceId);

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        setCameraDevices(videoInputs);

        currentVideo.onloadedmetadata = async () => {
          if (!isMounted || videoRef.current !== currentVideo) return;

          console.log("metadata loaded");
          console.log("videoWidth:", currentVideo.videoWidth);
          console.log("videoHeight:", currentVideo.videoHeight);

          await currentVideo.play();

          console.log("readyState:", currentVideo.readyState);
          console.log("srcObject:", currentVideo.srcObject);
          console.log("playback dimensions:", currentVideo.videoWidth, currentVideo.videoHeight);

          const session = await loadModel();
          const processCanvas = processCanvasRef.current;
          const overlayCanvas = overlayCanvasRef.current;

          if (!processCanvas || !overlayCanvas) return;

          processCanvas.width = INPUT_SIZE;
          processCanvas.height = INPUT_SIZE;

          overlayCanvas.width = currentVideo.videoWidth;
          overlayCanvas.height = currentVideo.videoHeight;

          let previousTime = performance.now();
          let frameSampleLogged = false;

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

            if (!frameSampleLogged) {
              const pixels = pCtx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
              let brightnessTotal = 0;
              let sampleCount = 0;

              for (let pixel = 0; pixel < pixels.length; pixel += 4096) {
                brightnessTotal += pixels[pixel] + pixels[pixel + 1] + pixels[pixel + 2];
                sampleCount += 3;
              }

              console.log("first copied frame average channel value:", brightnessTotal / sampleCount);
              frameSampleLogged = true;
            }

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
            drawGuideFrame(oCanvas, poseResult);
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

        currentVideo.onplaying = () => {
          console.log("video playing:", {
            readyState: currentVideo.readyState,
            videoWidth: currentVideo.videoWidth,
            videoHeight: currentVideo.videoHeight,
          });
        };

        currentVideo.srcObject = stream;
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
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (video?.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [selectedDeviceId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      <DebugHUD
        fps={fps}
        inferenceTimeMs={inferenceTime}
        detectionCount={detectionCount}
        pose={pose}
      />

      {cameraDevices.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 16,
            display: "flex",
            gap: 8,
            zIndex: 60,
          }}
        >
          <select
            aria-label="Camera device"
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
          >
            <option value="">Default camera</option>
            {cameraDevices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setSelectedDeviceId(cameraDevices[0].deviceId)}>
            Use first camera
          </button>
        </div>
      )}

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
