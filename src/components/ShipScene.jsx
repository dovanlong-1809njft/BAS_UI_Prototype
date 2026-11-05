import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import cruiseUrl from '../assets/models/cruise_liner.glb?url';
import tankerUrl from '../assets/models/tanker_ship.glb?url';
import { quay, vesselControlCodes, fineControlCodes, getQuayContact, simulationRuntime, startSimulationSession, setSimulationUnavailable, sampleSimulation, stepSimulation } from '../simulation/state.js';

// Meters; Y up, water Y=0, quay edge X=-12, vessel bow -Z.
const QUAY_EDGE = quay.edgeX;
const MAX_POLAR = 1.40;
const views = [['top', 'Góc nhìn từ trên'], ['3d', 'Góc nhìn 3D'], ['side', 'Góc nhìn bên'], ['quay', 'Từ cầu cảng']];
const shipTypes = {
  cruise: { label: 'Tàu du lịch', url: cruiseUrl, draft: 8 },
  tanker: { label: 'Tàu chở dầu', url: tankerUrl, draft: 12 },
};
function frameForBounds(bounds) {
  const wholeScene = bounds.clone().union(new THREE.Box3(new THREE.Vector3(QUAY_EDGE - quay.width, -2, -quay.length / 2), new THREE.Vector3(42, 8.05, quay.length / 2)));
  const sphere = wholeScene.getBoundingSphere(new THREE.Sphere());
  const minDistance = Math.max(sphere.radius * 1.15, (wholeScene.max.y - sphere.center.y + 3) / Math.cos(MAX_POLAR));
  return { target: sphere.center.toArray(), min: wholeScene.min.toArray(), max: wholeScene.max.toArray(), minDistance, maxY: wholeScene.max.y };
}
const defaultFrame = frameForBounds(new THREE.Box3(new THREE.Vector3(7, -2, -29), new THREE.Vector3(17, 6, 29)));

// Normal-only ripples: vertices and the reference water plane remain exactly Y=0.
const waterVertexShader = `
  varying vec3 vWaterPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWaterPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const waterFragmentShader = `
  // BAS_PROCEDURAL_WATER
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uLight;
  varying vec3 vWaterPosition;
  void main() {
    vec2 p = vWaterPosition.xz;
    float a = p.x * 0.43 + p.y * 0.27 + uTime * 0.70;
    float b = p.x * -0.21 + p.y * 0.61 - uTime * 0.48;
    float c = p.x * 1.15 + p.y * 0.77 + uTime * 0.94;
    vec2 slope = vec2(0.020, 0.013) * cos(a)
      + vec2(-0.008, 0.023) * cos(b) + vec2(0.009, 0.006) * cos(c);
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 eye = normalize(cameraPosition - vWaterPosition);
    float facing = max(dot(n, eye), 0.0);
    float fresnel = pow(1.0 - facing, 3.0);
    vec3 color = mix(uDeep, uLight, 0.34 + fresnel * 0.42);
    color += 0.012 * sin(a) * sin(b);
    vec3 sun = normalize(vec3(0.40, 0.85, 0.30));
    float glint = pow(max(dot(reflect(-sun, n), eye), 0.0), 96.0);
    color += vec3(0.06) * glint;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function ProceduralWater({ mode, onFallback }) {
  const material = useRef();
  const performanceWindow = useRef({ seconds: 0, frames: 0, warmup: 0 });
  const { gl, invalidate } = useThree();
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uDeep: { value: new THREE.Color('#8fa9aa') }, uLight: { value: new THREE.Color('#c1d1ce') } }), []);
  useEffect(() => {
    performanceWindow.current = { seconds: 0, frames: 0, warmup: 0 };
    const resume = () => { performanceWindow.current = { seconds: 0, frames: 0, warmup: 0 }; invalidate(); };
    document.addEventListener('visibilitychange', resume);
    invalidate();
    return () => document.removeEventListener('visibilitychange', resume);
  }, [mode, invalidate]);
  React.useLayoutEffect(() => {
    const previous = gl.debug.onShaderError;
    const handler = (context, program, vertex, fragment) => {
      if (context.getShaderSource(fragment)?.includes('BAS_PROCEDURAL_WATER')) queueMicrotask(() => onFallback('shader'));
      else if (previous) previous(context, program, vertex, fragment);
      else console.error('Không biên dịch được shader của cảnh 3D.', context.getProgramInfoLog(program));
    };
    gl.debug.onShaderError = handler;
    return () => { if (gl.debug.onShaderError === handler) gl.debug.onShaderError = previous; };
  }, [gl, onFallback]);
  useFrame(({ clock }, delta) => {
    if (mode !== 'ripple' || document.hidden) return;
    if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime;
    // Switch only on sustained measured underperformance, excluding warm-up/hidden tabs.
    const window = performanceWindow.current;
    window.warmup += delta;
    if (window.warmup > 3 && delta < 0.5) {
      window.seconds += delta; window.frames++;
      if (window.seconds >= 10) {
        if (window.frames / window.seconds < 24) onFallback('performance');
        window.seconds = 0; window.frames = 0;
      }
    }
    invalidate();
  });
  // Declarative R3F resources are disposed on replacement/unmount; no per-frame allocation.
  return <mesh rotation={[-Math.PI / 2, 0, 0]} name="water" userData={{ mode }}>
    <planeGeometry args={[2400, 2400]} />
    {mode === 'ripple'
      ? <shaderMaterial ref={material} name="BAS Procedural Water" uniforms={uniforms} vertexShader={waterVertexShader} fragmentShader={waterFragmentShader} />
      : <meshStandardMaterial color="#a6b9b8" roughness={0.88} />}
  </mesh>;
}

