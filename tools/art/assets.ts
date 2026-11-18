// Art direction v2 (2026-11-18 user feedback): hand-drawn cartoon world art with thick ink outlines,
// muted earthy colours and warm glowing accents, seen from a top-down three-quarter view.
// Described in our own words; no screenshots of other games are used as references.

export const STYLE_V2 =
  'Hand-drawn 2D cartoon game art, thick dark brown ink outlines, muted earthy desaturated palette with warm glowing orange accents, ' +
  'flat painterly shading with soft brush texture, whimsical dark Nordic fantasy mood, clean readable shapes.';

export interface AssetSpec {
  key: string;
  prompt: string;
  aspect: '16:9' | '1:1' | '4:3' | '3:4' | '21:9' | '9:16';
  transparent: boolean;
  /** Keys of already generated assets (tools/art/out/v2/<key>.png) used as image references. */
  refs?: string[];
}

const SPRITE = 'Single game sprite, whole subject fully visible with empty margin, no ground shadow, no text, no frame.';

const SMITH =
  'a stocky middle-aged human blacksmith hero with a thick braided auburn beard, bald head with a soot smudge, ' +
  'muscular forearms, rolled-up linen sleeves, heavy brown leather apron, thick work gloves, sturdy boots';

const HERO_WEAPON = {
  sword: 'holding a plain steel longsword in his right hand, blade pointing forward and slightly down',
  spear: 'holding a long wooden spear with a steel spearhead in both hands, pointing forward',
  axe: 'holding a heavy steel battle axe in both hands at his side',
  hammer: 'holding a heavy blacksmith forging hammer in his right hand',
} as const;

