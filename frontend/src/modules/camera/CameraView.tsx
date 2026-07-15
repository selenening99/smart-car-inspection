import { useEffect, useRef } from "react";
import { loadModel } from "../ai/detector";
import { preprocess } from "../ai/preprocess";
import { runInference } from "../ai/inference";
import { postprocess } from "../ai/postprocess";

export default function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    console.log("===== NEW CameraView v2 =====");

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

          console.log(session);

          const canvas = canvasRef.current;
          if (!canvas) return;

          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;

          console.log("Canvas:", canvas.width, canvas.height);

          const ctx = canvas.getContext("2d");

          if (!ctx) return;

          setInterval(async () => {
            if (!videoRef.current) return;

            ctx.drawImage(
              videoRef.current,
              0,
              0,
              canvas.width,
              canvas.height
            );

            const tensor = preprocess(canvas);

            console.log("Before inference");

            try {
              const output = await runInference(session, tensor);

              console.log("After inference");

              const detections = postprocess(output);

              console.log("========== DETECTIONS ==========");
              console.log("Detection count:", detections.length);
              console.log(detections);

            } catch (err) {
              console.error("Inference Error:", err);
            }
          }, 1000);
        };
      } catch (err) {
        console.error(err);
        alert("Cannot open camera");
      }
    }

    startCamera();
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: "100%",
          height: "100vh",
          objectFit: "cover",
        }}
      />

      <canvas
        ref={canvasRef}
        style={{ display: "none" }}
      />
    </>
  );
}