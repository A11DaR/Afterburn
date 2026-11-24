// The little cel drawings use the same integer pixels as the aircraft art.
function cel(rows, inks) {
  const runs = [];
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length;) {
      const first = x, ink = row[x++];
      while (x < row.length && row[x] === ink) x++;
      if (inks[ink]) runs.push([first, y, x - first, inks[ink]]);
    }
  }
  return { w: Math.max(...rows.map(row => row.length)), h: rows.length, runs, bitmap: null };
}

function stamp(ctx, sprite, x, y, width, height) {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const l = Math.round(x - w / 2), top = Math.round(y - h / 2);
  if (!sprite.bitmap) {
    const tile = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(sprite.w, sprite.h)
      : ctx.canvas?.ownerDocument?.createElement('canvas');
    if (tile) {
      tile.width = sprite.w;
      tile.height = sprite.h;
      const ink = tile.getContext('2d');
      for (const [u, v, n, colour] of sprite.runs) {
        ink.fillStyle = colour;
        ink.fillRect(u, v, n, 1);
      }
      sprite.bitmap = tile;
    }
  }
  if (sprite.bitmap) {
    ctx.drawImage(sprite.bitmap, l, top, w, h);
    return;
  }
  // Also works on DOM-free software canvases.
  for (const [u, v, n, colour] of sprite.runs) {
    const x0 = Math.round(u * w / sprite.w), y0 = Math.round(v * h / sprite.h);
    ctx.fillStyle = colour;
    ctx.fillRect(l + x0, top + y0, Math.round((u + n) * w / sprite.w) - x0,
      Math.round((v + 1) * h / sprite.h) - y0);
  }
}

const smoke = cel([
  '.....4444.......', '...4466654......', '..466555554.33..',
  '..4555333354454.', '.455333553355554', '4533335444333554',
  '3333355433223353', '.323335322222353', '.233322221122233',
  '..2332221122233.', '...32221122223..', '....22222333....',
  '......222.......'
], [null, '#35313b', '#443b44', '#57474b', '#67565a', '#776468', '#897375']);

const fireRows = [
  '......344.......', '..34.34554......', '..344555554..2..',
  '.34555566544432.', '.345666666555432', '3456666655665432',
  '3456665545566543', '3456555456655532', '.34554455554332.',
  '.23445555443332.', '..233444332222..', '...223332222....',
  '.....222........'
];
const fire = cel(fireRows, [null, '#6b3b3d', '#9b4035', '#d25931', '#f5883d', '#ffc568', '#fff3b9']);
const ember = cel(fireRows, [null, '#493c44', '#604144', '#80463e', '#a75038', '#cc693d', '#f89f54']);
const core = cel([
  '.....223.....', '....23332....', '..233343.22..', '.23344433332.',
  '2334444443332', '2334444444432', '.233344444332', '..2334433332.',
  '..223333322..', '....22222....'
], [null, null, '#ff993f', '#ffd873', '#fff5cf']);

// Horizontal offset, vertical offset, diameter. The upper puffs lift first.
const smokePuffs = [
  [-.40, -.12, .80], [.32, -.20, .89], [-.03, -.44, .94],
  [.39, .16, .72], [-.24, .21, .82], [.06, .06, .91]
];
const firePuffs = [
  [-.35, -.17, .75], [.19, -.28, .78], [.37, .15, .60],
  [-.18, .22, .70], [.01, .04, .96]
];
const rim = [
  [[-.99, -.04], [-.91, -.28], [-.66, -.48], [-.37, -.58]],
  [[.02, -.63], [.30, -.60], [.51, -.52]],
  [[.82, -.36], [.97, -.15], [1, .03]],
  [[.82, .35], [.57, .51], [.29, .61]],
  [[-.12, .64], [-.42, .57], [-.66, .44]]
];
// Angle, travel, shard size and release time. Uneven spacing leaves gaps in the spray.
const shards = [
  [.10, 1.27, .040, .03], [.28, .93, .025, .12], [.86, 1.04, .048, .02],
  [1.49, .85, .027, .15], [1.91, 1.19, .043, .05], [2.46, .95, .029, .13],
  [2.71, 1.34, .056, .01], [3.25, 1.09, .032, .10], [3.83, 1.24, .045, .035],
  [4.04, .84, .021, .16], [4.72, 1.28, .038, .06], [5.44, 1.17, .051, .02]
].map(([a, travel, size, release]) => [Math.cos(a), Math.sin(a), travel, size, release]);

const unit = value => Math.max(0, Math.min(1, value));
const easeOut = value => 1 - (1 - unit(value)) ** 3;

