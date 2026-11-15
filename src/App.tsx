import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Disc3,
  FileEdit,
  Folder,
  FolderOpen,
  Library,
  ListMusic,
  Maximize,
  Minimize,
  Palette,
  Play,
  RefreshCw,
  Sliders,
  Upload,
  X,
} from 'lucide-react';
import { AppTab, LoopMode, MusicQueue, Track } from './types/studio';
import {
  createPlaceholderTrack,
  createStarterQueues,
  createStarterTracks,
} from './utils/demoTracks';
import {
  loadAppState,
  loadDirectoryHandle,
  loadMediaBlob,
  saveAppState,
  saveDirectoryHandle,
} from './utils/storage';
import { scanDirectoryHandle, scanFileList } from './utils/folderScanner';
import { StageRenderer } from './components/StageRenderer';
import { AlbumActionModal } from './components/AlbumActionModal';
import { QueuesView } from './components/QueuesView';
import { LibraryView } from './components/LibraryView';
import { MotionEditor } from './components/MotionEditor';
import { PWAInstallButton } from './components/PWAInstallButton';

const DEFAULT_ACCENT_HEX = '#84CC16';

const THEME_PRESETS = [
  { label: 'Lime Green', hex: '#84CC16' },
  { label: 'Emerald', hex: '#10B981' },
  { label: 'Cyan', hex: '#22D3EE' },
  { label: 'Amber', hex: '#F59E0B' },
  { label: 'Rose', hex: '#F43F5E' },
  { label: 'Violet', hex: '#A855F7' },
  { label: 'Pure White', hex: '#F8FAFC' },
];

