# FORGE THE NIGHT — Higgsfield 컷신 제작 가이드

## 현재 사용: 짧은 인트로 3장면 (2026-11-18 사용자 결정)

게임 그림체(손그림 카툰), 장면당 5초, 자막 한 줄. **보스 컷신과 엔딩은 없음.** 아래 2장 이후의 사실적 12장면 계획은 보관용이며 쓰지 않는다 (만든 영상은 `tools/art/out/cine/raw/realistic_*.mp4`).

| 파일 | 장면 | 자막 |
|---|---|---|
| `intro_1.mp4` | 떠 있는 여러 세계, 세계마다 대장장이가 망치질 (얼굴형만 같고 인종·옷은 다름) | 모든 세계에는 같은 대장장이가 산다. |
| `intro_2.mp4` | 왕좌의 THE FIRST가 명령, 보라색 균열이 열림 | THE FIRST가 명령했다. / 다른 세계의 너를 죽여라. |
| `intro_3.mp4` | 우리 대장간에 균열, 다른 세계 대장장이 셋이 걸어 나옴 | 밤이 오면, 그들이 온다. / 몇 강을 벼려 왔는지는 아무도 모른다. |

프롬프트는 `tools/art/cinematics-spec.ts`의 `GAME_FRAMES`, `GAME_VIDEOS`. 제작: `npx.cmd tsx tools/art/gen-cine.ts gframes` → `gvideos` (Kling 4.0, 5초, 720p), 그다음 `tools/art/compress-cine.sh`.

---

게임은 이 문서의 파일 이름으로 영상을 찾는다. 파일이 없으면 임시 화면(배경 이미지 + 자막)으로 대신 재생하므로, 영상이 하나도 없어도 게임은 돌아간다.

## 1. 파일 규칙

| 항목 | 값 |
|---|---|
| 위치 | `public/assets/cinematics/` |
| 형식 | MP4 (H.264 + AAC), 1920×1080 또는 1280×720, 16:9 |
| 소리 | 영상에 음악·효과음이 있어도 됨. 재생 중 게임 BGM·효과음은 꺼진다 |
| 글자 | **영상 안에 글자·로고를 넣지 않는다.** 자막과 로고는 게임이 그린다 |
| 길이 | 목표 8초(엔딩·정체 공개 12초). 모델이 짧게만 만들면 `intro_01a.mp4`, `intro_01b.mp4`처럼 나눠도 된다 (`src/config/cinematics.ts`에서 순서 지정) |

| 파일 | 장면 | 목표 길이 | 재생 시점 |
|---|---|---|---|
| `intro_01.mp4` | 세계의 탄생 | 8초 | 첫 실행 인트로 |
| `intro_02.mp4` | 멀티버스 대장장이들 | 8초 | 인트로 |
| `intro_03.mp4` | THE FIRST 등장 | 8초 | 인트로 |
| `intro_04.mp4` | 대장장이 전쟁 | 8초 | 인트로 |
| `intro_05.mp4` | 주인공의 대장간 (심장의 모루) | 8초 | 인트로 |
| `intro_06.mp4` | 첫 번째 균열 | 8초 | 인트로 마지막 → 로고 → DAY 1 |
| `boss_25.mp4` | THE FIRST의 계획 암시 | 8초 | DAY 25 보스 전 |
| `boss_40.mp4` | 세계의 붕괴 | 8초 | DAY 40 보스 전 |
| `boss_50.mp4` | THE FIRST 정체 공개 | 12초 | DAY 50 최종전 전 |
| `ending_a.mp4` | ONE WORLD | 12초 | 엔딩 A |
| `ending_b.mp4` | INFINITE FLAMES | 12초 | 엔딩 B |
| `ending_c.mp4` | THE UNFORGED | 12초 | 엔딩 C |

## 2. 일관성 가이드 (먼저 기준 이미지를 만든다)

순서: **캐릭터 기준 이미지 → 장소 기준 이미지 → 장면 첫 프레임 이미지 → 영상(image-to-video)**. 모든 장면 프롬프트에 아래 스타일 문구를 붙이고, 기준 이미지를 image reference로 넣는다.

**공통 스타일 문구**

> Dark fantasy cinematic, multiverse, blacksmith, cosmic forge. Deep shadows, red-orange forge fire against black metal, violet dimensional rifts, realistic molten metal and steel textures, volumetric light, film grain, anamorphic 2.39 look framed in 16:9, no text, no logos, no watermarks.

**기준 이미지 1 — 주인공 (THE SMITH)**

> Character reference sheet, front and three-quarter view, of a stocky middle-aged human blacksmith: thick braided auburn beard, bald head with a soot smudge, muscular forearms, rolled-up linen sleeves, heavy brown leather apron with a Nordic knot emblem, thick work gloves, sturdy boots. Neutral grey background, even lighting, realistic dark fantasy style, no text.