function strokePixels(ctx, x0, y0, x1, y1, pixel) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / pixel));
  for (let i = 0; i <= steps; i++) {
    ctx.fillRect(Math.round(x0 + dx * i / steps), Math.round(y0 + dy * i / steps), pixel, pixel);
  }
}

function fragments(ctx, x, y, r, t, turn, opacity, reduced) {
  const co = Math.cos(turn), si = Math.sin(turn);
  for (let i = 0; i < shards.length; i++) {
    if (reduced && i % 3 !== 0) continue;
    const [u, v, travel, size, release] = shards[i];
    const age = unit((t - release) / (1 - release));
    if (!age) continue;
    const d = .10 + travel * (.79 * easeOut(age / .56) + .21 * age);
    const dx = u * co - v * si, dy = (u * si + v * co) * .83;
    const sx = x + dx * d * r, sy = y + (dy * d + .20 * age * age) * r;
    const pixel = Math.max(1, Math.round(r * size));
    const metal = i % 3 === 0;
    ctx.globalAlpha = opacity * unit((1 - age) * 3.5);
    if (!reduced && age < .78) {
      const tail = r * (.12 + size * 4.4) * (1 - age);
      ctx.fillStyle = metal ? '#87524a' : '#c75c38';
      strokePixels(ctx, sx - dx * tail, sy - dy * tail, sx, sy, Math.max(1, Math.round(pixel * .63)));
      ctx.fillStyle = age < .48 ? '#ffb95f' : '#de7947';
      strokePixels(ctx, sx - dx * tail * .48, sy - dy * tail * .48, sx, sy, Math.max(1, Math.round(pixel * .78)));
    }
    ctx.fillStyle = metal ? '#453d43' : '#e9803e';
    ctx.fillRect(Math.round(sx), Math.round(sy), pixel * (metal ? 2 : 1), pixel);
    if (metal && pixel > 1) ctx.fillRect(Math.round(sx + dx * pixel), Math.round(sy + dy * pixel), pixel, pixel);
    ctx.fillStyle = age < .50 ? '#ffe29a' : '#e99957';
    ctx.fillRect(Math.round(sx), Math.round(sy - pixel * .5), Math.max(1, pixel), Math.max(1, Math.round(pixel * .6)));
  }
}

// Screen-space centre and radius, age / lifetime, and a seed held constant for this burst.
export function drawMissileBurst(ctx, x, y, radius, progress, seed = 0, reduced = false) {
  if (!(radius > 0 && progress >= 0 && progress < 1)) return;
  const t = progress, motion = reduced ? .43 : t;
  const turn = (seed * 2.399963) % (Math.PI * 2), wind = Math.sin(turn) * .14;
  const hand = Math.cos(turn) < 0 ? -1 : 1;
  const spread = .09 + .91 * easeOut(motion * 1.72);
  const smokeScale = .11 + .91 * easeOut(motion * 1.54);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const opacity = ctx.globalAlpha;
  if (!reduced && t < .34 && radius >= 8) {
    const extent = radius * (.24 + .82 * easeOut(t / .35));
    const pixel = Math.max(1, Math.round(radius / 49));
    ctx.globalAlpha = opacity * .74 * unit((.34 - t) / .22);
    ctx.fillStyle = '#ffe2aa';
    for (const arc of rim) {
      for (let j = 1; j < arc.length; j++) {
        const [u, v] = arc[j - 1], [uu, vv] = arc[j];
        strokePixels(ctx, x + u * extent, y + v * extent, x + uu * extent, y + vv * extent, pixel);
      }
    }
  }
  ctx.globalAlpha = opacity * (reduced ? .80 : unit(t * 9)) * unit((1 - t) / .37);
  for (const [u, v, diameter] of smokePuffs) {
    const px = x + radius * (hand * u * spread + wind * motion * motion);
    const lift = (.35 - v * .48) * motion * motion;
    const py = y + radius * (v * spread - lift);
    const width = radius * diameter * smokeScale;
    stamp(ctx, smoke, px, py, width, width * (.82 - v * .18));
  }
  if (t < .80) {
    const cooling = unit((.80 - t) / .46);
    const glow = reduced ? .40 : unit((.56 - t) / .22);
    const fireScale = (.31 + .72 * easeOut(motion / .38)) * (.19 + .81 * cooling);
    const drift = radius * .12 * motion * motion;
    for (const [u, v, diameter] of firePuffs) {
      const px = x + hand * u * radius * spread, py = y + v * radius * spread - drift;
      const width = diameter * radius * fireScale, height = width * (.86 - v * .2);
      if (glow < 1) {
        ctx.globalAlpha = opacity * unit(cooling * 2.4);
        stamp(ctx, ember, px, py, width, height);
      }
      if (glow > 0) {
        ctx.globalAlpha = opacity * glow * unit(cooling * 2.4);
        stamp(ctx, fire, px, py, width, height);
      }
    }
    if (!reduced && t < .37) {
      const width = radius * (.36 + .27 * easeOut(t / .17)) * unit((.37 - t) / .18);
      ctx.globalAlpha = opacity * unit((.37 - t) / .15);
      stamp(ctx, core, x - radius * .04 * hand, y - radius * .035, width, width * .76);
    }
  }
  fragments(ctx, x, y, radius, motion, turn, opacity * (reduced ? .72 * unit((1 - t) / .32) : 1), reduced);
  ctx.restore();
}

