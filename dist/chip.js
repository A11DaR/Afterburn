// Cartridge-style effects. Build once at sound unlock, then play the cached buffers.
const RATE = 16000;
const pulse = (at, hz, seconds, gain = .22, end = hz) => ({wave:'pulse', at, hz, seconds, gain, end});
const triangle = (at, hz, seconds, gain = .26, end = hz) => ({wave:'triangle', at, hz, seconds, gain, end});
const noise = (at, hz, seconds, gain = .21, end = hz) => ({wave:'noise', at, hz, seconds, gain, end});

function phrase(voice, at, beat, pitches, gain, gate = .77) {
  return pitches.map((hz, i) => voice(at + i * beat, hz, beat * gate, gain));
}

const effects = {
  menuSelect: [triangle(0, 524, .044, .21, 466), pulse(.006, 784, .018, .065)],
  menuConfirm: [triangle(0, 523, .056, .21), pulse(.048, 698, .045, .105), triangle(.048, 698, .081, .18)],
  start: [...phrase(pulse, 0, .072, [294, 440, 587], .19), triangle(.155, 147, .24, .30), pulse(.234, 740, .16, .20)],
  boost: [triangle(0, 86, .30, .30, 278), pulse(.035, 165, .27, .17, 784), noise(.045, 620, .21, .18, 2900)],
  brake: [triangle(0, 355, .24, .27, 110), noise(.015, 2570, .21, .24, 430)],
  flapDown: [pulse(0, 248, .14, .16, 108), triangle(.025, 187, .18, .24, 87),
    noise(.063, 1230, .035, .16, 585), noise(.126, 1070, .035, .16, 475), triangle(.196, 105, .070, .24, 70)],
  flapUp: [noise(0, 1230, .033, .16, 610), triangle(.012, 95, .17, .23, 215),
    pulse(.057, 149, .12, .15, 298), noise(.108, 1350, .030, .12), triangle(.169, 352, .052, .19, 262)],
  roll: [...phrase(pulse, 0, .052, [330, 494, 659, 784, 659, 494, 330], .17), triangle(.04, 131, .31, .17, 196)],
  rollLeft: [...phrase(pulse, .02, .048, [659, 587, 494, 392, 330], .17), triangle(0, 262, .31, .22, 117), noise(.06, 420, .21, .11, 1340)],
  rollRight: [...phrase(pulse, .02, .048, [330, 392, 494, 587, 659], .17), triangle(0, 147, .31, .22, 294), noise(.06, 420, .21, .11, 1340)],
  gun: [noise(0, 3550, .056, .26, 460), triangle(0, 163, .061, .28, 54), pulse(.006, 435, .024, .14, 185), noise(.032, 1780, .029, .13, 480)],
  hit: [triangle(0, 329, .063, .23, 130), pulse(.008, 960, .034, .16, 610), pulse(.050, 622, .035, .15, 932)],
  missile: [triangle(0, 105, .18, .31, 52), noise(.012, 420, .32, .26, 3050), pulse(.080, 311, .25, .17, 1175)],
  enemyArmorHit: [triangle(0, 680, .046, .19, 620), pulse(.003, 1180, .032, .115, 925),
    noise(.012, 3400, .032, .12, 1200), triangle(.037, 398, .052, .14, 273)],
  enemyMissileImpact: [noise(0, 3500, .114, .28, 690), triangle(.004, 260, .16, .28, 100),
    pulse(.049, 395, .071, .14, 135), noise(.091, 2200, .14, .17, 350), triangle(.112, 142, .138, .20, 73)],
  playerMissileImpact: [noise(0, 3150, .16, .31, 510), triangle(0, 158, .30, .36, 41),
    pulse(.037, 162, .13, .17, 55), noise(.104, 1710, .27, .24, 125),
    triangle(.172, 90, .24, .22, 37), noise(.235, 820, .126, .14, 235)],
  flares: [noise(0, 3200, .075, .23, 1100), noise(.086, 3100, .07, .22, 900), pulse(.098, 880, .062, .15, 587), triangle(.18, 659, .08, .22, 392)],
  flareSave: [noise(0, 3250, .085, .23, 1050), noise(.080, 2820, .068, .22, 860), ...phrase(triangle, .13, .056, [659, 784, 988, 1319], .27), pulse(.30, 988, .105, .15)],
  acquire: [triangle(0, 440, .066, .23), pulse(.071, 659, .072, .14)],
  track1: [triangle(0, 784, .052, .21)],
  track2: [triangle(0, 880, .036, .20), triangle(.053, 988, .042, .20)],
  locked: [...phrase(pulse, 0, .059, [784, 988, 1175], .18), triangle(.150, 587, .16, .25), pulse(.185, 1175, .13, .15)],
  lockBreak: [pulse(0, 784, .069, .15, 554), triangle(.085, 440, .115, .23, 262)],
  denied: [pulse(0, 208, .074, .18), pulse(.095, 185, .086, .17)],
  dodge: [...phrase(triangle, 0, .055, [494, 659, 880], .27), pulse(.172, 988, .103, .19)],
  terrainMiss: [triangle(0, 140, .31, .29, 44), noise(0, 1920, .21, .29, 190), pulse(.118, 174, .110, .12, 68), triangle(.29, 392, .092, .15, 494)],
  skim: [noise(0, 1280, .205, .14, 360), triangle(.018, 208, .18, .19, 117), pulse(.06, 247, .069, .075, 185)],
  kill: [noise(0, 2950, .29, .36, 165), triangle(0, 162, .36, .38, 41), ...phrase(pulse, .16, .067, [392, 494, 587], .16)],
  damage: [triangle(0, 121, .27, .33, 61), noise(0, 3300, .25, .28, 385), pulse(.075, 174, .18, .21, 92)],
  wingBreak: [noise(0, 4150, .078, .32, 510), noise(.071, 2890, .14, .30, 720), pulse(.044, 510, .17, .19, 77), triangle(.13, 155, .33, .32, 40), noise(.22, 1690, .14, .15, 220)],
  reload: [noise(0, 1340, .054, .20, 430), triangle(.058, 165, .07, .23), noise(.14, 1840, .05, .17, 650)],
  rearmed: [triangle(0, 392, .061, .24), pulse(.082, 494, .061, .18), pulse(.151, 659, .125, .17)],
  wave: [...phrase(pulse, 0, .083, [392, 440, 523, 659], .21), triangle(0, 131, .18, .24), triangle(.20, 196, .19, .26)],
  gate: [triangle(0, 659, .14, .26), triangle(.089, 988, .19, .25), pulse(.099, 494, .115, .12)],
  lessonStep: [...phrase(pulse, 0, .086, [392, 494, 587], .18), triangle(0, 196, .21, .24), triangle(.250, 784, .25, .25), pulse(.257, 494, .17, .115)],
  won: [...phrase(pulse, 0, .083, [392, 494, 587, 784, 988], .20), triangle(0, 196, .21, .27), triangle(.25, 247, .18, .25), pulse(.43, 784, .32, .21), triangle(.43, 196, .34, .29)],
  lost: [...phrase(pulse, 0, .112, [370, 330, 262, 196], .18), noise(0, 2250, .28, .24, 210), triangle(.38, 98, .36, .32, 52)],
  decoy: [pulse(0, 784, .072, .15, 392), noise(.008, 2100, .081, .17, 590), triangle(.104, 622, .09, .20, 311)],
  miss: [triangle(0, 523, .087, .23), triangle(.095, 349, .12, .22, 247)]
};

