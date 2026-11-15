import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Lock,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Ban,
} from 'lucide-react';
import { LoopMode, MotionLayer, Track } from '../types/studio';
import { evaluateAllLayers, evaluateDiscreteProp } from '../utils/interpolation';
import { formatTime } from '../utils/lyricsAndTags';
import { LyricsPanel } from './LyricsPanel';

interface StageRendererProps {
  track: Track;
  currentTime: number;
  isPlaying: boolean;
  loopMode: LoopMode;
  lyricsEnabled: boolean;
  isEditorMode?: boolean;
  selectedLayerId?: string | null;
  viewportZoom?: number;
  viewportPan?: { x: number; y: number };
  onChangeViewport?: (zoom: number, pan: { x: number; y: number }) => void;
  onSelectLayer?: (layerId: string) => void;
  onDragLayer?: (layerId: string, newX: number, newY: number) => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleLoop: () => void;
  onToggleLyrics: () => void;
  onSeek: (time: number) => void;
  onAlbumLongPress: () => void;
}

export const StageRenderer: React.FC<StageRendererProps> = ({
  track,
  currentTime,
  isPlaying,
  loopMode,
  lyricsEnabled,
  isEditorMode = false,
  selectedLayerId = null,
  viewportZoom = 1,
  viewportPan = { x: 0, y: 0 },
  onChangeViewport,
  onSelectLayer,
  onDragLayer,
  onTogglePlay,
  onNext,
  onPrev,
  onToggleLoop,
  onToggleLyrics,
  onSeek,
  onAlbumLongPress,
}) => {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [boxSize, setBoxSize] = useState({ width: 360, height: 640 });
  const [lockedShakeId, setLockedShakeId] = useState<string | null>(null);

  const project = track.project;
  const safeCanvasW = Math.max(1, project.canvasWidth);
  const safeCanvasH = Math.max(1, project.canvasHeight);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const pad = isEditorMode ? 24 : 12;
      const availW = Math.max(80, rect.width - pad);
      const availH = Math.max(80, rect.height - pad);
      const aspect = safeCanvasW / safeCanvasH;

      let renderW = availW;
      let renderH = renderW / aspect;
      if (renderH > availH) {
        renderH = availH;
        renderW = renderH * aspect;
      }

      renderW = Math.max(44, Math.round(renderW));
      renderH = Math.max(44, Math.round(renderH));
      setBoxSize({ width: renderW, height: renderH });
    };

    updateSize();
    const obs = new ResizeObserver(updateSize);
    obs.observe(el);
    return () => obs.disconnect();
  }, [safeCanvasW, safeCanvasH, isEditorMode]);

  const evaluated = useMemo(
    () => evaluateAllLayers(project.layers, currentTime, safeCanvasW, safeCanvasH),
    [project.layers, currentTime, safeCanvasW, safeCanvasH]
  );

  const isGlobalTouchLocked = useMemo(
    () => !isEditorMode && evaluateDiscreteProp(project.globalTouchLock, currentTime),
    [isEditorMode, project.globalTouchLock, currentTime]
  );

  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  // Layer drag in Editor Mode
  const dragRef = useRef<{
    layerId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Multi-touch pinch-to-zoom & canvas background pan in Editor Mode
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{
    dist: number;
    zoom: number;
    midX: number;
    midY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const panDragRef = useRef<{
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  const triggerAction = (layer: MotionLayer) => {
    const state = evaluated[layer.id];
    if (!state) return;

    if (!isEditorMode) {
      if (isGlobalTouchLocked || state.controlState === 'disabled') return;
      if (state.controlState === 'locked') {
        setLockedShakeId(layer.id);
        window.setTimeout(() => setLockedShakeId(null), 350);
        return;
      }
      if (state.controlState === 'hidden') return;
    }

    switch (layer.actionRole) {
      case 'play-pause':
        onTogglePlay();
        break;
      case 'next':
        onNext();
        break;
      case 'prev':
        onPrev();
        break;
      case 'loop':
        onToggleLoop();
        break;
      case 'toggle-lyrics':
        onToggleLyrics();
        break;
      case 'seek-fwd':
        onSeek(Math.min(track.duration, currentTime + 5));
        break;
      case 'seek-back':
        onSeek(Math.max(0, currentTime - 5));
        break;
      default:
        break;
    }
  };

  const handleStagePointerDown = (e: React.PointerEvent) => {
    if (!isEditorMode) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2) {
      // Begin pinch-to-zoom + 2-finger pan
      dragRef.current = null;
      panDragRef.current = null;
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      pinchStartRef.current = {
        dist: Math.max(10, dist),
        zoom: viewportZoom,
        midX,
        midY,
        panX: viewportPan.x,
        panY: viewportPan.y,
      };
      return;
    }

    if (activePointersRef.current.size === 1 && !dragRef.current) {
      // Background drag to pan canvas
      panDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origPanX: viewportPan.x,
        origPanY: viewportPan.y,
      };
    }
  };

  const handleStagePointerMove = (e: React.PointerEvent) => {
    if (isEditorMode && activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (isEditorMode && activePointersRef.current.size >= 2 && pinchStartRef.current && onChangeViewport) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const nextZoom = Math.max(
        0.2,
        Math.min(3.0, Number((pinchStartRef.current.zoom * (dist / pinchStartRef.current.dist)).toFixed(2)))
      );
      const nextPan = {
        x: pinchStartRef.current.panX + (midX - pinchStartRef.current.midX),
        y: pinchStartRef.current.panY + (midY - pinchStartRef.current.midY),
      };
      onChangeViewport(nextZoom, nextPan);
      return;
    }

    if (dragRef.current && onDragLayer) {
      const z = Math.max(0.2, viewportZoom);
      const dxPx = (e.clientX - dragRef.current.startClientX) / z;
      const dyPx = (e.clientY - dragRef.current.startClientY) / z;
      const dxPct = (dxPx / Math.max(1, boxSize.width)) * 100;
      const dyPct = (dyPx / Math.max(1, boxSize.height)) * 100;
      onDragLayer(
        dragRef.current.layerId,
        Number((dragRef.current.origX + dxPct).toFixed(1)),
        Number((dragRef.current.origY + dyPct).toFixed(1))
      );
      return;
    }

    if (isEditorMode && panDragRef.current && onChangeViewport) {
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      onChangeViewport(viewportZoom, {
        x: Math.round(panDragRef.current.origPanX + dx),
        y: Math.round(panDragRef.current.origPanY + dy),
      });
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }
    dragRef.current = null;
    panDragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!isEditorMode || !onChangeViewport) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const nextZoom = Math.max(0.2, Math.min(3.0, Number((viewportZoom + delta).toFixed(2))));
    onChangeViewport(nextZoom, viewportPan);
  };

  const minDim = Math.min(boxSize.width, boxSize.height);
  const compactUI = minDim < 220;

  return (
    <div
      ref={outerRef}
      className={`w-full h-full flex items-center justify-center relative select-none overflow-hidden ${
        isEditorMode ? 'touch-none' : ''
      }`}
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      onPointerCancel={handleStagePointerUp}
      onPointerLeave={handleStagePointerUp}
      onWheel={handleWheel}
    >
      <div
        className={`relative transition-[width,height] duration-150 ${
          project.transparentBg
            ? isEditorMode
              ? 'bg-alpha-checker shadow-2xl'
              : 'bg-transparent'
            : 'shadow-2xl'
        } ${
          isEditorMode
            ? 'border-2 border-dashed border-[var(--accent-border)] overflow-visible'
            : project.transparentBg
              ? 'overflow-hidden'
              : 'border border-white/10 overflow-hidden'
        }`}
        style={{
          width: boxSize.width,
          height: boxSize.height,
          backgroundColor: project.transparentBg
            ? undefined
            : project.backgroundColor || '#0E1118',
          borderRadius: isEditorMode ? '6px' : '16px',
          transform: isEditorMode
            ? `translate(${viewportPan.x}px, ${viewportPan.y}px) scale(${viewportZoom})`
            : undefined,
          transformOrigin: 'center center',
        }}
      >
        {/* Subtle ambient backdrop cover tint for unedited or default tracks */}
        {track.coverArtUrl && project.showAlbumArt !== false && !track.hasMotionEdit && !project.transparentBg && (
          <div
            className="absolute inset-0 opacity-20 blur-2xl scale-110 pointer-events-none"
            style={{
              backgroundImage: `url(${track.coverArtUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}

        {/* Render Layers in z-order (top of timeline list = frontmost on stage) */}
        {project.layers.map((layer, layerIdx) => {
          const st = evaluated[layer.id];
          if (!st || !st.isWithinTimeRange) return null;

          const isSelected = isEditorMode && selectedLayerId === layer.id;
          const isHiddenState = st.controlState === 'hidden';
          const isLockedState = st.controlState === 'locked';
          const isDisabledState = st.controlState === 'disabled';

          const finalOpacity = isHiddenState ? (isEditorMode ? 0.18 : 0) : st.worldOpacity;
          const isInteractive =
            isEditorMode ||
            (!isGlobalTouchLocked &&
              !isHiddenState &&
              !isDisabledState &&
              (layer.actionRole !== 'none' ||
                layer.controlKind === 'seek-bar' ||
                layer.controlKind === 'lyrics'));

          const leftPct = 50 + st.worldX;
          const topPct = 50 + st.worldY;
          const shakeOffset = lockedShakeId === layer.id ? 'translateX(4px)' : '';

          const glowShadow =
            st.glow > 0
              ? `0 0 ${Math.round((st.glow / 100) * 48)}px ${st.color}, 0 0 ${Math.round(
                  (st.glow / 100) * 18
                )}px ${st.color}`
              : undefined;

          const hasCrop =
            st.cropTop > 0 || st.cropRight > 0 || st.cropBottom > 0 || st.cropLeft > 0;
          const clipPath = hasCrop
            ? `inset(${st.cropTop}% ${st.cropRight}% ${st.cropBottom}% ${st.cropLeft}%)`
            : undefined;

          const originX = 50 + st.anchorX;
          const originY = 50 + st.anchorY;

          return (
            <div
              key={layer.id}
              onPointerDown={(e) => {
                if (isEditorMode) {
                  if (activePointersRef.current.size >= 1) {
                    // Let 2-finger pinch propagate if second finger lands
                    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    if (activePointersRef.current.size >= 2) return;
                  }
                  e.stopPropagation();
                  onSelectLayer?.(layer.id);
                  if (!layer.lockedInEditor) {
                    dragRef.current = {
                      layerId: layer.id,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      origX: st.x,
                      origY: st.y,
                    };
                  }
                  return;
                }

                if (layer.controlKind === 'album-cover') {
                  e.stopPropagation();
                  longPressTriggeredRef.current = false;
                  longPressTimerRef.current = window.setTimeout(() => {
                    longPressTriggeredRef.current = true;
                    onAlbumLongPress();
                  }, 500);
                }
              }}
              onPointerUp={(e) => {
                if (isEditorMode) return;
                if (layer.controlKind === 'album-cover') {
                  e.stopPropagation();
                  if (longPressTimerRef.current !== null) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                  if (!longPressTriggeredRef.current) {
                    triggerAction(layer);
                  }
                }
              }}
              onPointerCancel={() => {
                if (longPressTimerRef.current !== null) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
              }}
              onClick={(e) => {
                if (isEditorMode) {
                  e.stopPropagation();
                  return;
                }
                if (layer.controlKind === 'album-cover') return;
                if (layer.actionRole !== 'none') {
                  e.stopPropagation();
                  triggerAction(layer);
                }
              }}
              style={{
                position: 'absolute',
                zIndex: project.layers.length - layerIdx,
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: layer.type === 'null' ? '28px' : `${Math.max(2, st.width)}%`,
                height: layer.type === 'null' ? '28px' : `${Math.max(2, st.height)}%`,
                transformOrigin: `${originX}% ${originY}%`,
                transform: `translate(-50%, -50%) scale(${st.worldScale}) rotate(${st.worldRotation}deg) skew(${st.skewX}deg, ${st.skewY}deg) ${shakeOffset}`,
                opacity: isDisabledState && !isEditorMode ? finalOpacity * 0.45 : finalOpacity,
                filter: st.blur > 0 ? `blur(${st.blur}px)` : undefined,
                pointerEvents: isInteractive ? 'auto' : 'none',
                cursor: isEditorMode
                  ? layer.lockedInEditor
                    ? 'not-allowed'
                    : 'grab'
                  : layer.actionRole !== 'none'
                    ? isLockedState
                      ? 'not-allowed'
                      : 'pointer'
                    : 'default',
              }}
              className={`group transition-shadow duration-75 ${
                isSelected
                  ? 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-transparent'
                  : ''
              }`}
            >
              {/* Croppable Inner Visual Wrapper */}
              <div className="w-full h-full" style={{ clipPath }}>
                <LayerVisual
                  layer={layer}
                  track={track}
                  color={st.color}
                  glowShadow={glowShadow}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  loopMode={loopMode}
                  lyricsEnabled={lyricsEnabled}
                  isEditorMode={isEditorMode}
                  compactUI={compactUI}
                  stageMinDim={minDim}
                  onSeek={onSeek}
                />
              </div>

              {/* Control State Overlays (Locked / Touch Disabled) */}
              {isLockedState && (
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-950/65 border border-amber-400/50 backdrop-blur-[1px]"
                  title="Locked at this timestamp"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                </div>
              )}
              {isDisabledState && isEditorMode && (
                <div
                  className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center"
                  title="Touch disabled at this timestamp"
                >
                  <Ban className="w-2.5 h-2.5" />
                </div>
              )}

              {/* Editor Rotation Pivot / Anchor Crosshair */}
              {isSelected && (
                <div
                  style={{ left: `${originX}%`, top: `${originY}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[var(--accent)] border-2 border-slate-950 shadow pointer-events-none flex items-center justify-center"
                  title="Rotation Pivot / Center"
                >
                  <div className="w-1 h-1 rounded-full bg-slate-950" />
                </div>
              )}
            </div>
          );
        })}

        {/* Global Touch Lock Banner in Player Mode */}
        {isGlobalTouchLocked && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-md bg-slate-950/85 border border-amber-500/40 text-amber-300 text-[11px] font-medium flex items-center gap-1.5 pointer-events-none">
            <Lock className="w-3 h-3" />
            <span>Touch Locked</span>
          </div>
        )}
      </div>
    </div>
  );
};