function normalizeVessel(scene, config) {
  // Clone only the hierarchy; cached geometry, textures and materials remain untouched.
  const object = new THREE.Group();
  object.name = 'normalized-vessel';
  const orientation = new THREE.Group();
  orientation.rotation.y = Math.PI; // Exported rudder/propeller are at -Z: bow was +Z.
  orientation.add(scene.clone(true));
  object.add(orientation);
  object.updateMatrixWorld(true);
  const originalBounds = new THREE.Box3().setFromObject(object, true);
  if (originalBounds.isEmpty()) throw new Error('Mô hình không có hình học hiển thị.');
  const center = originalBounds.getCenter(new THREE.Vector3());
  const size = originalBounds.getSize(new THREE.Vector3());
  // Keep native 1:1 scale and relative vessel dimensions; real dimensions are unverified.
  orientation.position.set(-center.x, -originalBounds.min.y - config.draft, -center.z);
  const anchorX = Math.max(12, QUAY_EDGE + 19 + size.x / 2);
  object.position.set(anchorX, 0, 0);
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object, true);
  return { object, size: size.toArray(), anchor: [anchorX, 0, 0], offset: orientation.position.toArray(), bounds,
    frame: frameForBounds(bounds) };
}

function VesselModel({ ship, onLoaded }) {
  const config = shipTypes[ship];
  const { scene } = useGLTF(config.url);
  const model = useMemo(() => normalizeVessel(scene, config), [scene, config]);
  const invalidate = useThree(state => state.invalidate);
  React.useLayoutEffect(() => { onLoaded(ship, model); invalidate(); }, [ship, model, onLoaded, invalidate]);
  return <primitive key={ship} object={model.object} dispose={null} />;
}

function VesselSlot({ ship, onLoaded, onError }) {
  const [visibleShip, setVisibleShip] = useState(ship);
  useEffect(() => {
    // Canvas has its own React root: run the transition here so Suspense retains
    // the previous vessel until the replacement and its textures are ready.
    React.startTransition(() => setVisibleShip(ship));
  }, [ship]);
  return <ModelBoundary ship={visibleShip} onError={onError}><React.Suspense fallback={<TemporaryVessel />}><VesselModel ship={visibleShip} onLoaded={onLoaded} /></React.Suspense></ModelBoundary>;
}

class ModelBoundary extends React.Component {
  state = { id: this.props.ship, failed: false };
  static getDerivedStateFromProps(props, state) { return props.ship !== state.id ? { id: props.ship, failed: false } : null; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(this.props.ship); }
  render() { return this.state.failed ? <TemporaryVessel /> : this.props.children; }
}

function WebGLFallback() {
  return <div className="scene-fallback" role="status"><strong>Không thể hiển thị môi trường 3D</strong><p>WebGL có thể không khả dụng hoặc ngữ cảnh đồ họa đã bị mất. Hãy bật tăng tốc phần cứng hoặc thử trình duyệt khác rồi tải lại trang.</p><span>Phép đo mô phỏng không khả dụng khi cảnh 3D không hoạt động.</span></div>;
}

class SceneBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { setSimulationUnavailable('error'); this.props.onError?.(); }
  render() { return this.state.failed ? <WebGLFallback /> : this.props.children; }
}

function VesselMotion({ runtime, onContact }) {
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => { runtime.current.invalidate = invalidate; }, [runtime, invalidate]);
  useEffect(() => {
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now(), delta = (now - previous) / 1000;
      previous = now;
      if (!document.hidden) sampleSimulation(delta);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
  useFrame((_, delta) => {
    const current = runtime.current;
    if (!current.enabled || !current.object || !current.pose) return;
    const result = stepSimulation(delta);
    if (!result) return;
    current.object.position.set(result.pose.x, 0, result.pose.z);
    current.object.rotation.y = result.pose.yaw;
    if (current.contactStatus !== result.contact.status) {
      current.contactStatus = result.contact.status;
      onContact(result.contact);
    }
    if (vesselControlCodes.some(code => current.keys.has(code))) invalidate();
  });
  return null;
}

function CameraRig({ view, frame, runtime, resetVersion, onContextLost }) {
  const controls = useRef();
  const lastFollow = useRef(new THREE.Vector3());
  const { camera, size, invalidate, gl } = useThree();
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(size.width / Math.max(size.height, 1), 0.1));
  const polar = view === 'top' ? 0.001 : view === 'side' || view === 'quay' ? 1.35 : 0.85;
  const azimuth = view === '3d' ? Math.PI / 3 : view === 'quay' ? -Math.PI / 2 : Math.PI / 2;
  const distance = useMemo(() => {
    const direction = new THREE.Vector3().setFromSphericalCoords(1, polar, azimuth);
    const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
    const up = direction.clone().cross(right).normalize();
    const target = new THREE.Vector3(...frame.target);
    let required = 0;
    // Fit actual projected corners, rather than a sphere that wastes the wide panel.
    for (const x of [frame.min[0], frame.max[0]]) for (const y of [frame.min[1], frame.max[1]]) for (const z of [frame.min[2], frame.max[2]]) {
      const point = new THREE.Vector3(x, y, z).sub(target);
      required = Math.max(required, point.dot(direction) + Math.max(Math.abs(point.dot(right)) / Math.tan(horizontalFov / 2), Math.abs(point.dot(up)) / Math.tan(verticalFov / 2)));
    }
    return Math.max(frame.minDistance, required * 1.08);
  }, [frame, polar, azimuth, verticalFov, horizontalFov]);

  useEffect(() => {
    const element = gl.domElement;
    const handleLost = event => { event.preventDefault(); onContextLost(); };
    element.addEventListener('webglcontextlost', handleLost);
    return () => element.removeEventListener('webglcontextlost', handleLost);
  }, [gl, onContextLost]);

  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    // Only explicit preset/reset, model changes or resize reframe the camera.
    control.target.fromArray(frame.target);
    const current = runtime.current;
    const follow = current.pose ? new THREE.Vector3(current.pose.x - current.anchor[0], 0, current.pose.z - current.anchor[2]) : new THREE.Vector3();
    lastFollow.current.copy(follow);
    control.target.add(follow);
    camera.position.setFromSphericalCoords(distance, polar, azimuth);
    camera.position.add(control.target);
    camera.up.set(0, 1, 0);
    camera.lookAt(control.target);
    camera.updateProjectionMatrix();
    control.update();
    invalidate();
  }, [view, frame, distance, polar, azimuth, resetVersion, runtime, camera, invalidate]);

  useFrame(() => {
    const control = controls.current, current = runtime.current;
    if (!control) return;
    if (current.pose) {
      const follow = new THREE.Vector3(current.pose.x - current.anchor[0], 0, current.pose.z - current.anchor[2]);
      const offset = follow.clone().sub(lastFollow.current);
      if (offset.lengthSq() > 0) {
        camera.position.add(offset);
        control.target.add(offset);
        lastFollow.current.copy(follow);
      }
    }
    // Horizontal pan stays available; height is clamped above the tallest solid.
    if (camera.position.y < frame.maxY + 3) {
      camera.position.y = frame.maxY + 3;
      control.update();
      invalidate();
    }
  });

  return <OrbitControls ref={controls} makeDefault enablePan={view === '3d'} screenSpacePanning={false} enableDamping={false}
    enableRotate={view === '3d'} enableZoom minDistance={frame.minDistance} maxDistance={distance * 2.2}
    minPolarAngle={view === '3d' ? 0.15 : polar} maxPolarAngle={view === '3d' ? MAX_POLAR : polar}
    minAzimuthAngle={view === '3d' ? -Infinity : view === 'quay' ? -Math.PI / 2 : Math.PI / 2}
    maxAzimuthAngle={view === '3d' ? Infinity : view === 'quay' ? -Math.PI / 2 : Math.PI / 2}
    zoomSpeed={0.7} rotateSpeed={0.6} keyEvents={false} />;
}

