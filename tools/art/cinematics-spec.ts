// Cutscene production data (docs/HIGGSFIELD_CINEMATICS.md). Three stages:
//   refs   — character / place reference images (keep faces and the anvil consistent)
//   frames — the first frame of every scene, made from the refs
//   videos — Kling 4.0 image-to-video from each first frame
export const CINE_STYLE =
  'Dark fantasy cinematic, multiverse, blacksmith, cosmic forge. Deep shadows, red-orange forge fire against black metal, violet dimensional rifts, ' +
  'realistic molten metal and steel textures, volumetric light, subtle film grain, epic cinematic composition, no text, no logos, no watermarks, no letters.';

export interface CineImage {
  key: string;
  aspect: '16:9' | '1:1' | '3:4';
  /** Keys of earlier cine images, or `v2:<key>` for game art in tools/art/out/v2. */
  refs: string[];
  prompt: string;
}

export interface CineVideo {
  key: string;
  frame: string;
  seconds: 5 | 10;
  motion: string;
}

const NO_TEXT = 'No text, no logos, no letters anywhere in the image.';

export const REFS: CineImage[] = [
  {
    key: 'ref_smith',
    aspect: '3:4',
    refs: ['v2:smith_raise'],
    prompt:
      'Cinematic character reference portrait, realistic dark fantasy, of the same blacksmith as the reference image but rendered realistically: a stocky middle-aged human blacksmith, thick braided auburn beard, bald head with a soot smudge, muscular forearms, rolled-up linen sleeves, heavy brown leather apron with a Nordic knot emblem, thick work gloves. ' +
      `Three-quarter view, upper body, neutral dark background, soft forge light. ${NO_TEXT}`,
  },
  {
    key: 'ref_first',
    aspect: '3:4',
    refs: ['ref_smith'],
    prompt:
      'Cinematic character reference portrait, realistic dark fantasy: THE FIRST, an ancient blacksmith emperor with the SAME face structure and braided beard as the reference man but aged, grey and scarred, wearing a cracked golden mask over the upper half of his face, dark ceremonial plate armor with faint violet forge-runes, a cloak of black iron chain. ' +
      `Three-quarter view, upper body, dark background, violet rim light. ${NO_TEXT}`,
  },
  {
    key: 'ref_alts',
    aspect: '16:9',
    refs: ['ref_smith'],
    prompt:
      'Four alternate-universe versions of the same blacksmith standing side by side, realistic dark fantasy. They share ONLY the same facial structure (eye shape, nose, jaw, brow) with the reference man; ' +
      'everything else differs completely — each is a different ethnicity with a different skin tone and hair, and each wears a completely different outfit design from a different culture: ' +
      '(1) a Black African blacksmith-king in ornate gold and bronze ceremonial armor with a crown of forged rings; ' +
      '(2) an East Asian battle-scarred warrior-smith in lacquered dark lamellar armor and a broken horned helm; ' +
      '(3) a pale Nordic corrupted smith whose skin is cracked with glowing molten metal, wearing charred iron plates and chains; ' +
      '(4) a South Asian hooded wanderer-smith in layered saffron and indigo travel robes, holding a lantern. ' +
      `Full bodies, dark background, dramatic lighting. ${NO_TEXT}`,
  },
  {
    key: 'ref_anvil',
    aspect: '1:1',
    refs: ['v2:anvil'],
    prompt:
      'THE HEART ANVIL: an ancient black-iron anvil on a gnarled oak stump, a pulsing golden heart-shaped light glowing from cracks in its side like a living heart, faint runes, sparks hanging in the air, dark workshop, realistic cinematic lighting. ' + NO_TEXT,
  },
];

const frame = (key: string, refs: string[], prompt: string): CineImage => ({ key, aspect: '16:9', refs, prompt: `${prompt} ${CINE_STYLE}` });