// One fracture starts at the smoked-over chip, then forks as the hull takes more damage.
const fractures = [
  [[0, 37], [5, 36], [9, 38], [15, 34], [22, 31], [28, 25], [37, 24], [43, 19], [50, 18]],
  [[15, 34], [17, 25], [21, 21], [20, 17], [25, 10]],
  [[15, 35], [23, 38], [30, 37], [36, 43], [43, 45]],
  [[13, 36], [15, 42], [12, 47], [15, 53]],
  [[12, 33], [7, 26], [5, 22]],
  [[22, 31], [23, 36], [30, 37]],
  [[37, 24], [42, 26], [48, 24], [55, 25]],
  [[50, 18], [56, 12], [65, 13], [70, 8]],
  [[36, 43], [38, 50], [47, 58], [49, 64]],
  [[17, 25], [13, 18], [14, 12], [9, 5]],
  [[21, 21], [28, 25]], [[15, 42], [23, 38]],
  [[70, 8], [74, 8], [80, 3]], [[43, 45], [53, 43], [58, 47], [69, 47]],
  [[47, 58], [52, 58], [60, 64]], [[65, 13], [71, 17], [78, 15]]
];
const soot = [
  '.....22.........', '..122332..1.....', '12233333212..1..',
  '233443333222....', '3344444433322.1.', '33445544433322..',
  '3445555444332...', '34455455443332..', '2334444443322.1.',
  '223334433222....', '.1223332231.....', '...122212.......',
  '....1..1........'
];
const glassInks = [null, 'rgba(62,53,56,.22)', 'rgba(65,54,53,.36)', 'rgba(67,54,53,.56)',
  'rgba(56,49,50,.73)', '#393539', 'rgba(40,48,54,.70)', 'rgba(235,228,205,.79)', '#ffedc8', '#bc8564'];

function canopyCel(stage) {
  const rows = Array.from({ length: 67 }, () => new Uint8Array(82));
  const dot = (x, y, value) => { rows[y][x] = value; };
  for (let y = 0; y < soot.length; y++) {
    for (let x = 0; x < soot[y].length; x++) {
      if (soot[y][x] !== '.') dot(x, 29 + y, Number(soot[y][x]));
    }
  }
  const paths = fractures.slice(0, [5, 10, 16][stage]);
  for (const [dy, ink] of [[1, 6], [0, 7]]) {
    for (const path of paths) {
      for (let j = 1; j < path.length; j++) {
        const [x, y] = path[j - 1], [xx, yy] = path[j];
        const n = Math.max(Math.abs(xx - x), Math.abs(yy - y));
        for (let i = 0; i <= n; i++) dot(Math.round(x + (xx - x) * i / n), dy + Math.round(y + (yy - y) * i / n), ink);
      }
    }
  }
  for (const [u, v] of [[12, 33], [13, 34], [14, 35], [15, 34], [18, 32], [28, 25]]) dot(u, v, 8);
  for (const [u, v] of [[3, 31], [7, 34], [8, 34], [9, 39], [6, 40]]) dot(u, v, 9);
  return cel(rows, glassInks);
}

const canopyCels = [0, 1, 2].map(canopyCel);

// Side is -1 on the left or +1 on the right. Hull is the 0–100 instrument reading.
export function drawCanopyDamage(ctx, view, hull, side = 1) {
  if (!(hull < 100)) return;
  const sprite = canopyCels[hull > 58 ? 0 : hull > 28 ? 1 : 2];
  const scale = Math.min(view.w * .0026, view.h * .0047);
  const width = Math.round(sprite.w * scale), height = Math.round(sprite.h * scale);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha *= .72 + .26 * unit((100 - hull) / 100);
  ctx.translate(side < 0 ? 0 : view.w, Math.round(view.h * .32 - height / 2));
  if (side >= 0) ctx.scale(-1, 1);
  stamp(ctx, sprite, width / 2, height / 2, width, height);
  ctx.restore();
}
