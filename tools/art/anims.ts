// Animations generated as video with Higgsfield (Kling 4.0 image-to-video), then cut into sprite sheets.
// Key frames: tools/art/out/keys/<subject>.png (subject on a flat chroma colour, see keyframe.ts).
// Loops pass the same image as start and end frame so the cycle closes; one-shots pass only the start.

export interface AnimSpec {
  key: string;
  subject: string;
  loop: boolean;
  /** Frames kept in the sheet and playback rate. */
  frames: number;
  fps: number;
  /** Chroma colour of the key frame. */
  chroma: string;
  /** Sheet cell height in px (width follows the union box). */
  cellH: number;
  action: string;
}

/** Appended to every motion prompt (camera lock, prop inertia, facing lock). */
export const MOTION_LOCK =
  'Camera locked, no camera movement, no zoom, no cut, subject stays fully in frame, plain static flat background of the same colour, ' +
  'the character performs ONLY this action and nothing else happens, keeps facing the same direction for the whole video, ' +
  'same art style as the image: hand-drawn cartoon with thick ink outlines, no new objects appear.';

const hero = (w: string, action: string, frames: number): AnimSpec[] => [
  { key: `hero_${w}_walk`, subject: `hero_${w}`, loop: true, frames: 12, fps: 12, chroma: '00b050', cellH: 220, action: 'walks in place with a steady heavy stride, weapon held still at his side, a full walk cycle that repeats' },
  { key: `hero_${w}_attack`, subject: `hero_${w}`, loop: false, frames, fps: 24, chroma: '00b050', cellH: 220, action },
];

export const ANIMS: AnimSpec[] = [
  {
    key: 'forge_strike',
    subject: 'smith_anvil',
    loop: false,
    frames: 14,
    fps: 24,
    chroma: '00b050',
    cellH: 560,
    action:
      'the blacksmith brings the raised hammer straight down in one heavy blow onto the top of the anvil, the hammer stops on the anvil face and stays resting there; the anvil itself never moves',
  },
  ...hero('sword', 'performs one single fast horizontal sword slash to the right, strong wind-up, sharp swing, short follow-through, then stops', 12),
  ...hero('spear', 'performs one single fast forward spear thrust to the right, the spear stabs out and pulls back once', 12),
  ...hero('axe', 'performs one single powerful full spinning axe attack, turning around once with the axe swung wide, ending facing right again', 14),
  ...hero('hammer', 'performs one single heavy overhead hammer smash down in front of him, the hammer hits the ground once', 12),
  { key: 'skeleton_walk', subject: 'skeleton', loop: true, frames: 10, fps: 10, chroma: '00b050', cellH: 160, action: 'shambles forward in place with a creepy jerky undead walk cycle that repeats' },
  { key: 'slime_walk', subject: 'slime', loop: true, frames: 10, fps: 12, chroma: 'ff00ff', cellH: 150, action: 'bounces and squishes in place, squash and stretch, a bouncy movement cycle that repeats' },
];