export const FRAMES: CineImage[] = [
  frame('f_intro_01', [], 'A colossal ancient cosmic forge floating in an endless black void, a gigantic celestial hammer raised above a glowing anvil the size of a mountain, golden sparks beginning to scatter like newborn stars.'),
  frame('f_intro_02', ['ref_alts', 'ref_smith'], 'Fractured parallel universes like shards of glass floating in space, each shard showing a different version of the same blacksmith from the reference sheet: a Black African king in gold armor, an East Asian scarred warrior in lacquered armor, a pale Nordic smith cracked with molten metal, a South Asian hooded wanderer in saffron robes. Only their facial structure is shared; ethnicity, skin tone, hair and outfit differ completely.'),
  frame('f_intro_03', ['ref_first'], 'The First, the masked ancient blacksmith emperor, seated upon a massive throne built from black iron and broken weapons, a colossal cosmic forge burning behind him, purple dimensional energy flowing across the throne room floor, seen from a low angle, his head bowed.'),
  frame('f_intro_04', ['ref_alts'], 'An epic battlefield where alternate-universe blacksmith warriors of many different ethnicities and outfit designs (as in the reference sheet, same facial structure only) clash with enchanted weapons: a flaming sword meets a lightning spear, an ice axe throws a frozen shockwave, violet portals torn open in the sky, sparks everywhere.'),
  frame('f_intro_05', ['ref_smith', 'ref_anvil'], 'Inside a small ancient blacksmith workshop at dusk, the reference blacksmith stands before the glowing heart anvil, three unfinished weapons (a sword, a spear and an axe) resting beside the furnace, warm orange firelight against deep shadows.'),
  frame('f_intro_06', ['ref_smith', 'ref_alts'], 'A lonely blacksmith workshop at midnight, three massive purple dimensional portals tearing open in front of the forge, three alternate versions of the blacksmith stepping out with mysterious glowing weapons, each a different ethnicity and outfit design (from the reference sheet) sharing only his facial structure, the reference blacksmith in the foreground gripping a glowing sword, seen from behind his shoulder.'),
  frame('f_boss_25', ['ref_first'], 'The masked emperor The First stands before a vast circular gallery of floating mirror-portals, each portal showing a different burning world, his hand raised as the portals bend toward a single point of light at the center.'),
  frame('f_boss_40', ['ref_anvil'], 'Parallel universes shattering like cracked glass across a black sky, landscapes and forges falling into a violet void, a small blacksmith workshop standing on the last unbroken island of ground, its anvil glowing gold.'),
  frame('f_boss_50', ['ref_first', 'ref_smith', 'ref_anvil'], 'In the last forge at the end of all worlds, The First stands across a giant glowing heart anvil from the protagonist blacksmith, gripping his cracked golden mask with one hand as if about to lift it, both men lit by the golden heart-light between them.'),
  frame('f_ending_a', ['ref_smith'], 'Countless parallel worlds folding together into one calm perfect golden world, glowing figures of alternate blacksmiths fading into light, the protagonist blacksmith standing alone on a peaceful hill, his forge fire extinguished, bittersweet dawn.'),
  frame('f_ending_b', ['ref_smith', 'ref_anvil'], 'The protagonist blacksmith raising his hammer over the heart anvil as golden threads that connect many distant worlds glow across a cosmic night sky, each world a small burning star with its own forge fire.'),
  frame('f_ending_c', ['ref_alts', 'ref_first', 'ref_anvil'], 'All the alternate blacksmiths of different ethnicities and outfits (from the reference sheet) and The First without his mask standing together in a circle around the heart anvil, lowering their weapons at the same moment, a huge burning rune of the forge law hovering above the anvil, warm triumphant light.'),
];

export const VIDEOS: CineVideo[] = [
  { key: 'intro_01', frame: 'f_intro_01', seconds: 10, motion: 'The gigantic celestial hammer strikes the glowing anvil, an explosion of golden sparks bursts outward and the sparks transform into countless galaxies and parallel universes. Slow dramatic camera push-in, monumental scale.' },
  { key: 'intro_02', frame: 'f_intro_02', seconds: 10, motion: 'The camera glides smoothly through the floating fractured shards, passing each alternate version of the blacksmith one after another, glowing dimensional cracks pulse softly. Seamless cinematic camera movement.' },
  { key: 'intro_03', frame: 'f_intro_03', seconds: 10, motion: 'The camera slowly approaches from a low angle as the masked emperor raises his head and looks into the camera, purple energy swirling around the throne, the cosmic forge flaring behind him. Ominous and slow.' },
  { key: 'intro_04', frame: 'f_intro_04', seconds: 10, motion: 'Dynamic sweeping camera across the battlefield as the warriors clash, flaming blades collide with lightning spears, an ice axe unleashes a frozen shockwave, portals tear open. Intense cinematic action.' },
  { key: 'intro_05', frame: 'f_intro_05', seconds: 10, motion: 'Slow cinematic camera orbit around the blacksmith and the anvil, the golden light inside the anvil pulses slowly like a heartbeat, embers drift in the firelight. Intimate and calm.' },
  { key: 'intro_06', frame: 'f_intro_06', seconds: 10, motion: 'The furnace flickers, the three purple portals tear wider and the three alternate blacksmiths step forward, the protagonist raises his glowing sword into a combat-ready stance. Slow suspenseful push-in.' },
  { key: 'boss_25', frame: 'f_boss_25', seconds: 10, motion: 'The emperor closes his raised hand and the mirror-portals slowly bend and drift toward the single point of light at the center, violet energy flowing. Slow orbiting camera, ominous calm.' },
  { key: 'boss_40', frame: 'f_boss_40', seconds: 10, motion: 'The shattered worlds keep breaking apart and falling into the violet void while the camera slowly pulls back to reveal the last small workshop with its glowing anvil. Epic scale.' },
  { key: 'boss_50', frame: 'f_boss_50', seconds: 10, motion: 'The First slowly lifts the cracked golden mask from his face, revealing an older scarred version of the protagonist own face, the protagonist freezes, the golden light of the anvil between them pulses. Tense slow push-in.' },
  { key: 'ending_a', frame: 'f_ending_a', seconds: 10, motion: 'The worlds finish folding into one, the glowing figures fade into light one by one, the camera rises slowly over the lone blacksmith on the hill. Bittersweet and slow.' },
  { key: 'ending_b', frame: 'f_ending_b', seconds: 10, motion: 'The blacksmith strikes the heart anvil once, the golden threads between the worlds snap gently apart and each world drifts away into its own star, every forge flaring alive. Hopeful wide cosmic shot.' },
  { key: 'ending_c', frame: 'f_ending_c', seconds: 10, motion: 'The blacksmiths lower their weapons together, the protagonist hammers the burning rune until it shatters into harmless golden sparks that rain gently over everyone. Warm triumphant slow circling camera.' },
];

