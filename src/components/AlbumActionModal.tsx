import React, { useState } from 'react';
import {
  Disc3,
  Download,
  FileEdit,
  Sliders,
  X,
  Upload,
  Clock,
  Play,
  Eye,
  EyeOff,
  Music,
} from 'lucide-react';
import { Track } from '../types/studio';
import { formatTime, parseLrcText, serializeLyricsToLrc } from '../utils/lyricsAndTags';

interface AlbumActionModalProps {
  track: Track;
  allTracks: Track[];
  currentTime: number;
  lyricsEnabled: boolean;
  onClose: () => void;
  onUpdateTrack: (updated: Track) => void;
  onSelectTrack: (trackId: string) => void;
  onOpenEditor: () => void;
  onToggleLyrics: () => void;
}

type ModalView = 'menu' | 'album' | 'tag-editor';

export const AlbumActionModal: React.FC<AlbumActionModalProps> = ({
  track,
  allTracks,
  currentTime,
  lyricsEnabled,
  onClose,
  onUpdateTrack,
  onSelectTrack,
  onOpenEditor,
  onToggleLyrics,
}) => {
  const [view, setView] = useState<ModalView>('menu');
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const [coverUrl, setCoverUrl] = useState<string | null>(track.coverArtUrl);
  const [rawLyrics, setRawLyrics] = useState(
    track.rawLyricsText || serializeLyricsToLrc(track.lyrics)
  );
  const [zoomArt, setZoomArt] = useState(false);

  const albumTracks = allTracks.filter(
    (t) => t.album.toLowerCase() === track.album.toLowerCase()
  );

  const handleDownloadCover = () => {
    if (!track.coverArtUrl) return;
    const link = document.createElement('a');
    link.href = track.coverArtUrl;
    link.download = `${track.title.replace(/[^\w\s-]/g, '')}-album-art.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCoverUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLrcFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawLyrics(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleStampLine = (lineIdx: number) => {
    const lines = rawLyrics.split(/\r?\n/);
    const clean = lines[lineIdx].replace(/^\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]\s*/, '');
    lines[lineIdx] = `[${formatTime(currentTime, true)}] ${clean}`;
    setRawLyrics(lines.join('\n'));
  };

  const handleSaveTags = () => {
    const parsed = parseLrcText(rawLyrics);
    onUpdateTrack({
      ...track,
      title: title.trim() || track.title,
      artist: artist.trim() || 'Unknown Artist',
      album: album.trim() || 'Unknown Album',
      coverArtUrl: coverUrl,
      rawLyricsText: rawLyrics,
      lyrics: parsed,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-[#141821] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-slate-900 border border-white/10 shrink-0 flex items-center justify-center overflow-hidden">
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
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">
                {view === 'menu'
                  ? track.title
                  : view === 'album'
                    ? track.album
                    : 'Tag & Lyrics Editor'}
              </h3>
              <p className="text-xs text-slate-400 truncate">
                {track.artist} · {track.album}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto p-5 flex-1">
          {view === 'menu' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setView('album')}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 flex items-center gap-3 text-left transition-colors"
              >
                <Disc3 className="w-5 h-5 text-[var(--accent)] shrink-0" />
                <div>
                  <div className="text-sm font-medium text-white">View Album</div>
                  <div className="text-xs text-slate-400">
                    Inspect album artwork and {albumTracks.length} track(s)
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={!track.coverArtUrl}
                onClick={handleDownloadCover}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 border border-white/5 flex items-center gap-3 text-left transition-colors"
              >
                <Download className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-white">Download Album Art</div>
                  <div className="text-xs text-slate-400">
                    Save embedded cover image locally
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setView('tag-editor')}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 flex items-center gap-3 text-left transition-colors"
              >
                <FileEdit className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-white">Edit Music & Embedded Lyrics</div>
                  <div className="text-xs text-slate-400">
                    Edit title, artist, album art, and synced LRC timestamps
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEditor();
                }}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[var(--accent-soft)] hover:bg-[var(--accent-border)] border border-[var(--accent-border)] flex items-center gap-3 text-left transition-colors"
              >
                <Sliders className="w-5 h-5 text-[var(--accent)] shrink-0" />
                <div>
                  <div className="text-sm font-medium text-white">Edit Motion Keyframes</div>
                  <div className="text-xs text-[var(--accent-text)]">
                    Open this track in Motion Studio
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onToggleLyrics();
                  onClose();
                }}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 flex items-center gap-3 text-left transition-colors"
              >
                {lyricsEnabled ? (
                  <EyeOff className="w-5 h-5 text-slate-400 shrink-0" />
                ) : (
                  <Eye className="w-5 h-5 text-[var(--accent)] shrink-0" />
                )}
                <div>
                  <div className="text-sm font-medium text-white">
                    {lyricsEnabled ? 'Disable Embedded Lyrics Mode' : 'Enable Embedded Lyrics Mode'}
                  </div>
                  <div className="text-xs text-slate-400">
                    Quick shortcut: tap the album cover once
                  </div>
                </div>
              </button>
            </div>
          )}

          {view === 'album' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => setZoomArt((z) => !z)}
                  className={`overflow-hidden border border-white/10 bg-[#11151E] transition-all ${
                    zoomArt ? 'w-full aspect-square' : 'w-44 h-44'
                  }`}
                >
                  {track.coverArtUrl ? (
                    <img
                      src={track.coverArtUrl}
                      alt={track.album}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center px-3 text-center">
                      <span className="text-sm font-display font-bold text-slate-200">
                        [ P.U.R MUSiCLiGHT ]
                      </span>
                    </div>
                  )}
                </button>
                <span className="text-xs text-slate-400">
                  Tap artwork to {zoomArt ? 'shrink' : 'zoom'}
                </span>
              </div>

              <div className="border-t border-white/10 pt-3 space-y-1">
                <div className="text-xs font-medium text-slate-400 mb-2">
                  Tracks in {track.album}
                </div>
                {albumTracks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onSelectTrack(t.id);
                      onClose();
                    }}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-lg flex items-center justify-between text-left transition-colors ${
                      t.id === track.id
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'hover:bg-white/5 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Play className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      <span className="text-sm font-medium truncate">{t.title}</span>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                      {formatTime(t.duration)}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setView('menu')}
                className="w-full min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-sm text-slate-300 font-medium"
              >
                Back to Actions
              </button>
            </div>
          )}

          {view === 'tag-editor' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 overflow-hidden bg-[#11151E] border border-white/10 shrink-0 flex items-center justify-center">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt="Cover preview"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[9px] font-display font-bold text-slate-300 text-center px-1">
                      [ P.U.R MUSiCLiGHT ]
                    </span>
                  )}
                </div>
                <label className="min-h-[44px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 cursor-pointer inline-flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[var(--accent)]" />
                  <span>Replace Album Art</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Track Name (extension hidden)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-sm text-white focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Artist</label>
                    <input
                      type="text"
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-sm text-white focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Album</label>
                    <input
                      type="text"
                      value={album}
                      onChange={(e) => setAlbum(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-sm text-white focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-slate-400">
                    Embedded / Synced Lyrics (.lrc timestamps auto-stripped on display)
                  </label>
                  <label className="text-xs text-[var(--accent)] hover:text-[var(--accent-text)] cursor-pointer font-medium">
                    Import .lrc
                    <input
                      type="file"
                      accept=".lrc,.txt"
                      onChange={handleLrcFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  rows={5}
                  value={rawLyrics}
                  onChange={(e) => setRawLyrics(e.target.value)}
                  placeholder="[00:12.00] Paste lyrics or .lrc lines here..."
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Musicolet-style quick line timestamp stamper */}
              <div className="bg-slate-900/70 border border-white/10 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-300">
                    Quick Timestamp Stamper
                  </span>
                  <span className="text-xs font-mono tabular-nums text-[var(--accent)]">
                    Playhead: {formatTime(currentTime, true)}
                  </span>
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {rawLyrics.split(/\r?\n/).map((line, idx) =>
                    line.trim() ? (
                      <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-slate-300">{line}</span>
                        <button
                          type="button"
                          onClick={() => handleStampLine(idx)}
                          className="shrink-0 px-2 py-1 rounded bg-[var(--accent-soft)] hover:bg-[var(--accent-border)] text-[var(--accent-text)] inline-flex items-center gap-1"
                        >
                          <Clock className="w-3 h-3" />
                          <span>Stamp</span>
                        </button>
                      </div>
                    ) : null
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setView('menu')}
                  className="flex-1 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-sm text-slate-300 font-medium"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSaveTags}
                  className="flex-1 min-h-[44px] rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm text-slate-950 font-semibold"
                >
                  Save Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
