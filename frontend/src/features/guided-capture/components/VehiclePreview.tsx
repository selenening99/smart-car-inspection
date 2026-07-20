import { useEffect, useState, type JSX } from 'react';
import { getVehicleOption, type VehicleModel } from '../data/vehicleOptions';

export interface VehiclePreviewProps {
  vehicleModel: VehicleModel | '';
}

export function VehiclePreview({ vehicleModel }: VehiclePreviewProps): JSX.Element {
  const vehicleOption = getVehicleOption(vehicleModel);
  const [failedImageSrc, setFailedImageSrc] = useState<string>();

  useEffect(() => {
    setFailedImageSrc(undefined);
  }, [vehicleModel]);

  if (vehicleOption === undefined) {
    return (
      <div className="vehicle-preview vehicle-preview--placeholder" aria-live="polite">
        <span className="vehicle-preview__placeholder-text">請先選擇車型</span>
      </div>
    );
  }

  if (failedImageSrc === vehicleOption.imageSrc) {
    return (
      <div className="vehicle-preview vehicle-preview--fallback" aria-live="polite">
        <span className="vehicle-preview__placeholder-text">暫無車型圖片</span>
      </div>
    );
  }

  return (
    <div className="vehicle-preview">
      <img
        alt={vehicleOption.imageAlt}
        className="vehicle-preview__image"
        onError={() => {
          setFailedImageSrc(vehicleOption.imageSrc);

          if (import.meta.env.DEV) {
            console.warn(`Vehicle image failed to load: ${vehicleOption.value}`);
          }
        }}
        src={vehicleOption.imageSrc}
      />
    </div>
  );
}
