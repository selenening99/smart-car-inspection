import { useMemo, useState, type JSX } from 'react';
import CompletePage from './pages/CompletePage';
import CapturePage from './pages/CapturePage';
import HomePage from './pages/HomePage';
import ReviewPage from './pages/ReviewPage';
import { getVehicleIdForModel, type VehicleModel } from './data/vehicleOptions';
import type { CaptureAngle, CapturedImage } from './types';

type DemoStep = 'home' | 'capture' | 'review' | 'complete';

type DemoInspectionSession = {
  vehicleModel: VehicleModel | '';
  plateNumber: string;
  currentAngle: CaptureAngle;
  completedAngles: CaptureAngle[];
  capturedImages: CapturedImage[];
};

const orderedAngles: readonly CaptureAngle[] = [
  'front-left',
  'front-right',
  'rear-left',
  'rear-right',
];

function getStepNumber(angle: CaptureAngle): number {
  return orderedAngles.indexOf(angle) + 1;
}

function normalizePlateNumber(value: string): string {
  return value.trim().toUpperCase().slice(0, 10);
}

function isPlateNumberValid(plateNumber: string): boolean {
  return /^[A-Z0-9-]+$/.test(plateNumber);
}

export default function GuidedCaptureDemo(): JSX.Element {
  const [step, setStep] = useState<DemoStep>('home');
  const [vehicleModel, setVehicleModel] = useState<VehicleModel | ''>('');
  const [plateNumber, setPlateNumber] = useState('');
  const [currentAngleIndex, setCurrentAngleIndex] = useState(0);
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [pendingImage, setPendingImage] = useState<CapturedImage>();
  const currentAngle = orderedAngles[currentAngleIndex];
  const resolvedVehicleModel = vehicleModel;
  const selectedVehicleId = getVehicleIdForModel(vehicleModel);
  const vehicleModelError = resolvedVehicleModel === ''
    ? '請選擇車型'
    : selectedVehicleId === undefined
      ? '此車型尚未完成拍攝座標校正'
      : undefined;
  const plateNumberError = plateNumber === ''
    ? '請輸入車牌號碼'
    : isPlateNumberValid(plateNumber)
      ? undefined
      : '車牌號碼僅能包含英文字母、數字與連字號';
  const canStart = vehicleModelError === undefined && plateNumberError === undefined;
  const completedAngles = useMemo(
    () => capturedImages.map((image) => image.angle),
    [capturedImages],
  );
  const demoSession: DemoInspectionSession = {
    vehicleModel,
    plateNumber,
    currentAngle,
    completedAngles,
    capturedImages,
  };

  function startDemo(): void {
    if (!canStart) {
      return;
    }

    setStep('capture');
  }

  function handleVehicleModelChange(value: VehicleModel | ''): void {
    setVehicleModel(value);
  }

  function handlePlateNumberChange(value: string): void {
    setPlateNumber(normalizePlateNumber(value));
  }

  function handleCaptureFinished(image?: string): void {
    const nextPendingImage: CapturedImage = {
      angle: currentAngle,
      capturedAt: Date.now(),
      image,
    };

    setPendingImage(nextPendingImage);
    setStep('review');
  }

  function confirmPhoto(): void {
    if (pendingImage === undefined) {
      return;
    }

    const nextImages = [
      ...capturedImages.filter((image) => image.angle !== pendingImage.angle),
      pendingImage,
    ];
    const hasNextAngle = currentAngleIndex < orderedAngles.length - 1;

    setCapturedImages(nextImages);
    setPendingImage(undefined);

    if (hasNextAngle) {
      setCurrentAngleIndex((index) => index + 1);
      setStep('capture');
      return;
    }

    setStep('complete');
  }

  function retakePhoto(): void {
    setPendingImage(undefined);
    setStep('capture');
  }

  function goBack(): void {
    if (step === 'review') {
      retakePhoto();
      return;
    }

    if (step === 'capture') {
      setStep('home');
    }
  }

  function resetDemo(): void {
    setStep('home');
    setVehicleModel('');
    setPlateNumber('');
    setCurrentAngleIndex(0);
    setCapturedImages([]);
    setPendingImage(undefined);
  }

  if (step === 'capture') {
    return (
      <CapturePage
        completedAngles={completedAngles}
        currentAngle={currentAngle}
        currentStep={getStepNumber(currentAngle)}
        demoMode
        onBack={goBack}
        onCaptureFinished={handleCaptureFinished}
        totalSteps={orderedAngles.length}
        vehicleId={selectedVehicleId}
      />
    );
  }

  if (step === 'review') {
    return (
      <ReviewPage
        currentAngle={currentAngle}
        currentStep={getStepNumber(currentAngle)}
        imageUrl={pendingImage?.image}
        onBack={goBack}
        onConfirm={confirmPhoto}
        onRetake={retakePhoto}
        totalSteps={orderedAngles.length}
      />
    );
  }

  if (step === 'complete') {
    return (
      <CompletePage
        capturedImages={capturedImages}
        completed={capturedImages.length}
        onDone={resetDemo}
        plateNumber={demoSession.plateNumber}
        total={orderedAngles.length}
        vehicleName={resolvedVehicleModel}
      />
    );
  }

  return (
    <HomePage
      onPlateNumberChange={handlePlateNumberChange}
      onStart={startDemo}
      onVehicleModelChange={handleVehicleModelChange}
      plateNumber={plateNumber}
      plateNumberError={plateNumberError}
      startDisabled={!canStart}
      vehicleModel={vehicleModel}
      vehicleModelError={vehicleModelError}
    />
  );
}
