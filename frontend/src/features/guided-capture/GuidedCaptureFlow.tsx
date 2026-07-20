import type { JSX } from 'react';
import { useEffect } from 'react';
import { GuidedCaptureProvider } from './context/GuidedCaptureContext';
import { useGuidedCapture } from './hooks/useGuidedCapture';
import CapturePage from './pages/CapturePage';
import CompletePage from './pages/CompletePage';
import HomePage from './pages/HomePage';
import ReviewPage from './pages/ReviewPage';
import { getVehicleIdForModel } from './data/vehicleOptions';
import type { FlowStep } from './types';

function normalizePlateNumber(value: string): string {
  return value.trim().toUpperCase().slice(0, 10);
}

function getPlateNumberError(plateNumber: string): string | undefined {
  if (plateNumber === '') {
    return '請輸入車牌號碼';
  }

  return /^[A-Z0-9-]+$/.test(plateNumber)
    ? undefined
    : '車牌號碼僅能包含英文字母、數字與連字號';
}

function stepFromHash(): FlowStep {
  if (window.location.hash === '#/app/capture') {
    return 'capture';
  }

  if (window.location.hash === '#/app/review') {
    return 'review';
  }

  if (window.location.hash === '#/app/complete') {
    return 'complete';
  }

  return 'home';
}

function hashForStep(step: FlowStep): string {
  if (step === 'capture') {
    return '#/app/capture';
  }

  if (step === 'review') {
    return '#/app/review';
  }

  if (step === 'complete') {
    return '#/app/complete';
  }

  return '#/app';
}

function canRestoreStepFromHash({
  canStart,
  completedCount,
  pendingImageExists,
  step,
  total,
}: {
  canStart: boolean;
  completedCount: number;
  pendingImageExists: boolean;
  step: FlowStep;
  total: number;
}): boolean {
  if (step === 'home') {
    return true;
  }

  if (step === 'capture') {
    return canStart;
  }

  if (step === 'review') {
    return pendingImageExists;
  }

  return completedCount >= total;
}

function GuidedCaptureFlowContent(): JSX.Element {
  const guidedCapture = useGuidedCapture();
  const selectedVehicleId = getVehicleIdForModel(guidedCapture.vehicleModel);
  const vehicleModelError = guidedCapture.vehicleModel === ''
    ? '請選擇車型'
    : selectedVehicleId === undefined
      ? '此車型尚未完成拍攝座標校正'
      : undefined;
  const plateNumberError = getPlateNumberError(guidedCapture.plateNumber);
  const canStart = vehicleModelError === undefined && plateNumberError === undefined;

  if (guidedCapture.currentStep === 'capture') {
    return (
      <CapturePage
        completedAngles={guidedCapture.completedAngles}
        currentAngle={guidedCapture.currentAngle}
        currentStep={guidedCapture.progress.currentStepNumber}
        onBack={guidedCapture.goBack}
        onCaptureFinished={guidedCapture.captureFinished}
        totalSteps={guidedCapture.progress.total}
        vehicleId={selectedVehicleId}
      />
    );
  }

  if (guidedCapture.currentStep === 'review') {
    return (
      <ReviewPage
        currentAngle={guidedCapture.currentAngle}
        currentStep={guidedCapture.progress.currentStepNumber}
        imageUrl={guidedCapture.pendingImage?.image}
        onBack={guidedCapture.goBack}
        onConfirm={guidedCapture.confirmCapture}
        onRetake={guidedCapture.retakeCapture}
        totalSteps={guidedCapture.progress.total}
      />
    );
  }

  if (guidedCapture.currentStep === 'complete') {
    return (
      <CompletePage
        capturedImages={guidedCapture.capturedImages}
        completed={guidedCapture.progress.completed}
        onDone={guidedCapture.resetInspection}
        plateNumber={guidedCapture.plateNumber}
        total={guidedCapture.progress.total}
        vehicleName={guidedCapture.vehicleModel}
      />
    );
  }

  return (
    <HomePage
      onPlateNumberChange={(value) => guidedCapture.updatePlateNumber(normalizePlateNumber(value))}
      onStart={guidedCapture.startInspection}
      onVehicleModelChange={guidedCapture.updateVehicleModel}
      plateNumber={guidedCapture.plateNumber}
      plateNumberError={plateNumberError}
      startDisabled={!canStart}
      vehicleModel={guidedCapture.vehicleModel}
      vehicleModelError={vehicleModelError}
    />
  );
}

export interface GuidedCaptureFlowProps {
  routeMode?: 'hash' | 'memory';
}

function RoutedGuidedCaptureFlowContent({
  routeMode,
}: Required<GuidedCaptureFlowProps>): JSX.Element {
  const guidedCapture = useGuidedCapture();
  const selectedVehicleId = getVehicleIdForModel(guidedCapture.vehicleModel);
  const canStart = selectedVehicleId !== undefined
    && getPlateNumberError(guidedCapture.plateNumber) === undefined;

  useEffect(() => {
    if (routeMode === 'memory') {
      return;
    }

    const nextHash = hashForStep(guidedCapture.currentStep);

    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash.slice(1);
    }
  }, [guidedCapture.currentStep, routeMode]);

  useEffect(() => {
    if (routeMode === 'memory') {
      return;
    }

    const syncFromHash = (): void => {
      const routeStep = stepFromHash();
      const canRestore = canRestoreStepFromHash({
        canStart,
        completedCount: guidedCapture.completedAngles.length,
        pendingImageExists: guidedCapture.pendingImage !== undefined,
        step: routeStep,
        total: guidedCapture.progress.total,
      });

      if (!canRestore) {
        guidedCapture.syncRouteStep('home');

        if (window.location.hash !== '#/app') {
          window.location.hash = '/app';
        }

        return;
      }

      guidedCapture.syncRouteStep(routeStep);
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);

    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [canStart, guidedCapture, routeMode]);

  return <GuidedCaptureFlowContent />;
}

export default function GuidedCaptureFlow({
  routeMode = 'hash',
}: GuidedCaptureFlowProps): JSX.Element {
  return (
    <GuidedCaptureProvider>
      <RoutedGuidedCaptureFlowContent routeMode={routeMode} />
    </GuidedCaptureProvider>
  );
}
