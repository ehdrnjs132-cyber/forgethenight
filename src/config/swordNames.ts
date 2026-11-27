// Sword names (user decision 2026-11-18): 30 swords per element, from a plain blade to a cosmic one;
// 21 more per element since the cap went to +100 (2026-11-26), one form every +2.
// The name changes with enhancement level; `look` is the English art brief for the sword's image
// (one image per entry, made with Higgsfield after a sample is approved).
// Each element has its own silhouette family so elements never look alike:
//   fire = curved, wavy, flaring · earth = heavy, blunt, stone and crystal · lightning = thin, jagged, angular
//   water = flowing curves, sea creatures · ice = translucent, faceted, spiky crystal.
import { CLASS_INFO, ELEMENT_INFO, ELEMENTS, type Element, type WeaponClass } from './weapons';
import { APPEARANCE_STAGES } from './appearance';

export interface SwordForm {
  name: string;
  look: string;
}

/**
 * Enhancement level at which each name begins: a new form every +2 up to +100 (user decision 2026-11-26;
 * it was 30 forms up to +50). Form i begins at +2i: the original 30 now cover +0..+58, the 21 added
 * forms (EXTRA_FORMS) +60..+100.
 */
export const SWORD_NAME_LEVELS: readonly number[] = APPEARANCE_STAGES;

