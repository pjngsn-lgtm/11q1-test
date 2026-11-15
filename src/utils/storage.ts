import { MusicQueue, Track } from '../types/studio';

const DB_NAME = 'llur_music_ight_db';
const DB_VERSION = 2;
const STORE_STATE = 'app_state';
const STORE_MEDIA = 'media_blobs';
const STORE_HANDLES = 'dir_handles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE);
      }
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        db.createObjectStore(STORE_MEDIA);
      }
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveMediaBlob(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      tx.objectStore(STORE_MEDIA).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Non-fatal if quota exceeded
  }
}

export async function loadMediaBlob(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readonly');
      const req = tx.objectStore(STORE_MEDIA).get(key);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    if (blob instanceof Blob) {
      return URL.createObjectURL(blob);
    }
  } catch {
    // ignore
  }
  return null;
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_HANDLES, 'readwrite');
      tx.objectStore(STORE_HANDLES).put(handle, 'music_folder');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore if browser blocks structured clone of handle
  }
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_HANDLES, 'readonly');
      const req = tx.objectStore(STORE_HANDLES).get('music_folder');
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
      req.onerror = () => reject(req.error);
    });
    return handle || null;
  } catch {
    return null;
  }
}

export interface PersistedAppState {
  tracks: Track[];
  queues: MusicQueue[];
  activeQueueId: string;
}

export async function saveAppState(state: PersistedAppState): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_STATE, 'readwrite');
      tx.objectStore(STORE_STATE).put(state, 'main_v3');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore storage failure
  }
}

export async function loadAppState(): Promise<PersistedAppState | null> {
  try {
    const db = await openDb();
    const result = await new Promise<PersistedAppState | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_STATE, 'readonly');
      const req = tx.objectStore(STORE_STATE).get('main_v3');
      req.onsuccess = () => resolve(req.result as PersistedAppState | undefined);
      req.onerror = () => reject(req.error);
    });
    return result || null;
  } catch {
    return null;
  }
}
