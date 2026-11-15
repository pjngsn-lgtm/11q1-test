import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Diamond,
  Eye,
  EyeOff,
  Film,
  GripHorizontal,
  Image as ImageIcon,
  Layers,
  Link2,
  Link2Off,
  Lock,
  Maximize2,
  Move,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Sparkles,
  Square,
  Trash2,
  Type,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
  Circle,
  Star,
  Minus,
} from 'lucide-react';
import {
  ActionRole,
  AnimatableProp,
  AnyPropKey,
  CanvasPresetId,
  ControlStateValue,
  EasingType,
  Keyframe,
  LayerTracks,
  LoopMode,
  MotionLayer,
  MotionProject,
  NumericPropKey,
  SCREEN_PRESETS,
  ShapeKind,
  Track,
} from '../types/studio';
import {
  createDefaultProject,
  createEmptyTracks,
  evaluateAllLayers,
  evaluateColorProp,
  evaluateDiscreteProp,
  evaluateNumberProp,
  makeProp,
  sortKeyframes,
} from '../utils/interpolation';
import { formatTime } from '../utils/lyricsAndTags';
import { StageRenderer } from './StageRenderer';

interface MotionEditorProps {
  track: Track;
  currentTime: number;
  isPlaying: boolean;
  loopMode: LoopMode;
  lyricsEnabled: boolean;
  onUpdateTrack: (updated: Track) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleLoop: () => void;
  onToggleLyrics: () => void;
  onAlbumLongPress: () => void;
}

type InspectorTab = 'transform' | 'effects' | 'parent' | 'actions';

const EASING_OPTIONS: { value: EasingType; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In-Out' },
  { value: 'step', label: 'Step (Instant)' },
  { value: 'custom-bezier', label: 'Custom Curve' },
];

