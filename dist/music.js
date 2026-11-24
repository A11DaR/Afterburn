// An original flight theme in four phrases of four bars around D minor.
// Melodic entries are [beat, MIDI pitch, length in beats]; empty beats are rests.
const RATE = 12800;
const BEAT = 60 / 96;
const NORMAL_LEVEL = .68;
const RADIO_LEVEL = .062;
const FADE_IN = .16;

const SCORE = [
  {bass:38, chord:[53,57,60,64], lead:[[.5,69,.85],[1.75,64,.42],[2.5,67,1.12]]},
  {bass:43, chord:[55,59,62,64], lead:[[0,66,.72],[1,67,1.45]]},
  {bass:48, chord:[55,59,62,64], lead:[[1.25,64,.45],[2,62,.72],[3,59,.55]]},
  {bass:45, chord:[55,57,62,64], lead:[[0,62,2.25]]},

  {bass:38, chord:[53,57,60,64], lead:[[.5,69,.85],[1.75,64,.42],[2.5,72,1.08]]},
  {bass:41, chord:[53,57,60,64], lead:[[0,69,.72],[1,67,1.05],[2.75,64,.65]]},
  {bass:40, chord:[55,59,62,66], lead:[[.5,66,.75],[1.75,62,.55],[2.75,59,.68]]},
  {bass:43, chord:[55,59,62,64], lead:[[0,64,2.45]]},

  {bass:41, chord:[53,57,60,64], lead:[[.25,65,.48],[1,69,.65],[2,74,1.15]]},
  {bass:48, chord:[55,59,62,64], lead:[[.5,72,1.15],[2.25,67,.82]]},
  {bass:43, chord:[55,59,62,64], lead:[[0,71,.85],[1.5,67,.42],[2.25,69,1.22]]},
  {bass:45, chord:[55,57,62,64], lead:[[.75,64,1.62],[3,62,.55]]},

  {bass:40, chord:[55,59,62,66], lead:[[.5,67,.85],[1.75,62,.42],[2.5,66,1.05]]},
  {bass:43, chord:[55,59,62,64], lead:[[0,64,.75],[1.25,62,1.28]]},
  {bass:38, chord:[53,57,60,64], lead:[[.5,60,.82],[2,64,.82]]},
  {bass:45, chord:[55,57,62,64], lead:[[0,62,2.42]]}
];

// Four-bit triangle and a rounded 3/8-duty pulse. The quiet, filtered pulse
// gives the melody a different colour from the alert beeps.
const triangle = new Float32Array(256);
const pulse = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const phase = i / 256;
  triangle[i] = Math.round((1 - 4 * Math.abs(phase - .5)) * 8) / 8;
  let value = 0;
  for (let n = 1; n <= 6; n++) {
    const angle = 2 * Math.PI * n * (phase - .1875);
    value += 2 * Math.sin(n * Math.PI * .375) * Math.cos(angle) / (n * Math.PI);
  }
  pulse[i] = Math.round((.76 * value + .24 * triangle[i]) * 32) / 32;
}