const triangleSample = phase => 1 - 4 * Math.abs(phase - .5);
const quantize = sample => Math.max(-128, Math.min(127, Math.round(sample * 128))) / 128;

function mixNote(samples, note, seed) {
  const offset = Math.round(note.at * RATE), count = Math.round(note.seconds * RATE);
  const attack = Math.min(count / 5, .004 * RATE), release = Math.min(count / 3, .018 * RATE);
  let phase = 0, lfsr = seed, filtered = 0;
  for (let i = 0; i < count; i++) {
    const portion = i / count;
    // Frequency changes land on discrete sound-driver ticks.
    const glide = Math.floor(portion * 24) / 23;
    const hz = note.hz + (note.end - note.hz) * glide;
    phase += hz / RATE;
    if (phase >= 1) {
      phase -= 1;
      const feedback = (lfsr ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (feedback << 14);
    }
    let raw;
    if (note.wave === 'triangle') raw = triangleSample(phase);
    else if (note.wave === 'noise') raw = (lfsr & 1) ? 1 : -1;
    else raw = phase < .3 ? 1 : -3 / 7; // Asymmetric pulse with zero mean.
    filtered += .56 * (raw - filtered);
    const edge = Math.min(1, i / attack, (count - 1 - i) / release);
    const decay = note.wave === 'noise' ? (1 - portion) ** 2 : 1 - .42 * portion;
    samples[offset + i] += filtered * note.gain * edge * decay;
  }
}

function engineLoop(context) {
  const count = RATE / 2, buffer = context.createBuffer(1, count, RATE);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < count; i++) {
    const t = i / count;
    // Each partial completes an integer number of cycles in this half-second loop.
    const bass = triangleSample((26 * t + .25) % 1);
    const buzz = triangleSample((53 * t + .25) % 1);
    const rumble = .82 + .18 * triangleSample((4 * t + .25) % 1);
    samples[i] = quantize((.105 * bass + .045 * buzz) * rumble);
  }
  return buffer;
}

export function createChipBank(context) {
  const bank = new Map();
  for (const [id, notes] of Object.entries(effects)) {
    const seconds = Math.max(...notes.map(note => note.at + note.seconds));
    const side = id === 'rollLeft' ? -1 : id === 'rollRight' ? 1 : 0;
    const buffer = context.createBuffer(side ? 2 : 1, Math.ceil(seconds * RATE) + 1, RATE);
    const samples = buffer.getChannelData(0);
    notes.forEach((note, i) => mixNote(samples, note, 0x4935 ^ (i * 313)));
    if (side) {
      const right = buffer.getChannelData(1);
      for (let i = 0; i < samples.length; i++) {
        const pan = side * .66 * Math.sin(Math.PI * i / samples.length);
        right[i] = quantize(samples[i] * (1 + Math.min(0, pan)));
        samples[i] = quantize(samples[i] * (1 - Math.max(0, pan)));
      }
    } else {
      for (let i = 0; i < samples.length; i++) samples[i] = quantize(samples[i]);
    }
    bank.set(id, buffer);
  }
  bank.set('engineLoop', engineLoop(context));
  return bank;
}
