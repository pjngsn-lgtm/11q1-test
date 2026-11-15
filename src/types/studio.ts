export type EasingType =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'step'
  | 'custom-bezier';

export interface Keyframe<T> {
  id: string;
  time: number;
  value: T;
  easing: EasingType;
  bezier?: [number, number, number, number];
}

export interface AnimatableProp<T> {
  baseValue: T;
  keyframes: Keyframe<T>[];
}

export type ControlStateValue = 'enabled' | 'locked' | 'disabled' | 'hidden';

export type LayerType =
  | 'shape'
  | 'text'
  | 'image'
  | 'video'
  | 'null'
  | 'player-control';

export type ShapeKind = 'rect' | 'circle' | 'rounded-rect' | 'line' | 'star';

export type ControlKind =
  | 'album-cover'
  | 'track-title'
  | 'play-pause'
  | 'next'
  | 'prev'
  | 'loop'
  | 'seek-bar'
  | 'lyrics';

export type ActionRole =
  | 'none'
  | 'play-pause'
  | 'next'
  | 'prev'
  | 'loop'
  | 'toggle-lyrics'
  | 'seek-fwd'
  | 'seek-back';

export interface LayerTracks {
  x: AnimatableProp<number>; // % of canvas width from center (-100..100)
  y: AnimatableProp<number>; // % of canvas height from center (-100..100)
  width: AnimatableProp<number>; // % of canvas width
  height: AnimatableProp<number>; // % of canvas height
  scale: AnimatableProp<number>; // uniform multiplier (1 = 100%)
  rotation: AnimatableProp<number>; // degrees
  skewX: AnimatableProp<number>; // degrees (-60..60)
  skewY: AnimatableProp<number>; // degrees (-60..60)
  anchorX: AnimatableProp<number>; // % offset from layer center (-50 = left edge, 50 = right edge)
  anchorY: AnimatableProp<number>; // % offset from layer center (-50 = top edge, 50 = bottom edge)
  cropTop: AnimatableProp<number>; // % 0..49
  cropRight: AnimatableProp<number>; // % 0..49
  cropBottom: AnimatableProp<number>; // % 0..49
  cropLeft: AnimatableProp<number>; // % 0..49
  opacity: AnimatableProp<number>; // 0..1
  color: AnimatableProp<string>; // hex color
  glow: AnimatableProp<number>; // 0..100
  blur: AnimatableProp<number>; // 0..40 px
  controlState: AnimatableProp<ControlStateValue>;
}

export type NumericPropKey =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'scale'
  | 'rotation'
  | 'skewX'
  | 'skewY'
  | 'anchorX'
  | 'anchorY'
  | 'cropTop'
  | 'cropRight'
  | 'cropBottom'
  | 'cropLeft'
  | 'opacity'
  | 'glow'
  | 'blur';

export type AnyPropKey = keyof LayerTracks;

export interface MotionLayer {
  id: string;
  name: string;
  type: LayerType;
  shapeKind?: ShapeKind;
  controlKind?: ControlKind;
  actionRole: ActionRole;
  parentId: string | null;
  startTime: number;
  endTime: number;
  visible: boolean;
  lockedInEditor: boolean;
  textContent?: string;
  fontSize?: number; // % of min(canvasW, canvasH) * 0.1
  cornerRadius?: number; // px or relative
  mediaUrl?: string;
  mediaName?: string;
  tracks: LayerTracks;
}

export type CanvasPresetId =
  | 'oppo-f1s'
  | 'oppo-f1s-land'
  | 'phone-fhd'
  | 'phone-tall'
  | 'landscape-hd'
  | 'landscape-fhd'
  | 'square'
  | 'custom';

export interface ScreenPreset {
  id: CanvasPresetId;
  label: string;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape' | 'square';
}

export const SCREEN_PRESETS: ScreenPreset[] = [
  { id: 'oppo-f1s', label: 'Oppo F1s (Portrait)', width: 720, height: 1280, orientation: 'portrait' },
  { id: 'oppo-f1s-land', label: 'Oppo F1s (Landscape)', width: 1280, height: 720, orientation: 'landscape' },
  { id: 'phone-fhd', label: 'Phone 9:16', width: 1080, height: 1920, orientation: 'portrait' },
  { id: 'phone-tall', label: 'Phone 9:20', width: 1080, height: 2400, orientation: 'portrait' },
  { id: 'landscape-hd', label: 'Landscape 16:9 HD', width: 1280, height: 720, orientation: 'landscape' },
  { id: 'landscape-fhd', label: 'Landscape 16:9 FHD', width: 1920, height: 1080, orientation: 'landscape' },
  { id: 'square', label: 'Square 1:1', width: 1080, height: 1080, orientation: 'square' },
  { id: 'custom', label: 'Custom Size', width: 720, height: 1280, orientation: 'portrait' },
];

export interface MotionProject {
  canvasWidth: number;
  canvasHeight: number;
  presetId: CanvasPresetId;
  linkAspect: boolean;
  backgroundColor: string;
  transparentBg?: boolean;
  showAlbumArt?: boolean;
  accentColor: string;
  themeMood: 'default' | 'warm' | 'dark' | 'custom';
  globalTouchLock: AnimatableProp<boolean>;
  layers: MotionLayer[];
}

export interface LyricLine {
  id: string;
  time: number | null; // seconds, null if unsynced
  text: string;
}

export interface Track {
  id: string;
  title: string; // display name WITHOUT .mp3 or extension
  fileName: string; // original file name
  folderPath?: string; // folder containing the audio file
  relativePath?: string; // unique relative path for folder refresh matching
  artist: string;
  album: string;
  duration: number;
  audioUrl: string;
  coverArtUrl: string | null;
  lyrics: LyricLine[];
  rawLyricsText: string;
  hasMotionEdit: boolean;
  project: MotionProject;
  addedAt: number;
}

export type LoopMode = 'off' | 'all' | 'one';

export interface MusicQueue {
  id: string;
  name: string;
  trackIds: string[];
  activeIndex: number;
  loopMode: LoopMode;
  shuffle: boolean;
}

export type AppTab = 'player' | 'queues' | 'library' | 'editor';
