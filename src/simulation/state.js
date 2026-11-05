// Deterministic demo kinematics and geometry; no maritime safety claims.
// +Y up, water XZ, local bow -Z; positive yaw turns the bow toward -X (port).
export const demoVesselSizes = {
  cruise: { width: 27.5417846, length: 184.2287750 },
  tanker: { width: 53.1663475, length: 323.5929565 },
};
export const quay = {
  edgeX: -12, width: 60,
  length: Math.ceil(Math.max(...Object.values(demoVesselSizes).map(size => size.length)) * 1.4 / 10) * 10,
  topY: 4, fenderReach: 1,
};
export const vesselControls = { surgeMps: 6, swayMps: 3, yawRadPerSec: Math.PI / 22.5, nearDistance: 8, maxSubstepM: 0.2 };
export const vesselControlCodes = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE'];
export const fineControlCodes = ['ShiftLeft', 'ShiftRight'];
export function createVesselPose(anchor) { return { x: anchor[0], z: anchor[2], yaw: 0 }; }

export function vesselFootprint(pose, size) {
  const cos = Math.cos(pose.yaw), sin = Math.sin(pose.yaw);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const x = sx * size.width / 2, z = sz * size.length / 2;
    return { x: pose.x + cos * x + sin * z, z: pose.z - sin * x + cos * z };
  });
}
function rectangle(minX, maxX, halfLength) { return [{ x: minX, z: -halfLength }, { x: maxX, z: -halfLength }, { x: maxX, z: halfLength }, { x: minX, z: halfLength }]; }
const quayPolygon = rectangle(quay.edgeX - quay.width, quay.edgeX, quay.length / 2);
const fenderPolygon = rectangle(quay.edgeX - 0.001, quay.edgeX + quay.fenderReach, quay.length / 2);

// Separating Axis Theorem on convex footprints; boundary contact is not penetration.
export function footprintsOverlap(a, b) {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const length = Math.hypot(q.x - p.x, q.z - p.z);
      const axis = { x: -(q.z - p.z) / length, z: (q.x - p.x) / length };
      const project = points => points.map(point => point.x * axis.x + point.z * axis.z);
      const ap = project(a), bp = project(b);
      if (Math.max(...ap) <= Math.min(...bp) + 1e-7 || Math.max(...bp) <= Math.min(...ap) + 1e-7) return false;
    }
  }
  return true;
}
export function penetratesQuay(pose, size) { return footprintsOverlap(vesselFootprint(pose, size), quayPolygon); }
function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
}
function footprintDistance(a, b) {
  if (footprintsOverlap(a, b)) return 0;
  let distance = Infinity;
  for (const [points, edges] of [[a, b], [b, a]]) for (const point of points) for (let i = 0; i < edges.length; i++) distance = Math.min(distance, pointSegmentDistance(point, edges[i], edges[(i + 1) % edges.length]));
  return distance;
}
export function getQuayContact(pose, size, blocked = false) {
  const footprint = vesselFootprint(pose, size);
  const clearance = footprintDistance(footprint, quayPolygon);
  const touching = footprintsOverlap(footprint, fenderPolygon) || (clearance < 0.001 && footprint.some(p => p.x >= quay.edgeX - 0.001));
  const status = blocked || penetratesQuay(pose, size) ? 'blocked' : touching ? 'contact' : clearance <= vesselControls.nearDistance ? 'near' : 'clear';
  const labels = { clear: 'Chưa tiếp xúc', near: 'Đang ở gần cầu cảng', contact: 'Tiếp xúc đệm / mép cầu', blocked: 'Đã chặn xâm nhập cầu cảng' };
  return { status, label: labels[status], clearance };
}
export function advanceVessel(pose, keys, delta, size) {
  const dt = Math.max(0, Math.min(Number.isFinite(delta) ? delta : 0, 0.1));
  const axis = (positive, negative) => Number(keys.has(positive)) - Number(keys.has(negative));
  const factor = fineControlCodes.some(code => keys.has(code)) ? 0.05 : 1;
  const maxSpeed = vesselControls.surgeMps * factor;
  let surge = axis('KeyW', 'KeyS') * maxSpeed;
  let sway = axis('KeyD', 'KeyA') * vesselControls.swayMps * factor;
  const magnitude = Math.hypot(surge, sway);
  if (magnitude > maxSpeed) { surge *= maxSpeed / magnitude; sway *= maxSpeed / magnitude; }
  const turn = axis('KeyQ', 'KeyE') * vesselControls.yawRadPerSec * factor;
  const sweptDistance = magnitude * dt + Math.hypot(size.width, size.length) / 2 * Math.abs(turn * dt);
  const steps = Math.max(1, Math.ceil(sweptDistance / vesselControls.maxSubstepM));
  let next = { ...pose }, blocked = false;
  for (let i = 0; i < steps; i++) {
    const yaw = next.yaw + turn * dt / steps;
    const midYaw = (next.yaw + yaw) / 2;
    const candidate = { x: next.x + (Math.cos(midYaw) * sway - Math.sin(midYaw) * surge) * dt / steps,
      z: next.z + (-Math.sin(midYaw) * sway - Math.cos(midYaw) * surge) * dt / steps,
      yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)) };
    if (penetratesQuay(candidate, size)) { blocked = true; break; }
    next = candidate;
  }
  return { pose: next, contact: getQuayContact(next, size, blocked) };
}

