// Sword names (user decision 2026-11-18): 30 swords per element, from a plain blade to a cosmic one.
// The name changes with enhancement level; `look` is the English art brief for the sword's image
// (one image per entry, made with Higgsfield after a sample is approved).
// Each element has its own silhouette family so elements never look alike:
//   fire = curved, wavy, flaring · earth = heavy, blunt, stone and crystal · lightning = thin, jagged, angular
//   water = flowing curves, sea creatures · ice = translucent, faceted, spiky crystal.
import { CLASS_INFO, ELEMENT_INFO, type Element, type WeaponClass } from './weapons';

export interface SwordForm {
  name: string;
  look: string;
}

/** Enhancement level at which each of the 30 names begins: every level up to +20, then wider steps to +50. */
export const SWORD_NAME_LEVELS: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 23, 26, 29, 32, 35, 38, 41, 45, 50,
];

export const SWORD_FORMS: Record<Element, readonly SwordForm[]> = {
  fire: [
    { name: '녹슨 부지깽이검', look: 'a rusty bent iron blade that looks like a fire poker, crude wooden grip' },
    { name: '그을린 철검', look: 'a plain iron arming sword with a soot-blackened edge' },
    { name: '숯불검', look: 'a short broad blade with faint glowing coal-red cracks' },
    { name: '화로지기의 검', look: 'a thick workshop blade with a leather-wrapped grip and a small bellows-shaped pommel' },
    { name: '불씨검', look: 'a slim blade with a single ember burning at its tip' },
    { name: '적철검', look: 'a red-tinted steel broadsword with a simple cross guard' },
    { name: '화염날', look: 'a blade whose edge ripples like a flame, orange glow along the waves' },
    { name: '홍련검', look: 'a crimson blade engraved with red lotus flowers, petal-shaped guard' },
    { name: '작열의 검', look: 'a white-hot glowing blade surrounded by heat haze' },
    { name: '불꽃 플랑베르주', look: 'a long flamberge with a deeply wavy blade licked by flames' },
    { name: '화룡의 송곳니', look: 'a curved blade shaped like a dragon fang with a red-scaled guard' },
    { name: '염제의 대검', look: 'a huge two-handed greatsword covered in burning fire runes' },
    { name: '용암 파쇄검', look: 'a blade of cooled black lava rock split by molten orange seams' },
    { name: '불사조 깃날', look: 'a blade built from overlapping golden-red phoenix feathers' },
    { name: '지옥불 참수도', look: 'a heavy black executioner blade wreathed in hellfire, chains on the hilt' },
    { name: '화산의 심장', look: 'a blade with a glowing magma-core gem in the guard, lava dripping down the fuller' },
    { name: '열화의 군주검', look: 'an ornate royal sword of gold and crimson with a crown-shaped guard' },
    { name: '염룡왕의 검', look: 'a dragon-head hilt breathing a river of fire along the blade' },
    { name: '이프리트의 분노', look: 'a blade made of pure living fire with a smoky spirit face in the guard' },
    { name: '붉은 혜성', look: 'a sleek blade trailing a long blazing comet tail' },
    { name: '홍염의 성검', look: 'a holy sword with a ring of fire like a halo behind the guard' },
    { name: '라그나로크', look: 'a black-red blade cracking with world-ending fire, burning runes of doom' },
    { name: '태양 단조검', look: 'a blade forged from a sliver of the sun, a blazing corona around the guard' },
    { name: '무스펠의 대검', look: 'a giant obsidian sword of the fire realm carved with glowing giant runes' },
    { name: '불새 신검', look: 'a divine sword whose guard spreads into huge burning phoenix wings' },
    { name: '항성 핵검', look: 'a translucent blade with a tiny star burning inside its core' },
    { name: '초신성', look: 'a blade bursting into exploding star shards that orbit around it' },
    { name: '홍염 성운검', look: 'a blade of swirling red nebula gas and newborn stars' },
    { name: '태초의 불꽃', look: 'an abstract blade of primordial white-gold fire from before time' },
    { name: '우주를 태운 자', look: 'a cosmic blade with a black-hole edge rimmed in burning gold, galaxies in its wake' },
  ],
  earth: [
    { name: '흙투성이 막검', look: 'a crude iron blade caked with dried mud' },
    { name: '돌날검', look: 'a chipped flint stone blade lashed to a wooden hilt' },
    { name: '광부의 곡괭이검', look: 'a heavy sword with a pickaxe spike on its back' },
    { name: '청동 장검', look: 'a green-patina bronze longsword' },
    { name: '바위깎이', look: 'a thick blunt blade shaped like a stonemason chisel' },
    { name: '철광석 대검', look: 'a greatsword hammered from raw rusty ore, rough and lumpy' },
    { name: '호박검', look: 'a golden amber resin blade with an ancient insect trapped inside' },
    { name: '화강암 파쇄검', look: 'a slab of speckled granite shaped into a massive sword' },
    { name: '뿌리감긴 검', look: 'a blade wrapped in living tree roots with small green sprouts' },
    { name: '대지의 맹세', look: 'a knight sword engraved with a mountain crest, earthen brown leather' },
    { name: '골렘의 팔', look: 'a blade shaped like a stone golem forearm with a glowing rune fist guard' },
    { name: '산맥 가르개', look: 'an enormous blade whose edge is a jagged mountain ridge' },
    { name: '흑요석 송곳니', look: 'a glossy black obsidian glass blade, razor sharp' },
    { name: '거신의 대검', look: 'a titan-sized greatsword bound with heavy chains and boulders' },
    { name: '석화의 검', look: 'a blade half turned to stone with a serpent eye set in the guard' },
    { name: '자수정 왕관검', look: 'a blade with purple amethyst crystal clusters growing along it' },
    { name: '고대 거목검', look: 'a blade of petrified ancient wood still sprouting leaves' },
    { name: '지진의 송곳', look: 'a spiralled drill-like blade with glowing fault cracks' },
    { name: '대지모신의 축복', look: 'a blade carved with an earth mother goddess, vines and flowers blooming on it' },
    { name: '황금 광맥검', look: 'a dark rock blade threaded with shining gold veins' },
    { name: '아틀라스의 짐', look: 'a mighty sword with a small stone globe held in the guard' },
    { name: '판게아', look: 'a blade carved like a map of one huge ancient continent' },
    { name: '세계수 뿌리검', look: 'a blade grown from a glowing world-tree root, golden sap light' },
    { name: '금강불괴', look: 'a flawless diamond blade, indestructible, prismatic sparkle' },
    { name: '지핵 단조검', look: 'a blade forged in a planet core, a molten iron heart pulsing inside' },
    { name: '월석 대검', look: 'a pale grey moon-rock greatsword covered in tiny craters' },
    { name: '행성 파쇄자', look: 'a colossal blade with a ring of asteroids orbiting it' },
    { name: '중력의 왕', look: 'a dark blade bending space around it, light warping into its edge' },
    { name: '운석 낙하', look: 'a meteoric iron blade with a burning atmospheric entry trail' },
    { name: '별을 빚은 흙', look: 'a cosmic clay blade with tiny planets embedded along it' },
  ],
  lightning: [
    { name: '정전기 쇠꼬챙이', look: 'a thin rusty skewer-like rapier crackling with tiny sparks' },
    { name: '구리선 검', look: 'a plain blade wrapped in coiled copper wire' },
    { name: '찌릿검', look: 'a small jagged blade with one blue spark jumping off the tip' },
    { name: '피뢰침 레이피어', look: 'a needle-thin rapier shaped like a lightning rod' },
    { name: '섬광검', look: 'a mirror-polished blade flashing white light' },
    { name: '번개못 장검', look: 'a longsword studded with rivets in a zigzag pattern' },
    { name: '뇌전 지그재그', look: 'a blade bent into the shape of a zigzag lightning bolt' },
    { name: '폭풍 전령검', look: 'a blade with a dark storm-cloud shaped guard' },
    { name: '천둥새 깃검', look: 'a blade of electric-blue thunderbird feathers' },
    { name: '뇌명', look: 'a blade ringed with resonating sound rings like a thunder drum' },
    { name: '청뢰검', look: 'a clear glass blade with a blue lightning core trapped inside' },
    { name: '테슬라 코일검', look: 'a blade lined with copper coil rings arcing electricity between them' },
    { name: '뇌신의 집행검', look: 'a judge sword with a scale-of-justice guard crackling with lightning' },
    { name: '폭풍의 눈', look: 'a blade with a swirling storm eye spinning at the guard' },
    { name: '자뢰 쌍날검', look: 'a double-ended blade pulsing with violet lightning' },
    { name: '플라즈마 엣지', look: 'a metal spine with a pure white-violet plasma edge' },
    { name: '천벌', look: 'a blade shaped like a bolt falling from heaven, golden light' },
    { name: '뇌룡 승천검', look: 'a lightning dragon spiralling up around the blade' },
    { name: '뇌제의 왕검', look: 'a royal emperor sword of gold and violet, crown of bolts' },
    { name: '오로라 섬광검', look: 'a blade shimmering with green and violet aurora light' },
    { name: '제우스의 벼락', look: 'a golden greatsword shaped like a giant thunderbolt' },
    { name: '전광석화', look: 'a blade leaving three glowing afterimages of itself' },
    { name: '이온 폭풍검', look: 'a blade made of ionized purple storm gas held in a metal frame' },
    { name: '펄서', look: 'a blade with a spinning pulsar at the hilt firing light beams' },
    { name: '초광속', look: 'a blade stretched into streaks of light as if moving faster than light' },
    { name: '감마선 폭발검', look: 'a blinding green-white beam blade erupting from a small hilt' },
    { name: '퀘이사', look: 'a blade with brilliant quasar jets shooting from both ends' },
    { name: '시공 방전', look: 'a blade cracking space itself, lightning leaking through the cracks' },
    { name: '창세의 섬광', look: 'a blade of the very first flash of creation, pure white light' },
    { name: '무한 전류', look: 'a cosmic blade of infinite looping lightning, galaxies in the arcs' },
  ],
  water: [
    { name: '물먹은 목검', look: 'a waterlogged wooden practice sword, dripping' },
    { name: '녹슨 선원검', look: 'a rusty sailor cutlass with a rope-wrapped grip' },
    { name: '조개날검', look: 'a blade edged with sharp seashells' },
    { name: '어부의 작살검', look: 'a blade with harpoon barbs near the tip' },
    { name: '산호검', look: 'a branching pink-orange coral blade' },
    { name: '파도 커틀러스', look: 'a cutlass with an edge curling like a wave' },
    { name: '해적왕의 곡도', look: 'an ornate golden pirate scimitar with a skull guard' },
    { name: '물방울 레이피어', look: 'a glass rapier ending in a droplet-shaped tip' },
    { name: '진주 장검', look: 'a longsword inlaid with rows of white pearls' },
    { name: '조류의 칼날', look: 'a blade whose edge is a flowing stream of water' },
    { name: '심해의 송곳니', look: 'a dark deep-sea blade with a glowing anglerfish lure' },
    { name: '세이렌의 노래', look: 'a blade carved with a siren and music notes made of bubbles' },
    { name: '해일 대검', look: 'a greatsword shaped like a towering curling tidal wave' },
    { name: '크라켄 촉수검', look: 'a blade wrapped by kraken tentacles with suckers' },
    { name: '소용돌이', look: 'a blade twisting into a spiral whirlpool' },
    { name: '수정 해류검', look: 'a clear water blade with tiny fish swimming inside' },
    { name: '리바이어던의 비늘', look: 'a blade of overlapping iridescent sea-serpent scales' },
    { name: '포세이돈의 삼지검', look: 'a sword whose tip splits into a trident' },
    { name: '심연의 군주', look: 'a black-blue abyssal blade with glowing eyes watching from it' },
    { name: '달의 조수', look: 'a blade with a full moon guard pulling water upward' },
    { name: '아틀란티스 왕검', look: 'a royal sword of a sunken city, marble and gold with drowned ruins' },
    { name: '대홍수', look: 'a blade endlessly pouring a waterfall from its tip' },
    { name: '용궁 보검', look: 'an eastern dragon-palace treasure sword, jade and pearl, sea dragon guard' },
    { name: '생명의 샘', look: 'a blade of glowing healing spring water, small plants growing around it' },
    { name: '해왕성', look: 'a blade with a deep-blue ice giant planet as the pommel' },
    { name: '은하수', look: 'a blade made of a flowing river of stars' },
    { name: '우주 해류', look: 'a blade of cosmic ocean currents carrying stars' },
    { name: '원시 바다', look: 'a blade of primordial glowing sea with drifting first life cells' },
    { name: '시간의 강', look: 'a blade of flowing water reflecting past and future moments' },
    { name: '모든 바다의 근원', look: 'a liquid universe blade, every ocean and galaxy swirling in it' },
  ],
  ice: [
    { name: '성에 낀 쇠검', look: 'a plain iron sword covered in white frost' },
    { name: '고드름검', look: 'a long icicle used as a blade on a wooden hilt' },
    { name: '서리 장검', look: 'a frosted longsword with frozen droplets on the edge' },
    { name: '설원 사냥검', look: 'a hunting sword with a fur-wrapped grip and antler guard' },
    { name: '빙결검', look: 'a blade sealed in a thin crust of clear ice' },
    { name: '눈보라 칼날', look: 'a blade swirling with snowflakes and blizzard wind' },
    { name: '서리늑대의 이빨', look: 'a blade with a snarling frost-wolf head guard' },
    { name: '북방 전사의 대검', look: 'a northern warrior greatsword with furs and bone charms' },
    { name: '빙정 레이피어', look: 'a delicate rapier made of snowflake crystals' },
    { name: '얼어붙은 맹세', look: 'a knight sword entirely encased in a block of blue ice' },
    { name: '설녀의 탄식', look: 'an elegant pale slender blade trailing a frozen veil' },
    { name: '빙하 절단검', look: 'a thick glacier-blue blade with layered ice strata' },
    { name: '프로스트 본', look: 'a blade carved from a frozen giant bone' },
    { name: '영구동토', look: 'a blade of dark frozen earth and ancient ice' },
    { name: '백야의 검', look: 'a pale blade glowing with endless white-night light' },
    { name: '결정 왕관검', look: 'a blade with a crown of sharp ice crystal spikes at the guard' },
    { name: '빙룡의 숨결', look: 'an ice dragon head hilt breathing frost along the blade' },
    { name: '요툰의 대검', look: 'a colossal frost-giant greatsword of jagged blue ice' },
    { name: '오로라 빙검', look: 'a crystal ice blade reflecting green and violet aurora' },
    { name: '니플헤임', look: 'a blade wrapped in freezing mist of the ice realm' },
    { name: '절대영도', look: 'a blue-black glass blade where even light is frozen still' },
    { name: '시간 정지', look: 'a blade with frozen clock gears suspended in ice' },
    { name: '빙하기', look: 'a huge curved blade like a mammoth tusk encased in glacier ice' },
    { name: '다이아몬드 더스트', look: 'a blade of sparkling diamond dust swirling in a sword shape' },
    { name: '혜성 얼음핵', look: 'a comet ice-core blade with a long glowing tail' },
    { name: '명왕성', look: 'a blade with a small frozen dwarf planet as the pommel' },
    { name: '우주 서리', look: 'a blade of frozen cosmic nebula, frost spreading into space' },
    { name: '엔트로피의 끝', look: 'a black ice blade from the heat death of the universe, faint dying stars' },
    { name: '영원의 결정', look: 'an endlessly repeating fractal ice crystal blade' },
    { name: '별을 얼린 검', look: 'a cosmic ice blade with whole stars frozen inside it' },
  ],
};

/** Index (0..29) of the sword form for an enhancement level. */
export function swordFormIndex(level: number): number {
  let idx = 0;
  for (let i = 0; i < SWORD_NAME_LEVELS.length; i++) if (level >= SWORD_NAME_LEVELS[i]) idx = i;
  return idx;
}

export function swordForm(element: Element, level: number): SwordForm {
  return SWORD_FORMS[element][swordFormIndex(level)];
}

/** Name shown in the game, without the "+N": swords use their form name, spears and axes stay "불 창". */
export function weaponDisplayName(w: { cls: WeaponClass; element: Element; level: number }): string {
  return w.cls === 'sword' ? swordForm(w.element, w.level).name : `${ELEMENT_INFO[w.element].name} ${CLASS_INFO[w.cls].name}`;
}
