import { Track } from '../types/studio';
import { createDefaultProject } from './interpolation';
import { parseId3FromFile, parseLrcText, stripAudioExtension } from './lyricsAndTags';
import { saveMediaBlob } from './storage';

const AUDIO_FILE_EXT = /\.(mp3|wav|flac|m4a|aac|ogg|opus|wma|webm)$/i;

export function isAudioFileName(name: string): boolean {
  return AUDIO_FILE_EXT.test(name);
}

function readAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 60;
      resolve(dur);
    };
    audio.onerror = () => resolve(60);
    audio.src = url;
  });
}

export interface CollectedFileEntry {
  file: File;
  folderPath: string;
  relativePath: string;
}

async function collectFromDirectoryRecursive(
  dirHandle: FileSystemDirectoryHandle,
  currentPath: string,
  audioEntries: CollectedFileEntry[],
  lrcMap: Map<string, File>
) {
  for await (const entry of dirHandle.values()) {
    const relPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      await collectFromDirectoryRecursive(
        entry as FileSystemDirectoryHandle,
        relPath,
        audioEntries,
        lrcMap
      );
    } else if (entry.kind === 'file') {
      const fileHandle = entry as FileSystemFileHandle;
      const lower = entry.name.toLowerCase();
      if (isAudioFileName(lower)) {
        const file = await fileHandle.getFile();
        audioEntries.push({
          file,
          folderPath: currentPath || dirHandle.name || 'Music Folder',
          relativePath: relPath,
        });
      } else if (lower.endsWith('.lrc')) {
        const file = await fileHandle.getFile();
        const key = relPath.replace(/\.lrc$/i, '').toLowerCase();
        lrcMap.set(key, file);
      }
    }
  }
}

export async function scanDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  existingTracks: Track[]
): Promise<{ tracks: Track[]; addedCount: number }> {
  const audioEntries: CollectedFileEntry[] = [];
  const lrcMap = new Map<string, File>();

  await collectFromDirectoryRecursive(dirHandle, dirHandle.name || 'Music', audioEntries, lrcMap);
  return buildTracksFromEntries(audioEntries, lrcMap, existingTracks);
}

export async function scanFileList(
  files: FileList,
  existingTracks: Track[]
): Promise<{ tracks: Track[]; addedCount: number }> {
  const audioEntries: CollectedFileEntry[] = [];
  const lrcMap = new Map<string, File>();

  for (const file of Array.from(files)) {
    const rel = file.webkitRelativePath || file.name;
    const parts = rel.split('/').filter(Boolean);
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Imported Files';
    const lower = file.name.toLowerCase();

    if (isAudioFileName(lower)) {
      audioEntries.push({
        file,
        folderPath,
        relativePath: rel,
      });
    } else if (lower.endsWith('.lrc')) {
      const key = rel.replace(/\.lrc$/i, '').toLowerCase();
      lrcMap.set(key, file);
    }
  }

  return buildTracksFromEntries(audioEntries, lrcMap, existingTracks);
}

async function buildTracksFromEntries(
  audioEntries: CollectedFileEntry[],
  lrcMap: Map<string, File>,
  existingTracks: Track[]
): Promise<{ tracks: Track[]; addedCount: number }> {
  const existingByRel = new Map<string, Track>();
  existingTracks.forEach((t) => {
    const key = (t.relativePath || t.fileName).toLowerCase();
    existingByRel.set(key, t);
  });

  const merged: Track[] = [...existingTracks];
  let addedCount = 0;

  for (const entry of audioEntries) {
    const matchKey = entry.relativePath.toLowerCase();
    const fallbackKey = entry.file.name.toLowerCase();
    const already = existingByRel.get(matchKey) || existingByRel.get(fallbackKey);

    if (already) {
      // Re-attach fresh blob URL from disk file while keeping all user motion edits
      const freshUrl = URL.createObjectURL(entry.file);
      await saveMediaBlob(`audio-${already.id}`, entry.file);
      let coverArtUrl = already.coverArtUrl;
      if (!coverArtUrl) {
        const refreshedTags = await parseId3FromFile(entry.file);
        if (refreshedTags.coverArtDataUrl) {
          coverArtUrl = refreshedTags.coverArtDataUrl;
        }
      }
      const idx = merged.findIndex((t) => t.id === already.id);
      if (idx >= 0) {
        merged[idx] = {
          ...already,
          audioUrl: freshUrl,
          coverArtUrl,
          folderPath: entry.folderPath,
          relativePath: entry.relativePath,
        };
      }
      continue;
    }

    const id = `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const blobUrl = URL.createObjectURL(entry.file);
    await saveMediaBlob(`audio-${id}`, entry.file);

    const [tags, duration] = await Promise.all([
      parseId3FromFile(entry.file),
      readAudioDuration(blobUrl),
    ]);

    let rawLyrics = tags.rawLyrics || '';
    if (!rawLyrics) {
      const lrcKey = entry.relativePath.replace(AUDIO_FILE_EXT, '').toLowerCase();
      const sidecarLrc = lrcMap.get(lrcKey);
      if (sidecarLrc) {
        rawLyrics = await sidecarLrc.text();
      }
    }

    const cleanTitle = tags.title
      ? stripAudioExtension(tags.title)
      : stripAudioExtension(entry.file.name);

    const newTrack: Track = {
      id,
      title: cleanTitle,
      fileName: entry.file.name,
      folderPath: entry.folderPath,
      relativePath: entry.relativePath,
      artist: tags.artist || 'Local Audio',
      album: tags.album || entry.folderPath,
      duration,
      audioUrl: blobUrl,
      coverArtUrl: tags.coverArtDataUrl || null,
      lyrics: parseLrcText(rawLyrics),
      rawLyricsText: rawLyrics,
      hasMotionEdit: false,
      project: createDefaultProject(duration, 720, 1280),
      addedAt: Date.now(),
    };

    merged.push(newTrack);
    existingByRel.set(matchKey, newTrack);
    addedCount++;
  }

  return { tracks: merged, addedCount };
}
