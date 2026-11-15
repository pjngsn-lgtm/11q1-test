import { LyricLine } from '../types/studio';

const AUDIO_EXT_REGEX = /\.(mp3|wav|flac|m4a|aac|ogg|opus|wma|webm|mp4|3gp|amr)$/i;

export function stripAudioExtension(filename: string): string {
  const cleaned = filename.trim().replace(AUDIO_EXT_REGEX, '');
  return cleaned || filename.trim() || 'Untitled Track';
}

export function formatTime(seconds: number, showMillis = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (!showMillis) return `${mm}:${ss}`;
  const cs = Math.floor((seconds % 1) * 100);
  return `${mm}:${ss}.${String(cs).padStart(2, '0')}`;
}

/**
 * Strips [00:00.00], <00:00.00>, and LRC header metadata like [ar:...], [ti:...]
 * so that ONLY pure lyric text is stored and displayed.
 */
export function parseLrcText(raw: string): LyricLine[] {
  if (!raw || !raw.trim()) return [];
  const lines = raw.split(/\r?\n/);
  const parsed: LyricLine[] = [];

  const timeTagRegex = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  const metaTagRegex = /^\[(ti|ar|al|au|by|offset|re|ve|length):.*\]$/i;
  const inlineWordTagRegex = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

  let offsetSeconds = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const offsetMatch = line.match(/^\[offset:([+-]?\d+)\]/i);
    if (offsetMatch) {
      offsetSeconds = parseInt(offsetMatch[1], 10) / 1000;
      continue;
    }

    if (metaTagRegex.test(line)) {
      continue;
    }

    const matches = [...line.matchAll(timeTagRegex)];
    const cleanText = line
      .replace(timeTagRegex, '')
      .replace(inlineWordTagRegex, '')
      .trim();

    if (matches.length > 0) {
      if (!cleanText) continue;
      for (let mIdx = 0; mIdx < matches.length; mIdx++) {
        const m = matches[mIdx];
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        const fracRaw = m[3] || '0';
        const frac =
          fracRaw.length === 3
            ? parseInt(fracRaw, 10) / 1000
            : parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length || 2);
        const t = Math.max(0, min * 60 + sec + frac + offsetSeconds);
        parsed.push({
          id: `lyr-${i}-${mIdx}-${Math.round(t * 1000)}`,
          time: Number(t.toFixed(3)),
          text: cleanText,
        });
      }
    } else {
      if (cleanText) {
        parsed.push({
          id: `lyr-plain-${i}`,
          time: null,
          text: cleanText,
        });
      }
    }
  }

  const hasTimed = parsed.some((l) => l.time !== null);
  if (hasTimed) {
    parsed.sort((a, b) => {
      if (a.time === null && b.time === null) return 0;
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return a.time - b.time;
    });
  }
  return parsed;
}

export function serializeLyricsToLrc(lyrics: LyricLine[]): string {
  return lyrics
    .map((line) => {
      if (line.time === null) return line.text;
      return `[${formatTime(line.time, true)}] ${line.text}`;
    })
    .join('\n');
}

export function getActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  let activeIdx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    const t = lyrics[i].time;
    if (t !== null && t <= currentTime + 0.08) {
      activeIdx = i;
    }
  }
  return activeIdx;
}

function decodeTextBytes(bytes: Uint8Array, encodingByte: number): string {
  try {
    if (encodingByte === 0) {
      return new TextDecoder('iso-8859-1').decode(bytes).replace(/\0/g, '').trim();
    }
    if (encodingByte === 1) {
      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(bytes.subarray(2)).replace(/\0/g, '').trim();
      }
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder('utf-16be').decode(bytes.subarray(2)).replace(/\0/g, '').trim();
      }
      return new TextDecoder('utf-16le').decode(bytes).replace(/\0/g, '').trim();
    }
    if (encodingByte === 2) {
      return new TextDecoder('utf-16be').decode(bytes).replace(/\0/g, '').trim();
    }
    return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim();
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\0/g, '').trim();
  }
}

function readSynchsafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

export interface ParsedAudioTags {
  title?: string;
  artist?: string;
  album?: string;
  rawLyrics?: string;
  coverArtDataUrl?: string;
}

function detectImageMime(bytes: Uint8Array, hint?: string): string {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) {
    return 'image/webp';
  }
  if (hint && hint.includes('/')) return hint;
  if (hint && hint.toUpperCase().includes('PNG')) return 'image/png';
  return 'image/jpeg';
}

function readUint24BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]) >>> 0;
}

/**
 * Browser-native audio metadata parser supporting ID3v2.2/2.3/2.4 (MP3),
 * FLAC PICTURE blocks, and MP4/M4A covr atoms.
 */
