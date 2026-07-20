import type { JSX } from 'react';

interface SummaryGridProps {
  vehicleName: string;
  plateNumber: string;
  completed: number;
  total: number;
  captureTime: string;
}

export function SummaryGrid({
  vehicleName,
  plateNumber,
  completed,
  total,
  captureTime,
}: SummaryGridProps): JSX.Element {
  return (
    <section aria-label="拍攝摘要" className="summary-grid">
      <div className="summary-grid__item">
        <div className="summary-grid__label">車型</div>
        <div className="summary-grid__value">{vehicleName}</div>
      </div>

      <div className="summary-grid__item">
        <div className="summary-grid__label">車牌號碼</div>
        <div className="summary-grid__value">{plateNumber}</div>
      </div>

      <div className="summary-grid__item">
        <div className="summary-grid__label">已完成</div>
        <div className="summary-grid__value">{completed} / {total}</div>
      </div>

      <div className="summary-grid__item">
        <div className="summary-grid__label">拍攝日期</div>
        <div className="summary-grid__value">{captureTime}</div>
      </div>
    </section>
  );
}