function normalizeHex(input: string): string | null {
  const cleaned = input.trim();
  const match6 = /^#?([0-9a-fA-F]{6})$/.exec(cleaned);
  if (match6) return `#${match6[1].toUpperCase()}`;
  const match3 = /^#?([0-9a-fA-F]{3})$/.exec(cleaned);
  if (match3) {
    const [r, g, b] = match3[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

function applyAccentThemeVars(hex: string) {
  const valid = normalizeHex(hex) || DEFAULT_ACCENT_HEX;
  const r = parseInt(valid.slice(1, 3), 16);
  const g = parseInt(valid.slice(3, 5), 16);
  const b = parseInt(valid.slice(5, 7), 16);
  const mixWhite = (c: number, amt: number) => Math.min(255, Math.round(c + (255 - c) * amt));
  const hoverHex = `#${mixWhite(r, 0.2).toString(16).padStart(2, '0')}${mixWhite(g, 0.2)
    .toString(16)
    .padStart(2, '0')}${mixWhite(b, 0.2).toString(16).padStart(2, '0')}`;
  const textHex = `#${mixWhite(r, 0.42).toString(16).padStart(2, '0')}${mixWhite(g, 0.42)
    .toString(16)
    .padStart(2, '0')}${mixWhite(b, 0.42).toString(16).padStart(2, '0')}`;

  const root = document.documentElement.style;
  root.setProperty('--accent', valid);
  root.setProperty('--accent-hover', hoverHex);
  root.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.16)`);
  root.setProperty('--accent-border', `rgba(${r}, ${g}, ${b}, 0.45)`);
  root.setProperty('--accent-text', textHex);
}

export default function App() {
  const [tracks, setTracks] = useState<Track[]>(() => createStarterTracks());
  const [queues, setQueues] = useState<MusicQueue[]>(() => createStarterQueues());
  const [activeQueueId, setActiveQueueId] = useState<string>('queue-main');
  const [activeTab, setActiveTab] = useState<AppTab>('player');

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [lyricsEnabled, setLyricsEnabled] = useState(true);
  const [albumModalTrack, setAlbumModalTrack] = useState<Track | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showFolderPrompt, setShowFolderPrompt] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  // App-wide customizable accent theme (defaults to Lime Green #84CC16)
  const [appAccentColor, setAppAccentColor] = useState<string>(() => {
    try {
      return localStorage.getItem('pur_accent_color') || DEFAULT_ACCENT_HEX;
    } catch {
      return DEFAULT_ACCENT_HEX;
    }
  });
  const [hexInput, setHexInput] = useState<string>(appAccentColor);
  const [showThemePicker, setShowThemePicker] = useState(false);

  // Fullscreen Player state + auto-fading pressable top-left unfullscreen button
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [unfullscreenVisible, setUnfullscreenVisible] = useState(false);
  const unfullscreenTimerRef = useRef<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const showNotice = useCallback((msg: string) => {
    setScanNotice(msg);
    window.setTimeout(() => setScanNotice(null), 3500);
  }, []);

  useEffect(() => {
    applyAccentThemeVars(appAccentColor);
    setHexInput(appAccentColor);
    try {
      localStorage.setItem('pur_accent_color', appAccentColor);
    } catch {
      // ignore storage errors
    }
  }, [appAccentColor]);

  const enterFullscreen = useCallback(() => {
    setIsFullscreen(true);
    setUnfullscreenVisible(true);
    if (unfullscreenTimerRef.current !== null) {
      window.clearTimeout(unfullscreenTimerRef.current);
    }
    unfullscreenTimerRef.current = window.setTimeout(() => {
      setUnfullscreenVisible(false);
      unfullscreenTimerRef.current = null;
    }, 1300);

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // Fallback overlay fullscreen still works smoothly inside iframe
      });
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setUnfullscreenVisible(false);
    if (unfullscreenTimerRef.current !== null) {
      window.clearTimeout(unfullscreenTimerRef.current);
      unfullscreenTimerRef.current = null;
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    return () => {
      if (unfullscreenTimerRef.current !== null) {
        window.clearTimeout(unfullscreenTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'player' && isFullscreen) {
      exitFullscreen();
    }
  }, [activeTab, isFullscreen, exitFullscreen]);

  // Hydrate persisted tracks, directory handle, & media blobs from IndexedDB on startup
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [saved, savedHandle] = await Promise.all([
        loadAppState(),
        loadDirectoryHandle(),
      ]);

      if (savedHandle && mounted) {
        setDirHandle(savedHandle);
      }

      if (saved && saved.tracks && mounted) {
        const rehydratedTracks = await Promise.all(
          saved.tracks.map(async (t) => {
            const restoredBlobUrl = await loadMediaBlob(`audio-${t.id}`);
            return restoredBlobUrl ? { ...t, audioUrl: restoredBlobUrl } : t;
          })
        );
        setTracks(rehydratedTracks);
        if (saved.queues?.length > 0) setQueues(saved.queues);
        if (saved.activeQueueId) setActiveQueueId(saved.activeQueueId);
      }
      if (mounted) setStorageReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Persist app state changes
  useEffect(() => {
    if (!storageReady) return;
    const timer = window.setTimeout(() => {
      saveAppState({ tracks, queues, activeQueueId });
    }, 350);
    return () => clearTimeout(timer);
  }, [tracks, queues, activeQueueId, storageReady]);

  const activeQueue = useMemo(
    () => queues.find((q) => q.id === activeQueueId) || queues[0],
    [queues, activeQueueId]
  );

  const [placeholderTrack, setPlaceholderTrack] = useState<Track>(() => createPlaceholderTrack());

  const currentTrack = useMemo(() => {
    if (tracks.length === 0) return placeholderTrack;
    const tid = activeQueue?.trackIds[activeQueue.activeIndex] || activeQueue?.trackIds[0];
    return tracks.find((t) => t.id === tid) || tracks[0] || placeholderTrack;
  }, [activeQueue, tracks, placeholderTrack]);

  const hasRealAudio = currentTrack.id !== '__placeholder__' && Boolean(currentTrack.audioUrl);

  const folderCount = useMemo(() => {
    const set = new Set<string>();
    tracks.forEach((t) => set.add(t.folderPath || 'Imported Files'));
    return set.size;
  }, [tracks]);

  // Sync audio element source when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!hasRealAudio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setIsPlaying(false);
      setCurrentTime(0);
      return;
    }

    const wasPlaying = isPlaying;
    audio.src = currentTrack.audioUrl;
    audio.currentTime = 0;
    setCurrentTime(0);

    if (wasPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id, hasRealAudio]);

  // 60fps animation frame sync while audio is playing
  useEffect(() => {
    const tick = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        setCurrentTime(audio.currentTime);
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    } else if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  const appendNewTracksToQueue = useCallback(
    (nextTracks: Track[], prevIds: Set<string>) => {
      const addedIds = nextTracks.filter((t) => !prevIds.has(t.id)).map((t) => t.id);
      if (addedIds.length === 0) return;
      setQueues((prev) =>
        prev.map((q) => {
          if (q.id !== (activeQueue?.id || prev[0]?.id)) return q;
          const existingSet = new Set(q.trackIds);
          const uniqueAdded = addedIds.filter((id) => !existingSet.has(id));
          return {
            ...q,
            trackIds: [...q.trackIds, ...uniqueAdded],
          };
        })
      );
    },
    [activeQueue?.id]
  );

  const handleScanFiles = useCallback(
    async (files: FileList, autoPlayFirst = false) => {
      setIsScanning(true);
      try {
        const prevIds = new Set(tracks.map((t) => t.id));
        const { tracks: merged, addedCount } = await scanFileList(files, tracks);
        setTracks(merged);
        appendNewTracksToQueue(merged, prevIds);
        setShowFolderPrompt(false);

        if (addedCount > 0) {
          showNotice(`Loaded ${addedCount} new ${addedCount === 1 ? 'song' : 'songs'}`);
          if (autoPlayFirst && tracks.length === 0 && merged.length > 0) {
            setIsPlaying(true);
            window.setTimeout(() => audioRef.current?.play().catch(() => {}), 80);
          }
        } else {
          showNotice('Folder refreshed · No new music files');
        }
      } finally {
        setIsScanning(false);
      }
    },
    [tracks, appendNewTracksToQueue, showNotice]
  );

  const handleAllowFolderStorage = useCallback(async () => {
    const picker = (
      window as Window & {
        showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;

    if (typeof picker === 'function') {
      try {
        const handle = await picker({ mode: 'read' });
        setDirHandle(handle);
        await saveDirectoryHandle(handle);
        setIsScanning(true);
        const prevIds = new Set(tracks.map((t) => t.id));
        const { tracks: merged, addedCount } = await scanDirectoryHandle(handle, tracks);
        setTracks(merged);
        appendNewTracksToQueue(merged, prevIds);
        setShowFolderPrompt(false);
        showNotice(
          addedCount > 0
            ? `Folder linked · ${addedCount} ${addedCount === 1 ? 'song' : 'songs'} loaded`
            : 'Folder linked and synced'
        );
        setIsScanning(false);
        return;
      } catch (err) {
        setIsScanning(false);
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        // SecurityError in iframe or unsupported -> fall back to webkitdirectory input
      }
    }

    folderInputRef.current?.click();
  }, [tracks, appendNewTracksToQueue, showNotice]);

  const handleRefreshFolders = useCallback(async () => {
    if (dirHandle) {
      try {
        // @ts-expect-error - queryPermission/requestPermission on FileSystemDirectoryHandle
        let perm = await dirHandle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') {
          // @ts-expect-error - requestPermission on FileSystemDirectoryHandle
          perm = await dirHandle.requestPermission({ mode: 'read' });
        }
        if (perm === 'granted') {
          setIsScanning(true);
          const prevIds = new Set(tracks.map((t) => t.id));
          const { tracks: merged, addedCount } = await scanDirectoryHandle(dirHandle, tracks);
          setTracks(merged);
          appendNewTracksToQueue(merged, prevIds);
          setIsScanning(false);
          showNotice(
            addedCount > 0
              ? `Refreshed · ${addedCount} new ${addedCount === 1 ? 'MP3' : 'MP3s'} found`
              : 'Folder refreshed · Up to date'
          );
          return;
        }
      } catch {
        setIsScanning(false);
      }
    }

    // Fallback: re-open folder picker to scan newly added MP3s
    await handleAllowFolderStorage();
  }, [dirHandle, tracks, appendNewTracksToQueue, showNotice, handleAllowFolderStorage]);

  const handleSeek = useCallback(
    (time: number) => {
      if (!hasRealAudio) return;
      const clamped = Math.max(0, Math.min(currentTrack.duration || 0, time));
      setCurrentTime(clamped);
      if (audioRef.current) {
        audioRef.current.currentTime = clamped;
      }
    },
    [hasRealAudio, currentTrack.duration]
  );

  const handleTogglePlay = useCallback(() => {
    if (!hasRealAudio) {
      setIsPlaying(false);
      setShowFolderPrompt(true);
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [hasRealAudio]);

  const stepQueue = useCallback(
    (delta: -1 | 1) => {
      if (!activeQueue || activeQueue.trackIds.length === 0) return;
      const len = activeQueue.trackIds.length;
      let nextIdx = activeQueue.activeIndex;

      if (activeQueue.shuffle && len > 1) {
        nextIdx = Math.floor(Math.random() * len);
      } else {
        nextIdx = (activeQueue.activeIndex + delta + len) % len;
      }

      setQueues((prev) =>
        prev.map((q) => (q.id === activeQueue.id ? { ...q, activeIndex: nextIdx } : q))
      );
    },
    [activeQueue]
  );

  const handleEnded = useCallback(() => {
    if (!activeQueue || !hasRealAudio) return;
    if (activeQueue.loopMode === 'one') {
      handleSeek(0);
      audioRef.current?.play().catch(() => {});
      return;
    }
    const isLast = activeQueue.activeIndex >= activeQueue.trackIds.length - 1;
    if (isLast && activeQueue.loopMode === 'off' && !activeQueue.shuffle) {
      setIsPlaying(false);
      return;
    }
    stepQueue(1);
    setIsPlaying(true);
  }, [activeQueue, hasRealAudio, handleSeek, stepQueue]);

  const handleToggleLoop = useCallback(() => {
    if (!activeQueue) return;
    const order: LoopMode[] = ['off', 'all', 'one'];
    const nextMode = order[(order.indexOf(activeQueue.loopMode) + 1) % order.length];
    setQueues((prev) =>
      prev.map((q) => (q.id === activeQueue.id ? { ...q, loopMode: nextMode } : q))
    );
  }, [activeQueue]);

  const handleUpdateTrack = useCallback((updated: Track) => {
    if (updated.id === '__placeholder__') {
      setPlaceholderTrack(updated);
      return;
    }
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  const handlePlayTrackById = useCallback(
    (trackId: string) => {
      if (!activeQueue || trackId === '__placeholder__') return;
      const existingIdx = activeQueue.trackIds.indexOf(trackId);
      if (existingIdx >= 0) {
        setQueues((prev) =>
          prev.map((q) => (q.id === activeQueue.id ? { ...q, activeIndex: existingIdx } : q))
        );
      } else {
        const nextIds = [...activeQueue.trackIds, trackId];
        setQueues((prev) =>
          prev.map((q) =>
            q.id === activeQueue.id
              ? { ...q, trackIds: nextIds, activeIndex: nextIds.length - 1 }
              : q
          )
        );
      }
      setIsPlaying(true);
      window.setTimeout(() => {
        audioRef.current?.play().catch(() => {});
      }, 60);
    },
    [activeQueue]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B0D12] text-slate-100 overflow-hidden">
      {/* Hidden native audio element */}
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        preload="auto"
      />

      {/* Hidden individual audio file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.lrc"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleScanFiles(e.target.files, true);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* Hidden folder directory picker fallback */}
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error - webkitdirectory is supported on Chromium/WebKit/Firefox
        webkitdirectory=""
        directory=""
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleScanFiles(e.target.files, true);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* 3-Zone Top Navigation Bar */}
      {!isFullscreen && (
        <header className="h-14 px-3 sm:px-6 border-b border-white/10 bg-[#10131C] flex items-center justify-between gap-3 sm:gap-6 shrink-0 relative z-40">
          {/* Zone 1: Single-element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('player')}
            className="text-sm sm:text-base font-display font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-[var(--accent-text)] transition-colors"
          >
            [ P.U.R MUSiCLiGHT ]
          </button>

          {/* Zone 2: Single-line navigation tabs (Desktop) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                { id: 'player', label: 'Player' },
                { id: 'queues', label: 'Queues' },
                { id: 'library', label: 'Folders' },
                { id: 'editor', label: 'Motion Studio' },
              ] as { id: AppTab; label: string }[]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                  activeTab === item.id
                    ? 'border-[var(--accent)] text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Install App + Theme Picker + Music Folder */}
          <div className="flex items-center gap-2 shrink-0 relative">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setShowThemePicker((v) => !v)}
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="Customize App Theme Color"
            >
              <span
                className="w-3.5 h-3.5 rounded-sm border border-white/30 shrink-0"
                style={{ backgroundColor: 'var(--accent)' }}
              />
              <Palette className="w-3.5 h-3.5 text-[var(--accent)] hidden sm:inline" />
              <span className="hidden sm:inline">Theme</span>
            </button>

            <button
              type="button"
              onClick={handleAllowFolderStorage}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Music Folder</span>
            </button>

            {showThemePicker && (
              <div
                className="absolute right-0 top-12 w-64 bg-[#141821] border border-white/15 rounded-2xl shadow-2xl p-3.5 space-y-3 z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">App Theme Color</span>
                  <button
                    type="button"
                    onClick={() => setShowThemePicker(false)}
                    className="p-1 rounded text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={normalizeHex(appAccentColor) || DEFAULT_ACCENT_HEX}
                    onChange={(e) => setAppAccentColor(e.target.value.toUpperCase())}
                    className="w-10 h-9 rounded bg-transparent border border-white/15 cursor-pointer shrink-0"
                    aria-label="Theme color picker"
                  />
                  <input
                    type="text"
                    value={hexInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setHexInput(val);
                      const valid = normalizeHex(val);
                      if (valid) setAppAccentColor(valid);
                    }}
                    placeholder="#84CC16"
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {THEME_PRESETS.map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => setAppAccentColor(p.hex)}
                      className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 ${
                        appAccentColor.toUpperCase() === p.hex
                          ? 'border-white ring-2 ring-white/40'
                          : 'border-white/20'
                      }`}
                      style={{ backgroundColor: p.hex }}
                      title={`${p.label} (${p.hex})`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-hidden relative">
        {scanNotice && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-lg bg-[#161B26] border border-[var(--accent-border)] text-xs font-medium text-[var(--accent-text)] shadow-xl pointer-events-none">
            {scanNotice}
          </div>
        )}

        {activeTab === 'player' && (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Track Context + Folder Icon + Refresh + Fullscreen Bar */}
            {!isFullscreen && (
              <div className="px-4 py-2 border-b border-white/5 bg-[#0E1119] flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
                  <span className="text-slate-200 font-medium truncate">{currentTrack.title}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums shrink-0">
                    {currentTrack.project.canvasWidth}×{currentTrack.project.canvasHeight}
                  </span>
                  {hasRealAudio && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">
                        {currentTrack.hasMotionEdit ? 'Animated' : 'Default Static UI'}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('library')}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
                    title="Folders with music"
                  >
                    <Folder className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Folders ({folderCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRefreshFolders}
                    disabled={isScanning}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
                    title="Refresh folder for newly added MP3s"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-[var(--accent)] ${isScanning ? 'animate-spin' : ''}`}
                    />
                    <span className="hidden sm:inline">Refresh</span>
                  </button>

                  <button
                    type="button"
                    onClick={enterFullscreen}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
                    title="Fullscreen Player"
                  >
                    <Maximize className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span className="hidden sm:inline">Fullscreen</span>
                  </button>

                  {hasRealAudio && (
                    <>
                      <button
                        type="button"
                        onClick={() => setAlbumModalTrack(currentTrack)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <FileEdit className="w-3.5 h-3.5 text-amber-400" />
                        <span className="hidden sm:inline">Tags & Lyrics</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('editor')}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] hover:bg-[var(--accent-border)] text-xs font-medium text-[var(--accent-text)] inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Edit Motion</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Live Stage Viewport (expands to fixed inset-0 when fullscreen) */}
            <div
              className={
                isFullscreen
                  ? 'fixed inset-0 z-50 bg-[#050705] p-1 sm:p-2 flex items-center justify-center'
                  : 'flex-1 min-h-0 p-2 sm:p-4'
              }
            >
              {isFullscreen && (
                <button
                  type="button"
                  onClick={exitFullscreen}
                  style={{
                    opacity: unfullscreenVisible ? 1 : 0,
                    pointerEvents: 'auto',
                  }}
                  className="fixed top-3 left-3 z-[60] min-w-[44px] min-h-[44px] px-3 rounded-xl bg-black/80 border border-white/20 text-white text-xs font-medium shadow-xl inline-flex items-center gap-1.5 transition-opacity duration-300"
                  title="Exit Fullscreen"
                  aria-label="Exit Fullscreen"
                >
                  <Minimize className="w-4 h-4 text-[var(--accent)]" />
                  <span>Exit</span>
                </button>
              )}

              <StageRenderer
                track={currentTrack}
                currentTime={currentTime}
                isPlaying={isPlaying}
                loopMode={activeQueue?.loopMode || 'off'}
                lyricsEnabled={lyricsEnabled}
                isEditorMode={false}
                onTogglePlay={handleTogglePlay}
                onNext={() => stepQueue(1)}
                onPrev={() => stepQueue(-1)}
                onToggleLoop={handleToggleLoop}
                onToggleLyrics={() => setLyricsEnabled((v) => !v)}
                onSeek={handleSeek}
                onAlbumLongPress={() => {
                  if (hasRealAudio) setAlbumModalTrack(currentTrack);
                  else setShowFolderPrompt(true);
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'queues' && (
          <QueuesView
            queues={queues}
            activeQueueId={activeQueue?.id || ''}
            tracks={tracks}
            currentTrackId={currentTrack.id}
            isPlaying={isPlaying}
            onSelectQueue={(qid) => setActiveQueueId(qid)}
            onCreateQueue={(name) => {
              const id = `queue-${Date.now()}`;
              setQueues((prev) => [
                ...prev,
                {
                  id,
                  name,
                  trackIds: [],
                  activeIndex: 0,
                  loopMode: 'off',
                  shuffle: false,
                },
              ]);
            }}
            onDeleteQueue={(qid) => {
              setQueues((prev) => {
                const next = prev.filter((q) => q.id !== qid);
                if (activeQueueId === qid && next[0]) setActiveQueueId(next[0].id);
                return next;
              });
            }}
            onPlayQueueTrack={(qid, idx) => {
              setActiveQueueId(qid);
              setQueues((prev) =>
                prev.map((q) => (q.id === qid ? { ...q, activeIndex: idx } : q))
              );
              setActiveTab('player');
              setIsPlaying(true);
              window.setTimeout(() => audioRef.current?.play().catch(() => {}), 60);
            }}
            onMoveTrackInQueue={(qid, fromIdx, toIdx) => {
              setQueues((prev) =>
                prev.map((q) => {
                  if (q.id !== qid) return q;
                  const nextIds = [...q.trackIds];
                  const [item] = nextIds.splice(fromIdx, 1);
                  nextIds.splice(toIdx, 0, item);
                  let nextActive = q.activeIndex;
                  if (q.activeIndex === fromIdx) nextActive = toIdx;
                  return { ...q, trackIds: nextIds, activeIndex: nextActive };
                })
              );
            }}
            onRemoveTrackFromQueue={(qid, index) => {
              setQueues((prev) =>
                prev.map((q) => {
                  if (q.id !== qid) return q;
                  const nextIds = q.trackIds.filter((_, i) => i !== index);
                  const nextActive = Math.max(0, Math.min(q.activeIndex, nextIds.length - 1));
                  return { ...q, trackIds: nextIds, activeIndex: nextActive };
                })
              );
            }}
            onToggleQueueLoop={(qid) => {
              const order: LoopMode[] = ['off', 'all', 'one'];
              setQueues((prev) =>
                prev.map((q) =>
                  q.id === qid
                    ? { ...q, loopMode: order[(order.indexOf(q.loopMode) + 1) % order.length] }
                    : q
                )
              );
            }}
            onToggleQueueShuffle={(qid) => {
              setQueues((prev) =>
                prev.map((q) => (q.id === qid ? { ...q, shuffle: !q.shuffle } : q))
              );
            }}
            onAddTrackToQueue={(qid, tid) => {
              setQueues((prev) =>
                prev.map((q) =>
                  q.id === qid ? { ...q, trackIds: [...q.trackIds, tid] } : q
                )
              );
            }}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            tracks={tracks}
            queues={queues}
            currentTrackId={currentTrack.id}
            hasFolderAccess={Boolean(dirHandle) || tracks.length > 0}
            isScanning={isScanning}
            onAllowFolderStorage={handleAllowFolderStorage}
            onRefreshFolders={handleRefreshFolders}
            onImportAudioFiles={(files) => handleScanFiles(files, true)}
            onPlayTrackNow={(tid) => {
              handlePlayTrackById(tid);
              setActiveTab('player');
            }}
            onOpenTagEditor={(t) => setAlbumModalTrack(t)}
            onOpenMotionEditor={(tid) => {
              handlePlayTrackById(tid);
              setActiveTab('editor');
            }}
            onAddTracksToQueue={(qid, tids) => {
              setQueues((prev) =>
                prev.map((q) =>
                  q.id === qid ? { ...q, trackIds: [...q.trackIds, ...tids] } : q
                )
              );
            }}
          />
        )}

        {activeTab === 'editor' && (
          <MotionEditor
            track={currentTrack}
            currentTime={currentTime}
            isPlaying={isPlaying}
            loopMode={activeQueue?.loopMode || 'off'}
            lyricsEnabled={lyricsEnabled}
            onUpdateTrack={handleUpdateTrack}
            onSeek={handleSeek}
            onTogglePlay={handleTogglePlay}
            onNext={() => stepQueue(1)}
            onPrev={() => stepQueue(-1)}
            onToggleLoop={handleToggleLoop}
            onToggleLyrics={() => setLyricsEnabled((v) => !v)}
            onAlbumLongPress={() => {
              if (hasRealAudio) setAlbumModalTrack(currentTrack);
              else setShowFolderPrompt(true);
            }}
          />
        )}
      </main>

      {/* Mobile Bottom Thumb Navigation (<= 15% mobile height) */}
      {!isFullscreen && (
        <nav className="md:hidden h-14 border-t border-white/10 bg-[#10131C]/95 backdrop-blur-md grid grid-cols-4 items-center shrink-0">
          {(
            [
              { id: 'player', label: 'Player', icon: Play },
              { id: 'queues', label: 'Queues', icon: ListMusic },
              { id: 'library', label: 'Folders', icon: Library },
              { id: 'editor', label: 'Studio', icon: Disc3 },
            ] as { id: AppTab; label: string; icon: React.FC<{ className?: string }> }[]
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-full flex flex-col items-center justify-center gap-0.5 ${
                  active ? 'text-[var(--accent)]' : 'text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Folder Storage Permission Prompt when Play is pressed with no music file */}
      {showFolderPrompt && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowFolderPrompt(false)}
        >
          <div
            className="w-full sm:max-w-md bg-[#141821] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-[#11151E] border border-white/10 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <div>
                  <h3 className="text-base font-display font-bold text-white">
                    Please allow folder storage
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    No music file is loaded to play yet.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFolderPrompt(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Select your music folder so [ P.U.R MUSiCLiGHT ] can scan folders containing your .mp3 or audio files, and use Refresh anytime you add new songs.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleAllowFolderStorage}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-slate-950 text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Allow Folder Storage</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFolderPrompt(false);
                  fileInputRef.current?.click();
                }}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-sm font-medium inline-flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Pick Files</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Musicolet Album Action / Tag & Lyrics Editor Modal */}
      {albumModalTrack && (
        <AlbumActionModal
          track={tracks.find((t) => t.id === albumModalTrack.id) || albumModalTrack}
          allTracks={tracks}
          currentTime={currentTime}
          lyricsEnabled={lyricsEnabled}
          onClose={() => setAlbumModalTrack(null)}
          onUpdateTrack={handleUpdateTrack}
          onSelectTrack={(tid) => handlePlayTrackById(tid)}
          onOpenEditor={() => setActiveTab('editor')}
          onToggleLyrics={() => setLyricsEnabled((v) => !v)}
        />
      )}
    </div>
  );
}