function TemporaryVessel() {
  const hull = useMemo(() => {
    const shape = new THREE.Shape();
    // Local XY is rotated into world XZ: local +Y becomes bow -Z.
    shape.moveTo(-5, -25);
    shape.lineTo(5, -25);
    shape.lineTo(5, 16);
    shape.quadraticCurveTo(5, 23, 0, 29);
    shape.quadraticCurveTo(-5, 23, -5, 16);
    shape.closePath();
    return shape;
  }, []);
  return <group position={[12, 0, 0]} name="temporary-vessel">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.8, 0]} name="hull"><extrudeGeometry args={[hull, { depth: 4, bevelEnabled: false, curveSegments: 8 }]} /><meshStandardMaterial color="#505b58" roughness={0.85} /></mesh>
      <mesh position={[0, 2.25, -1]}><boxGeometry args={[8.2, 0.3, 42]} /><meshStandardMaterial color="#d8d9d0" /></mesh>
      <mesh position={[0, 4, 17]} name="stern-cabin"><boxGeometry args={[7, 3.2, 7]} /><meshStandardMaterial color="#f5f3ec" /></mesh>
      <mesh position={[0, 5.8, 17]}><boxGeometry args={[7.7, 0.4, 7.6]} /><meshStandardMaterial color="#737e78" /></mesh>
      <mesh position={[0, 4.6, 13.45]}><boxGeometry args={[5.5, 0.9, 0.12]} /><meshStandardMaterial color="#434e4b" /></mesh>
      <mesh position={[0, 3.1, -5]}><boxGeometry args={[5.6, 1.5, 18]} /><meshStandardMaterial color="#a2aaa1" /></mesh>
      <mesh position={[0, 2.5, -23]} rotation={[-Math.PI / 2, 0, 0]} name="bow-marker"><coneGeometry args={[1.1, 3.5, 3]} /><meshStandardMaterial color="#faf9f4" /></mesh>
    </group>;
}

function Harbour({ waterMode, onWaterFallback }) {
  return <>
    <color attach="background" args={['#eef1f0']} />
    <ambientLight intensity={1.4} />
    <directionalLight position={[40, 80, 30]} intensity={2.2} />
    <ProceduralWater mode={waterMode} onFallback={onWaterFallback} />
    <gridHelper args={[600, 60, '#91a5a3', '#afbfbd']} position={[0, 0.015, 0]} />
    <mesh position={[QUAY_EDGE - quay.width / 2, 1, 0]} name="quay"><boxGeometry args={[quay.width, 6, quay.length]} /><meshStandardMaterial color="#c5c1b7" roughness={1} /></mesh>
    <mesh position={[QUAY_EDGE - 0.35, 4.035, 0]} name="quay-edge"><boxGeometry args={[0.7, 0.07, quay.length]} /><meshStandardMaterial color="#655f51" /></mesh>
    {Array.from({ length: 15 }, (_, i) => (i - 7) * 30).map(z => <group key={z}>
      <mesh position={[QUAY_EDGE + quay.fenderReach / 2, 1, z]}><boxGeometry args={[quay.fenderReach, 3, 4]} /><meshStandardMaterial color="#515553" /></mesh>
      <mesh position={[QUAY_EDGE - 5, 4.5, z]}><cylinderGeometry args={[0.7, 0.85, 1, 10]} /><meshStandardMaterial color="#666a67" /></mesh>
      <mesh position={[QUAY_EDGE - 12, 4.04, z]}><boxGeometry args={[0.5, 0.08, 9]} /><meshStandardMaterial color="#f2efe6" /></mesh>
    </group>)}
    {/* Grayscale axes avoid adding a blue UI theme: X short, Y vertical, Z long. */}
    <group position={[34, 0.05, 40]} name="coordinate-axes">
      <mesh position={[4, 0, 0]}><boxGeometry args={[8, 0.15, 0.15]} /><meshBasicMaterial color="#414b48" /></mesh>
      <mesh position={[0, 4, 0]}><boxGeometry args={[0.15, 8, 0.15]} /><meshBasicMaterial color="#414b48" /></mesh>
      <mesh position={[0, 0, 5]}><boxGeometry args={[0.15, 0.15, 10]} /><meshBasicMaterial color="#414b48" /></mesh>
    </group>
  </>;
}

