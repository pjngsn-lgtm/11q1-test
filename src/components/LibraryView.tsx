import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckSquare,
  FileEdit,
  Folder,
  FolderOpen,
  ListPlus,
  Play,
  RefreshCw,
  Search,
  Sliders,
  Square,
  Upload,
} from 'lucide-react';
import { MusicQueue, Track } from '../types/studio';
import { formatTime } from '../utils/lyricsAndTags';

interface LibraryViewProps {
  tracks: Track[];
  queues: MusicQueue[];
  currentTrackId: string;
  hasFolderAccess: boolean;
  isScanning: boolean;
  onAllowFolderStorage: () => void;
  onRefreshFolders: () => void;
  onImportAudioFiles: (files: FileList) => void;
  onPlayTrackNow: (trackId: string) => void;
  onOpenTagEditor: (track: Track) => void;
  onOpenMotionEditor: (trackId: string) => void;
  onAddTracksToQueue: (queueId: string, trackIds: string[]) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  tracks,
  queues,
  currentTrackId,
  hasFolderAccess,
  isScanning,
  onAllowFolderStorage,
  onRefreshFolders,
  onImportAudioFiles,
  onPlayTrackNow,
  onOpenTagEditor,
  onOpenMotionEditor,
  onAddTracksToQueue,
}) => {
  const [viewMode, setViewMode] = useState<'folders' | 'songs'>('folders');
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetQueueId, setTargetQueueId] = useState(queues[0]?.id || '');

  // Only list folders that actually contain music tracks
  const foldersWithMusic = useMemo(() => {
    const map = new Map<string, Track[]>();
    for (const t of tracks) {
      const folder = t.folderPath || 'Imported Files';
      const list = map.get(folder) || [];
      list.push(t);
      map.set(folder, list);
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
  }, [tracks]);

  const visibleTracks = useMemo(() => {
    let base = tracks;
    if (viewMode === 'folders' && activeFolder) {
      base = tracks.filter((t) => (t.folderPath || 'Imported Files') === activeFolder);
    }
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        (t.folderPath || '').toLowerCase().includes(q)
    );
  }, [tracks, viewMode, activeFolder, query]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const invertSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const t of visibleTracks) {
        if (!prev.has(t.id)) next.add(t.id);
      }
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-5">
      {/* Header + Folder Storage & Refresh Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-white">Music Folders & Library</h2>
          <p className="text-sm text-slate-400">
            Browse folders containing music or refresh to pick up newly added audio files.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onAllowFolderStorage}
            disabled={isScanning}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-slate-950 text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <FolderOpen className="w-4 h-4" />
            <span>{hasFolderAccess ? 'Change Music Folder' : 'Allow Folder Storage'}</span>
          </button>

          <button
            type="button"
            onClick={onRefreshFolders}
            disabled={isScanning}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#141821] hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-medium inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            title="Refresh folder to scan for newly added MP3s"
          >
            <RefreshCw className={`w-4 h-4 text-[var(--accent)] ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Refresh'}</span>
          </button>

          <label className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#141821] hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-medium inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0">
            <Upload className="w-4 h-4 text-slate-300" />
            <span>Pick Files</span>
            <input
              type="file"
              accept="audio/*"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onImportAudioFiles(e.target.files);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Mode Tabs (Folders vs All Songs) + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#141821] border border-white/10 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setViewMode('folders');
              setActiveFolder(null);
            }}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
              viewMode === 'folders'
                ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Folders ({foldersWithMusic.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('songs');
              setActiveFolder(null);
            }}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              viewMode === 'songs'
                ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Songs ({tracks.length})
          </button>
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs or folders..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#141821] border border-white/10 text-sm text-white focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {(viewMode === 'songs' || activeFolder) && visibleTracks.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={invertSelection}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#141821] hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-300 whitespace-nowrap"
            >
              Invert Select
            </button>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={targetQueueId || queues[0]?.id || ''}
                  onChange={(e) => setTargetQueueId(e.target.value)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#141821] border border-white/10 text-xs text-white"
                >
                  {queues.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const qid = targetQueueId || queues[0]?.id;
                    if (qid) onAddTracksToQueue(qid, Array.from(selectedIds));
                    setSelectedIds(new Set());
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  <span>Queue {selectedIds.size}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Empty Library State */}
      {tracks.length === 0 ? (
        <div className="bg-[#141821] border border-white/10 rounded-2xl p-10 text-center space-y-4">
          <div className="w-14 h-14 mx-auto bg-[#11151E] border border-white/10 flex items-center justify-center">
            <Folder className="w-7 h-7 text-[var(--accent)]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">No Music Files Loaded</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Please allow folder storage access so [ P.U.R MUSiCLiGHT ] can display folders containing your songs.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={onAllowFolderStorage}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-slate-950 text-sm font-semibold inline-flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Allow Folder Storage</span>
            </button>
          </div>
        </div>
      ) : viewMode === 'folders' && !activeFolder && !query.trim() ? (
        /* Folders List (ONLY folders containing music) */
        <div className="bg-[#141821] border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden">
          {foldersWithMusic.map((folder) => (
            <button
              key={folder.name}
              type="button"
              onClick={() => setActiveFolder(folder.name)}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-white/[0.04] text-left transition-colors"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 bg-[#11151E] border border-white/10 shrink-0 flex items-center justify-center">
                  <Folder className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{folder.name}</div>
                  <div className="text-xs text-slate-400">
                    {folder.items.length} {folder.items.length === 1 ? 'song' : 'songs'}
                  </div>
                </div>
              </div>
              <span className="text-xs text-[var(--accent)] font-medium shrink-0">Open</span>
            </button>
          ))}
        </div>
      ) : (
        /* Song List inside Folder or All Songs */
        <div className="space-y-3">
          {viewMode === 'folders' && activeFolder && (
            <button
              type="button"
              onClick={() => setActiveFolder(null)}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#141821] hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <Folder className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{activeFolder}</span>
            </button>
          )}

          <div className="bg-[#141821] border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden">
            {visibleTracks.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">
                No matching songs found.
              </div>
            ) : (
              visibleTracks.map((track) => {
                const isSelected = selectedIds.has(track.id);
                const isCurrent = track.id === currentTrackId;
                return (
                  <div
                    key={track.id}
                    className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                      isCurrent ? 'bg-[var(--accent-soft)]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleSelect(track.id)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white"
                        aria-label={`Select ${track.title}`}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onPlayTrackNow(track.id)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <div className="w-11 h-11 overflow-hidden bg-[#11151E] border border-white/10 shrink-0 flex items-center justify-center">
                          {track.coverArtUrl ? (
                            <img
                              src={track.coverArtUrl}
                              alt={track.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[8px] font-display font-bold text-slate-300 text-center leading-tight px-0.5">
                              [ P.U.R ]
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-sm font-semibold truncate ${
                              isCurrent ? 'text-[var(--accent-text)]' : 'text-white'
                            }`}
                          >
                            {track.title}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {track.artist} · {track.folderPath || 'Imported'} ·{' '}
                            {track.hasMotionEdit
                              ? `Motion (${track.project.canvasWidth}×${track.project.canvasHeight})`
                              : 'Default UI'}
                          </div>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-mono tabular-nums text-slate-400 mr-1 hidden sm:inline">
                        {formatTime(track.duration)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onPlayTrackNow(track.id)}
                        className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-200"
                        title="Play now"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenTagEditor(track)}
                        className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg hover:bg-white/10 text-amber-300"
                        title="Tag & Lyrics Editor"
                      >
                        <FileEdit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenMotionEditor(track.id)}
                        className="min-h-[38px] px-3 rounded-lg bg-[var(--accent-soft)] hover:bg-[var(--accent-border)] text-[var(--accent-text)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Animate</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
