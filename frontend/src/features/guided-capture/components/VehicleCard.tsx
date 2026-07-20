import type { JSX } from 'react';
import { VehiclePreview } from './VehiclePreview';
import type { VehicleModel, VehicleOption } from '../data/vehicleOptions';

interface VehicleCardProps {
  onPlateNumberChange: (value: string) => void;
  onVehicleModelChange: (value: VehicleModel | '') => void;
  plateNumber: string;
  plateNumberError?: string;
  vehicleModel: VehicleModel | '';
  vehicleModelError?: string;
  vehicleOptions: readonly VehicleOption[];
}

export function VehicleCard({
  onPlateNumberChange,
  onVehicleModelChange,
  plateNumber,
  plateNumberError,
  vehicleModel,
  vehicleModelError,
  vehicleOptions,
}: VehicleCardProps): JSX.Element {
  return (
    <section aria-label="車輛資訊" className="guided-capture-card vehicle-card">
      <label className="vehicle-card__field">
        <span className="vehicle-card__label">車型</span>
        <select
          className="vehicle-card__control"
          onChange={(event) => onVehicleModelChange(event.target.value as VehicleModel | '')}
          value={vehicleModel}
        >
          <option value="">請選擇車型</option>
          {vehicleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {vehicleModelError !== undefined && (
        <p className="vehicle-card__error">{vehicleModelError}</p>
      )}

      <VehiclePreview vehicleModel={vehicleModel} />

      <label className="vehicle-card__field">
        <span className="vehicle-card__label">車牌</span>
        <input
          autoCapitalize="characters"
          autoCorrect="off"
          className="vehicle-card__control"
          inputMode="text"
          maxLength={10}
          onChange={(event) => onPlateNumberChange(event.target.value)}
          placeholder="例如 ABC-1234"
          spellCheck={false}
          type="text"
          value={plateNumber}
        />
      </label>

      {plateNumberError !== undefined && (
        <p className="vehicle-card__error">{plateNumberError}</p>
      )}
    </section>
  );
}
