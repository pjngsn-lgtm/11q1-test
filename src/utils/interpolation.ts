import {
  AnimatableProp,
  ControlStateValue,
  EasingType,
  Keyframe,
  LayerTracks,
  MotionLayer,
  MotionProject,
  Track,
} from '../types/studio';

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function cubicBezierY(t: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  // Solve x(u) = t using Newton-Raphson then evaluate y(u)
  const sampleX = (u: number) =>
    3 * (1 - u) * (1 - u) * u * p1x + 3 * (1 - u) * u * u * p2x + u * u * u;
  const sampleDX = (u: number) =>
    3 * (1 - u) * (1 - u) * p1x +
    6 * (1 - u) * u * (p2x - p1x) +
    3 * u * u * (1 - p2x);
  const sampleY = (u: number) =>
    3 * (1 - u) * (1 - u) * u * p1y + 3 * (1 - u) * u * u * p2y + u * u * u;

  let u = t;
  for (let i = 0; i < 6; i++) {
    const err = sampleX(u) - t;
    if (Math.abs(err) < 1e-4) break;
    const dx = sampleDX(u);
    if (Math.abs(dx) < 1e-5) break;
    u -= err / dx;
  }
  u = clamp01(u);
  return sampleY(u);
}

export function applyEasing(
  t: number,
  easing: EasingType,
  bezier?: [number, number, number, number]
): number {
  const x = clamp01(t);
  switch (easing) {
    case 'linear':
      return x;
    case 'ease-in':
      return x * x * x;
    case 'ease-out':
      return 1 - Math.pow(1 - x, 3);
    case 'ease-in-out':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'step':
      return x >= 1 ? 1 : 0;
    case 'custom-bezier': {
      const [p1x, p1y, p2x, p2y] = bezier || [0.25, 0.1, 0.25, 1];
      return cubicBezierY(x, p1x, p1y, p2x, p2y);
    }
    default:
      return x;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function interpolateColor(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function sortKeyframes<T>(kfs: Keyframe<T>[]): Keyframe<T>[] {
  return [...kfs].sort((a, b) => a.time - b.time);
}

export function evaluateNumberProp(prop: AnimatableProp<number>, time: number): number {
  const kfs = prop.keyframes;
  if (!kfs || kfs.length === 0) return prop.baseValue;
  if (time <= kfs[0].time) return kfs[0].value;
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

  for (let i = 0; i < kfs.length - 1; i++) {
    const k1 = kfs[i];
    const k2 = kfs[i + 1];
    if (time >= k1.time && time <= k2.time) {
      const span = k2.time - k1.time;
      if (span <= 0.0001) return k2.value;
      const rawT = (time - k1.time) / span;
      const easedT = applyEasing(rawT, k1.easing, k1.bezier);
      return k1.value + (k2.value - k1.value) * easedT;
    }
  }
  return kfs[kfs.length - 1].value;
}

export function evaluateColorProp(prop: AnimatableProp<string>, time: number): string {
  const kfs = prop.keyframes;
  if (!kfs || kfs.length === 0) return prop.baseValue;
  if (time <= kfs[0].time) return kfs[0].value;
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

  for (let i = 0; i < kfs.length - 1; i++) {
    const k1 = kfs[i];
    const k2 = kfs[i + 1];
    if (time >= k1.time && time <= k2.time) {
      const span = k2.time - k1.time;
      if (span <= 0.0001) return k2.value;
      const rawT = (time - k1.time) / span;
      const easedT = applyEasing(rawT, k1.easing, k1.bezier);
      return interpolateColor(k1.value, k2.value, easedT);
    }
  }
  return kfs[kfs.length - 1].value;
}

export function evaluateDiscreteProp<T>(prop: AnimatableProp<T>, time: number): T {
  const kfs = prop.keyframes;
  if (!kfs || kfs.length === 0) return prop.baseValue;
  if (time < kfs[0].time) return kfs[0].value;
  let active = kfs[0].value;
  for (let i = 0; i < kfs.length; i++) {
    if (kfs[i].time <= time + 0.001) {
      active = kfs[i].value;
    } else {
      break;
    }
  }
  return active;
}

export interface EvaluatedLayerState {
  x: number; // % from canvas center
  y: number;
  width: number; // % of canvas width
  height: number; // % of canvas height
  scale: number;
  rotation: number;
  skewX: number;
  skewY: number;
  anchorX: number;
  anchorY: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  cropLeft: number;
  opacity: number;
  color: string;
  glow: number;
  blur: number;
  controlState: ControlStateValue;
  // World-space computed after parenting (in % of canvas)
  worldX: number;
  worldY: number;
  worldScale: number;
  worldRotation: number;
  worldOpacity: number;
  isWithinTimeRange: boolean;
}

export function evaluateAllLayers(
  layers: MotionLayer[],
  time: number,
  canvasWidth: number,
  canvasHeight: number
): Record<string, EvaluatedLayerState> {
  const localMap: Record<string, EvaluatedLayerState> = {};

  for (const layer of layers) {
    const t = layer.tracks;
    const isWithinTimeRange =
      layer.visible && time >= layer.startTime - 0.001 && time <= layer.endTime + 0.001;
    const x = evaluateNumberProp(t.x, time);
    const y = evaluateNumberProp(t.y, time);
    const width = evaluateNumberProp(t.width, time);
    const height = evaluateNumberProp(t.height, time);
    const scale = evaluateNumberProp(t.scale, time);
    const rotation = evaluateNumberProp(t.rotation, time);
    const skewX = t.skewX ? evaluateNumberProp(t.skewX, time) : 0;
    const skewY = t.skewY ? evaluateNumberProp(t.skewY, time) : 0;
    const anchorX = t.anchorX ? evaluateNumberProp(t.anchorX, time) : 0;
    const anchorY = t.anchorY ? evaluateNumberProp(t.anchorY, time) : 0;
    const cropTop = t.cropTop ? Math.max(0, Math.min(49, evaluateNumberProp(t.cropTop, time))) : 0;
    const cropRight = t.cropRight ? Math.max(0, Math.min(49, evaluateNumberProp(t.cropRight, time))) : 0;
    const cropBottom = t.cropBottom ? Math.max(0, Math.min(49, evaluateNumberProp(t.cropBottom, time))) : 0;
    const cropLeft = t.cropLeft ? Math.max(0, Math.min(49, evaluateNumberProp(t.cropLeft, time))) : 0;
    const opacity = clamp01(evaluateNumberProp(t.opacity, time));
    const color = evaluateColorProp(t.color, time);
    const glow = Math.max(0, evaluateNumberProp(t.glow, time));
    const blur = Math.max(0, evaluateNumberProp(t.blur, time));
    const controlState = evaluateDiscreteProp(t.controlState, time);

    localMap[layer.id] = {
      x,
      y,
      width,
      height,
      scale,
      rotation,
      skewX,
      skewY,
      anchorX,
      anchorY,
      cropTop,
      cropRight,
      cropBottom,
      cropLeft,
      opacity,
      color,
      glow,
      blur,
      controlState,
      worldX: x,
      worldY: y,
      worldScale: scale,
      worldRotation: rotation,
      worldOpacity: opacity,
      isWithinTimeRange,
    };
  }

  const layerById = new Map(layers.map((l) => [l.id, l]));
  const resolved = new Set<string>();

  const resolveWorld = (id: string, visiting: Set<string>): EvaluatedLayerState | null => {
    const state = localMap[id];
    const layer = layerById.get(id);
    if (!state || !layer) return null;
    if (resolved.has(id)) return state;
    if (!layer.parentId || visiting.has(id)) {
      resolved.add(id);
      return state;
    }

    visiting.add(id);
    const parentState = resolveWorld(layer.parentId, visiting);
    visiting.delete(id);

    if (parentState) {
      // Convert local % offset to px in current canvas so rotation around parent is aspect-accurate
      const safeW = Math.max(1, canvasWidth);
      const safeH = Math.max(1, canvasHeight);
      const localPxX = (state.x / 100) * safeW * parentState.worldScale;
      const localPxY = (state.y / 100) * safeH * parentState.worldScale;

      const rad = (parentState.worldRotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotPxX = localPxX * cos - localPxY * sin;
      const rotPxY = localPxX * sin + localPxY * cos;

      state.worldX = parentState.worldX + (rotPxX / safeW) * 100;
      state.worldY = parentState.worldY + (rotPxY / safeH) * 100;
      state.worldScale = parentState.worldScale * state.scale;
      state.worldRotation = parentState.worldRotation + state.rotation;
      state.worldOpacity = parentState.worldOpacity * state.opacity;
    }
    resolved.add(id);
    return state;
  };

  for (const layer of layers) {
    resolveWorld(layer.id, new Set());
  }

  return localMap;
}

export function makeProp<T>(baseValue: T, keyframes: Keyframe<T>[] = []): AnimatableProp<T> {
  return { baseValue, keyframes };
}

export function createEmptyTracks(overrides?: Partial<LayerTracks>): LayerTracks {
  return {
    x: makeProp(0),
    y: makeProp(0),
    width: makeProp(28),
    height: makeProp(20),
    scale: makeProp(1),
    rotation: makeProp(0),
    skewX: makeProp(0),
    skewY: makeProp(0),
    anchorX: makeProp(0),
    anchorY: makeProp(0),
    cropTop: makeProp(0),
    cropRight: makeProp(0),
    cropBottom: makeProp(0),
    cropLeft: makeProp(0),
    opacity: makeProp(1),
    color: makeProp('#84CC16'),
    glow: makeProp(0),
    blur: makeProp(0),
    controlState: makeProp<ControlStateValue>('enabled'),
    ...overrides,
  };
}

/**
 * Generates the static, non-moving default Musicolet-inspired layout
 * tailored for either portrait, landscape, square, or extreme custom sizes.
 */
export function createDefaultProject(
  trackDuration: number,
  width = 720,
  height = 1280
): MotionProject {
  const safeDur = Math.max(10, trackDuration || 60);
  const isLandscape = width > height * 1.15;
  const presetId =
    width === 720 && height === 1280
      ? 'oppo-f1s'
      : width === 1280 && height === 720
        ? 'oppo-f1s-land'
        : width === height
          ? 'square'
          : isLandscape
            ? 'landscape-hd'
            : 'phone-fhd';

  const layers: MotionLayer[] = isLandscape
    ? [
        {
          id: 'ctrl-album',
          name: 'Album Cover',
          type: 'player-control',
          controlKind: 'album-cover',
          actionRole: 'toggle-lyrics',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          cornerRadius: 0,
          tracks: createEmptyTracks({
            x: makeProp(-26),
            y: makeProp(-4),
            width: makeProp(31.5),
            height: makeProp(56),
            color: makeProp('#1E293B'),
          }),
        },
        {
          id: 'ctrl-title',
          name: 'Track Title',
          type: 'player-control',
          controlKind: 'track-title',
          actionRole: 'none',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(19),
            y: makeProp(-22),
            width: makeProp(46),
            height: makeProp(16),
            color: makeProp('#F8FAFC'),
          }),
        },
        {
          id: 'ctrl-lyrics',
          name: 'Embedded Lyrics',
          type: 'player-control',
          controlKind: 'lyrics',
          actionRole: 'none',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(19),
            y: makeProp(2),
            width: makeProp(46),
            height: makeProp(30),
            color: makeProp('#CBD5E1'),
          }),
        },
        {
          id: 'ctrl-seek',
          name: 'Seek Bar',
          type: 'player-control',
          controlKind: 'seek-bar',
          actionRole: 'none',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(19),
            y: makeProp(22),
            width: makeProp(46),
            height: makeProp(8),
            color: makeProp('#84CC16'),
          }),
        },
        {
          id: 'ctrl-prev',
          name: 'Previous Button',
          type: 'player-control',
          controlKind: 'prev',
          actionRole: 'prev',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(5),
            y: makeProp(36),
            width: makeProp(8),
            height: makeProp(12),
            color: makeProp('#E2E8F0'),
          }),
        },
        {
          id: 'ctrl-play',
          name: 'Play / Pause Button',
          type: 'player-control',
          controlKind: 'play-pause',
          actionRole: 'play-pause',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(19),
            y: makeProp(36),
            width: makeProp(11),
            height: makeProp(16),
            color: makeProp('#84CC16'),
          }),
        },
        {
          id: 'ctrl-next',
          name: 'Next Button',
          type: 'player-control',
          controlKind: 'next',
          actionRole: 'next',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(33),
            y: makeProp(36),
            width: makeProp(8),
            height: makeProp(12),
            color: makeProp('#E2E8F0'),
          }),
        },
        {
          id: 'ctrl-loop',
          name: 'Loop Button',
          type: 'player-control',
          controlKind: 'loop',
          actionRole: 'loop',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(-26),
            y: makeProp(36),
            width: makeProp(9),
            height: makeProp(11),
            color: makeProp('#94A3B8'),
          }),
        },
      ]
    : [
        {
          id: 'ctrl-album',
          name: 'Album Cover',
          type: 'player-control',
          controlKind: 'album-cover',
          actionRole: 'toggle-lyrics',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          cornerRadius: 0,
          tracks: createEmptyTracks({
            x: makeProp(0),
            y: makeProp(-21),
            width: makeProp(64),
            height: makeProp(36),
            color: makeProp('#1E293B'),
          }),
        },
        {
          id: 'ctrl-title',
          name: 'Track Title',
          type: 'player-control',
          controlKind: 'track-title',
          actionRole: 'none',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(0),
            y: makeProp(4),
            width: makeProp(84),
            height: makeProp(10),
            color: makeProp('#F8FAFC'),
          }),
        },
        {
          id: 'ctrl-lyrics',
          name: 'Embedded Lyrics',
          type: 'player-control',
          controlKind: 'lyrics',
          actionRole: 'none',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(0),
            y: makeProp(17),
            width: makeProp(84),
            height: makeProp(14),
            color: makeProp('#CBD5E1'),
          }),
        },
        {
          id: 'ctrl-seek',
          name: 'Seek Bar',
          type: 'player-control',
          controlKind: 'seek-bar',
          actionRole: 'none',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(0),
            y: makeProp(28),
            width: makeProp(84),
            height: makeProp(6),
            color: makeProp('#84CC16'),
          }),
        },
        {
          id: 'ctrl-loop',
          name: 'Loop Button',
          type: 'player-control',
          controlKind: 'loop',
          actionRole: 'loop',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(-32),
            y: makeProp(38),
            width: makeProp(12),
            height: makeProp(8),
            color: makeProp('#94A3B8'),
          }),
        },
        {
          id: 'ctrl-prev',
          name: 'Previous Button',
          type: 'player-control',
          controlKind: 'prev',
          actionRole: 'prev',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(-16),
            y: makeProp(38),
            width: makeProp(12),
            height: makeProp(8),
            color: makeProp('#E2E8F0'),
          }),
        },
        {
          id: 'ctrl-play',
          name: 'Play / Pause Button',
          type: 'player-control',
          controlKind: 'play-pause',
          actionRole: 'play-pause',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(0),
            y: makeProp(38),
            width: makeProp(18),
            height: makeProp(10),
            color: makeProp('#84CC16'),
          }),
        },
        {
          id: 'ctrl-next',
          name: 'Next Button',
          type: 'player-control',
          controlKind: 'next',
          actionRole: 'next',
          parentId: null,
          startTime: 0,
          endTime: safeDur,
          visible: true,
          lockedInEditor: false,
          tracks: createEmptyTracks({
            x: makeProp(16),
            y: makeProp(38),
            width: makeProp(12),
            height: makeProp(8),
            color: makeProp('#E2E8F0'),
          }),
        },
      ];

  return {
    canvasWidth: width,
    canvasHeight: height,
    presetId,
    linkAspect: false,
    backgroundColor: '#0E1118',
    accentColor: '#84CC16',
    themeMood: 'default',
    globalTouchLock: makeProp<boolean>(false),
    layers,
  };
}

export function trackHasCustomEdits(track: Track): boolean {
  return track.hasMotionEdit;
}
