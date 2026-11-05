import React from 'react';

import { demoThresholds } from '../simulation/state.js';

const formatLimit = value => Number.isFinite(value) ? value.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

export default function TelemetryPanel({ monitoring }) {
  return <aside className="panel telemetry-panel" tabIndex={0} aria-labelledby="telemetry-title">
    <div className="panel-heading"><h2 id="telemetry-title">Thông số giám sát</h2><span className="tag">Mô phỏng 3D</span></div><p className="telemetry-intro">Tính từ cảnh 3D nội bộ · Không phải cảm biến thực</p>
    <div className="metrics">{monitoring.metrics.map((metric, index) => <div className="metric" key={metric.id} data-metric={metric.id}><div><span className="metric-index">{String(index + 1).padStart(2, '0')}</span><span>{metric.label}<span className="metric-description">{metric.description}</span></span></div><strong className={`value-${metric.status}`}>{metric.value}<small>{metric.unit}</small></strong></div>)}</div>
    <div className="berthing-status" aria-live="polite"><span className="eyebrow">Trạng thái giám sát tổng hợp</span><strong className={`value-${monitoring.status}`}><i className="dot" />{monitoring.label}</strong><p>Chỉ đánh giá chỉ số có ngưỡng và tiếp xúc hình học minh họa; không kết luận an toàn tàu.</p></div>
    <p className="note">Trong vùng gần cầu ≤ {demoThresholds.approachZoneM} m: cảnh báo tốc độ &gt; {formatLimit(demoThresholds.approachSpeed?.warningAbove)}; nguy hiểm &gt; {formatLimit(demoThresholds.approachSpeed?.dangerAbove)} m/s. Dấu âm: ra xa cầu.</p>
  </aside>;
}