(게임 속 대장장이 그림 `tools/art/out/v2/smith_raise.png`을 함께 레퍼런스로 넣어 얼굴·수염·앞치마를 맞춘다.)

**기준 이미지 2 — THE FIRST**

> Character reference sheet of an ancient blacksmith emperor: the SAME face structure and braided beard as the protagonist but aged, grey and scarred, wearing a cracked golden mask over the upper face, dark ceremonial plate armor with forge-runes glowing faint violet, a cloak of black iron chain. Neutral background, realistic dark fantasy, no text.

**기준 이미지 3 — 다른 세계의 대장장이 4명** (2026-11-18 사용자 지시: **얼굴 생김새만 같고, 인종·피부색·머리·옷 디자인은 모두 다르게**)

> Four alternate-universe versions of the same blacksmith. They share ONLY the same facial structure (eye shape, nose, jaw, brow); each is a different ethnicity with a different skin tone and hair and wears a completely different outfit from a different culture: a Black African blacksmith-king in gold and bronze ceremonial armor; an East Asian scarred warrior-smith in lacquered lamellar armor and a broken horned helm; a pale Nordic corrupted smith cracked with glowing molten metal in charred iron plates; a South Asian hooded wanderer-smith in saffron and indigo robes with a lantern. Full bodies, dark background, realistic dark fantasy, no text.

**기준 이미지 4 — 심장의 모루 (THE HEART ANVIL)**

> An ancient black-iron anvil on a gnarled oak stump, with a pulsing golden heart-shaped light glowing from cracks in its side like a living heart, faint runes, sparks hanging in the air. Dark workshop, realistic, no text.

## 3. 장면 프롬프트 (지시서 원문 + 일관성 보강)

각 장면은 ① 첫 프레임 이미지를 만들고 ② image-to-video로 움직인다. 카메라 동작은 영상 프롬프트에만 쓴다.

### INTRO_01 — THE BIRTH OF WORLDS (8초)
**영상 프롬프트**
> A colossal ancient cosmic forge floating in an endless black void. A gigantic celestial hammer strikes a glowing anvil, releasing an explosion of golden sparks that transform into countless galaxies and parallel universes. Dark fantasy cinematic atmosphere, monumental scale, realistic molten metal, volumetric lighting, slow dramatic camera push-in, epic mythological visual storytelling, no text, no logos.

**자막** 태초에 세계는 창조되지 않았다. 벼려졌다.

### INTRO_02 — INFINITE BLACKSMITHS (8초)
**레퍼런스** 기준 이미지 1, 3
> A cinematic journey through fractured parallel universes, revealing alternate versions of the same blacksmith in different realities. One is a golden armored king, another is a battle-scarred warrior, another is a corrupted molten-metal blacksmith, another is a mysterious hooded wanderer. Their facial identity remains recognizable across all variations. Dark fantasy multiverse, glowing dimensional fractures, dramatic lighting, seamless cinematic camera movement, no text, no logos.

**자막** 그리고 모든 세계에는 같은 운명을 가진 대장장이가 태어났다.

### INTRO_03 — THE FIRST (8초)
**레퍼런스** 기준 이미지 2
> A mysterious ancient blacksmith emperor known as The First, seated upon a massive throne made of black iron and broken weapons. He wears a cracked golden mask and dark ceremonial armor. A colossal cosmic forge burns behind him. Purple dimensional energy flows through the throne room. The camera slowly approaches from a low angle as he raises his head. Ominous dark fantasy cinematic lighting, powerful villain introduction, no text, no logos.

**자막** 그러나 그중 단 한 명이 모든 세계의 진실을 깨달았다.

### INTRO_04 — WAR OF THE FORGEMASTERS (8초)
**레퍼런스** 기준 이미지 3
> An epic dark fantasy battlefield where alternate-universe blacksmith warriors clash with highly enchanted swords, spears and battle axes. Flaming blades collide with lightning spears, ice axes unleash frozen shockwaves, and dimensional portals tear open across the battlefield. Dynamic sweeping camera movement, intense cinematic action, spectacular magical weapon effects, realistic metal sparks, high contrast lighting, no text, no logos.

**자막** 그는 모든 세계에 명령했다. 다른 세계의 너를 죽여라.

### INTRO_05 — THE HEART ANVIL (8초)
**레퍼런스** 기준 이미지 1, 4
> Inside a small ancient blacksmith workshop at dusk, a lone blacksmith (the reference character) stands before a mysterious glowing anvil. Three unfinished weapons — a sword, a spear and an axe — rest beside the furnace. The anvil contains a pulsating golden light like a living heart. Warm orange firelight contrasts with deep surrounding shadows. Slow cinematic camera orbit, intimate dark fantasy atmosphere, detailed medieval workshop, no text, no logos.