// All thresholds below are configurable presentation examples, not safety standards.
export const demoThresholds = {
  approachSpeed: { warningAbove: 0.20, dangerAbove: 0.30 },
  approachZoneM: vesselControls.nearDistance,
};
export const shipLabels = { cruise: 'Tàu du lịch', tanker: 'Tàu chở dầu' };

function endDistance(pose, size, localZ) {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const points = [-size.width / 2, size.width / 2].map(x => ({ x: pose.x + c * x + s * localZ, z: pose.z - s * x + c * localZ }));
  const [a, b] = points, dz = b.z - a.z, half = quay.length / 2;
  let lo = 0, hi = 1;
  if (Math.abs(dz) < 1e-9) { if (a.z < -half || a.z > half) return null; }
  else {
    const ts = [(-half - a.z) / dz, (half - a.z) / dz].sort((x, y) => x - y);
    lo = Math.max(0, ts[0]); hi = Math.min(1, ts[1]);
    if (lo > hi) return null;
  }
  const nearestX = Math.min(a.x + (b.x - a.x) * lo, a.x + (b.x - a.x) * hi);
  const distance = nearestX - quay.edgeX;
  return distance >= -1e-6 ? Math.max(0, distance) : null;
}
export function deriveTelemetry(pose, size, velocity = { x: 0, z: 0 }) {
  if (!pose || !size) return { bowDistance: null, sternDistance: null, approachSpeed: null, dockingAngle: null, heading: null, inRange: false };
  const bowDistance = endDistance(pose, size, -size.length / 2);
  const sternDistance = endDistance(pose, size, size.length / 2);
  return { bowDistance, sternDistance,
    approachSpeed: Math.abs(velocity.x) < 1e-7 ? 0 : -velocity.x,
    dockingAngle: Math.acos(Math.min(1, Math.abs(Math.cos(pose.yaw)))) * 180 / Math.PI,
    heading: ((-pose.yaw * 180 / Math.PI) % 360 + 360) % 360,
    inRange: bowDistance !== null || sternDistance !== null };
}
export function getMonitoringState(readings, contact, thresholds = demoThresholds) {
  const limit = thresholds.approachSpeed;
  const configured = limit && Number.isFinite(limit.warningAbove) && Number.isFinite(limit.dangerAbove) && limit.warningAbove >= 0 && limit.dangerAbove >= limit.warningAbove && Number.isFinite(thresholds.approachZoneM) && thresholds.approachZoneM >= 0;
  const inZone = readings.inRange && contact && contact.clearance <= thresholds.approachZoneM;
  const definitions = [['bowDistance', 'Khoảng cách mũi tàu', 'm', 2], ['sternDistance', 'Khoảng cách đuôi tàu', 'm', 2], ['approachSpeed', 'Tốc độ tiếp cận', 'm/s', 2], ['dockingAngle', 'Góc cập cầu', '°', 1], ['heading', 'Hướng mũi tàu', '°', 1]];
  const metrics = definitions.map(([id, label, unit, digits]) => {
    const value = readings[id], hasData = typeof value === 'number' && Number.isFinite(value);
    const assessed = id === 'approachSpeed' && hasData && configured && inZone;
    const status = !assessed ? 'unknown' : value > limit.dangerAbove + 1e-6 ? 'danger' : value > limit.warningAbove + 1e-6 ? 'warning' : 'normal';
    let description = !hasData ? (id.endsWith('Distance') && readings.heading !== null ? 'Ngoài phạm vi mép cầu' : 'Chờ dữ liệu mô phỏng') : 'Chưa có ngưỡng đánh giá';
    if (id === 'approachSpeed' && hasData) {
      const direction = value > 1e-6 ? 'Về phía cầu' : value < -1e-6 ? 'Ra xa cầu' : 'Không tiếp cận ngang';
      description = `${direction} · ${!configured ? 'chưa có ngưỡng' : !inZone ? 'ngoài vùng đánh giá' : status === 'danger' ? 'vượt mức nguy hiểm minh họa' : status === 'warning' ? 'vượt mức cảnh báo minh họa' : 'trong ngưỡng minh họa'}`;
    }
    return { id, label, unit, status, description, value: hasData ? value.toFixed(digits) : '—' };
  });
  const alerts = metrics.filter(m => ['warning', 'danger'].includes(m.status)).map(m => ({ id: m.id, status: m.status, label: m.label, message: `${m.label}: ${m.value} ${m.unit}. ${m.description}.` }));
  if (contact?.status === 'contact') alerts.push({ id: 'contact', status: 'warning', label: 'Tiếp xúc đệm / mép cầu', message: 'Tiếp xúc hình học minh họa; không đồng nhất với tai nạn.' });
  if (contact?.status === 'blocked') alerts.push({ id: 'quay-blocked', status: 'danger', label: 'Đã chặn xâm nhập cầu cảng', message: 'Bước chuyển bị chặn; tàu giữ tư thế hợp lệ cuối cùng.' });
  const status = alerts.some(a => a.status === 'danger') ? 'danger' : alerts.length ? 'warning' : metrics.some(m => m.status === 'normal') ? 'normal' : 'unknown';
  const labels = { danger: 'Có cảnh báo mức nguy hiểm', warning: 'Có cảnh báo minh họa', normal: 'Trong ngưỡng đã đánh giá', unknown: 'Chưa có chỉ số được đánh giá' };
  return { metrics, alerts, status, label: labels[status], inZone };
}