interface LayerVisualProps {
  layer: MotionLayer;
  track: Track;
  color: string;
  glowShadow?: string;
  currentTime: number;
  isPlaying: boolean;
  loopMode: LoopMode;
  lyricsEnabled: boolean;
  isEditorMode: boolean;
  compactUI: boolean;
  stageMinDim: number;
  onSeek: (time: number) => void;
}

const LayerVisual: React.FC<LayerVisualProps> = ({
  layer,
  track,
  color,
  glowShadow,
  currentTime,
  isPlaying,
  loopMode,
  lyricsEnabled,
  isEditorMode,
  compactUI,
  stageMinDim,
  onSeek,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || layer.type !== 'video') return;
    const localT = Math.max(0, currentTime - layer.startTime);
    if (Math.abs(vid.currentTime - localT) > 0.25) {
      vid.currentTime = localT;
    }
    if (isPlaying && vid.paused) {
      vid.play().catch(() => {});
    } else if (!isPlaying && !vid.paused) {
      vid.pause();
    }
  }, [currentTime, isPlaying, layer.startTime, layer.type]);

  if (layer.type === 'null') {
    if (!isEditorMode) return null;
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-5 h-5 border border-dashed border-amber-400/90 rounded-sm flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
        </div>
      </div>
    );
  }

  if (layer.type === 'shape') {
    const kind = layer.shapeKind || 'rect';
    if (kind === 'star') {
      return (
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full overflow-visible"
          style={{ filter: glowShadow ? `drop-shadow(${glowShadow})` : undefined }}
        >
          <polygon
            points="50,5 63,36 96,38 71,60 79,93 50,75 21,93 29,60 4,38 37,36"
            fill={color}
          />
        </svg>
      );
    }
    if (kind === 'line') {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div
            className="w-full h-[3px] rounded-full"
            style={{ backgroundColor: color, boxShadow: glowShadow }}
          />
        </div>
      );
    }
    const radius =
      kind === 'circle'
        ? '9999px'
        : kind === 'rounded-rect'
          ? `${layer.cornerRadius ?? 18}px`
          : `${layer.cornerRadius ?? 0}px`;
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          backgroundColor: color,
          borderRadius: radius,
          boxShadow: glowShadow,
        }}
      >
        {layer.actionRole !== 'none' && isEditorMode && (
          <span className="text-[10px] font-semibold text-slate-950/80 px-1 truncate">
            {layer.actionRole}
          </span>
        )}
      </div>
    );
  }

  if (layer.type === 'text') {
    const fontSizePx = Math.max(10, Math.round((layer.fontSize ?? 5) * (stageMinDim / 100)));
    return (
      <div
        className="w-full h-full flex items-center justify-center text-center px-2 font-display font-bold leading-tight break-words"
        style={{
          color,
          fontSize: `${fontSizePx}px`,
          textShadow: glowShadow,
        }}
      >
        {layer.textContent || 'Sample Text'}
      </div>
    );
  }

  if (layer.type === 'image') {
    return layer.mediaUrl ? (
      <img
        src={layer.mediaUrl}
        alt={layer.name}
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover"
        style={{
          borderRadius: `${layer.cornerRadius ?? 12}px`,
          boxShadow: glowShadow,
        }}
      />
    ) : (
      <div className="w-full h-full bg-slate-800/80 border border-white/10 rounded-lg flex items-center justify-center text-xs text-slate-400">
        Image
      </div>
    );
  }

  if (layer.type === 'video') {
    return layer.mediaUrl ? (
      <video
        ref={videoRef}
        src={layer.mediaUrl}
        muted
        playsInline
        loop
        className="w-full h-full object-cover"
        style={{
          borderRadius: `${layer.cornerRadius ?? 12}px`,
          boxShadow: glowShadow,
        }}
      />
    ) : (
      <div className="w-full h-full bg-slate-800/80 border border-white/10 rounded-lg flex items-center justify-center text-xs text-slate-400">
        Video
      </div>
    );
  }

  switch (layer.controlKind) {
    case 'album-cover':
      return (
        <div
          className="w-full h-full relative overflow-hidden border border-white/15 shadow-xl flex items-center justify-center bg-[#121620]"
          style={{
            borderRadius: `${layer.cornerRadius ?? 0}px`,
            boxShadow: glowShadow,
          }}
        >
          {track.coverArtUrl && track.project.showAlbumArt !== false ? (
            <img
              src={track.coverArtUrl}
              alt={track.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover pointer-events-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#11151E] px-3 text-center select-none">
              <span
                className={`font-display font-bold tracking-tight text-slate-200 leading-tight ${
                  compactUI ? 'text-[10px]' : 'text-sm sm:text-base'
                }`}
              >
                [ P.U.R MUSiCLiGHT ]
              </span>
            </div>
          )}
        </div>
      );

    case 'track-title':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-2 overflow-hidden">
          <div
            className={`font-display font-bold truncate w-full ${
              compactUI ? 'text-xs' : 'text-base sm:text-lg'
            }`}
            style={{ color, textShadow: glowShadow }}
          >
            {track.title}
          </div>
          {!compactUI && (
            <div className="text-xs text-slate-400 truncate w-full mt-0.5">
              {track.artist} · {track.album}
            </div>
          )}
        </div>
      );

    case 'lyrics':
      return (
        <div className="w-full h-full overflow-hidden rounded-xl bg-black/20 border border-white/5">
          <LyricsPanel
            lyrics={track.lyrics}
            currentTime={currentTime}
            enabled={lyricsEnabled}
            onSeek={onSeek}
            compact={compactUI}
            accentColor={track.hasMotionEdit ? track.project.accentColor : 'var(--accent)'}
          />
        </div>
      );

    case 'seek-bar': {
      const pct = track.duration > 0 ? Math.min(100, Math.max(0, (currentTime / track.duration) * 100)) : 0;
      return (
        <div
          className="w-full h-full flex flex-col justify-center px-1"
          onClick={(e) => {
            if (isEditorMode) return;
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
            onSeek(ratio * track.duration);
          }}
        >
          <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden cursor-pointer relative">
            <div
              className="h-full rounded-full transition-[width] duration-75"
              style={{ width: `${pct}%`, backgroundColor: color, boxShadow: glowShadow }}
            />
          </div>
          {!compactUI && (
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(track.duration)}</span>
            </div>
          )}
        </div>
      );
    }

    case 'play-pause':
      return (
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-slate-950 shadow-lg transition-transform active:scale-95"
          style={{ backgroundColor: color, boxShadow: glowShadow }}
        >
          {isPlaying ? (
            <Pause className={compactUI ? 'w-3.5 h-3.5 fill-current' : 'w-5 h-5 fill-current'} />
          ) : (
            <Play className={compactUI ? 'w-3.5 h-3.5 fill-current ml-0.5' : 'w-5 h-5 fill-current ml-0.5'} />
          )}
        </div>
      );

    case 'next':
      return (
        <div
          className="w-full h-full rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 transition-transform active:scale-95"
          style={{ color, boxShadow: glowShadow }}
        >
          <SkipForward className={compactUI ? 'w-3.5 h-3.5' : 'w-5 h-5'} />
        </div>
      );

    case 'prev':
      return (
        <div
          className="w-full h-full rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 transition-transform active:scale-95"
          style={{ color, boxShadow: glowShadow }}
        >
          <SkipBack className={compactUI ? 'w-3.5 h-3.5' : 'w-5 h-5'} />
        </div>
      );

    case 'loop':
      return (
        <div
          className="w-full h-full rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 transition-transform active:scale-95"
          style={{
            color: loopMode === 'off' ? '#64748B' : 'var(--accent)',
            boxShadow: glowShadow,
          }}
          title={`Loop: ${loopMode}`}
        >
          {loopMode === 'one' ? (
            <Repeat1 className={compactUI ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          ) : (
            <Repeat className={compactUI ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          )}
        </div>
      );

    default:
      return null;
  }
};