// ── v2 (2026-11-18 feedback): the game's own hand-drawn cartoon look, and a very short story.
// Intro = 3 clips of 5 s. Sample first (gsample), batch only after the user approves.
export const GAME_STYLE =
  'Hand-drawn 2D cartoon game illustration, thick dark brown ink outlines, muted earthy palette with warm glowing orange forge light and violet rift light, ' +
  'flat painterly shading with soft brush texture, whimsical dark Nordic fantasy, the same art style as the reference images, clean readable shapes, no text, no letters, no logos.';

export const GAME_FRAMES: CineImage[] = [
  {
    key: 'g_intro_1',
    aspect: '16:9',
    refs: ['v2:forge_bg', 'v2:smith_raise'],
    prompt:
      'A starry night sky full of floating round world-islands, like glowing bubbles in space, each holding its own little forge with a lit furnace. ' +
      'In each nearby world a blacksmith hammers at an anvil: they all share the same face shape as the blacksmith in the second reference, but each is a different ethnicity with different skin tone and hair and a different outfit ' +
      '(an East Asian smith in a lacquered work coat, a Black African smith in gold-trimmed robes, a pale Nordic smith in furs, a South Asian smith in saffron cloth). ' +
      'In the largest world at the center, the blacksmith from the second reference works at his anvil. Sparks drift between the worlds like stars. ' +
      GAME_STYLE,
  },
  {
    key: 'g_intro_2',
    aspect: '16:9',
    refs: ['v2:forge_bg', 'v2:smith_raise'],
    prompt:
      'THE FIRST: an ancient, aged and grey-bearded version of the blacksmith in the second reference, wearing a cracked golden mask over the upper half of his face, dark plate armor with faint violet runes and a cloak of black iron chain, ' +
      'seated on a huge throne built from black iron and broken weapons. Behind him a colossal cosmic forge burns. He points forward commandingly; violet rift energy pours across the floor toward many small portals. Low camera angle, menacing. ' +
      GAME_STYLE,
  },
  {
    key: 'g_intro_3',
    aspect: '16:9',
    refs: ['v2:forge_bg', 'v2:smith_raise'],
    prompt:
      'Inside the blacksmith forge from the first reference image at midnight. Three violet dimensional rifts tear open in front of the furnace. ' +
      'Three alternate versions of the blacksmith step out of the rifts, each holding a mysterious glowing weapon (a sword, a spear, an axe): they share the same face shape as the blacksmith in the second reference, ' +
      'but each is a different ethnicity with different skin tone and hair, and wears a completely different outfit (a Black African king in gold armor, an East Asian warrior in lacquered armor, a pale Nordic smith cracked with molten metal). ' +
      'In the foreground, seen from behind his shoulder, the blacksmith from the second reference grips his hammer, ready to fight. ' +
      GAME_STYLE,
  },
];

export const GAME_VIDEOS: CineVideo[] = [
  {
    key: 'g_intro_1',
    frame: 'g_intro_1',
    seconds: 5,
    motion: 'The blacksmiths in every world strike their anvils, sparks fly up and drift between the floating worlds like stars, the worlds slowly turn. Slow push-in toward the central world.',
  },
  {
    key: 'g_intro_2',
    frame: 'g_intro_2',
    seconds: 5,
    motion: 'The masked emperor leans forward and thrusts his pointing hand out, his eyes ignite violet under the mask, violet rift energy surges across the floor and the portals flare open. Slow low-angle push-in.',
  },
  {
    key: 'g_intro_3',
    frame: 'g_intro_3',
    seconds: 5,
    motion: 'The violet rifts crackle and widen, the three alternate blacksmiths step forward together and raise their glowing weapons, the blacksmith in the foreground tightens his grip on the hammer. Slow push-in camera.',
  },
];

/** The whole intro story, cut down to three lines (one per 5-second clip). */
export const SHORT_INTRO = [
  '모든 세계에는 같은 대장장이가 산다.',
  'THE FIRST가 명령했다. 다른 세계의 너를 죽여라.',
  '밤이 오면, 그들이 온다. 몇 강을 강화해 왔는지는 아무도 모른다.',
];

/** Appended to every motion prompt. */
export const MOTION_TAIL = 'Cinematic, realistic dark fantasy, smooth natural motion, consistent faces, no text, no logos, no subtitles appear.';
