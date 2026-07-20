import { useCallback, useEffect, useRef, useState } from 'react';
import * as ort from 'onnxruntime-web';
import { AutoCaptureController, AutoCaptureState } from '../capture/AutoCaptureController';
import { evaluateCaptureDecision, type FrameValidatorResult } from '../capture/CaptureQualityGate';
import { validateFrameQuality } from '../capture/FrameQualityValidator';
import type { BoxDetection } from '../ai/postprocess/BoxConverter';
import { convertXYWHToXYXY } from '../ai/postprocess/BoxConverter';
import { filterByConfidence } from '../ai/postprocess/ConfidenceFilter';
import { recoverOriginalCoordinates } from '../ai/postprocess/CoordinateMapper';
import { decode } from '../ai/postprocess/Decoder';
import { classWiseNMS } from '../ai/postprocess/NMS';
import { runDetector } from '../ai/detector/Detector';
import { letterbox } from '../ai/preprocess/Letterbox';
import { preprocess } from '../ai/preprocess/Preprocess';
import type { GuidanceState } from '../guide/GuidanceEngine';
import { calculateGuidanceState } from '../guide/GuidanceEngine';
import { getTargetLayout, type CaptureAngle } from '../guide/TargetLayout';
import { getVehicleProfile, type VehicleId } from '../guide/VehicleProfiles';
import { InspectionWorkflow, type InspectionWorkflowState } from '../workflow/InspectionWorkflow';

const VEHICLE_ID: VehicleId = 'corolla-cross';
const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const QUALITY_CANVAS_WIDTH = 320;
const QUALITY_CANVAS_HEIGHT = 180;

