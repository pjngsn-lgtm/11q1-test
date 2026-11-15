import { MusicQueue, Track } from '../types/studio';
import { createDefaultProject } from './interpolation';

export function createStarterTracks(): Track[] {
  return [];
}

export function createStarterQueues(): MusicQueue[] {
  return [
    {
      id: 'queue-main',
      name: 'Main Queue',
      trackIds: [],
      activeIndex: 0,
      loopMode: 'all',
      shuffle: false,
    },
  ];
}

export function createPlaceholderTrack(): Track {
  return {
    id: '__placeholder__',
    title: 'No Music File',
    fileName: '',
    folderPath: '',
    artist: 'Allow folder storage to load songs',
    album: '[ P.U.R MUSiCLiGHT ]',
    duration: 0,
    audioUrl: '',
    coverArtUrl: null,
    lyrics: [],
    rawLyricsText: '',
    hasMotionEdit: false,
    project: createDefaultProject(60, 720, 1280),
    addedAt: 0,
  };
}
