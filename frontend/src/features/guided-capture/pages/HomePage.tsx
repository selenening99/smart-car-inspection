import type { JSX } from 'react';
import { StartCaptureButton } from '../components/StartCaptureButton';
import { VehicleCard } from '../components/VehicleCard';
import { VEHICLE_OPTIONS, type VehicleModel } from '../data/vehicleOptions';
import '../styles/HomePage.css';

export interface HomePageProps {
  onPlateNumberChange?: (value: string) => void;
  onVehicleModelChange?: (value: VehicleModel | '') => void;
  plateNumber?: string;
  plateNumberError?: string;
  onStart?: () => void;
  startDisabled?: boolean;
  vehicleModel?: VehicleModel | '';
  vehicleModelError?: string;
}

function getDefaultPlateNumberError(plateNumber: string): string | undefined {
  const normalizedPlateNumber = plateNumber.trim();

  if (normalizedPlateNumber === '') {
    return '請輸入車牌號碼';
  }

  if (!/^[A-Z0-9-]+$/.test(normalizedPlateNumber.toUpperCase())) {
    return '車牌號碼僅能包含英文字母、數字與連字號';
  }

  return undefined;
}

export default function HomePage({
  onPlateNumberChange,
  onVehicleModelChange,
  plateNumber = '',
  plateNumberError,
  onStart,
  startDisabled = false,
  vehicleModel = '',
  vehicleModelError,
}: HomePageProps): JSX.Element {
  const resolvedVehicleModelError = vehicleModelError
    ?? (vehicleModel === '' ? '請選擇車型' : undefined);
  const resolvedPlateNumberError = plateNumberError
    ?? getDefaultPlateNumberError(plateNumber);
  const isStartDisabled = startDisabled
    || resolvedVehicleModelError !== undefined
    || resolvedPlateNumberError !== undefined;

  return (
    <main className="guided-capture-home">
      <div className="guided-capture-home__shell">
        <header className="guided-capture-home__header">
          <div className="guided-capture-home__brand">
            <div className="guided-capture-home__logo" aria-hidden="true">🚘</div>
            <h1 className="guided-capture-home__title">AI 智慧車損巡檢系統</h1>
          </div>
          <p className="guided-capture-home__subtitle">
            請依照引導完成四個角度的拍攝
          </p>
        </header>

        <div className="guided-capture-home__content">
          <VehicleCard
            onPlateNumberChange={onPlateNumberChange ?? (() => undefined)}
            onVehicleModelChange={onVehicleModelChange ?? (() => undefined)}
            plateNumber={plateNumber}
            plateNumberError={resolvedPlateNumberError}
            vehicleModel={vehicleModel}
            vehicleModelError={resolvedVehicleModelError}
            vehicleOptions={VEHICLE_OPTIONS}
          />

          <section aria-label="拍攝提醒" className="guided-capture-card instructions-card">
            <ul className="instructions-card__list">
              <li>請完整拍攝整台車輛。</li>
              <li>請在光線充足的環境拍攝。</li>
              <li>拍攝時請保持手機穩定。</li>
            </ul>
          </section>

          <StartCaptureButton disabled={isStartDisabled} onClick={onStart} />
        </div>
      </div>
    </main>
  );
}