// One live state for both the Canvas and all Dashboard consumers. React receives
// immutable display snapshots only; no second integrator or intended velocity.
export const simulationRuntime = { current: {
  keys: new Set(), enabled: false, pose: null, object: null, ship: null, size: null,
  velocity: { x: 0, z: 0 }, status: 'loading', time: 0, session: 0,
  history: [], events: [], alertStates: new Map(), contact: null,
} };
const listeners = new Set();
let eventId = 0;
let snapshot = null;
export const subscribeSimulation = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const getSimulationSnapshot = () => snapshot;
function addEvent(label, status = 'info', message = '') {
  const r = simulationRuntime.current;
  r.events = [{ id: ++eventId, time: r.time, label, status, message }, ...r.events].slice(0, 80);
}
function publishSimulation(recordHistory = false) {
  const r = simulationRuntime.current;
  const readings = deriveTelemetry(r.status === 'ready' ? r.pose : null, r.size, r.velocity);
  const contact = r.status === 'ready' && r.pose ? getQuayContact(r.pose, r.size, r.contact?.status === 'blocked') : null;
  const monitoring = getMonitoringState(readings, contact);
  const nextAlerts = new Map(monitoring.alerts.map(a => [a.id, a]));
  for (const alert of nextAlerts.values()) {
    if (r.alertStates.get(alert.id)?.status !== alert.status) addEvent(`${alert.status === 'danger' ? 'Nguy hiểm minh họa' : 'Cảnh báo'} · ${alert.label}`, alert.status, alert.message);
  }
  for (const [id, alert] of r.alertStates) if (!nextAlerts.has(id)) addEvent(`Kết thúc cảnh báo · ${alert.label}`, 'normal', 'Điều kiện cảnh báo không còn trong mẫu hiện tại.');
  r.alertStates = nextAlerts;
  if (recordHistory) {
    r.history = [...r.history, { time: r.time, bow: readings.bowDistance, stern: readings.sternDistance }];
    r.lastHistoryTime = r.time;
  }
  r.history = r.history.filter(point => point.time >= r.time - 60);
  snapshot = { session: r.session, ship: r.ship, status: r.status, time: r.time,
    pose: r.pose ? { ...r.pose } : null, velocity: { ...r.velocity }, readings, monitoring,
    history: r.history, events: r.events, contact };
  listeners.forEach(listener => listener());
}
export function startSimulationSession(ship, anchor, size, reason = 'model', modelToken = null) {
  const r = simulationRuntime.current;
  if (reason === 'model' && modelToken && r.modelToken === modelToken && r.status === 'ready') return;
  Object.assign(r, { ship, anchor, size, pose: createVesselPose(anchor), velocity: { x: 0, z: 0 }, status: 'ready',
    time: 0, session: r.session + 1, modelToken, history: [], events: [], alertStates: new Map(), lastHistoryTime: 0 });
  r.keys.clear();
  r.contact = getQuayContact(r.pose, size);
  r.contactStatus = r.contact.status;
  addEvent(reason === 'reset' ? 'Đặt lại vị trí · bắt đầu phiên mới' : `Bắt đầu phiên · ${shipLabels[ship]}`);
  publishSimulation(true);
}
export function setSimulationUnavailable(status = 'loading') {
  const r = simulationRuntime.current;
  r.status = status; r.enabled = false; r.keys.clear(); r.velocity = { x: 0, z: 0 };
  r.history = []; r.events = []; r.alertStates = new Map(); r.time = 0;
  publishSimulation();
}
export function sampleSimulation(delta) {
  const r = simulationRuntime.current;
  if (r.status !== 'ready' || !r.pose || !(delta > 0) || !Number.isFinite(delta)) return;
  r.time += delta;
  if (!vesselControlCodes.some(code => r.keys.has(code))) r.velocity = { x: 0, z: 0 };
  publishSimulation(r.time - r.lastHistoryTime >= 1 - 1e-6);
}
export function stepSimulation(delta) {
  const r = simulationRuntime.current;
  if (r.status !== 'ready' || !r.pose || !r.size) return null;
  const dt = Math.max(0, Math.min(Number.isFinite(delta) ? delta : 0, 0.1));
  const previous = r.pose;
  const result = advanceVessel(previous, r.keys, dt, r.size);
  r.pose = result.pose;
  r.contact = result.contact;
  r.velocity = dt > 0 ? { x: (r.pose.x - previous.x) / dt, z: (r.pose.z - previous.z) / dt } : { x: 0, z: 0 };
  return result;
}
publishSimulation();