export const ASSETS: AssetSpec[] = [
  {
    key: 'forge_bg',
    aspect: '16:9',
    transparent: false,
    prompt:
      'Wide interior of a cozy blacksmith forge at night, front view. Stone walls and wooden beams, a big glowing furnace with embers in the back centre, ' +
      'tools, tongs and finished weapons hanging on the walls, barrels and a quench bucket, warm orange firelight spilling over a worn stone floor. ' +
      'The centre foreground floor is open and empty (an anvil will be placed there). The far left and far right edges are darker and calmer. ' +
      `${STYLE_V2} No characters, no text.`,
  },
  {
    key: 'forge_rack_bg',
    aspect: '16:9',
    transparent: false,
    refs: ['forge_bg'],
    prompt:
      'The same cozy blacksmith forge interior as the reference image, same style and colours, front view, at night. ' +
      'On the LEFT wall hangs one large wooden weapon display rack, built into the wall: a sturdy timber frame with exactly 8 empty horizontal display shelves, ' +
      'arranged as 2 columns by 4 rows, each shelf a dark wooden plank with two empty iron hooks for hanging one weapon horizontally. All 8 shelves are EMPTY, evenly spaced, clearly separated. ' +
      'The rack fills the left 40 percent of the picture from near the top to the lower third. The glowing furnace is in the back centre-right. ' +
      'The centre-right foreground floor is open and empty (a blacksmith and anvil will stand there). The far right edge is darker and calmer. ' +
      `${STYLE_V2} No characters, no weapons on the rack, no text.`,
  },
  {
    key: 'night_ground',
    aspect: '1:1',
    transparent: false,
    prompt:
      'Seamless tileable top-down ground texture for a game map at night: cracked dark flagstones mixed with patches of dead grass, dirt and moss, ' +
      'scattered pebbles, cool blue moonlight tint, low contrast so characters stand out, no large objects, evenly distributed detail, edges wrap seamlessly. ' +
      `${STYLE_V2} No characters, no text.`,
  },
  {
    key: 'anvil',
    aspect: '4:3',
    transparent: true,
    refs: ['forge_bg'],
    prompt: `A heavy dark iron blacksmith anvil standing on a thick wooden tree stump, front three-quarter view, worn edges catching warm firelight. ${SPRITE} ${STYLE_V2}`,
  },
  {
    key: 'hammer',
    aspect: '21:9',
    transparent: true,
    refs: ['forge_bg'],
    prompt: `A sturdy blacksmith forging hammer lying horizontally, leather-wrapped wooden handle on the left, heavy square iron head on the right, scuffed and well used. ${SPRITE} ${STYLE_V2}`,
  },
  {
    key: 'smith_raise',
    aspect: '3:4',
    transparent: true,
    refs: ['forge_bg'],
    prompt: `Full body of ${SMITH}, three-quarter front view facing left, both hands gripping a forging hammer raised high above his right shoulder, ready to strike, determined expression. ${SPRITE} ${STYLE_V2}`,
  },
  {
    key: 'skeleton',
    aspect: '1:1',
    transparent: true,
    refs: ['forge_bg'],
    prompt: 'A small hunched undead skeleton warrior with glowing red eye sockets, a rusty dented helmet and tattered cloth, top-down three-quarter view facing the viewer, menacing but cartoonish. ' + `${SPRITE} ${STYLE_V2}`,
  },
  {
    key: 'slime',
    aspect: '1:1',
    transparent: true,
    refs: ['forge_bg'],
    prompt: 'A round sickly green blob slime with a glowing orange molten core visible inside, bubbling and about to explode, angry little eyes, top-down three-quarter view. ' + `${SPRITE} ${STYLE_V2}`,
  },
  {
    key: 'props',
    aspect: '16:9',
    transparent: true,
    refs: ['forge_bg'],
    prompt:
      'A sprite sheet of six separate top-down three-quarter view map decorations for a dark night field, evenly spaced in a 3 by 2 grid with wide empty gaps between them, nothing touching: ' +
      'a gnarled dead tree, a mossy boulder, a carved rune stone, a cluster of glowing pale blue crystals, a broken wooden cart wheel, a cracked old gravestone. ' +
      `No ground under them, no shadows, no text. ${STYLE_V2}`,
  },
  {
    key: 'morr',
    aspect: '3:4',
    transparent: true,
    refs: ['forge_bg'],
    prompt: 'Upper body portrait of a mysterious hooded travelling merchant with a long grey beard, glowing amber eyes in the shadow of the hood, a big patched backpack full of trinkets, holding a small lantern, sly friendly smile. ' + `${SPRITE} ${STYLE_V2}`,
  },
  // 2026-11-18 round 2: front-view forge composition, weapon rack, armed hero key poses
  {
    key: 'smith_anvil',
    aspect: '3:4',
    transparent: true,
    refs: ['smith_raise', 'anvil'],
    prompt:
      'Front view, camera facing the scene: the same blacksmith as the first reference image, identical design and colours, standing directly BEHIND the same heavy iron anvil on a tree stump as the second reference image. ' +
      'The anvil is in the foreground and covers his legs; its flat top face is clear and empty at chest height of the viewer. Both his hands grip the forging hammer raised high above his head, ready to strike straight down onto the centre of the anvil. ' +
      `Whole figure and whole anvil fully visible with empty margin above the hammer and around everything. ${SPRITE} ${STYLE_V2}`,
  },
  {
    key: 'rack_slot',
    aspect: '21:9',
    transparent: true,
    refs: ['forge_bg'],
    prompt:
      'A single empty wall-mounted weapon display board: a horizontal dark wooden plank with iron corner brackets and two empty iron hooks on top to hang one weapon horizontally, seen from the front. ' +
      `Plain, no weapon on it. ${SPRITE} ${STYLE_V2}`,
  },
  {
    key: 'padlock',
    aspect: '1:1',
    transparent: true,
    refs: ['forge_bg'],
    prompt: 'A big heavy old iron padlock with a keyhole and a rusty shackle, wrapped with a short length of iron chain, front view. ' + `${SPRITE} ${STYLE_V2}`,
  },
  {
    key: 'lock_key',
    aspect: '1:1',
    transparent: true,
    refs: ['forge_bg'],
    prompt: 'An ornate antique iron-and-brass key for a weapon rack lock, Nordic knot pattern on the bow, lying diagonally. ' + `${SPRITE} ${STYLE_V2}`,
  },
  ...(['sword', 'spear', 'axe', 'hammer'] as const).map(
    (w): AssetSpec => ({
      key: `hero_${w}`,
      aspect: '1:1',
      transparent: true,
      refs: ['player_top'],
      prompt:
        `The same blacksmith character as the reference image, identical design and colours, small game character seen from a top-down three-quarter view, facing right, ` +
        `${HERO_WEAPON[w]}, ready combat stance. Full body in frame with wide empty margin on all sides for the weapon swing. ${SPRITE} ${STYLE_V2}`,
    }),
  ),
  // second wave: poses that must match the first smith image
  {
    key: 'smith_strike',
    aspect: '3:4',
    transparent: true,
    refs: ['smith_raise'],
    prompt: `The same blacksmith character as the reference image, identical design and colours, full body, three-quarter front view facing left, swinging the forging hammer down to the lower left at the end of a strike, body leaning forward. ${SPRITE} ${STYLE_V2}`,
  },
  {
    key: 'player_top',
    aspect: '1:1',
    transparent: true,
    refs: ['smith_raise'],
    prompt: `The same blacksmith character as the reference image, identical design and colours, small game character seen from a top-down three-quarter view, standing ready in a combat stance facing right, empty hands. ${SPRITE} ${STYLE_V2}`,
  },
];