function formatAngle(angle: CaptureAngle | undefined): string {
  return angle === undefined ? 'Inspection Completed' : angle.replace('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scoreColor(score: number): string {
  if (score >= 90) {
    return '#16a34a';
  }

  if (score >= 70) {
    return '#ea580c';
  }

  return '#dc2626';
}

/**
 * Production capture composition page. React owns stream/render lifecycle only;
 * inference, guidance, quality gating, auto-capture, and workflow rules remain
 * in their dedicated modules.
 */
export default function InspectionCamera(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const qualityCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const autoCaptureRef = useRef<AutoCaptureController | null>(null);
  const workflowRef = useRef<InspectionWorkflow | null>(null);
  const angleRef = useRef<CaptureAngle | undefined>(undefined);
  const [frameSize, setFrameSize] = useState({ width: 1, height: 1 });
  const [guidance, setGuidance] = useState<GuidanceState>();
  const [quality, setQuality] = useState<FrameValidatorResult>();
  const [qualityScore, setQualityScore] = useState(0);
  const [autoCaptureState, setAutoCaptureState] = useState<AutoCaptureState>(AutoCaptureState.Idle);
  const [countdown, setCountdown] = useState<number>();
  const [cameraError, setCameraError] = useState<string>();
  const [workflowState, setWorkflowState] = useState<InspectionWorkflowState>(() => ({
    currentVehicle: undefined,
    currentStep: undefined,
    completedSteps: [],
    remainingSteps: [],
    inspectionProgress: 0,
  }));

  const captureCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    const captureCanvas = captureCanvasRef.current;
    const controller = autoCaptureRef.current;
    const workflow = workflowRef.current;

    if (video === null || captureCanvas === null || controller === null || workflow === null) {
      return;
    }

    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const context = captureCanvas.getContext('2d');
    if (context === null) {
      controller.reset();
      setAutoCaptureState(controller.state);
      return;
    }

    context.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    captureCanvas.toBlob((blob) => {
      if (blob === null) {
        controller.reset();
        setAutoCaptureState(controller.state);
        return;
      }

      const currentAngle = workflow.getCurrentStep()?.captureAngle ?? 'capture';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${VEHICLE_ID}-${currentAngle}-${Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(url);

      controller.complete();
      const nextWorkflowState = workflow.getState();
      angleRef.current = nextWorkflowState.currentStep?.captureAngle;
      setWorkflowState(nextWorkflowState);
      controller.reset();
      setAutoCaptureState(controller.state);
      setCountdown(undefined);
    }, 'image/png');
  }, []);

  useEffect(() => {
    const controller = new AutoCaptureController({
      onCountdown: (remainingMilliseconds) => setCountdown(remainingMilliseconds),
      onCapture: captureCurrentFrame,
      onCancel: () => setCountdown(undefined),
    });
    const workflow = new InspectionWorkflow(controller);
    const initialWorkflowState = workflow.startInspection(VEHICLE_ID);
    autoCaptureRef.current = controller;
    workflowRef.current = workflow;
    angleRef.current = initialWorkflowState.currentStep?.captureAngle;
    setWorkflowState(initialWorkflowState);

    return () => {
      workflow.dispose();
      autoCaptureRef.current = null;
      workflowRef.current = null;
      angleRef.current = undefined;
    };
  }, [captureCurrentFrame]);

  useEffect(() => {
    angleRef.current = workflowState.currentStep?.captureAngle;
  }, [workflowState]);

  useEffect(() => {
    let active = true;
    let animationFrame: number | undefined;
    let stream: MediaStream | undefined;
    let previousQualityFrame: ImageData | undefined;
    let inferenceInFlight = false;

    const processFrame = async (session: ort.InferenceSession): Promise<void> => {
      if (!active) {
        return;
      }

      const video = videoRef.current;
      const angle = angleRef.current;
      const controller = autoCaptureRef.current;
      const qualityCanvas = qualityCanvasRef.current;

      if (
        video === null
        || angle === undefined
        || controller === null
        || qualityCanvas === null
        || video.videoWidth === 0
        || inferenceInFlight
      ) {
        animationFrame = window.requestAnimationFrame(() => { void processFrame(session); });
        return;
      }

      inferenceInFlight = true;

      try {
        qualityCanvas.width = QUALITY_CANVAS_WIDTH;
        qualityCanvas.height = QUALITY_CANVAS_HEIGHT;
        const qualityContext = qualityCanvas.getContext('2d');
        if (qualityContext === null) {
          return;
        }

        qualityContext.drawImage(video, 0, 0, QUALITY_CANVAS_WIDTH, QUALITY_CANVAS_HEIGHT);
        const qualityFrame = qualityContext.getImageData(0, 0, QUALITY_CANVAS_WIDTH, QUALITY_CANVAS_HEIGHT);
        const frameQuality = validateFrameQuality(qualityFrame, previousQualityFrame);
        previousQualityFrame = qualityFrame;

        const letterboxed = letterbox(video, video.videoWidth, video.videoHeight);
        const tensor = preprocess(letterboxed);
        const output = await runDetector(session, tensor);
        const decoded = decode(output);
        const confidenceFiltered = filterByConfidence(decoded.detections, CONFIDENCE_THRESHOLD);
        const converted = convertXYWHToXYXY(confidenceFiltered);
        const selected = classWiseNMS(converted, IOU_THRESHOLD);
        const detections: BoxDetection[] = recoverOriginalCoordinates(
          selected,
          letterboxed.scale,
          letterboxed.padX,
          letterboxed.padY,
          { width: video.videoWidth, height: video.videoHeight },
        );
        const currentGuidance = calculateGuidanceState(
          detections,
          video.videoWidth,
          video.videoHeight,
          VEHICLE_ID,
          angle,
        );
        const decision = evaluateCaptureDecision(currentGuidance, frameQuality);
        const autoGuidance = decision.allowCapture
          ? currentGuidance
          : { ...currentGuidance, ready: false };
        const nextAutoCaptureState = controller.update(autoGuidance);

        if (active) {
          setFrameSize({ width: video.videoWidth, height: video.videoHeight });
          setGuidance(currentGuidance);
          setQuality(frameQuality);
          setQualityScore(decision.qualityScore);
          setAutoCaptureState(nextAutoCaptureState);
        }
      } catch (caught) {
        if (active) {
          setCameraError(caught instanceof Error ? caught.message : 'Frame processing failed.');
        }
      } finally {
        inferenceInFlight = false;
        if (active) {
          animationFrame = window.requestAnimationFrame(() => { void processFrame(session); });
        }
      }
    };

    const start = async (): Promise<void> => {
      try {
        const [session, mediaStream] = await Promise.all([
          ort.InferenceSession.create('/best.onnx', { executionProviders: ['wasm'] }),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
        ]);

        if (!active) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream = mediaStream;
        const video = videoRef.current;
        if (video === null) {
          return;
        }

        video.srcObject = mediaStream;
        await video.play();
        animationFrame = window.requestAnimationFrame(() => { void processFrame(session); });
      } catch (caught) {
        if (active) {
          setCameraError(caught instanceof Error ? caught.message : 'Unable to start inspection camera.');
        }
      }
    };

    void start();

    return () => {
      active = false;
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }

      stream?.getTracks().forEach((track) => track.stop());
      const video = videoRef.current;
      if (video !== null) {
        video.srcObject = null;
      }
    };
  }, []);

  const profile = getVehicleProfile(VEHICLE_ID);
  const totalSteps = workflowState.completedSteps.length + workflowState.remainingSteps.length;
  const completedOrSkipped = totalSteps === 0 ? 0 : Math.round(workflowState.inspectionProgress / 100 * totalSteps);
  const inspectionCompleted = workflowState.currentStep === undefined && workflowState.currentVehicle !== undefined;
  const countdownSeconds = countdown === undefined ? undefined : Math.ceil(countdown / 1000);
  const plateTargetX = guidance?.plateTarget.x ?? 0;
  const plateTargetY = guidance?.plateTarget.y ?? 0;
  const wheelTargetX = guidance?.wheelTarget.x ?? 0;
  const wheelTargetY = guidance?.wheelTarget.y ?? 0;
  const toleranceRadius = Math.min(frameSize.width, frameSize.height);

  return (
    <main style={{ background: '#111827', color: '#f9fafb', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', padding: 20 }}>
      <header style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>{profile.displayName}</h1>
          <p style={{ margin: '4px 0 0' }}>Current Capture Angle: {formatAngle(workflowState.currentStep?.captureAngle)}</p>
        </div>
        <strong>Inspection Progress: {completedOrSkipped} / {totalSteps}</strong>
      </header>

      {cameraError !== undefined && <p role="alert">{cameraError}</p>}

      <section style={{ margin: '20px auto', maxWidth: 1100, position: 'relative' }}>
        <video
          autoPlay
          muted
          playsInline
          ref={videoRef}
          style={{ background: '#000', display: 'block', height: 'auto', maxHeight: '65vh', objectFit: 'contain', width: '100%' }}
        />
        {guidance !== undefined && (
          <svg
            aria-label="Vehicle guidance overlay"
            preserveAspectRatio="none"
            style={{ height: '100%', inset: 0, pointerEvents: 'none', position: 'absolute', width: '100%' }}
            viewBox={`0 0 ${frameSize.width} ${frameSize.height}`}
          >
            <ellipse cx={plateTargetX * frameSize.width} cy={plateTargetY * frameSize.height} fill="none" rx={getTargetLayout(VEHICLE_ID, workflowState.currentStep?.captureAngle ?? 'front-left').plate.toleranceX * toleranceRadius} ry={getTargetLayout(VEHICLE_ID, workflowState.currentStep?.captureAngle ?? 'front-left').plate.toleranceY * toleranceRadius} stroke="#22c55e" strokeDasharray="10 8" strokeWidth="3" />
            <ellipse cx={wheelTargetX * frameSize.width} cy={wheelTargetY * frameSize.height} fill="none" rx={getTargetLayout(VEHICLE_ID, workflowState.currentStep?.captureAngle ?? 'front-left').wheel.toleranceX * toleranceRadius} ry={getTargetLayout(VEHICLE_ID, workflowState.currentStep?.captureAngle ?? 'front-left').wheel.toleranceY * toleranceRadius} stroke="#2563eb" strokeDasharray="10 8" strokeWidth="3" />
            <rect fill="#22c55e" height="16" width="16" x={plateTargetX * frameSize.width - 8} y={plateTargetY * frameSize.height - 8} />
            <rect fill="#2563eb" height="16" width="16" x={wheelTargetX * frameSize.width - 8} y={wheelTargetY * frameSize.height - 8} />
            {guidance.plateCurrent !== undefined && <circle cx={guidance.plateCurrent.x * frameSize.width} cy={guidance.plateCurrent.y * frameSize.height} fill="#22c55e" r="8" />}
            {guidance.wheelCurrent !== undefined && <circle cx={guidance.wheelCurrent.x * frameSize.width} cy={guidance.wheelCurrent.y * frameSize.height} fill="#2563eb" r="8" />}
          </svg>
        )}
        {guidance !== undefined && guidance.hints.length > 0 && (
          <aside style={{ background: 'rgba(17, 24, 39, 0.8)', borderRadius: 8, bottom: 16, left: 16, padding: 12, position: 'absolute' }}>
            {guidance.hints.map((hint) => <div key={hint}>{hint}</div>)}
          </aside>
        )}
        {inspectionCompleted && (
          <div style={{ alignItems: 'center', background: 'rgba(22, 163, 74, 0.85)', display: 'flex', fontSize: 28, fontWeight: 700, inset: 0, justifyContent: 'center', position: 'absolute' }}>
            Inspection Completed
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', margin: '0 auto', maxWidth: 1100 }}>
        <div><strong>Overall Score</strong><br /><span style={{ color: guidance === undefined ? '#f9fafb' : scoreColor(guidance.overallScore), fontSize: 28 }}>{guidance?.overallScore ?? 0} %</span></div>
        <div><strong>Quality Score</strong><br /><span style={{ fontSize: 28 }}>{qualityScore} %</span></div>
        <div><strong>AutoCapture State</strong><br />{autoCaptureState}</div>
        <div><strong>Ready</strong><br />{guidance?.ready ? '✅ READY' : '❌ NOT READY'}</div>
        <div><strong>Countdown</strong><br />{countdownSeconds === undefined ? '—' : `${countdownSeconds}s`}</div>
        {quality !== undefined && <div><strong>Frame Quality</strong><br />{quality.isBlurred || quality.isMoving || quality.isOverExposed || quality.isUnderExposed ? 'Blocked' : 'Pass'}</div>}
      </section>

      <section style={{ margin: '24px auto 0', maxWidth: 1100 }}>
        <h2>Inspection Workflow</h2>
        <ol style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', listStyle: 'none', padding: 0 }}>
          {getVehicleProfile(VEHICLE_ID).inspectionSequence.map((angle) => {
            const step = [...workflowState.completedSteps, ...workflowState.remainingSteps, workflowState.currentStep]
              .find((candidate) => candidate?.captureAngle === angle);
            const status = step?.status ?? 'completed';
            const label = status === 'completed' ? '✓' : status === 'active' ? 'Current' : status === 'skipped' ? 'Skipped' : 'Pending';

            return <li key={angle} style={{ border: '1px solid #4b5563', borderRadius: 8, padding: 12 }}>{formatAngle(angle)}<br /><strong>{label}</strong></li>;
          })}
        </ol>
      </section>

      <canvas ref={qualityCanvasRef} style={{ display: 'none' }} />
      <canvas ref={captureCanvasRef} style={{ display: 'none' }} />
    </main>
  );
}
