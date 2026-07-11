import { useEffect } from "react";
import CameraView from "../modules/camera/CameraView";
import { loadModel } from "../modules/ai/detector";

export default function CameraPage() {
  useEffect(() => {
    loadModel();
  }, []);

  return <CameraView />;
}