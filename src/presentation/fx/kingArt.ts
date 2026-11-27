// The king, drawn in code (no image): cloak, fur collar, long head, spiked crown, burning eyes and a
// fanged grin. Shared by the wrath scene (unpaid rent) and the first-time story cutscene.
import Phaser from 'phaser';

type P = [number, number];
const pts = (list: P[]) => list.map(([x, y]) => new Phaser.Math.Vector2(x, y));

export interface KingParts {
  king: Phaser.GameObjects.Container;
  rim: Phaser.GameObjects.Graphics;
  eyes: Phaser.GameObjects.Container;
  eyeGlow: Phaser.GameObjects.Graphics;
  mouth: Phaser.GameObjects.Graphics;
}

/** The king at (x, y) (the line of his shoulders). Eyes start closed (scaleY 0.05), the grin hidden. */
export function drawKing(scene: Phaser.Scene, x: number, y: number): KingParts {
  const king = scene.add.container(x, y);
  const body = scene.add.graphics();
  // cloak and shoulders
  body.fillStyle(0x070405, 1).fillPoints(pts([[-640, 520], [-470, 90], [-230, 0], [-95, -40], [95, -40], [230, 0], [470, 90], [640, 520]]), true);
  // fur collar: a row of ragged spikes along the shoulders
  body.fillStyle(0x1a0e12, 1);
  for (let i = -7; i <= 7; i++) {
    const cx = i * 52;
    const cy = Math.abs(i) * 13 - 30;
    body.fillTriangle(cx - 34, cy + 40, cx + 34, cy + 40, cx + (i % 2 ? 10 : -10), cy - 34);
  }
  // head, long and narrow
  body.fillStyle(0x050304, 1).fillEllipse(0, -165, 210, 270);
  // crown: a band and five spikes, dull gold with red gems
  body.fillStyle(0x4a3008, 1).fillRect(-120, -300, 240, 40);
  const spikes: P[] = [[-120, -300], [-110, -400], [-75, -300], [-50, -430], [-20, -300], [0, -470], [20, -300], [50, -430], [75, -300], [110, -400], [120, -300]];
  body.fillStyle(0x4a3008, 1).fillPoints(pts(spikes), true);
  body.lineStyle(4, 0xb8862b, 0.55).strokePoints(pts(spikes), false);
  body.lineStyle(3, 0xb8862b, 0.5).strokeRect(-120, -300, 240, 40);
  for (const gx of [-80, 0, 80]) body.fillStyle(0xd11f2a, 1).fillCircle(gx, -280, 9);
  king.add(body);

  // red rim light on the outline
  const rim = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  rim.lineStyle(6, 0xff2a1a, 0.35).strokeEllipse(0, -165, 214, 274);
  rim.lineStyle(5, 0xff2a1a, 0.25).strokePoints(pts([[-640, 520], [-470, 90], [-230, 0], [-95, -40]]), false);
  rim.lineStyle(5, 0xff2a1a, 0.25).strokePoints(pts([[95, -40], [230, 0], [470, 90], [640, 520]]), false);
  king.add(rim);

  // eyes: two slits that open, with a burning glow
  const eyes = scene.add.container(0, -180);
  const eyeGlow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  for (const ex of [-48, 48]) for (let i = 4; i >= 1; i--) eyeGlow.fillStyle(0xff3a1a, 0.12 * i).fillEllipse(ex, 0, 50 + i * 26, 18 + i * 14);
  const eyeCore = scene.add.graphics();
  for (const ex of [-48, 48]) {
    eyeCore.fillStyle(0xff2a1a, 1).fillEllipse(ex, 0, 58, 20);
    eyeCore.fillStyle(0xffe08a, 1).fillEllipse(ex, 0, 12, 16);
  }
  eyes.add([eyeGlow, eyeCore]);
  eyes.setScale(1, 0.05);
  king.add(eyes);

  // a wide jagged grin, hidden until he speaks: a dark red maw with long fangs top and bottom
  const mouth = scene.add.graphics().setAlpha(0);
  const top = (mx: number) => -112 + (mx / 90) ** 2 * -22;
  const bot = (mx: number) => -52 - (mx / 90) ** 2 * 10;
  const maw: P[] = [];
  for (let mx = -90; mx <= 90; mx += 15) maw.push([mx, top(mx)]);
  for (let mx = 90; mx >= -90; mx -= 15) maw.push([mx, bot(mx)]);
  mouth.fillStyle(0x4a0606, 1).fillPoints(pts(maw), true);
  mouth.fillStyle(0xe6ddd0, 1);
  for (let mx = -78; mx <= 78; mx += 19.5) {
    mouth.fillTriangle(mx - 9, top(mx) + 2, mx + 9, top(mx) + 2, mx, top(mx) + 30);
    mouth.fillTriangle(mx - 8 + 9, bot(mx) - 2, mx + 8 + 9, bot(mx) - 2, mx + 9, bot(mx) - 24);
  }
  mouth.lineStyle(3, 0xff2a1a, 0.5).strokePoints(pts(maw), true);
  king.add(mouth);

  return { king, rim, eyes, eyeGlow, mouth };
}