export const MotionEditor: React.FC<MotionEditorProps> = ({
  track,
  currentTime,
  isPlaying,
  loopMode,
  lyricsEnabled,
  onUpdateTrack,
  onSeek,
  onTogglePlay,
  onNext,
  onPrev,
  onToggleLoop,
  onToggleLyrics,
  onAlbumLongPress,
}) => {
  const project = track.project;
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    project.layers[0]?.id || null
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('transform');
  const [activeEasing, setActiveEasing] = useState<EasingType>('ease-out');
  const [customBezier, setCustomBezier] = useState<[number, number, number, number]>([
    0.22, 1, 0.36, 1,
  ]);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [viewportPan, setViewportPan] = useState({ x: 0, y: 0 });
  const [resetOnResize, setResetOnResize] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [drawerPct, setDrawerPct] = useState(48);
  const [mobilePane, setMobilePane] = useState<'timeline' | 'inspector'>('timeline');
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const draggingSplitRef = useRef(false);

  const handleSplitPointerMove = (e: React.PointerEvent) => {
    if (!draggingSplitRef.current || !workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
    if (rect.height <= 0) return;
    const fromBottomPx = rect.bottom - e.clientY;
    const rawPct = (fromBottomPx / rect.height) * 100;
    if (rawPct < 6) {
      setDrawerPct(0);
    } else {
      setDrawerPct(Math.max(12, Math.min(78, Math.round(rawPct))));
    }
  };

  const handleSplitPointerUp = () => {
    draggingSplitRef.current = false;
  };

  const selectedLayer = useMemo(
    () => project.layers.find((l) => l.id === selectedLayerId) || project.layers[0] || null,
    [project.layers, selectedLayerId]
  );

  const evaluatedMap = useMemo(
    () =>
      evaluateAllLayers(
        project.layers,
        currentTime,
        project.canvasWidth,
        project.canvasHeight
      ),
    [project.layers, currentTime, project.canvasWidth, project.canvasHeight]
  );

  const selectedState = selectedLayer ? evaluatedMap[selectedLayer.id] : null;
  const globalTouchLocked = evaluateDiscreteProp(project.globalTouchLock, currentTime);

  const commitProject = (nextProject: MotionProject, markEdited = true) => {
    onUpdateTrack({
      ...track,
      hasMotionEdit: markEdited ? true : track.hasMotionEdit,
      project: nextProject,
    });
  };

  const updateLayer = (layerId: string, updater: (layer: MotionLayer) => MotionLayer) => {
    commitProject({
      ...project,
      layers: project.layers.map((l) => (l.id === layerId ? updater(l) : l)),
    });
  };

  // Upsert or update prop value (if keyframes exist on this prop, insert/update keyframe at currentTime; else set baseValue)
  const setPropValueAtPlayhead = <K extends AnyPropKey>(
    layer: MotionLayer,
    propKey: K,
    value: LayerTracks[K]['baseValue'],
    forceKeyframe = false
  ) => {
    const prop = layer.tracks[propKey] as AnimatableProp<LayerTracks[K]['baseValue']>;
    const snapT = Number(currentTime.toFixed(2));
    const existingIdx = prop.keyframes.findIndex((k) => Math.abs(k.time - snapT) < 0.08);

    if (forceKeyframe || prop.keyframes.length > 0) {
      let nextKfs: Keyframe<LayerTracks[K]['baseValue']>[];
      if (existingIdx >= 0) {
        nextKfs = prop.keyframes.map((k, idx) =>
          idx === existingIdx ? { ...k, value, easing: activeEasing, bezier: customBezier } : k
        );
      } else {
        nextKfs = sortKeyframes([
          ...prop.keyframes,
          {
            id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            time: snapT,
            value,
            easing: activeEasing,
            bezier: customBezier,
          },
        ]);
      }
      updateLayer(layer.id, (l) => ({
        ...l,
        tracks: {
          ...l.tracks,
          [propKey]: {
            ...prop,
            keyframes: nextKfs,
          },
        },
      }));
    } else {
      updateLayer(layer.id, (l) => ({
        ...l,
        tracks: {
          ...l.tracks,
          [propKey]: {
            ...prop,
            baseValue: value,
          },
        },
      }));
    }
  };

  const toggleKeyframeAtPlayhead = <K extends AnyPropKey>(
    layer: MotionLayer,
    propKey: K,
    currentEvaluatedValue: LayerTracks[K]['baseValue']
  ) => {
    const prop = layer.tracks[propKey] as AnimatableProp<LayerTracks[K]['baseValue']>;
    const snapT = Number(currentTime.toFixed(2));
    const existingIdx = prop.keyframes.findIndex((k) => Math.abs(k.time - snapT) < 0.08);

    if (existingIdx >= 0) {
      const nextKfs = prop.keyframes.filter((_, idx) => idx !== existingIdx);
      updateLayer(layer.id, (l) => ({
        ...l,
        tracks: {
          ...l.tracks,
          [propKey]: { ...prop, keyframes: nextKfs },
        },
      }));
    } else {
      const nextKfs = sortKeyframes([
        ...prop.keyframes,
        {
          id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          time: snapT,
          value: currentEvaluatedValue,
          easing: activeEasing,
          bezier: customBezier,
        },
      ]);
      updateLayer(layer.id, (l) => ({
        ...l,
        tracks: {
          ...l.tracks,
          [propKey]: { ...prop, keyframes: nextKfs },
        },
      }));
    }
  };

  const jumpSiblingKeyframe = (layer: MotionLayer, propKey: AnyPropKey, dir: -1 | 1) => {
    const kfs = layer.tracks[propKey].keyframes;
    if (!kfs || kfs.length === 0) return;
    if (dir < 0) {
      const prev = [...kfs].reverse().find((k) => k.time < currentTime - 0.06);
      if (prev) onSeek(prev.time);
    } else {
      const next = kfs.find((k) => k.time > currentTime + 0.06);
      if (next) onSeek(next.time);
    }
  };

  // Canvas Dimension / Orientation Handlers
  const applyCanvasResize = (
    nextW: number,
    nextH: number,
    presetId: CanvasPresetId = 'custom'
  ) => {
    const safeW = Math.max(1, Math.round(nextW || 1));
    const safeH = Math.max(1, Math.round(nextH || 1));

    if (resetOnResize) {
      const fresh = createDefaultProject(track.duration, safeW, safeH);
      commitProject(
        {
          ...fresh,
          presetId,
          linkAspect: project.linkAspect,
        },
        false
      );
      setSelectedLayerId(fresh.layers[0]?.id || null);
    } else {
      commitProject({
        ...project,
        canvasWidth: safeW,
        canvasHeight: safeH,
        presetId,
      });
    }
  };

  const handleWidthInput = (val: number) => {
    const w = Math.max(1, Math.round(val || 1));
    if (project.linkAspect && project.canvasWidth > 0) {
      const ratio = project.canvasHeight / project.canvasWidth;
      applyCanvasResize(w, Math.max(1, Math.round(w * ratio)), 'custom');
    } else {
      applyCanvasResize(w, project.canvasHeight, 'custom');
    }
  };

  const handleHeightInput = (val: number) => {
    const h = Math.max(1, Math.round(val || 1));
    if (project.linkAspect && project.canvasHeight > 0) {
      const ratio = project.canvasWidth / project.canvasHeight;
      applyCanvasResize(Math.max(1, Math.round(h * ratio)), h, 'custom');
    } else {
      applyCanvasResize(project.canvasWidth, h, 'custom');
    }
  };

  const addShapeLayer = (shapeKind: ShapeKind) => {
    const id = `shape-${Date.now()}`;
    const labelMap: Record<ShapeKind, string> = {
      rect: 'Box Shape',
      circle: 'Circle Shape',
      'rounded-rect': 'Rounded Box',
      line: 'Line Bar',
      star: 'Star Shape',
    };
    const newLayer: MotionLayer = {
      id,
      name: labelMap[shapeKind],
      type: 'shape',
      shapeKind,
      actionRole: 'none',
      parentId: null,
      startTime: 0,
      endTime: track.duration,
      visible: true,
      lockedInEditor: false,
      cornerRadius: shapeKind === 'rounded-rect' ? 18 : 0,
      tracks: createEmptyTracks({
        x: makeProp(0),
        y: makeProp(0),
        width: makeProp(shapeKind === 'line' ? 60 : shapeKind === 'circle' ? 18 : 48),
        height: makeProp(shapeKind === 'line' ? 4 : shapeKind === 'circle' ? 18 : 22),
        color: makeProp('#FACC15'),
      }),
    };
    commitProject({
      ...project,
      layers: [newLayer, ...project.layers],
    });
    setSelectedLayerId(id);
    setShowAddMenu(false);
  };

  const addTextLayer = () => {
    const id = `text-${Date.now()}`;
    const newLayer: MotionLayer = {
      id,
      name: 'Custom Text',
      type: 'text',
      actionRole: 'none',
      parentId: null,
      startTime: 0,
      endTime: track.duration,
      visible: true,
      lockedInEditor: false,
      textContent: track.title,
      fontSize: 6,
      tracks: createEmptyTracks({
        x: makeProp(0),
        y: makeProp(-8),
        width: makeProp(75),
        height: makeProp(16),
        color: makeProp('#FFFFFF'),
      }),
    };
    commitProject({ ...project, layers: [newLayer, ...project.layers] });
    setSelectedLayerId(id);
    setShowAddMenu(false);
  };

  const addNullLayer = () => {
    const id = `null-${Date.now()}`;
    const newLayer: MotionLayer = {
      id,
      name: 'Null Parent Rig',
      type: 'null',
      actionRole: 'none',
      parentId: null,
      startTime: 0,
      endTime: track.duration,
      visible: true,
      lockedInEditor: false,
      tracks: createEmptyTracks({
        x: makeProp(0),
        y: makeProp(0),
      }),
    };
    commitProject({ ...project, layers: [newLayer, ...project.layers] });
    setSelectedLayerId(id);
    setShowAddMenu(false);
  };

  const handleUploadMediaLayer = (e: React.ChangeEvent<HTMLInputElement>, kind: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const id = `${kind}-${Date.now()}`;
    const newLayer: MotionLayer = {
      id,
      name: file.name.replace(/\.[^.]+$/, ''),
      type: kind,
      actionRole: 'none',
      parentId: null,
      startTime: Number(currentTime.toFixed(2)),
      endTime: track.duration,
      visible: true,
      lockedInEditor: false,
      cornerRadius: 12,
      mediaUrl: url,
      mediaName: file.name,
      tracks: createEmptyTracks({
        x: makeProp(0),
        y: makeProp(0),
        width: makeProp(56),
        height: makeProp(36),
        color: makeProp('#FFFFFF'),
      }),
    };
    commitProject({
      ...project,
      layers: [newLayer, ...project.layers],
    });
    setSelectedLayerId(id);
    setShowAddMenu(false);
    e.target.value = '';
  };

  const splitLayerAtPlayhead = (layer: MotionLayer) => {
    if (currentTime <= layer.startTime + 0.1 || currentTime >= layer.endTime - 0.1) return;
    const splitT = Number(currentTime.toFixed(2));
    const cloneId = `${layer.id}-part-${Date.now().toString().slice(-4)}`;
    const firstPart: MotionLayer = { ...layer, endTime: splitT };
    const secondPart: MotionLayer = {
      ...JSON.parse(JSON.stringify(layer)),
      id: cloneId,
      name: `${layer.name} (2)`,
      startTime: splitT,
    };
    const idx = project.layers.findIndex((l) => l.id === layer.id);
    const nextLayers = [...project.layers];
    nextLayers.splice(idx, 1, firstPart, secondPart);
    commitProject({ ...project, layers: nextLayers });
    setSelectedLayerId(cloneId);
  };

  const duplicateLayer = (layer: MotionLayer) => {
    const copy: MotionLayer = {
      ...JSON.parse(JSON.stringify(layer)),
      id: `${layer.id}-copy-${Date.now().toString().slice(-4)}`,
      name: `${layer.name} Copy`,
    };
    commitProject({ ...project, layers: [...project.layers, copy] });
    setSelectedLayerId(copy.id);
  };

  const deleteLayer = (layerId: string) => {
    const nextLayers = project.layers
      .filter((l) => l.id !== layerId)
      .map((l) => (l.parentId === layerId ? { ...l, parentId: null } : l));
    commitProject({ ...project, layers: nextLayers });
    setSelectedLayerId(nextLayers[0]?.id || null);
  };

  const moveLayerOrder = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= project.layers.length) return;
    const next = [...project.layers];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    commitProject({ ...project, layers: next });
  };

  // Timeline bar drag / trim interactions
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const timelineDragRef = useRef<{
    layerId: string;
    mode: 'move' | 'trim-start' | 'trim-end';
    startClientX: number;
    origStart: number;
    origEnd: number;
  } | null>(null);

  const handleTimelinePointerMove = (e: React.PointerEvent) => {
    if (!timelineDragRef.current || !timelineTrackRef.current) return;
    const widthPx = Math.max(100, timelineTrackRef.current.clientWidth);
    const dxPx = e.clientX - timelineDragRef.current.startClientX;
    const dt = (dxPx / widthPx) * track.duration;
    const { layerId, mode, origStart, origEnd } = timelineDragRef.current;

    updateLayer(layerId, (l) => {
      if (mode === 'move') {
        const len = origEnd - origStart;
        const nextStart = Math.max(0, Math.min(track.duration - len, origStart + dt));
        return {
          ...l,
          startTime: Number(nextStart.toFixed(2)),
          endTime: Number((nextStart + len).toFixed(2)),
        };
      }
      if (mode === 'trim-start') {
        const nextStart = Math.max(0, Math.min(origEnd - 0.2, origStart + dt));
        return { ...l, startTime: Number(nextStart.toFixed(2)) };
      }
      const nextEnd = Math.min(track.duration, Math.max(origStart + 0.2, origEnd + dt));
      return { ...l, endTime: Number(nextEnd.toFixed(2)) };
    });
  };

  const handleTimelinePointerUp = () => {
    timelineDragRef.current = null;
  };

  // Check if moving a parent creates a cycle
  const wouldCreateCycle = (childId: string, candidateParentId: string): boolean => {
    if (childId === candidateParentId) return true;
    const byId = new Map(project.layers.map((l) => [l.id, l]));
    let cur: string | null = candidateParentId;
    const seen = new Set<string>();
    while (cur) {
      if (cur === childId) return true;
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = byId.get(cur)?.parentId || null;
    }
    return false;
  };

  const toggleGlobalTouchLockKf = () => {
    const snapT = Number(currentTime.toFixed(2));
    const prop = project.globalTouchLock;
    const existingIdx = prop.keyframes.findIndex((k) => Math.abs(k.time - snapT) < 0.08);
    if (existingIdx >= 0) {
      commitProject({
        ...project,
        globalTouchLock: {
          ...prop,
          keyframes: prop.keyframes.filter((_, i) => i !== existingIdx),
        },
      });
    } else {
      commitProject({
        ...project,
        globalTouchLock: {
          ...prop,
          keyframes: sortKeyframes([
            ...prop.keyframes,
            {
              id: `gtl-${Date.now()}`,
              time: snapT,
              value: !globalTouchLocked,
              easing: 'step',
            },
          ]),
        },
      });
    }
  };

  return (
    <div
      ref={workspaceRef}
      onPointerMove={handleSplitPointerMove}
      onPointerUp={handleSplitPointerUp}
      onPointerLeave={handleSplitPointerUp}
      className="h-full flex flex-col bg-[#0B0D12] overflow-hidden relative"
    >
      {/* Compact Single-Row Scrollable Top Studio Bar */}
      <div className="px-3 py-1.5 border-b border-white/10 bg-[#121620] flex items-center justify-between gap-2 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={project.presetId}
            onChange={(e) => {
              const p = SCREEN_PRESETS.find((sp) => sp.id === e.target.value);
              if (p && p.id !== 'custom') {
                applyCanvasResize(p.width, p.height, p.id);
              }
            }}
            className="h-8 px-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-[var(--accent)] shrink-0"
            title="Select phone or screen size preset"
          >
            {SCREEN_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.width}×{p.height})
              </option>
            ))}
          </select>

          {/* Unlinked Custom W x H (supports 1x1, 1234x223, 8x90) */}
          <div className="flex items-center gap-1 bg-slate-900 border border-white/10 rounded-lg px-2 h-8 shrink-0">
            <input
              type="number"
              min={1}
              max={9999}
              value={project.canvasWidth}
              onChange={(e) => handleWidthInput(parseInt(e.target.value, 10))}
              className="w-12 bg-transparent text-xs font-mono tabular-nums text-white text-center focus:outline-none"
              aria-label="Canvas width"
            />
            <span className="text-slate-500 text-xs">×</span>
            <input
              type="number"
              min={1}
              max={9999}
              value={project.canvasHeight}
              onChange={(e) => handleHeightInput(parseInt(e.target.value, 10))}
              className="w-12 bg-transparent text-xs font-mono tabular-nums text-white text-center focus:outline-none"
              aria-label="Canvas height"
            />
            <button
              type="button"
              onClick={() =>
                commitProject({ ...project, linkAspect: !project.linkAspect }, false)
              }
              className={`p-1 rounded ${
                project.linkAspect ? 'text-[var(--accent)]' : 'text-slate-500 hover:text-slate-300'
              }`}
              title={project.linkAspect ? 'Aspect ratio linked' : 'Aspect ratio unlinked (free resize)'}
            >
              {project.linkAspect ? (
                <Link2 className="w-3.5 h-3.5" />
              ) : (
                <Link2Off className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => applyCanvasResize(project.canvasHeight, project.canvasWidth, 'custom')}
            className="h-8 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Swap Portrait and Landscape"
          >
            <Maximize2 className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{project.canvasWidth > project.canvasHeight ? 'Landscape' : 'Portrait'}</span>
          </button>

          <button
            type="button"
            onClick={() => setResetOnResize((v) => !v)}
            className={`h-8 px-2.5 rounded-lg border text-xs whitespace-nowrap shrink-0 transition-colors ${
              resetOnResize
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
            }`}
            title="Toggle whether changing size scales existing edits or resets to default UI"
          >
            {resetOnResize ? 'Resize: Reset Default' : 'Resize: Scale Edits'}
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              const fresh = createDefaultProject(
                track.duration,
                project.canvasWidth,
                project.canvasHeight
              );
              commitProject(fresh, false);
              setSelectedLayerId(fresh.layers[0]?.id || null);
            }}
            className="h-8 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Default</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddMenu(true)}
            className="h-8 px-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Layer</span>
          </button>
        </div>
      </div>

      {/* Top Stage Preview Area (Expands automatically as you slide the editing drawer down!) */}
      <div className="flex-1 min-h-[120px] bg-[#090B10] flex flex-col overflow-hidden">
        <div className="px-3 py-1 flex items-center justify-between gap-2 text-[11px] text-slate-400 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate">
              Stage ·{' '}
              <span className="font-mono tabular-nums text-slate-200">
                {project.canvasWidth}×{project.canvasHeight}
              </span>
            </span>
            <span className="hidden md:inline text-slate-500">· Pinch or wheel to zoom out</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                commitProject({
                  ...project,
                  showAlbumArt: project.showAlbumArt === false ? true : false,
                })
              }
              className={`px-2 py-0.5 rounded border text-[10px] font-medium inline-flex items-center gap-1 transition-colors ${
                project.showAlbumArt !== false
                  ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-text)]'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
              }`}
              title="Toggle song album cover image ON or OFF (falls back to [ P.U.R MUSiCLiGHT ] text)"
            >
              <ImageIcon className="w-3 h-3" />
              <span>Album Art: {project.showAlbumArt !== false ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewportZoom((z) => Math.max(0.2, Number((z - 0.15).toFixed(2))))}
              className="p-1 rounded hover:bg-white/10 text-slate-300"
              title="Zoom out stage (see outside canvas)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setViewportZoom(1);
                setViewportPan({ x: 0, y: 0 });
              }}
              className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 font-mono tabular-nums text-[10px] text-slate-200"
              title="Reset stage zoom & pan"
            >
              {Math.round(viewportZoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setViewportZoom((z) => Math.min(3, Number((z + 0.15).toFixed(2))))}
              className="p-1 rounded hover:bg-white/10 text-slate-300"
              title="Zoom in stage"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 p-2">
          <StageRenderer
            track={track}
            currentTime={currentTime}
            isPlaying={isPlaying}
            loopMode={loopMode}
            lyricsEnabled={lyricsEnabled}
            isEditorMode={true}
            selectedLayerId={selectedLayer?.id || null}
            viewportZoom={viewportZoom}
            viewportPan={viewportPan}
            onChangeViewport={(z, p) => {
              setViewportZoom(z);
              setViewportPan(p);
            }}
            onSelectLayer={(id) => setSelectedLayerId(id)}
              onDragLayer={(id, newX, newY) => {
                const layer = project.layers.find((l) => l.id === id);
                if (!layer) return;
                // Update both X and Y cleanly in one state commit
                const snapT = Number(currentTime.toFixed(2));
                const updateSingleProp = (
                  prop: AnimatableProp<number>,
                  val: number
                ): AnimatableProp<number> => {
                  if (prop.keyframes.length === 0) return { ...prop, baseValue: val };
                  const idx = prop.keyframes.findIndex((k) => Math.abs(k.time - snapT) < 0.08);
                  if (idx >= 0) {
                    return {
                      ...prop,
                      keyframes: prop.keyframes.map((k, i) => (i === idx ? { ...k, value: val } : k)),
                    };
                  }
                  return {
                    ...prop,
                    keyframes: sortKeyframes([
                      ...prop.keyframes,
                      {
                        id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                        time: snapT,
                        value: val,
                        easing: activeEasing,
                        bezier: customBezier,
                      },
                    ]),
                  };
                };
                updateLayer(id, (l) => ({
                  ...l,
                  tracks: {
                    ...l.tracks,
                    x: updateSingleProp(l.tracks.x, newX),
                    y: updateSingleProp(l.tracks.y, newY),
                  },
                }));
              }}
              onTogglePlay={onTogglePlay}
              onNext={onNext}
              onPrev={onPrev}
              onToggleLoop={onToggleLoop}
              onToggleLyrics={onToggleLyrics}
              onSeek={onSeek}
            onAlbumLongPress={onAlbumLongPress}
          />
        </div>
      </div>

      {/* Draggable Slide-Down Handle Bar */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          draggingSplitRef.current = true;
        }}
        className="h-9 px-3 border-y border-white/10 bg-[#141824] flex items-center justify-between gap-2 cursor-ns-resize touch-none select-none shrink-0"
        title="Drag up or down to resize stage vs editor"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onTogglePlay}
            className="w-7 h-7 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-slate-950 flex items-center justify-center"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>
          <span className="text-xs font-mono tabular-nums text-white">
            {formatTime(currentTime, true)}
          </span>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 hidden sm:inline">
            / {formatTime(track.duration, true)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400 pointer-events-none">
          <GripHorizontal className="w-5 h-5" />
          <span className="text-[11px] hidden sm:inline">Drag to slide</span>
        </div>

        <div className="flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
          {/* Mobile pane toggle inside drawer */}
          {drawerPct > 0 && (
            <div className="flex lg:hidden items-center bg-slate-900 border border-white/10 rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setMobilePane('timeline')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                  mobilePane === 'timeline' ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'text-slate-400'
                }`}
              >
                Timeline
              </button>
              <button
                type="button"
                onClick={() => setMobilePane('inspector')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                  mobilePane === 'inspector' ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'text-slate-400'
                }`}
              >
                Edit
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setDrawerPct((p) => (p === 0 ? 48 : 0))}
            className="h-7 px-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 inline-flex items-center gap-1 whitespace-nowrap"
            title={drawerPct === 0 ? 'Slide editor up' : 'Slide editor down to view stage'}
          >
            {drawerPct === 0 ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Show Editor</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Hide</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sliding Lower Editing Drawer (Inspector + Multi-Track Timeline) */}
      {drawerPct > 0 && (
        <div
          style={{ height: `${drawerPct}%` }}
          className="flex flex-col lg:flex-row min-h-0 overflow-hidden bg-[#10131C] shrink-0"
        >
          {/* Property / Keyframe / Parenting / Action Inspector */}
          <div
            className={`${
              mobilePane === 'inspector' ? 'flex' : 'hidden'
            } lg:flex lg:w-[370px] xl:w-[410px] shrink-0 bg-[#121620] lg:border-r border-white/10 flex-col min-h-0 overflow-hidden flex-1 lg:flex-none`}
          >
            {selectedLayer && selectedState ? (
            <>
              <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <input
                    type="text"
                    value={selectedLayer.name}
                    onChange={(e) =>
                      updateLayer(selectedLayer.id, (l) => ({ ...l, name: e.target.value }))
                    }
                    className="bg-transparent text-sm font-semibold text-white focus:outline-none border-b border-transparent focus:border-[var(--accent)] w-full truncate"
                  />
                  <div className="text-[11px] text-slate-400">
                    {selectedLayer.type}
                    {selectedLayer.parentId
                      ? ` · Parent: ${
                          project.layers.find((p) => p.id === selectedLayer.parentId)?.name || 'Layer'
                        }`
                      : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => splitLayerAtPlayhead(selectedLayer)}
                    className="p-2 rounded-lg hover:bg-white/10 text-slate-300"
                    title="Split layer at playhead"
                  >
                    <Scissors className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateLayer(selectedLayer)}
                    className="p-2 rounded-lg hover:bg-white/10 text-slate-300"
                    title="Duplicate layer"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteLayer(selectedLayer.id)}
                    className="p-2 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
                    title="Delete layer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Inspector Tabs */}
              <div className="grid grid-cols-4 border-b border-white/10 bg-slate-950/40 shrink-0">
                {(
                  [
                    { id: 'transform', label: 'Move', icon: Move },
                    { id: 'effects', label: 'FX/Crop', icon: Sparkles },
                    { id: 'parent', label: 'Parent', icon: Layers },
                    { id: 'actions', label: 'Lock', icon: Lock },
                  ] as const
                ).map((t) => {
                  const Icon = t.icon;
                  const active = inspectorTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setInspectorTab(t.id)}
                      className={`py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        active
                          ? 'border-[var(--accent)] text-[var(--accent-text)] bg-[var(--accent-soft)]'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                {/* Easing Curve Selector (Shared for new keyframes) */}
                {(inspectorTab === 'transform' || inspectorTab === 'effects') && (
                  <div className="p-2.5 rounded-xl bg-slate-900/70 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-400">
                        Keyframe Easing Curve
                      </span>
                      <select
                        value={activeEasing}
                        onChange={(e) => setActiveEasing(e.target.value as EasingType)}
                        className="px-2 py-1 rounded bg-slate-950 border border-white/10 text-xs text-[var(--accent-text)]"
                      >
                        {EASING_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {activeEasing === 'custom-bezier' && (
                      <div className="grid grid-cols-4 gap-1.5 pt-1">
                        {customBezier.map((val, idx) => (
                          <input
                            key={idx}
                            type="number"
                            step={0.05}
                            min={0}
                            max={1.5}
                            value={val}
                            onChange={(e) => {
                              const next = [...customBezier] as [number, number, number, number];
                              next[idx] = parseFloat(e.target.value) || 0;
                              setCustomBezier(next);
                            }}
                            className="px-1.5 py-1 rounded bg-slate-950 border border-white/10 text-[11px] font-mono text-center text-white"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {inspectorTab === 'transform' && (
                  <div className="space-y-2.5">
                    {/* Rotation Center / Pivot Point Quick Presets */}
                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-200">
                          Rotation Center (Pivot)
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {Math.round(selectedState.anchorX)}%, {Math.round(selectedState.anchorY)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { label: 'Center', ax: 0, ay: 0 },
                            { label: 'Left Side', ax: -50, ay: 0 },
                            { label: 'Right Side', ax: 50, ay: 0 },
                            { label: 'Top Edge', ax: 0, ay: -50 },
                            { label: 'Bottom Edge', ax: 0, ay: 50 },
                            { label: 'Top-Left', ax: -50, ay: -50 },
                          ] as const
                        ).map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              updateLayer(selectedLayer.id, (l) => ({
                                ...l,
                                tracks: {
                                  ...l.tracks,
                                  anchorX: { ...l.tracks.anchorX, baseValue: preset.ax },
                                  anchorY: { ...l.tracks.anchorY, baseValue: preset.ay },
                                },
                              }));
                            }}
                            className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                              Math.round(selectedState.anchorX) === preset.ax &&
                              Math.round(selectedState.anchorY) === preset.ay
                                ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-text)]'
                                : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/5'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(
                      [
                        { key: 'x', label: 'Position X (%)', min: -150, max: 150, step: 0.5 },
                        { key: 'y', label: 'Position Y (%)', min: -150, max: 150, step: 0.5 },
                        { key: 'width', label: 'Width (%)', min: 2, max: 200, step: 0.5 },
                        { key: 'height', label: 'Height (%)', min: 2, max: 200, step: 0.5 },
                        { key: 'scale', label: 'Scale', min: 0.1, max: 4, step: 0.05 },
                        { key: 'rotation', label: 'Rotation (°)', min: -360, max: 360, step: 1 },
                        { key: 'skewX', label: 'Skew X (°)', min: -60, max: 60, step: 1 },
                        { key: 'skewY', label: 'Skew Y (°)', min: -60, max: 60, step: 1 },
                        { key: 'anchorX', label: 'Pivot X (%)', min: -100, max: 100, step: 1 },
                        { key: 'anchorY', label: 'Pivot Y (%)', min: -100, max: 100, step: 1 },
                        { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.02 },
                      ] as { key: NumericPropKey; label: string; min: number; max: number; step: number }[]
                    ).map((cfg) => {
                      const prop = selectedLayer.tracks[cfg.key] || makeProp(cfg.key === 'scale' || cfg.key === 'opacity' ? 1 : 0);
                      const val = evaluateNumberProp(prop, currentTime);
                      const hasKfHere = prop.keyframes.some(
                        (k) => Math.abs(k.time - currentTime) < 0.08
                      );
                      return (
                        <div
                          key={cfg.key}
                          className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-200">{cfg.label}</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => jumpSiblingKeyframe(selectedLayer, cfg.key, -1)}
                                className="p-1 rounded hover:bg-white/10 text-slate-400"
                                title="Previous keyframe"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleKeyframeAtPlayhead(selectedLayer, cfg.key, val)}
                                className={`p-1 rounded transition-colors ${
                                  hasKfHere
                                    ? 'text-[var(--accent)] bg-[var(--accent-soft)]'
                                    : prop.keyframes.length > 0
                                      ? 'text-amber-400/80 hover:bg-white/10'
                                      : 'text-slate-400 hover:bg-white/10'
                                }`}
                                title="Toggle keyframe at playhead"
                              >
                                <Diamond
                                  className={`w-3.5 h-3.5 ${hasKfHere ? 'fill-[var(--accent)]' : ''}`}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => jumpSiblingKeyframe(selectedLayer, cfg.key, 1)}
                                className="p-1 rounded hover:bg-white/10 text-slate-400"
                                title="Next keyframe"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="number"
                                step={cfg.step}
                                value={Number(val.toFixed(2))}
                                onChange={(e) =>
                                  setPropValueAtPlayhead(
                                    selectedLayer,
                                    cfg.key,
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-16 px-1.5 py-0.5 rounded bg-slate-950 border border-white/10 text-xs font-mono tabular-nums text-right text-white"
                              />
                            </div>
                          </div>
                          <input
                            type="range"
                            min={cfg.min}
                            max={cfg.max}
                            step={cfg.step}
                            value={val}
                            onChange={(e) =>
                              setPropValueAtPlayhead(
                                selectedLayer,
                                cfg.key,
                                parseFloat(e.target.value)
                              )
                            }
                            className="w-full accent-[var(--accent)] h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {inspectorTab === 'effects' && (
                  <div className="space-y-3">
                    {/* Color Keyframe */}
                    {(() => {
                      const cProp = selectedLayer.tracks.color;
                      const currentColor = evaluateColorProp(cProp, currentTime);
                      const hasKf = cProp.keyframes.some((k) => Math.abs(k.time - currentTime) < 0.08);
                      return (
                        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-200">
                              Layer Color (Lights up at keyframes)
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                toggleKeyframeAtPlayhead(selectedLayer, 'color', currentColor)
                              }
                              className={`p-1 rounded ${
                                hasKf ? 'text-[var(--accent)] bg-[var(--accent-soft)]' : 'text-slate-400 hover:bg-white/10'
                              }`}
                              title="Keyframe Color"
                            >
                              <Diamond className={`w-3.5 h-3.5 ${hasKf ? 'fill-[var(--accent)]' : ''}`} />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={currentColor}
                              onChange={(e) =>
                                setPropValueAtPlayhead(selectedLayer, 'color', e.target.value)
                              }
                              className="w-10 h-9 rounded bg-transparent border border-white/10 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={currentColor}
                              onChange={(e) =>
                                setPropValueAtPlayhead(selectedLayer, 'color', e.target.value)
                              }
                              className="flex-1 px-2.5 py-1.5 rounded bg-slate-950 border border-white/10 text-xs font-mono text-white"
                            />
                            {['#84CC16', '#FACC15', '#FFFFFF', '#0F172A'].map((swatch) => (
                              <button
                                key={swatch}
                                type="button"
                                onClick={() =>
                                  setPropValueAtPlayhead(selectedLayer, 'color', swatch, true)
                                }
                                className="w-6 h-6 rounded border border-white/20 shrink-0"
                                style={{ backgroundColor: swatch }}
                                title={`Keyframe color ${swatch}`}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Glow & Blur Keyframes */}
                    {(
                      [
                        { key: 'glow', label: 'Glow / Light Bloom', min: 0, max: 100, step: 1 },
                        { key: 'blur', label: 'Gaussian Blur (px)', min: 0, max: 30, step: 0.5 },
                      ] as { key: NumericPropKey; label: string; min: number; max: number; step: number }[]
                    ).map((cfg) => {
                      const prop = selectedLayer.tracks[cfg.key];
                      const val = evaluateNumberProp(prop, currentTime);
                      const hasKf = prop.keyframes.some((k) => Math.abs(k.time - currentTime) < 0.08);
                      return (
                        <div
                          key={cfg.key}
                          className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-200">{cfg.label}</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleKeyframeAtPlayhead(selectedLayer, cfg.key, val)}
                                className={`p-1 rounded ${
                                  hasKf ? 'text-[var(--accent)] bg-[var(--accent-soft)]' : 'text-slate-400'
                                }`}
                              >
                                <Diamond className={`w-3.5 h-3.5 ${hasKf ? 'fill-[var(--accent)]' : ''}`} />
                              </button>
                              <span className="text-xs font-mono tabular-nums text-slate-300 w-9 text-right">
                                {Math.round(val)}
                              </span>
                            </div>
                          </div>
                          <input
                            type="range"
                            min={cfg.min}
                            max={cfg.max}
                            step={cfg.step}
                            value={val}
                            onChange={(e) =>
                              setPropValueAtPlayhead(
                                selectedLayer,
                                cfg.key,
                                parseFloat(e.target.value)
                              )
                            }
                            className="w-full accent-[var(--accent)] h-1.5 bg-slate-800 rounded-lg"
                          />
                        </div>
                      );
                    })}

                    {(selectedLayer.controlKind === 'album-cover' ||
                      selectedLayer.type === 'shape' ||
                      selectedLayer.type === 'image' ||
                      selectedLayer.type === 'video') && (
                      <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-200">
                            Corner Radius (0 = Sharp Square)
                          </span>
                          <span className="text-xs font-mono tabular-nums text-slate-300">
                            {selectedLayer.cornerRadius ?? 0}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={120}
                          step={1}
                          value={selectedLayer.cornerRadius ?? 0}
                          onChange={(e) =>
                            updateLayer(selectedLayer.id, (l) => ({
                              ...l,
                              cornerRadius: parseInt(e.target.value, 10) || 0,
                            }))
                          }
                          className="w-full accent-[var(--accent)] h-1.5 bg-slate-800 rounded-lg"
                        />
                      </div>
                    )}

                    {selectedLayer.controlKind === 'album-cover' && (
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">
                            Song Album Cover Image
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              commitProject({
                                ...project,
                                showAlbumArt: project.showAlbumArt === false ? true : false,
                              })
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                              project.showAlbumArt !== false
                                ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-text)] font-medium'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {project.showAlbumArt !== false ? 'Album Art: ON' : 'Album Art: OFF'}
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          When ON, automatically picks the song&apos;s embedded album cover (or defaults to [ P.U.R MUSiCLiGHT ] if none). When OFF, always shows [ P.U.R MUSiCLiGHT ].
                        </p>
                        <div className="flex items-center gap-2">
                          <label className="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 cursor-pointer inline-flex items-center justify-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-[var(--accent)]" />
                            <span>Pick Cover Image</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                  if (typeof reader.result === 'string') {
                                    onUpdateTrack({
                                      ...track,
                                      coverArtUrl: reader.result,
                                      project: { ...project, showAlbumArt: true },
                                    });
                                  }
                                };
                                reader.readAsDataURL(file);
                                e.target.value = '';
                              }}
                              className="hidden"
                            />
                          </label>
                          {track.coverArtUrl && (
                            <button
                              type="button"
                              onClick={() => onUpdateTrack({ ...track, coverArtUrl: null })}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 text-xs text-slate-300 hover:text-rose-200"
                              title="Remove custom cover and reset to [ P.U.R MUSiCLiGHT ]"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedLayer.type === 'text' && (
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
                        <label className="block text-xs font-medium text-slate-300">
                          Text Content
                        </label>
                        <input
                          type="text"
                          value={selectedLayer.textContent || ''}
                          onChange={(e) =>
                            updateLayer(selectedLayer.id, (l) => ({
                              ...l,
                              textContent: e.target.value,
                            }))
                          }
                          className="w-full px-2.5 py-2 rounded bg-slate-950 border border-white/10 text-xs text-white"
                        />
                      </div>
                    )}

                    {/* Crop Tool (Top, Right, Bottom, Left - Keyframeable!) */}
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
                      <div className="text-xs font-semibold text-white">
                        Crop Layer (Edges %)
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {(
                          [
                            { key: 'cropTop', label: 'Top %' },
                            { key: 'cropBottom', label: 'Bottom %' },
                            { key: 'cropLeft', label: 'Left %' },
                            { key: 'cropRight', label: 'Right %' },
                          ] as { key: NumericPropKey; label: string }[]
                        ).map((c) => {
                          const prop = selectedLayer.tracks[c.key] || makeProp(0);
                          const val = evaluateNumberProp(prop, currentTime);
                          const hasKf = prop.keyframes.some((k) => Math.abs(k.time - currentTime) < 0.08);
                          return (
                            <div key={c.key} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-300">{c.label}</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => toggleKeyframeAtPlayhead(selectedLayer, c.key, val)}
                                    className={`p-0.5 rounded ${
                                      hasKf ? 'text-[var(--accent)]' : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                    title="Keyframe crop"
                                  >
                                    <Diamond className={`w-3 h-3 ${hasKf ? 'fill-[var(--accent)]' : ''}`} />
                                  </button>
                                  <span className="font-mono tabular-nums text-slate-300">
                                    {Math.round(val)}%
                                  </span>
                                </div>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={49}
                                step={1}
                                value={val}
                                onChange={(e) =>
                                  setPropValueAtPlayhead(
                                    selectedLayer,
                                    c.key,
                                    parseFloat(e.target.value)
                                  )
                                }
                                className="w-full accent-[var(--accent)] h-1.5 bg-slate-800 rounded-lg"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Stage Background & Transparent Canvas Toggle */}
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-200">
                          Stage Background
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            commitProject({
                              ...project,
                              transparentBg: !project.transparentBg,
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                            project.transparentBg
                              ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-text)] font-medium'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {project.transparentBg ? 'Transparent: ON' : 'Make Transparent'}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          disabled={Boolean(project.transparentBg)}
                          value={project.backgroundColor}
                          onChange={(e) =>
                            commitProject({
                              ...project,
                              transparentBg: false,
                              backgroundColor: e.target.value,
                            })
                          }
                          className="w-9 h-8 rounded bg-transparent border border-white/10 disabled:opacity-35"
                        />
                        {(
                          [
                            { id: 'default', label: 'Default', bg: '#0E1118', acc: '#84CC16' },
                            { id: 'warm', label: 'Warm', bg: '#0E0C0A', acc: '#F59E0B' },
                            { id: 'dark', label: 'Dark', bg: '#06080E', acc: '#64748B' },
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() =>
                              commitProject({
                                ...project,
                                transparentBg: false,
                                themeMood: m.id,
                                backgroundColor: m.bg,
                                accentColor: m.acc,
                              })
                            }
                            className={`px-2.5 py-1.5 rounded-lg text-xs border ${
                              !project.transparentBg && project.themeMood === m.id
                                ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-text)]'
                                : 'bg-white/5 border-white/10 text-slate-300'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {inspectorTab === 'parent' && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
                      <div className="text-xs font-semibold text-white">
                        Alight Motion Parenting Tool
                      </div>
                      <p className="text-xs text-slate-400">
                        Attach this layer to a parent (such as a Null Rig or Box). Rotating, scaling, or moving the parent automatically transforms this child layer.
                      </p>
                      <select
                        value={selectedLayer.parentId || ''}
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, (l) => ({
                            ...l,
                            parentId: e.target.value || null,
                          }))
                        }
                        className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-[var(--accent)]"
                      >
                        <option value="">None (Independent)</option>
                        {project.layers
                          .filter(
                            (cand) =>
                              cand.id !== selectedLayer.id &&
                              !wouldCreateCycle(selectedLayer.id, cand.id)
                          )
                          .map((cand) => (
                            <option key={cand.id} value={cand.id}>
                              {cand.name} ({cand.type})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}

                {inspectorTab === 'actions' && (
                  <div className="space-y-3">
                    {/* Custom Action Role (Shape -> Pause Button etc.) */}
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
                      <div className="text-xs font-semibold text-white">
                        Interactive Button Action Role
                      </div>
                      <p className="text-xs text-slate-400">
                        Turn any shape (like a Circle) or layer into a real music player control.
                      </p>
                      <select
                        value={selectedLayer.actionRole}
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, (l) => ({
                            ...l,
                            actionRole: e.target.value as ActionRole,
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-xs text-white"
                      >
                        <option value="none">None (Visual Layer Only)</option>
                        <option value="play-pause">Play / Pause Music</option>
                        <option value="next">Next Track</option>
                        <option value="prev">Previous Track</option>
                        <option value="loop">Toggle Loop Mode</option>
                        <option value="toggle-lyrics">Toggle Embedded Lyrics</option>
                        <option value="seek-fwd">Seek Forward +5s</option>
                        <option value="seek-back">Seek Back -5s</option>
                      </select>
                    </div>

                    {/* Keyframeable Lock / Disappear / Disable Touch */}
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">
                          Control State at {formatTime(currentTime, true)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            toggleKeyframeAtPlayhead(
                              selectedLayer,
                              'controlState',
                              selectedState.controlState
                            )
                          }
                          className="text-xs text-[var(--accent)] hover:text-[var(--accent-text)] inline-flex items-center gap-1"
                        >
                          <Diamond className="w-3.5 h-3.5" />
                          <span>Toggle KF</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { id: 'enabled', label: 'Enabled', icon: Unlock },
                            { id: 'locked', label: 'Lock Button', icon: Lock },
                            { id: 'disabled', label: 'Disable Touch', icon: Ban },
                            { id: 'hidden', label: 'Disappear', icon: EyeOff },
                          ] as { id: ControlStateValue; label: string; icon: React.FC<{ className?: string }> }[]
                        ).map((st) => {
                          const Icon = st.icon;
                          const isActive = selectedState.controlState === st.id;
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() =>
                                setPropValueAtPlayhead(selectedLayer, 'controlState', st.id, true)
                              }
                              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                                isActive
                                  ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-text)]'
                                  : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-white/5'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{st.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Global Touch Lock Keyframe */}
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-white">
                          Global Touch Lock (Player Mode)
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Disable all stage touches at {formatTime(currentTime, true)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={toggleGlobalTouchLockKf}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                          globalTouchLocked
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                            : 'bg-white/5 border-white/10 text-slate-300'
                        }`}
                      >
                        {globalTouchLocked ? 'Touch Locked' : 'Unlocked'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Quick Lyric Cues Jump List */}
                {track.lyrics.some((l) => l.time !== null) && (
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
                    <div className="text-xs font-medium text-slate-300">
                      Jump to Lyric Cue to Keyframe
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {track.lyrics
                        .filter((l) => l.time !== null)
                        .map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => onSeek(l.time!)}
                            className="w-full px-2 py-1.5 rounded-lg hover:bg-white/5 text-left flex items-center gap-2 text-xs"
                          >
                            <span className="font-mono tabular-nums text-[var(--accent)] shrink-0">
                              {formatTime(l.time!, false)}
                            </span>
                            <span className="text-slate-200 truncate">{l.text}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400">
                Select or add a layer to animate its properties.
              </div>
            )}
          </div>

          {/* Multi-Track Timeline */}
          <div
            className={`${
              mobilePane === 'timeline' ? 'flex' : 'hidden'
            } lg:flex flex-1 min-h-0 flex-col overflow-hidden`}
          >
            {/* Timeline Zoom Bar */}
            <div className="px-3 py-1 border-b border-white/10 flex items-center justify-between gap-2 bg-[#141824] shrink-0">
              <span className="text-[11px] font-medium text-slate-400">
                Timeline · Drag bars to move, drag edges to stretch/trim
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTimelineZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
                  className="p-1 rounded hover:bg-white/10 text-slate-300"
                  title="Zoom out timeline"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono tabular-nums text-slate-400 w-9 text-center">
                  {timelineZoom}x
                </span>
                <button
                  type="button"
                  onClick={() => setTimelineZoom((z) => Math.min(4, Number((z + 0.5).toFixed(1))))}
                  className="p-1 rounded hover:bg-white/10 text-slate-300"
                  title="Zoom in timeline"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

        {/* Layers + Tracks Scroll Area */}
        <div
          className="flex-1 overflow-y-auto overflow-x-auto relative"
          onPointerMove={handleTimelinePointerMove}
          onPointerUp={handleTimelinePointerUp}
          onPointerLeave={handleTimelinePointerUp}
        >
          <div className="min-w-full flex">
            {/* Sticky Layer Header Column */}
            <div className="w-44 sm:w-52 shrink-0 border-r border-white/10 bg-[#121620] sticky left-0 z-20">
              <div className="h-8 px-2.5 flex items-center text-[11px] font-medium text-[var(--accent-text)] border-b border-white/10 bg-[#151A26]">
                Music · {track.title}
              </div>
              {project.layers.map((layer, idx) => {
                const isSel = selectedLayer?.id === layer.id;
                return (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className={`h-9 px-2 flex items-center justify-between gap-1 border-b border-white/5 cursor-pointer ${
                      isSel ? 'bg-[var(--accent-soft)]' : 'hover:bg-white/[0.03]'
                    } ${!layer.visible ? 'opacity-55' : ''}`}
                  >
                    <span className="text-xs text-slate-200 truncate flex-1">{layer.name}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveLayerOrder(idx, -1);
                        }}
                        disabled={idx === 0}
                        className="min-w-[26px] min-h-[26px] flex items-center justify-center rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-25"
                        title="Move layer up (front)"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveLayerOrder(idx, 1);
                        }}
                        disabled={idx === project.layers.length - 1}
                        className="min-w-[26px] min-h-[26px] flex items-center justify-center rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-25"
                        title="Move layer down (back)"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateLayer(layer.id, (l) => ({ ...l, visible: !l.visible }));
                        }}
                        className="min-w-[26px] min-h-[26px] flex items-center justify-center rounded hover:bg-white/10 text-slate-300 hover:text-white"
                        title={layer.visible ? 'Hide layer (make invisible)' : 'Show layer'}
                      >
                        {layer.visible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-rose-400" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time Ruler + Track Bars */}
            <div
              ref={timelineTrackRef}
              className="flex-1 relative"
              style={{ minWidth: `${timelineZoom * 100}%` }}
            >
              {/* Music & Lyric Cue Ruler */}
              <div
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  onSeek(ratio * track.duration);
                }}
                className="h-8 border-b border-white/10 bg-[#151A26] relative cursor-pointer select-none"
              >
                {track.lyrics
                  .filter((l) => l.time !== null)
                  .map((l) => {
                    const leftPct = (l.time! / Math.max(1, track.duration)) * 100;
                    return (
                      <div
                        key={l.id}
                        style={{ left: `${leftPct}%` }}
                        className="absolute top-1 bottom-1 border-l border-amber-400/50 pl-1 pointer-events-none"
                        title={`${formatTime(l.time!)} ${l.text}`}
                      >
                        <span className="text-[10px] text-amber-300/80 whitespace-nowrap block max-w-[90px] truncate">
                          {l.text}
                        </span>
                      </div>
                    );
                  })}
              </div>

              {/* Layer Duration Bars & Keyframe Diamonds */}
              {project.layers.map((layer) => {
                const startPct = (layer.startTime / Math.max(1, track.duration)) * 100;
                const widthPct = Math.max(
                  1.5,
                  ((layer.endTime - layer.startTime) / Math.max(1, track.duration)) * 100
                );
                const isSel = selectedLayer?.id === layer.id;

                // Gather all unique keyframe timestamps on this layer
                const kfTimes = new Set<number>();
                (Object.keys(layer.tracks) as AnyPropKey[]).forEach((k) => {
                  layer.tracks[k].keyframes.forEach((kf) => kfTimes.add(kf.time));
                });

                return (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className="h-9 border-b border-white/5 relative"
                  >
                    {/* Stretchable / Movable Layer Bar */}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedLayerId(layer.id);
                        timelineDragRef.current = {
                          layerId: layer.id,
                          mode: 'move',
                          startClientX: e.clientX,
                          origStart: layer.startTime,
                          origEnd: layer.endTime,
                        };
                      }}
                      style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                      className={`absolute top-1.5 bottom-1.5 rounded-md border flex items-center justify-between px-1.5 cursor-grab active:cursor-grabbing ${
                        isSel
                          ? 'bg-[var(--accent-soft)] border-[var(--accent-border)]'
                          : layer.type === 'video'
                            ? 'bg-indigo-500/20 border-indigo-400/40'
                            : 'bg-slate-700/40 border-white/10'
                      }`}
                    >
                      {/* Trim Start Handle */}
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          timelineDragRef.current = {
                            layerId: layer.id,
                            mode: 'trim-start',
                            startClientX: e.clientX,
                            origStart: layer.startTime,
                            origEnd: layer.endTime,
                          };
                        }}
                        className="w-2 h-full cursor-ew-resize bg-white/20 rounded-l hover:bg-[var(--accent)]"
                        title="Trim start"
                      />
                      <span className="text-[10px] text-slate-200 truncate px-1 pointer-events-none">
                        {layer.name}
                      </span>
                      {/* Trim End Handle (Stretch!) */}
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          timelineDragRef.current = {
                            layerId: layer.id,
                            mode: 'trim-end',
                            startClientX: e.clientX,
                            origStart: layer.startTime,
                            origEnd: layer.endTime,
                          };
                        }}
                        className="w-2 h-full cursor-ew-resize bg-white/20 rounded-r hover:bg-[var(--accent)]"
                        title="Stretch / Trim end"
                      />
                    </div>

                    {/* Keyframe Diamonds */}
                    {Array.from(kfTimes).map((t) => {
                      const kfLeft = (t / Math.max(1, track.duration)) * 100;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLayerId(layer.id);
                            onSeek(t);
                          }}
                          style={{ left: `${kfLeft}%` }}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-3 h-3 rotate-45 bg-[var(--accent)] border border-slate-950 hover:scale-125 transition-transform"
                          title={`Keyframe at ${formatTime(t, true)}`}
                        />
                      );
                    })}
                  </div>
                );
              })}

              {/* Playhead Line */}
              <div
                style={{
                  left: `${Math.min(100, (currentTime / Math.max(1, track.duration)) * 100)}%`,
                }}
                className="absolute top-0 bottom-0 w-[2px] bg-rose-500 pointer-events-none z-30"
              >
                <div className="w-2.5 h-2.5 -translate-x-[4px] bg-rose-500 rounded-b-sm" />
              </div>
            </div>
          </div>
        </div>
          </div>
        </div>
      )}

      {/* Scrollable Add Layer Modal / Bottom Sheet */}
      {showAddMenu && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowAddMenu(false)}
        >
          <div
            className="w-full sm:max-w-sm bg-[#161B26] border border-white/15 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[78vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-display font-bold text-white">Add Layer</h3>
              <button
                type="button"
                onClick={() => setShowAddMenu(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                aria-label="Close Add Layer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-3 space-y-1.5">
              <div className="px-2 py-1 text-[11px] font-medium text-slate-400">Shapes</div>
              <button
                type="button"
                onClick={() => addShapeLayer('rect')}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/10 text-left text-xs text-white flex items-center gap-3"
              >
                <Square className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Rectangle Box (Stretchable)</span>
              </button>
              <button
                type="button"
                onClick={() => addShapeLayer('circle')}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/10 text-left text-xs text-white flex items-center gap-3"
              >
                <Circle className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span>Circle (Can act as button!)</span>
              </button>
              <button
                type="button"
                onClick={() => addShapeLayer('rounded-rect')}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/10 text-left text-xs text-white flex items-center gap-3"
              >
                <Square className="w-4 h-4 text-emerald-400 rounded shrink-0" />
                <span>Rounded Box</span>
              </button>
              <button
                type="button"
                onClick={() => addShapeLayer('line')}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/10 text-left text-xs text-white flex items-center gap-3"
              >
                <Minus className="w-4 h-4 text-slate-300 shrink-0" />
                <span>Line</span>
              </button>
              <button
                type="button"
                onClick={() => addShapeLayer('star')}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/10 text-left text-xs text-white flex items-center gap-3"
              >
                <Star className="w-4 h-4 text-yellow-400 shrink-0" />
                <span>Star</span>
              </button>

              <div className="border-t border-white/10 my-1.5" />
              <div className="px-2 py-1 text-[11px] font-medium text-slate-400">
                Media & Rigging
              </div>
              <button
                type="button"
                onClick={addTextLayer}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/10 text-left text-xs text-white flex items-center gap-3"
              >
                <Type className="w-4 h-4 text-indigo-300 shrink-0" />
                <span>Text Layer</span>
              </button>
              <button
                type="button"
                onClick={addNullLayer}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/10 text-left text-xs text-white flex items-center gap-3"
              >
                <Move className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Null Object (Parent Rig)</span>
              </button>
              <label className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/10 text-left text-xs text-white flex items-center gap-3 cursor-pointer">
                <ImageIcon className="w-4 h-4 text-pink-300 shrink-0" />
                <span>Import Image Layer</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUploadMediaLayer(e, 'image')}
                  className="hidden"
                />
              </label>
              <label className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/10 text-left text-xs text-white flex items-center gap-3 cursor-pointer">
                <Film className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span>Import Video Layer (Stretchable)</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => handleUploadMediaLayer(e, 'video')}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