const BASE_FORMS: Record<Element, readonly SwordForm[]> = {
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

/**
 * Forms 30..50 (+60..+100), added when the cap went to +100 (2026-11-26): past the cosmos — other
 * dimensions, gods, the idea of the element itself. Same silhouette families per element as above.
 */
const EXTRA_FORMS: Record<Element, readonly SwordForm[]> = {
  fire: [
    { name: '차원 균열 화염검', look: 'a blade of fire pouring out of a glowing crack between dimensions' },
    { name: '다중우주 용광로', look: 'a blade glowing like a furnace, many tiny universes being forged in its fuller' },
    { name: '혼돈의 불씨', look: 'a wavy blade of chaotic flame shifting between red, violet and gold' },
    { name: '신염', look: 'a divine white-flame blade with a golden halo ring behind the guard' },
    { name: '염신의 왕홀검', look: 'a fire god sceptre-sword, burning crown jewels set in the hilt' },
    { name: '영겁의 화로', look: 'a blade of eternal forge fire with an anvil-shaped guard throwing endless sparks' },
    { name: '별의 장례식', look: 'a blade made of a dying red giant star collapsing into embers' },
    { name: '화염 특이점', look: 'a curved blade with a blazing singularity at its tip pulling flames inward' },
    { name: '붉은 다중성', look: 'a blade split into several overlapping fiery copies of itself from parallel worlds' },
    { name: '불타는 시간', look: 'a blade whose flame burns backwards, ashes rising and turning back into fire' },
    { name: '천염 십이익', look: 'a blade with twelve burning seraph wings spreading from the guard' },
    { name: '화염의 이데아', look: 'a perfect geometric blade of idealised flame drawn in clean glowing lines' },
    { name: '세계를 지핀 불', look: 'a blade with a tiny world catching fire inside its glowing core' },
    { name: '진홍 무한검', look: 'a crimson blade whose wavy edge repeats into infinity like a fractal' },
    { name: '원초의 대폭발', look: 'a blade erupting with a big-bang burst of light and matter' },
    { name: '불의 근원', look: 'a blade holding the origin of all fire, a calm white-gold flame at its heart' },
    { name: '신살의 업화', look: 'a black-red blade of karmic hellfire, a broken divine halo on the hilt' },
    { name: '태양들의 왕관', look: 'a blade crowned with a ring of many small blazing suns' },
    { name: '영원한 불꽃', look: 'a blade of a flame that never flickers, frozen in perfect eternal burning' },
    { name: '절대 화염', look: 'an absolute flame blade so bright the fire shades into pure white' },
    { name: '불꽃 그 자체', look: 'a sword that is fire itself, flame shaped into a blade with a whole cosmos in its glow' },
  ],
  earth: [
    { name: '차원 지각검', look: 'a heavy blade of tectonic plates from different worlds grinding together' },
    { name: '다중 대륙검', look: 'a broad blade with several small floating continents stacked along it' },
    { name: '혼돈의 바위', look: 'a blunt blade of impossible shifting rock shapes and colours' },
    { name: '신의 초석', look: 'a divine cornerstone blade of white marble with glowing golden runes' },
    { name: '지신의 왕검', look: 'an earth god king sword with a crown of mountain peaks as the guard' },
    { name: '영겁의 지층', look: 'a thick blade showing billions of years of coloured rock layers' },
    { name: '행성 탄생검', look: 'a blade of swirling dust and rock clumping into a newborn planet' },
    { name: '중력 특이점', look: 'a massive blade with a heavy black point at the tip bending rocks around it' },
    { name: '평행 산맥', look: 'a jagged blade where mountain ranges from parallel worlds overlap' },
    { name: '화석이 된 시간', look: 'a stone blade of fossilised moments, clocks and shells turned to rock' },
    { name: '거신들의 왕좌', look: 'a huge blade shaped like a titan throne carved out of a mountain' },
    { name: '대지의 이데아', look: 'a perfect geometric crystal-stone blade with clean faceted lines' },
    { name: '세계의 뼈대', look: 'a blade made from the bones of a world, glowing molten marrow inside' },
    { name: '무한 결정검', look: 'a crystal blade whose facets repeat into infinity' },
    { name: '원초의 응결', look: 'a blade of the first matter condensing out of glowing cosmic dust' },
    { name: '흙의 근원', look: 'a blade holding the origin of all earth, living soil with a seed of light' },
    { name: '신살의 거암', look: 'a dark god-slaying stone greatsword, a cracked divine halo on the hilt' },
    { name: '행성들의 왕관', look: 'a blade crowned with a ring of small orbiting planets' },
    { name: '영원한 대지', look: 'a blade of unchanging eternal stone, perfectly still and timeless' },
    { name: '절대 금강', look: 'an absolute diamond blade, flawless and shining pure white' },
    { name: '대지 그 자체', look: 'a sword that is the earth itself, a whole world shaped into a blade' },
  ],
  lightning: [
    { name: '차원 방전검', look: 'a thin blade arcing lightning between two different dimensions' },
    { name: '다중우주 회로검', look: 'an angular blade covered in glowing circuits linking many tiny universes' },
    { name: '혼돈의 번개', look: 'a jagged blade of chaotic multi-coloured lightning branching everywhere' },
    { name: '신뢰', look: 'a divine golden lightning blade with a halo made of bolts' },
    { name: '뇌신의 왕홀검', look: 'a thunder god sceptre-sword with a crown of crackling bolts' },
    { name: '영겁의 폭풍', look: 'a blade wrapped in an eternal storm that never stops' },
    { name: '별의 신경망', look: 'a blade of glowing nerve-like lightning connecting stars' },
    { name: '전하 특이점', look: 'a needle blade with a blinding charged point at its tip pulling arcs inward' },
    { name: '평행 섬광', look: 'a blade split into overlapping lightning copies from parallel worlds' },
    { name: '멈춘 번개', look: 'a zigzag blade of a lightning bolt frozen in time, sparks hanging in the air' },
    { name: '천뢰 십이익', look: 'a blade with twelve wings of lightning spreading from the guard' },
    { name: '번개의 이데아', look: 'a perfect geometric zigzag blade of ideal light' },
    { name: '세계를 깨운 번개', look: 'a blade with a tiny world struck awake by a bolt inside its core' },
    { name: '무한 섬광검', look: 'a blade of lightning repeating into infinity like a fractal' },
    { name: '원초의 방전', look: 'a blade of the first spark of creation, white-violet energy' },
    { name: '빛의 근원', look: 'a blade holding the origin of all light, a calm bright star at its heart' },
    { name: '신살의 낙뢰', look: 'a black-gold god-slaying bolt blade, a broken divine halo on the hilt' },
    { name: '폭풍들의 왕관', look: 'a blade crowned with a ring of small storm clouds' },
    { name: '영원한 섬광', look: 'a blade of an eternal flash that never fades, perfectly still light' },
    { name: '절대 전류', look: 'an absolute current blade of pure white energy beyond colour' },
    { name: '번개 그 자체', look: 'a sword that is lightning itself, a bolt shaped into a blade with a cosmos in its arcs' },
  ],
  water: [
    { name: '차원 해류검', look: 'a flowing blade of water pouring between two dimensions through a rift' },
    { name: '다중우주 바다검', look: 'a curved blade holding many small oceans of different worlds' },
    { name: '혼돈의 물결', look: 'a blade of chaotic waves in shifting impossible colours' },
    { name: '신수', look: 'a divine glowing holy-water blade with a golden halo' },
    { name: '해신의 왕검', look: 'a sea god king sword with a coral and pearl crown guard' },
    { name: '영겁의 조류', look: 'a blade of an eternal tide endlessly rising and falling' },
    { name: '별의 바다', look: 'a blade of an ocean where stars swim like fish' },
    { name: '심연 특이점', look: 'a blade with a deep dark whirlpool point at its tip pulling water inward' },
    { name: '평행 대양', look: 'a blade where oceans from parallel worlds overlap' },
    { name: '거꾸로 흐르는 강', look: 'a blade of a river flowing upward and backward in time' },
    { name: '해천 십이익', look: 'a blade with twelve wings of flowing water spreading from the guard' },
    { name: '물의 이데아', look: 'a perfect geometric blade of ideal water in clean flowing lines' },
    { name: '세계를 적신 비', look: 'a blade with a tiny world in a rainstorm inside its core' },
    { name: '무한 파도검', look: 'a blade of curling waves repeating into infinity like a fractal' },
    { name: '원초의 대양', look: 'a blade of the first ocean of the universe, glowing primordial water' },
    { name: '생명의 근원', look: 'a blade holding the origin of all life, a calm glowing water drop at its heart' },
    { name: '신살의 해일', look: 'a dark god-slaying tidal blade, a broken divine halo on the hilt' },
    { name: '바다들의 왕관', look: 'a blade crowned with a ring of small floating oceans' },
    { name: '영원한 물방울', look: 'a blade of a single eternal water drop that never falls' },
    { name: '절대 정수', look: 'an absolute pure-water blade, perfectly clear and shining white' },
    { name: '물 그 자체', look: 'a sword that is water itself, every sea shaped into a blade with the cosmos reflected in it' },
  ],
  ice: [
    { name: '차원 동결검', look: 'a faceted ice blade freezing the rift between two dimensions' },
    { name: '다중우주 빙정검', look: 'a spiky blade holding many tiny frozen universes in its crystals' },
    { name: '혼돈의 서리', look: 'a blade of chaotic frost crystals in shifting impossible colours' },
    { name: '신빙', look: 'a divine glowing holy-ice blade with a golden halo' },
    { name: '빙신의 왕홀검', look: 'an ice god sceptre-sword with a crown of ice spires' },
    { name: '영겁의 빙하', look: 'a blade of an eternal glacier that never melts' },
    { name: '얼어붙은 은하', look: 'a blade of a whole spiral galaxy frozen into ice' },
    { name: '냉기 특이점', look: 'a blade with a freezing point at its tip where everything stops' },
    { name: '평행 결정', look: 'a blade where ice crystals from parallel worlds overlap' },
    { name: '얼어붙은 순간', look: 'a blade of one frozen moment, falling snow stopped in mid-air' },
    { name: '빙천 십이익', look: 'a blade with twelve wings of ice spreading from the guard' },
    { name: '얼음의 이데아', look: 'a perfect geometric blade of ideal ice with clean faceted lines' },
    { name: '세계를 재운 겨울', look: 'a blade with a tiny sleeping winter world inside its core' },
    { name: '무한 눈송이검', look: 'a blade of snowflake fractals repeating into infinity' },
    { name: '원초의 냉기', look: 'a blade of the first cold of the universe, deep blue stillness' },
    { name: '고요의 근원', look: 'a blade holding the origin of all stillness, a calm glowing ice seed at its heart' },
    { name: '신살의 영구빙', look: 'a dark god-slaying permafrost blade, a broken divine halo on the hilt' },
    { name: '혹성들의 왕관', look: 'a blade crowned with a ring of small frozen planets' },
    { name: '멈춘 영원', look: 'a blade of a timeless crystal, perfectly still' },
    { name: '절대 빙결', look: 'an absolute ice blade, flawless and shining pure white' },
    { name: '얼음 그 자체', look: 'a sword that is ice itself, all cold shaped into a blade with the cosmos frozen in it' },
  ],
};

/** 51 forms per element: the original 30, then the 21 added ones. */
export const SWORD_FORMS: Record<Element, readonly SwordForm[]> = Object.fromEntries(
  ELEMENTS.map((el) => [el, [...BASE_FORMS[el], ...EXTRA_FORMS[el]]]),
) as unknown as Record<Element, readonly SwordForm[]>;

/** 무기 도감 key of a sword form (records keep the ones the player has held). */
export function codexKey(element: Element, level: number): string {
  return `${element}:${swordFormIndex(level)}`;
}

/** Index (0..50) of the sword form for an enhancement level. */
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