export async function parseId3FromFile(file: File): Promise<ParsedAudioTags> {
  const result: ParsedAudioTags = {};
  try {
    const headerBuf = await file.slice(0, 12).arrayBuffer();
    const header = new Uint8Array(headerBuf);
    if (header.length < 10) return result;

    // 1. FLAC format ('fLaC')
    if (header[0] === 0x66 && header[1] === 0x4c && header[2] === 0x61 && header[3] === 0x43) {
      const scanBuf = await file.slice(4, Math.min(file.size, 8 * 1024 * 1024)).arrayBuffer();
      const data = new Uint8Array(scanBuf);
      let pos = 0;
      while (pos + 4 <= data.length) {
        const blockHeader = data[pos];
        const isLast = (blockHeader & 0x80) !== 0;
        const blockType = blockHeader & 0x7f;
        const blockLen = readUint24BE(data, pos + 1);
        pos += 4;
        if (pos + blockLen > data.length) break;
        if (blockType === 6 && blockLen > 32) {
          // METADATA_BLOCK_PICTURE
          const block = data.subarray(pos, pos + blockLen);
          let p = 4; // skip picture type
          const mimeLen = readUint32BE(block, p);
          p += 4;
          const mime = new TextDecoder('iso-8859-1').decode(block.subarray(p, p + mimeLen));
          p += mimeLen;
          const descLen = readUint32BE(block, p);
          p += 4 + descLen + 16; // skip desc + width/height/depth/colors
          if (p + 4 <= block.length) {
            const imgLen = readUint32BE(block, p);
            p += 4;
            if (p + imgLen <= block.length && imgLen > 0) {
              const imgBytes = block.subarray(p, p + imgLen);
              const blob = new Blob([imgBytes], { type: detectImageMime(imgBytes, mime) });
              result.coverArtDataUrl = await blobToDataUrl(blob);
            }
          }
        }
        pos += blockLen;
        if (isLast) break;
      }
      return result;
    }

    // 2. MP4 / M4A ('ftyp' at offset 4) -> search for 'covr' atom
    if (header.length >= 8 && header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) {
      const maxRead = Math.min(file.size, 12 * 1024 * 1024);
      const buf = await file.slice(0, maxRead).arrayBuffer();
      const data = new Uint8Array(buf);
      for (let i = 0; i + 24 < data.length; i++) {
        // Look for 'covr' followed shortly by 'data'
        if (
          data[i] === 0x63 &&
          data[i + 1] === 0x6f &&
          data[i + 2] === 0x76 &&
          data[i + 3] === 0x72 &&
          data[i + 8] === 0x64 &&
          data[i + 9] === 0x61 &&
          data[i + 10] === 0x74 &&
          data[i + 11] === 0x61
        ) {
          const dataAtomSize = readUint32BE(data, i + 4);
          if (dataAtomSize > 16 && i + 4 + dataAtomSize <= data.length) {
            const imgBytes = data.subarray(i + 20, i + 4 + dataAtomSize);
            const blob = new Blob([imgBytes], { type: detectImageMime(imgBytes) });
            result.coverArtDataUrl = await blobToDataUrl(blob);
            break;
          }
        }
      }
      return result;
    }

    // 3. ID3v2 ('ID3')
    if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) {
      return result;
    }

    const versionMajor = header[3];
    const tagSize = readSynchsafeInt(header, 6);
    const maxRead = Math.min(file.size, 10 + tagSize, 16 * 1024 * 1024);
    const tagBuf = await file.slice(10, maxRead).arrayBuffer();
    const data = new Uint8Array(tagBuf);

    let offset = 0;
    // Skip extended header if present (ID3v2.3 / v2.4)
    if (versionMajor >= 3 && (header[5] & 0x40) !== 0 && data.length >= 4) {
      const extSize = versionMajor >= 4 ? readSynchsafeInt(data, 0) : readUint32BE(data, 0) + 4;
      offset += Math.min(extSize, data.length);
    }

    // ID3v2.2 (6-byte frame headers: 3-char ID + 3-byte size)
    if (versionMajor === 2) {
      while (offset + 6 <= data.length) {
        if (data[offset] === 0) break;
        const frameId = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2]);
        if (!/^[A-Z0-9]{3}$/.test(frameId)) break;
        const frameSize = readUint24BE(data, offset + 3);
        if (frameSize <= 0 || offset + 6 + frameSize > data.length) break;
        const frameData = data.subarray(offset + 6, offset + 6 + frameSize);
        offset += 6 + frameSize;

        if (frameId === 'TT2' && frameData.length > 1) {
          result.title = decodeTextBytes(frameData.subarray(1), frameData[0]);
        } else if (frameId === 'TP1' && frameData.length > 1) {
          result.artist = decodeTextBytes(frameData.subarray(1), frameData[0]);
        } else if (frameId === 'TAL' && frameData.length > 1) {
          result.album = decodeTextBytes(frameData.subarray(1), frameData[0]);
        } else if (frameId === 'PIC' && frameData.length > 6 && !result.coverArtDataUrl) {
          const enc = frameData[0];
          const imgFmt = String.fromCharCode(frameData[1], frameData[2], frameData[3]);
          let pos = 5; // skip enc(1) + format(3) + picType(1)
          if (enc === 1 || enc === 2) {
            while (pos + 1 < frameData.length) {
              if (frameData[pos] === 0 && frameData[pos + 1] === 0) {
                pos += 2;
                break;
              }
              pos += 2;
            }
          } else {
            while (pos < frameData.length) {
              if (frameData[pos] === 0) {
                pos += 1;
                break;
              }
              pos += 1;
            }
          }
          if (pos < frameData.length) {
            const imgBytes = frameData.subarray(pos);
            const blob = new Blob([imgBytes], { type: detectImageMime(imgBytes, imgFmt) });
            result.coverArtDataUrl = await blobToDataUrl(blob);
          }
        }
      }
      return result;
    }

    // ID3v2.3 / ID3v2.4 (10-byte frame headers)
    while (offset + 10 <= data.length) {
      if (data[offset] === 0) break;
      const frameId = String.fromCharCode(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3]
      );
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      const frameSize =
        versionMajor >= 4
          ? readSynchsafeInt(data, offset + 4)
          : readUint32BE(data, offset + 4);

      if (frameSize <= 0 || offset + 10 + frameSize > data.length) break;

      const frameData = data.subarray(offset + 10, offset + 10 + frameSize);
      offset += 10 + frameSize;

      if (frameId === 'TIT2' && frameData.length > 1) {
        result.title = decodeTextBytes(frameData.subarray(1), frameData[0]);
      } else if (frameId === 'TPE1' && frameData.length > 1) {
        result.artist = decodeTextBytes(frameData.subarray(1), frameData[0]);
      } else if (frameId === 'TALB' && frameData.length > 1) {
        result.album = decodeTextBytes(frameData.subarray(1), frameData[0]);
      } else if (frameId === 'USLT' && frameData.length > 4) {
        const enc = frameData[0];
        let pos = 4; // skip encoding (1) + language (3)
        if (enc === 1 || enc === 2) {
          while (pos + 1 < frameData.length) {
            if (frameData[pos] === 0 && frameData[pos + 1] === 0) {
              pos += 2;
              break;
            }
            pos += 2;
          }
        } else {
          while (pos < frameData.length) {
            if (frameData[pos] === 0) {
              pos += 1;
              break;
            }
            pos += 1;
          }
        }
        if (pos < frameData.length) {
          const text = decodeTextBytes(frameData.subarray(pos), enc);
          if (text) result.rawLyrics = text;
        }
      } else if (frameId === 'SYLT' && frameData.length > 6 && !result.rawLyrics) {
        const enc = frameData[0];
        let pos = 6;
        if (enc === 1 || enc === 2) {
          while (pos + 1 < frameData.length) {
            if (frameData[pos] === 0 && frameData[pos + 1] === 0) {
              pos += 2;
              break;
            }
            pos += 2;
          }
        } else {
          while (pos < frameData.length) {
            if (frameData[pos] === 0) {
              pos += 1;
              break;
            }
            pos += 1;
          }
        }
        const syltLines: string[] = [];
        while (pos < frameData.length) {
          const textStart = pos;
          if (enc === 1 || enc === 2) {
            while (pos + 1 < frameData.length && !(frameData[pos] === 0 && frameData[pos + 1] === 0)) {
              pos += 2;
            }
            const lineTxt = decodeTextBytes(frameData.subarray(textStart, pos), enc);
            pos += 2;
            if (pos + 4 <= frameData.length) {
              const ts = readUint32BE(frameData, pos);
              pos += 4;
              const sec = ts / 1000;
              if (lineTxt) syltLines.push(`[${formatTime(sec, true)}] ${lineTxt}`);
            }
          } else {
            while (pos < frameData.length && frameData[pos] !== 0) {
              pos += 1;
            }
            const lineTxt = decodeTextBytes(frameData.subarray(textStart, pos), enc);
            pos += 1;
            if (pos + 4 <= frameData.length) {
              const ts = readUint32BE(frameData, pos);
              pos += 4;
              const sec = ts / 1000;
              if (lineTxt) syltLines.push(`[${formatTime(sec, true)}] ${lineTxt}`);
            }
          }
        }
        if (syltLines.length > 0) {
          result.rawLyrics = syltLines.join('\n');
        }
      } else if (frameId === 'APIC' && frameData.length > 4 && !result.coverArtDataUrl) {
        const enc = frameData[0];
        let pos = 1;
        while (pos < frameData.length && frameData[pos] !== 0) pos++;
        const mime = new TextDecoder('iso-8859-1').decode(frameData.subarray(1, pos));
        pos += 2; // null + picture type byte
        // Skip description
        if (enc === 1 || enc === 2) {
          while (pos + 1 < frameData.length) {
            if (frameData[pos] === 0 && frameData[pos + 1] === 0) {
              pos += 2;
              break;
            }
            pos += 2;
          }
        } else {
          while (pos < frameData.length) {
            if (frameData[pos] === 0) {
              pos += 1;
              break;
            }
            pos += 1;
          }
        }
        if (pos < frameData.length && mime !== '-->') {
          const imgBytes = frameData.subarray(pos);
          const blob = new Blob([imgBytes], { type: detectImageMime(imgBytes, mime) });
          result.coverArtDataUrl = await blobToDataUrl(blob);
        }
      }
    }
  } catch {
    // Gracefully fallback if file has non-standard tags
  }
  return result;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
