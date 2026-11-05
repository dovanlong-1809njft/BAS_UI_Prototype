import React, { useSyncExternalStore } from 'react';
import ShipScene from './components/ShipScene.jsx';
import TelemetryPanel from './components/TelemetryPanel.jsx';
import { subscribeSimulation, getSimulationSnapshot, shipLabels } from './simulation/state.js';

function timeLabel(seconds) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
function distancePlot(history, time) {
  const start = Math.max(0, time - 60), span = Math.max(time - start, 1e-9);
  const values = history.flatMap(point => [point.bow, point.stern]).filter(Number.isFinite);
  const max = Math.max(10, Math.ceil(Math.max(0, ...values) * 1.1 / 10) * 10);
  const x = t => 42 + (t - start) / span * 584;
  const y = value => 80 - value / max * 68;
  const path = key => {
    let drawing = false;
    return history.map(point => {
      if (!Number.isFinite(point[key])) { drawing = false; return ''; }
      const command = drawing ? 'L' : 'M'; drawing = true;
      return `${command}${x(point.time).toFixed(2)} ${y(point[key]).toFixed(2)}`;
    }).join(' ');
  };
  return { start, max, x, y, bow: path('bow'), stern: path('stern') };
}

export default function App() {
  const data = useSyncExternalStore(subscribeSimulation, getSimulationSnapshot, getSimulationSnapshot);
  const { monitoring } = data;
  const plot = distancePlot(data.history, data.time);
  const last = data.history.at(-1);
  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><b>BAS<span>⌁</span></b><div><strong>Hệ thống hỗ trợ tàu cập cầu cảng</strong><small>Giao diện giám sát cập cảng</small></div></div>
      <div className="vessel"><small>Tàu đang giám sát</small><strong>MV OCEAN PIONEER <span>/ {shipLabels[data.ship] || 'Đang tải'}</span></strong></div>
      <div className="header-actions"><span className="connection"><i className="dot" />{data.status === 'ready' ? 'Mô phỏng nội bộ đang hoạt động' : data.status === 'error' ? 'Mô phỏng chưa khả dụng' : 'Đang tải mô phỏng'}</span><button disabled title="Cài đặt chưa hoạt động trong giai đoạn này">⚙ Cài đặt</button></div>
    </header>
    <main>
      <div className="demo-toolbar"><span>Mô phỏng 3D nội bộ · Không phải cảm biến thực</span><span className="demo-tag">Dữ liệu mô phỏng</span></div>
      <div className="dashboard"><ShipScene /><TelemetryPanel monitoring={monitoring} /></div>
      <div className="lower-grid">
        <section className="panel" tabIndex={0} aria-label="Cảnh báo và sự kiện">
          <div className="panel-heading"><h2>Cảnh báo và sự kiện</h2><span className="tag">{monitoring.alerts.length} cảnh báo hiện hành</span></div>
          <div aria-live="polite">{monitoring.alerts.map(alert => <div className="event" key={alert.id}><span className={`event-icon ${alert.status}`}>!</span><div><strong>{alert.label}</strong><p>{alert.message}</p></div></div>)}</div>
          {!monitoring.alerts.length && <p className="note">{data.status === 'ready' ? 'Chưa có cảnh báo hiện hành theo cấu hình minh họa.' : 'Chờ dữ liệu từ cảnh 3D.'}</p>}
          {data.events.map(event => <div className="event" key={event.id}><span className={`event-icon ${event.status}`}>{event.status === 'normal' ? '✓' : event.status === 'info' ? '·' : '!'}</span><div><strong>{event.label}</strong>{event.message && <p>{event.message}</p>}</div><time title="Thời gian mô phỏng trong phiên">{timeLabel(event.time)}</time></div>)}
          <p className="note">Sự kiện theo thời gian mô phỏng · Ngưỡng chỉ để minh họa</p>
        </section>
        <section className="panel trend-panel" tabIndex={0} aria-label="Biểu đồ khoảng cách">
          <div className="panel-heading"><h2>Biểu đồ khoảng cách</h2><span className="tag">Phiên {data.session} · {timeLabel(data.time)}</span></div>
          <div className="legend"><span><i />Mũi tàu</span><span><i className="dashed" />Đuôi tàu</span><span>m</span></div>
          <svg className="trend-chart" viewBox="0 0 640 110" role="img" aria-label="Lịch sử khoảng cách mũi và đuôi tàu từ mô phỏng 3D, tối đa 60 giây gần nhất">
            {[plot.max, plot.max / 2, 0].map(value => <g key={value}><line x1="42" x2="626" y1={plot.y(value)} y2={plot.y(value)} className="chart-grid" /><text x="2" y={plot.y(value) + 4}>{value}</text></g>)}
            <path d={plot.bow} className="chart-line" /><path d={plot.stern} className="chart-line secondary" />
            {last && Number.isFinite(last.bow) && <circle cx={plot.x(last.time)} cy={plot.y(last.bow)} r="2" fill="#555" />}
            {last && Number.isFinite(last.stern) && <circle cx={plot.x(last.time)} cy={plot.y(last.stern)} r="2" fill="#888" />}
            <text x="42" y="105">{plot.start.toFixed(0)} s</text><text x="308" y="105">{((plot.start + data.time) / 2).toFixed(0)} s</text><text x="584" y="105">{data.time.toFixed(0)} s</text>
            {!data.history.length && <text x="220" y="48">Chờ số đo từ mô phỏng 3D</text>}
          </svg>
          <p className="note">Mẫu mỗi giây · Khoảng trống: ngoài phạm vi đo · Đặt lại/đổi tàu bắt đầu phiên mới</p>
        </section>
      </div>
    </main>
  </div>;
}
