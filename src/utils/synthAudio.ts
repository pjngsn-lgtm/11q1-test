// Clean offline WAV synthesizer for default unedited starter audio.

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function encodeWavMono(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

let cachedDefaultAudioUrl: string | null = null;

export function getDefaultSampleAudioUrl(): string {
  if (cachedDefaultAudioUrl) return cachedDefaultAudioUrl;

  const sampleRate = 22050;
  const duration = 32;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  const chords = [
    [220.0, 261.63, 329.63, 392.0],
    [174.61, 220.0, 261.63, 349.23],
    [196.0, 246.94, 293.66, 392.0],
    [164.81, 246.94, 293.66, 392.0],
  ];
  const barLen = 4.0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.floor(t / barLen) % chords.length;
    const barT = (t % barLen) / barLen;
    const chord = chords[barIdx];

    const barEnv = Math.sin(Math.PI * Math.min(1, barT * 1.15)) * 0.5 + 0.5;
    let sig = 0;

    for (let v = 0; v < chord.length; v++) {
      const f = chord[v];
      sig += Math.sin(2 * Math.PI * f * t) * (0.12 / chord.length);
    }

    const arpStep = Math.floor(t * 2);
    const arpT = (t * 2) % 1;
    const arpFreq = chord[arpStep % chord.length] * 2;
    const arpEnv = Math.exp(-arpT * 5.0);
    sig += Math.sin(2 * Math.PI * arpFreq * t) * arpEnv * 0.12;

    const fadeIn = Math.min(1, t / 0.5);
    const fadeOut = Math.min(1, Math.max(0, (duration - t) / 1.0));
    samples[i] = sig * barEnv * fadeIn * fadeOut * 0.8;
  }

  const blob = encodeWavMono(samples, sampleRate);
  cachedDefaultAudioUrl = URL.createObjectURL(blob);
  return cachedDefaultAudioUrl;
}
