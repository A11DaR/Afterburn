// The cockpit altimeter uses ten game feet per map unit.
export const METRES_PER_UNIT = 3.048;

export function scanTerrain(plane, travel, climb) {
  const sn = Math.sin(plane.trackYaw), cs = Math.cos(plane.trackYaw);
  const clearanceAt = (seconds, forward, right) => plane.alt + climb * seconds -
    plane.heightAt(plane.x + forward * sn + right * cs, plane.z + forward * cs - right * sn);

  const wasDanger = plane.groundWarning;
  const shortMargin = Math.min(...[.4, .9, 1.55].map(t => clearanceAt(t, travel * t, 0)));
  plane.groundWarning = plane.clearance < (wasDanger ? 16 : 13) || shortMargin < (wasDanger ? 11 : 8);
  const wasLow = plane.lowAltitude;
  plane.lowAltitude = plane.clearance < (wasLow ? 36 : 30);
  plane.bankWarning = !plane.roll && plane.clearance < (plane.bankWarning ? 86 : 72) &&
    Math.abs(plane.baseBank) > (plane.bankWarning ? .98 : 1.15);

  // Compare two curved routes across the same height map used by collision detection.
  let straight = Infinity, left = Infinity, right = Infinity;
  const turnRate = .34, radius = travel / turnRate;
  for (let i = 1; i <= 12; i++) {
    const t = i * .25, angle = t * turnRate;
    const forward = radius * Math.sin(angle), lateral = radius * (1 - Math.cos(angle));
    straight = Math.min(straight, clearanceAt(t, travel * t, 0));
    left = Math.min(left, clearanceAt(t, forward, -lateral));
    right = Math.min(right, clearanceAt(t, forward, lateral));
  }
  plane.leftMargin = left;
  plane.rightMargin = right;
  const best = Math.max(left, right), advantage = Math.abs(right - left);
  const keep = plane.terrainTurn !== 0;
  plane.terrainTurn = straight < (keep ? 28 : 21) && best > 15 && best - straight > 9 &&
    advantage > (keep ? 6 : 12) ? Math.sign(right - left) : 0;
  if (plane.groundWarning && !wasDanger) plane.emit('ground');
  else if (plane.lowAltitude && !wasLow && !plane.groundWarning) plane.emit('skim');
}

export function advisedRoll(plane) {
  if (plane.groundWarning || plane.bankWarning || plane.wingLoss || plane.roll) return 0;
  if (plane.terrainTurn) return plane.terrainTurn;
  const threat = plane.threats.find(t => !t.free && t.ttl <= 2.85);
  if (!threat || Math.max(plane.leftMargin, plane.rightMargin) < 15) return 0;
  if (plane.leftMargin < 15) return 1;
  if (plane.rightMargin < 15) return -1;
  return threat.evadeSide;
}