**자막** 그리고 마지막까지 남겨진 한 세계. 그곳에는 특별한 모루가 있었다.

### INTRO_06 — THE FIRST NIGHT (8초)
**레퍼런스** 기준 이미지 1, 3, 4
> A lonely dark fantasy blacksmith workshop at midnight. The furnace suddenly flickers as three massive purple dimensional portals tear open in front of the forge. Three alternate versions of the blacksmith emerge, each holding a different mysterious enchanted weapon. Their faces resemble the protagonist but their armor and weapons differ. The protagonist grips a glowing sword and prepares to fight. Slow suspenseful camera movement transitioning into an intense combat-ready composition, dramatic lighting, no text, no logos.

**자막** 밤이 되면, 다른 세계의 네가 찾아온다. / 그들이 어떤 무기를 벼려왔는지는 아무도 모른다.

그다음 게임이 FORGE THE NIGHT 로고를 띄우고 DAY 1을 시작한다.

### BOSS_25 — THE PLAN (8초)
**레퍼런스** 기준 이미지 2
> The masked emperor The First stands before a vast circular gallery of floating mirror-portals, each showing a different burning world. He reaches out and the portals slowly bend toward a single point of light at the center, as if being pulled together. Violet energy, ominous calm, slow orbiting camera, no text, no logos.

**자막** 하나의 세계라면, 비극도 하나로 끝낼 수 있다.

### BOSS_40 — COLLAPSE (8초)
> Parallel universes shattering like cracked glass across a black sky, entire landscapes and forges falling into a violet void, fragments of cities and burning anvils drifting apart, the protagonist's small workshop standing on the last unbroken island of ground, its anvil glowing gold. Epic scale, slow pull-back camera, no text, no logos.

**자막** 세계가 무너진다. 그리고 모든 균열은 너의 모루를 향하고 있다.

### BOSS_50 — THE FIRST, UNMASKED (12초)
**레퍼런스** 기준 이미지 1, 2
> In the last forge at the end of all worlds, The First slowly lifts the cracked golden mask from his face, revealing an older, scarred version of the protagonist's own face. The protagonist, standing across a giant anvil, freezes. Both men are lit by the same golden heart-light from the anvil between them. Extreme close-ups alternating with a wide shot, tense slow camera, no text, no logos.

**자막** THE FIRST: 너는 내가 몇 번째 너인지 알고 있느냐? / 모든 세계에서 너는 실패했다. / 이번에는 다를 것 같으냐? / 주인공: 다를 필요는 없어. / 나는 다시 벼리면 되니까.

### ENDING_A — ONE WORLD (12초)
> Countless parallel worlds fold together into one perfect calm golden world; the alternate blacksmiths fade into light one by one; the protagonist stands alone on a peaceful hill, the forge fire extinguished. Bittersweet, slow rising camera, no text, no logos.

**자막** 전쟁은 끝났다. 수많은 가능성과 함께.

### ENDING_B — INFINITE FLAMES (12초)
> The protagonist strikes the heart anvil once and golden threads connecting all the worlds snap apart gently; each world drifts away into its own star, every forge in every world flaring alive with its own fire. Hopeful, wide cosmic shot, no text, no logos.

**자막** 모든 세계는 저마다의 불꽃으로 타오른다.

### ENDING_C — THE UNFORGED (12초)
> All the alternate blacksmiths, including The First without his mask, stand together around the heart anvil and lower their weapons at the same time; the protagonist hammers the law of the forge itself, a burning rune, until it shatters into harmless sparks. Warm, triumphant, slow circling camera, no text, no logos.

**자막** 대장장이가 서로를 죽여야 한다는 법칙은, 다시 벼려졌다.

## 4. 추천 모델 (이 PC의 Higgsfield 카탈로그 기준)

| 단계 | 모델 | 이유 |
|---|---|---|
| 기준·첫 프레임 이미지 | `gpt_image_2_6` (2k, high) | 글자 없는 사실적 판타지 일러스트, 레퍼런스 일관성 |
| 영상 | `kling4_0` image-to-video, 1080p, 5초 또는 10초 | 이 프로젝트 스프라이트 작업에서 품질 확인됨. 시작·끝 프레임 지정 가능 |
| 대안 | `veo3_1`, `seedance_2_5` | 카메라 움직임이 큰 장면(INTRO_01, 04)에 비교용 |

명령 예 (터미널):

```
higgsfield.cmd generate create kling4_0 --mode image-to-video --start-image keyframes/intro_01.png --prompt "<영상 프롬프트>" --aspect_ratio 16:9 --duration 10 --resolution 1080p --wait
```
