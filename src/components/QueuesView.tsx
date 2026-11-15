import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ListPlus,
  Music,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Shuffle,
  Trash2,
} from 'lucide-react';
import { MusicQueue, Track } from '../types/studio';
import { formatTime } from '../utils/lyricsAndTags';

interface QueuesViewProps {
  queues: MusicQueue[];
  activeQueueId: string;
  tracks: Track[];
  currentTrackId: string;
  isPlaying: boolean;
  onSelectQueue: (queueId: string) => void;
  onCreateQueue: (name: string) => void;
  onDeleteQueue: (queueId: string) => void;
  onPlayQueueTrack: (queueId: string, index: number) => void;
  onMoveTrackInQueue: (queueId: string, fromIdx: number, toIdx: number) => void;
  onRemoveTrackFromQueue: (queueId: string, index: number) => void;
  onToggleQueueLoop: (queueId: string) => void;
  onToggleQueueShuffle: (queueId: string) => void;
  onAddTrackToQueue: (queueId: string, trackId: string) => void;
}

export const QueuesView: React.FC<QueuesViewProps> = ({
  queues,
  activeQueueId,
  tracks,
  currentTrackId,
  isPlaying,
  onSelectQueue,
  onCreateQueue,
  onDeleteQueue,
  onPlayQueueTrack,
  onMoveTrackInQueue,
  onRemoveTrackFromQueue,
  onToggleQueueLoop,
  onToggleQueueShuffle,
  onAddTrackToQueue,
}) => {
  const [viewingQueueId, setViewingQueueId] = useState(activeQueueId);
  const [newQueueName, setNewQueueName] = useState('');
  const [showAddPicker, setShowAddPicker] = useState(false);

  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const viewingQueue = queues.find((q) => q.id === viewingQueueId) || queues[0];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newQueueName.trim();
    if (!trimmed) return;
    onCreateQueue(trimmed);
    setNewQueueName('');
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-white">Multiple Queues</h2>
          <p className="text-sm text-slate-400">
            Maintain independent playback queues and switch cleanly without losing your place.
          </p>
        </div>

        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <input
            type="text"
            value={newQueueName}
            onChange={(e) => setNewQueueName(e.target.value)}
            placeholder="New queue name..."
            className="px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-sm text-white focus:outline-none focus:border-[var(--accent)] min-w-[160px]"
          />
          <button
            type="submit"
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-slate-950 text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Queue</span>
          </button>
        </form>
      </div>

      {/* Queue Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {queues.map((q) => {
          const isViewing = q.id === viewingQueue?.id;
          const isCurrent = q.id === activeQueueId;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setViewingQueueId(q.id)}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 border transition-colors flex items-center gap-2 ${
                isViewing
                  ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-text)]'
                  : 'bg-[#151923] border-white/10 text-slate-300 hover:bg-white/5'
              }`}
            >
              <span>{q.name}</span>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {q.trackIds.length}
              </span>
              {isCurrent && (
                <span className="text-[11px] text-[var(--accent)] font-semibold">· Active</span>
              )}
            </button>
          );
        })}
      </div>

      {viewingQueue && (
        <div className="bg-[#141821] border border-white/10 rounded-2xl overflow-hidden">
          {/* Queue Controls Bar */}
          <div className="px-5 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-white">{viewingQueue.name}</h3>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                {viewingQueue.trackIds.length} tracks
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {viewingQueue.id !== activeQueueId && (
                <button
                  type="button"
                  onClick={() => onSelectQueue(viewingQueue.id)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-slate-950 text-xs font-semibold whitespace-nowrap"
                >
                  Activate Queue
                </button>
              )}

              <button
                type="button"
                onClick={() => onToggleQueueShuffle(viewingQueue.id)}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap ${
                  viewingQueue.shuffle
                    ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-text)]'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Shuffle</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleQueueLoop(viewingQueue.id)}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap ${
                  viewingQueue.loopMode !== 'off'
                    ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-text)]'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                {viewingQueue.loopMode === 'one' ? (
                  <Repeat1 className="w-3.5 h-3.5" />
                ) : (
                  <Repeat className="w-3.5 h-3.5" />
                )}
                <span>Loop: {viewingQueue.loopMode}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAddPicker((s) => !s)}
                className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <ListPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Add Songs</span>
              </button>

              {queues.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteQueue(viewingQueue.id);
                    setViewingQueueId(queues[0].id);
                  }}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-medium text-rose-300 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>

          {showAddPicker && (
            <div className="p-4 border-b border-white/10 bg-slate-950/60">
              <div className="text-xs font-medium text-slate-400 mb-2">
                Tap a song to append to {viewingQueue.name}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tracks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onAddTrackToQueue(viewingQueue.id, t.id)}
                    className="min-h-[44px] px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-left flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-medium text-slate-200 truncate">
                      {t.title}
                    </span>
                    <Plus className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Queue Track List */}
          {viewingQueue.trackIds.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">
              This queue is empty. Add songs from your library above.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {viewingQueue.trackIds.map((tid, idx) => {
                const track = trackById.get(tid);
                if (!track) return null;
                const isActiveRow =
                  viewingQueue.id === activeQueueId &&
                  viewingQueue.activeIndex === idx &&
                  track.id === currentTrackId;

                return (
                  <div
                    key={`${tid}-${idx}`}
                    className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                      isActiveRow ? 'bg-[var(--accent-soft)]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onPlayQueueTrack(viewingQueue.id, idx)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <span className="w-6 text-xs font-mono tabular-nums text-slate-500 text-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="w-10 h-10 overflow-hidden bg-[#11151E] border border-white/10 shrink-0 flex items-center justify-center">
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
                          className={`text-sm font-medium truncate ${
                            isActiveRow ? 'text-[var(--accent-text)]' : 'text-white'
                          }`}
                        >
                          {track.title}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {track.artist} · {track.project.canvasWidth}×{track.project.canvasHeight}
                          {track.hasMotionEdit ? ' · Edited' : ' · Default UI'}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs font-mono tabular-nums text-slate-400 mr-2 hidden sm:inline">
                        {formatTime(track.duration)}
                      </span>
                      {isActiveRow && (
                        <span className="text-xs text-[var(--accent)] mr-1 hidden sm:inline">
                          {isPlaying ? 'Playing' : 'Paused'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onPlayQueueTrack(viewingQueue.id, idx)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-300"
                        title="Play track"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => onMoveTrackInQueue(viewingQueue.id, idx, idx - 1)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === viewingQueue.trackIds.length - 1}
                        onClick={() => onMoveTrackInQueue(viewingQueue.id, idx, idx + 1)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveTrackFromQueue(viewingQueue.id, idx)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
                        title="Remove from queue"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