export default React.memo(function ShipScene() {
  const [view, setView] = useState('top');
  const [ship, setShip] = useState('cruise');
  const [frame, setFrame] = useState(defaultFrame);
  const [modelState, setModelState] = useState({ status: 'loading', id: 'cruise' });
  const [contextLost, setContextLost] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [contact, setContact] = useState({ status: 'clear', label: 'Chưa tiếp xúc' });
  const [fine, setFine] = useState(false);
  const [waterMode, setWaterMode] = useState('ripple');
  const [waterFallback, setWaterFallback] = useState('');
  const handleWaterFallback = React.useCallback(reason => { setWaterMode('simple'); setWaterFallback(reason); }, []);
  const runtime = simulationRuntime;
  const handleContextLost = React.useCallback(() => { setSimulationUnavailable('error'); setContextLost(true); }, []);
  const handleContact = React.useCallback(next => setContact(previous => previous.status === next.status ? previous : next), []);
  const handleLoaded = React.useCallback((id, model) => {
    const current = runtime.current;
    current.object = model.object;
    startSimulationSession(id, model.anchor, { width: model.size[0], length: model.size[2] }, 'model', model.object.uuid);
    setFine(false);
    model.object.rotation.y = 0;
    model.object.position.set(...model.anchor);
    setContact(getQuayContact(current.pose, current.size));
    setFrame(model.frame);
    setModelState({ status: 'ready', id });
  }, []);
  const handleModelError = React.useCallback(id => {
    runtime.current.enabled = false;
    runtime.current.keys.clear();
    runtime.current.object = null;
    runtime.current.pose = null;
    runtime.current.contactStatus = 'clear';
    setSimulationUnavailable('error');
    setFine(false);
    setContact({ status: 'clear', label: 'Chưa tiếp xúc' });
    setFrame(defaultFrame);
    setModelState({ status: 'error', id });
  }, []);
  const ready = !contextLost && modelState.status === 'ready' && modelState.id === ship;
  const loadingModel = modelState.status === 'loading' || modelState.id !== ship;
  useEffect(() => {
    runtime.current.enabled = ready;
    runtime.current.keys.clear();
    setFine(false);
  }, [ready, ship]);
  useEffect(() => {
    const editing = element => element instanceof Element && (element.closest('input, textarea, select, button') || element.isContentEditable);
    const clear = () => { runtime.current.keys.clear(); setFine(false); runtime.current.invalidate?.(); };
    const down = event => {
      if (!runtime.current.enabled || ![...vesselControlCodes, ...fineControlCodes].includes(event.code) || event.ctrlKey || event.altKey || event.metaKey || editing(event.target)) return;
      if (vesselControlCodes.includes(event.code)) event.preventDefault();
      runtime.current.keys.add(event.code);
      if (fineControlCodes.includes(event.code)) setFine(true);
      if (event.shiftKey) { runtime.current.keys.add('ShiftLeft'); setFine(true); }
      runtime.current.invalidate?.();
    };
    const up = event => {
      if (runtime.current.keys.delete(event.code)) runtime.current.invalidate?.();
      if (fineControlCodes.includes(event.code)) {
        if (!event.shiftKey) fineControlCodes.forEach(code => runtime.current.keys.delete(code));
        setFine(fineControlCodes.some(code => runtime.current.keys.has(code)));
      }
    };
    const focus = event => { if (editing(event.target)) clear(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    document.addEventListener('focusin', focus);
    return () => {
      clear();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
      document.removeEventListener('focusin', focus);
    };
  }, []);
  const resetVessel = () => {
    const current = runtime.current;
    if (!current.object || !current.pose) return;
    startSimulationSession(current.ship, current.anchor, current.size, 'reset', current.modelToken);
    setFine(false);
    current.object.position.set(...current.anchor);
    current.object.rotation.y = 0;
    current.contactStatus = 'clear';
    setContact(getQuayContact(current.pose, current.size));
    setResetVersion(version => version + 1);
    current.invalidate?.();
  };
  const modelMessage = modelState.id !== ship || modelState.status === 'loading' ? 'Đang tải mô hình tàu…'
    : modelState.status === 'error' ? 'Không tải được GLB. Đang dùng tàu hình học dự phòng.'
      : `${shipTypes[ship].label} · Tỷ lệ và mớn nước minh họa`;
  return <section className="panel scene-panel" aria-labelledby="scene-title">
    <div className="panel-heading scene-heading">
      <div><h2 id="scene-title">Mô phỏng tàu</h2><p>Môi trường 3D · dữ liệu minh họa</p></div>
      <div className="scene-tools">
        <label className="ship-picker" htmlFor="ship-type">Loại tàu
          <select id="ship-type" value={ship} disabled={contextLost || loadingModel} onChange={event => {
            if (loadingModel || event.target.value === ship) return;
            runtime.current.keys.clear();
            runtime.current.enabled = false;
            setSimulationUnavailable('loading');
            setFine(false);
            setShip(event.target.value);
          }}>
            <option value="cruise">Tàu du lịch</option><option value="tanker">Tàu chở dầu</option>
          </select>
        </label>
        <div className="view-switch" role="group" aria-label="Chọn góc nhìn">
          {views.map(([mode, label]) => <button key={mode} aria-pressed={view === mode} disabled={contextLost} onClick={() => {
            setView(mode);
            setResetVersion(version => version + 1);
          }}>{label}</button>)}
        </div>
        <button className="reset-vessel" onClick={resetVessel} disabled={!ready}>Đặt lại vị trí tàu</button>
      </div>
    </div>
    {/* Keep the containing block local even during stylesheet hot replacement. */}
    <div className="scene-canvas" style={{ position: 'relative', minWidth: 0, overflow: 'hidden' }} role="region" tabIndex={0} onPointerDown={event => event.currentTarget.focus({ preventScroll: true })} aria-label="Môi trường 3D; W S A D Q E điều khiển tàu, giữ Shift để điều khiển tinh">
      {contextLost ? <WebGLFallback /> : <SceneBoundary onError={handleContextLost}><Canvas style={{ position: 'relative', width: '100%', height: '100%' }} frameloop="demand" dpr={[1, 1.5]} camera={{ position: [120, 160, 120], fov: 45, near: 0.5, far: 4000 }} gl={{ antialias: true, powerPreference: 'low-power' }} fallback={<WebGLFallback />} resize={{ debounce: 0 }}><Harbour waterMode={waterMode} onWaterFallback={handleWaterFallback} /><VesselSlot ship={ship} onLoaded={handleLoaded} onError={handleModelError} /><VesselMotion runtime={runtime} onContact={handleContact} /><CameraRig view={view} frame={frame} runtime={runtime} resetVersion={resetVersion} onContextLost={handleContextLost} /></Canvas></SceneBoundary>}
      {waterFallback && !contextLost && <span className="water-notice" role="status">Nước tĩnh dự phòng: {waterFallback === 'shader' ? 'shader chưa khả dụng' : 'FPS thấp kéo dài'}</span>}
      {!contextLost && <div className={`model-status ${modelState.status === 'error' ? 'model-error' : ''}`} role="status">{modelMessage}</div>}
      {!contextLost && <div className={`contact-status contact-${contact.status}`} role="status" title="Phân loại hình học minh họa từ cùng tư thế với telemetry; không đánh giá an toàn hàng hải.">{contact.label} · Mô phỏng</div>}
      {fine && !contextLost && <span className="fine-indicator" role="status">Điều khiển tinh · 5%</span>}
      {!contextLost && <div className="scene-overlay" aria-hidden="true">Lưới 10 m · Mũi ban đầu: −Z<br />+X: từ cầu ra nước · +Y: lên cao · +Z: về đuôi ban đầu</div>}
    </div>
    <div className="scene-caption"><span>{view === '3d' ? 'Kéo trái: xoay 360° · Kéo phải: pan · Cuộn: thu/phóng' : 'Cuộn chuột: thu/phóng · Góc nhìn cố định'}</span><span>W/S/A/D/Q/E · Shift: tinh 5% · Số đo từ mô phỏng 3D</span></div>
  </section>;
});