function renderScore(context) {
  const buffer = context.createBuffer(2, Math.round(SCORE.length * 4 * BEAT * RATE), RATE);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);

  function note(beat, pitch, length, table, level, pan, release) {
    const start = Math.round(beat * BEAT * RATE);
    const count = Math.min(Math.round(length * BEAT * RATE), left.length - start);
    const step = 440 * 2 ** ((pitch - 69) / 12) * 256 / RATE;
    const attackSamples = Math.min(count * .22, RATE * .021);
    const releaseSamples = Math.min(count * .52, RATE * release);
    const leftGain = level * (1 - Math.max(0, pan));
    const rightGain = level * (1 + Math.min(0, pan));
    let phase = 64, filtered = 0;
    for (let i = 0; i < count; i++) {
      filtered += .38 * (table[phase & 255] - filtered);
      const envelope = Math.min(1, i / attackSamples, (count - 1 - i) / releaseSamples);
      const s = filtered * envelope * (1 - .46 * i / count);
      left[start + i] += s * leftGain;
      right[start + i] += s * rightGain;
      phase += step;
    }
  }

  function brush(beat, level, seed) {
    const start = Math.round(beat * BEAT * RATE);
    const count = Math.min(Math.round(RATE * .066), left.length - start);
    let prior = 0;
    for (let i = 0; i < count; i++) {
      const bit = (seed ^ (seed >> 1)) & 1;
      seed = (seed >> 1) | (bit << 14);
      const raw = (seed & 1) ? 1 : -1;
      const sample = (raw - prior) * (1 - i / count) ** 3 * Math.min(1, i / 28) * level;
      left[start + i] += sample * .78;
      right[start + i] += sample;
      prior = raw;
    }
  }

  SCORE.forEach(({bass, chord, lead}, bar) => {
    const start = bar * 4, middle = bar >= 8 && bar < 12;
    note(start, bass, 1.6, triangle, .27, -.06, .1);
    if (bar % 4 !== 3) note(start + 2.25, bass + 7, 1.02, triangle, .15, .04, .095);

    const plucks = bar % 2 ? [[.5,2],[1.5,0],[2.75,3]] : [[.25,0],[1.25,1],[2,3],[3.25,2]];
    for (const [beat, tone] of plucks) {
      note(start + beat, chord[tone], .48, pulse, .085, tone % 2 ? .34 : -.4, .13);
    }
    for (const [beat, pitch, duration] of lead) {
      note(start + beat, pitch, duration, pulse, .32, -.12, .12);
      if (duration > 1) note(start + beat + .375, pitch, duration, triangle, .079, .53, .18);
    }
    if (bar % 4 !== 3) brush(start + 1.5, .033, 0x39ad ^ bar);
    if (middle) {
      brush(start + 3, .048, 0x5b1f ^ bar);
      note(start + 3.5, chord[1], .28, triangle, .105, .22, .08);
    }
  });

  for (let i = 0; i < left.length; i++) {
    left[i] = Math.round(left[i] * 128) / 128;
    right[i] = Math.round(right[i] * 128) / 128;
  }
  return buffer;
}

export class FlightMusic {
  constructor(context, destination) {
    this.context = context;
    this.mix = context.createGain();
    this.mix.gain.value = NORMAL_LEVEL;
    this.mix.connect(destination);
    this.buffer = null;
    this.playback = null;
    this.offset = 0;
    this.ducked = false;
  }

  setPlaying(enabled) {
    if (Boolean(enabled) === Boolean(this.playback)) return;
    const context = this.context;
    if (enabled) {
      this.buffer ??= renderScore(context);
      const now = context.currentTime, source = context.createBufferSource(), gate = context.createGain();
      source.buffer = this.buffer;
      source.loop = true;
      gate.gain.setValueAtTime(0, now);
      gate.gain.linearRampToValueAtTime(1, now + FADE_IN);
      source.connect(gate);
      gate.connect(this.mix);
      source.onended = () => { source.disconnect(); gate.disconnect(); };
      source.start(now, this.offset);
      this.playback = {source, gate, started:now};
    } else {
      const now = context.currentTime;
      const {source, gate, started} = this.playback;
      const elapsed = Math.max(0, now - started);
      this.offset = (this.offset + elapsed) % this.buffer.duration;
      this.playback = null;
      gate.gain.cancelScheduledValues(now);
      gate.gain.setValueAtTime(Math.min(1, elapsed / FADE_IN), now);
      gate.gain.linearRampToValueAtTime(0, now + .055);
      source.stop(now + .06);
    }
  }

  setDucked(ducked) {
    if (this.ducked === ducked) return;
    this.ducked = ducked;
    this.mix.gain.setTargetAtTime(ducked ? RADIO_LEVEL : NORMAL_LEVEL, this.context.currentTime, ducked ? .025 : .24);
  }

  reset() {
    const running = Boolean(this.playback);
    this.setPlaying(false);
    this.offset = 0;
    if (running) this.setPlaying(true);
  }
}
