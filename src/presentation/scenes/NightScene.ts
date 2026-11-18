// Night (reboot spec PART 3–4): direct-control hack-and-slash against blacksmiths from other worlds.
// Their weapons were really forged with the player's own odds, but how far is hidden ("+??") until the
// SHOWDOWN reveal. Beat every rival to reach dawn; fall and the night is lost (§13 lives and retries).
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import type { NightWeapon } from '../../core/systems/daynight';
import type { GameOverSummary } from '../../core/state/types';
import { weaponLabel, type Doppelganger } from '../../core/systems/doppelganger';
import { skillTotals } from '../../core/systems/skills';
import { formatDamage, hits, weaponDamage, xpToNext, addXp } from '../../combat/rules';
import { HAMMER, type AttackShape } from '../../config/combat';
import { ELEMENT_INFO, type Element } from '../../config/weapons';
import { weaponDisplayName } from '../../config/swordNames';
import { DOPPEL_COMBAT, REVEAL, TEMPERAMENTS } from '../../config/doppelganger';
import { COMBOS, COMBO_COUNTER_WINDOW, DASH, DOPPEL_AI, ELEMENT_SKILL, HEAVY, HITSTOP, PLAYER_COMBAT, type MoveClass } from '../../config/hackslash';
import { ITEMS, REVIVE } from '../../config/economy';
import { ARMOR_CAP, CRIT_BASE, LAST_STAND_HP, type SkillEffects } from '../../config/skills';
import { milestoneTier } from '../../config/appearance';
import { glowStrength } from '../weaponArt';
import { C, DISPLAY, H, W, css, label } from '../theme';
import { Sfx } from '../audio/sfx';
import { PROP_COUNT } from './BootScene';
import type { ModalData, ModalRequest } from './ModalScene';

export interface NightData {
  weapon: NightWeapon;
  day: number;
  lineup: Doppelganger[];
}

type AiState = 'arrive' | 'approach' | 'circle' | 'windup' | 'recover' | 'stagger' | 'dash' | 'dead';

interface Rival {
  d: Doppelganger;
  sprite: Phaser.Physics.Arcade.Sprite;
  aura: Phaser.GameObjects.Graphics;
  telegraph: Phaser.GameObjects.Graphics;
  plate: Phaser.GameObjects.Text;
  /** Big "+23" over the head (user decision 2026-11-18: levels are shown openly, not hidden). */
  levelTag: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Graphics;
  sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  hp: number;
  maxHp: number;
  state: AiState;
  t: number;
  heavy: boolean;
  aim: number;
  strafeDir: number;
  dodgeCd: number;
  flinch: number;
  revealed: boolean;
  engagedAt: number;
  shape: AttackShape;
  anim: string;
}

const ARENA = DOPPEL_AI.arena;
/** Other-world tint so rivals never read as the player. */
const RIVAL_TINT = 0xc9b2ff;

export class NightScene extends Phaser.Scene {
  private core!: GameCore;
  private nd!: NightData;
  private sfx = new Sfx();
  private sk!: Required<SkillEffects>;
  private cls: MoveClass = 'sword';
  private element: Element | null = null;
  private baseDamage = 100;
  private levelGlow = 0;

  private player!: Phaser.Physics.Arcade.Sprite;
  private heroAnim: string | null = null;
  private heroLight!: Phaser.GameObjects.Graphics;
  private chargeRing!: Phaser.GameObjects.Graphics;
  private rivals: Rival[] = [];
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'SPACE' | 'Q' | 'E' | 'R' | 'ESC', Phaser.Input.Keyboard.Key>;
  private numbers: Phaser.GameObjects.Text[] = [];
  private numberIdx = 0;

  private hp: number = PLAYER_COMBAT.maxHp;
  private maxHp: number = PLAYER_COMBAT.maxHp;
  private invuln = 0;
  private aim = 0;
  private comboStep = 0;
  private swingT = 0;
  private comboWindow = 0;
  private queued = false;
  private charging = false;
  private chargeT = 0;
  private heavyCd = 0;
  private dashT = 0;
  private dashCd = 0;
  private dashDir = new Phaser.Math.Vector2(1, 0);
  private skillCd = 0;
  private freeze = 0;
  private comboCount = 0;
  private comboTimer = 0;
  private bestCombo = 0;
  private elapsed = 0;
  private kills = 0;
  private level = 1;
  private xp = 0;
  private xpTotal = 0;
  private damageDealt = 0;
  private ended = false;
  private defeated: Doppelganger[] = [];
  private cards: Phaser.GameObjects.Container[] = [];

  private hud!: {
    hpBar: Phaser.GameObjects.Graphics;
    hpText: Phaser.GameObjects.Text;
    rivals: Phaser.GameObjects.Text;
    combo: Phaser.GameObjects.Text;
    xpBar: Phaser.GameObjects.Graphics;
    xpText: Phaser.GameObjects.Text;
    skills: Phaser.GameObjects.Graphics;
  };

  constructor() {
    super('Night');
  }

  init(data: NightData) {
    this.core = this.registry.get('core') as GameCore;
    this.nd = data;
    const w = data.weapon;
    this.cls = w.kind === 'weapon' ? w.weapon.cls : 'hammer';
    this.element = w.kind === 'weapon' ? w.weapon.element : null;
    this.sk = skillTotals(this.core.state, this.element);
    const raw = w.kind === 'weapon' ? weaponDamage(w.weapon.level, w.weapon.cls) : HAMMER.damage;
    const high = w.kind === 'weapon' && w.weapon.level >= 20 ? this.sk.highLevel : 0;
    this.baseDamage = Math.round(raw * (1 + this.sk.damage + this.sk.mastery + high));
    this.levelGlow = w.kind === 'weapon' ? glowStrength(w.weapon.level) : 0;
    this.maxHp = Math.round(PLAYER_COMBAT.maxHp + this.sk.maxHp);
    const p = this.core.state.player;
    Object.assign(this, {
      hp: this.maxHp, invuln: 0, comboStep: 0, swingT: 0, comboWindow: 0, queued: false, charging: false, chargeT: 0, heavyCd: 0,
      dashT: 0, dashCd: 0, skillCd: 0, freeze: 0, comboCount: 0, comboTimer: 0, bestCombo: 0, elapsed: 0, kills: 0,
      level: p.level, xp: p.xp, xpTotal: 0, damageDealt: 0, ended: false, rivals: [], defeated: [], cards: [], numbers: [], numberIdx: 0,
    });
  }

  private get glowColor(): number {
    return this.element ? ELEMENT_INFO[this.element].glow : 0xd8d0bb;
  }

  // ───────────────────────── setup
  create() {
    this.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);
    const art = this.textures.exists('art-night_ground');
    this.add.tileSprite(0, 0, ARENA.width, ARENA.height, art ? 'art-night_ground' : 'ground').setOrigin(0);
    if (art) this.scatterProps();
    const edge = this.add.graphics();
    edge.lineStyle(10, 0x6b3fd1, 0.35);
    edge.strokeRect(5, 5, ARENA.width - 10, ARENA.height - 10);

    this.heroLight = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 5; i >= 1; i--) {
      this.heroLight.fillStyle(0xffb347, 0.016 * i);
      this.heroLight.fillCircle(0, 0, 36 + i * 22);
    }
    this.chargeRing = this.add.graphics().setDepth(11);

    this.heroAnim = this.textures.exists(`anim-hero_${this.cls}_walk`) ? `hero_${this.cls}` : null;
    this.player = this.physics.add.sprite(ARENA.width / 2, ARENA.height / 2 + 120, this.heroAnim ? `anim-${this.heroAnim}_walk` : 'player', 0).setDepth(10);
    this.fitBody(this.player, 96, PLAYER_COMBAT.radius);
    this.player.setCollideWorldBounds(true);

    for (let i = 0; i < 90; i++) {
      this.numbers.push(
        this.add
          .text(0, 0, '', { fontFamily: DISPLAY, fontSize: '28px', fontStyle: '900', color: '#ffffff', stroke: '#140a05', strokeThickness: 8, resolution: 2 })
          .setShadow(0, 4, '#000000', 0, true, true)
          .setOrigin(0.5)
          .setDepth(40)
          .setVisible(false),
      );
    }

    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
    this.cameras.main.fadeIn(400, 0, 0, 0);
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setScrollFactor(0).setDepth(90);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,SPACE,Q,E,R,ESC') as typeof this.keys;
    kb.addCapture('W,A,S,D,SPACE,Q,E,R');
    this.keys.ESC.on('down', () => this.askLeave());
    this.keys.SPACE.on('down', () => this.tryDash());
    this.keys.Q.on('down', () => this.elementSkill());
    this.keys.E.on('down', () => this.lockedSkill('E'));
    this.keys.R.on('down', () => this.lockedSkill('R'));
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.ended) return;
      if (p.rightButtonDown()) this.startCharge();
      else this.queued = true;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button === 2) this.releaseCharge();
    });

    this.buildHud();
    this.intro();
    this.nd.lineup.forEach((d, i) => this.time.delayedCall(900 + i * DOPPEL_AI.arrivalGap * 1000, () => this.arrive(d, i)));
  }

  /** Scale a sheet sprite to `height` px and give it a feet-level circle body of `radius` px. */
  private fitBody(s: Phaser.Physics.Arcade.Sprite, height: number, radius: number) {
    const k = height / s.height;
    s.setScale(k);
    const r = radius / k;
    s.setCircle(r, s.width / 2 - r, s.height - r * 2.3);
  }

  private scatterProps() {
    const rnd = new Phaser.Math.RandomDataGenerator([`props-${this.nd.day}`]);
    const keys = Array.from({ length: PROP_COUNT }, (_, i) => `art-prop_${i}`).filter((k) => this.textures.exists(k));
    for (let i = 0; i < 26; i++) {
      const x = rnd.between(60, ARENA.width - 60);
      const y = rnd.between(60, ARENA.height - 60);
      if (Phaser.Math.Distance.Between(x, y, ARENA.width / 2, ARENA.height / 2) < 300) continue;
      const img = this.add.image(x, y, rnd.pick(keys)).setOrigin(0.5, 0.9);
      img.setScale(rnd.realInRange(0.32, 0.55)).setFlipX(rnd.frac() < 0.5).setDepth(2).setAlpha(0.95);
    }
  }

  private buildHud() {
    const nw = this.nd.weapon;
    const name = nw.kind === 'weapon' ? `${weaponDisplayName(nw.weapon)} +${nw.weapon.level}` : HAMMER.name;
    const fix = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(100);
    const back = fix(this.add.graphics());
    back.fillStyle(0x000000, 0.55);
    back.fillRoundedRect(16, 14, 320, 92, 10);
    back.fillRoundedRect(W / 2 - 130, 10, 260, 56, 10);
    const hpBar = fix(this.add.graphics());
    const hpText = fix(label(this, 32, 22, '', 14, C.text, { weight: 700 }));
    fix(label(this, 32, 66, name, 15, this.glowColor, { weight: 900 }));
    fix(label(this, 32, 86, `기본 피해 ${formatDamage(this.baseDamage)} · ${COMBOS[this.cls].steps.length}연타 콤보`, 12, C.mute, { weight: 700 }));
    fix(label(this, W / 2, 20, `DAY ${this.nd.day} · 다른 세계의 대장장이`, 12, C.mute, { weight: 700, origin: [0.5, 0] }));
    const rivals = fix(label(this, W / 2, 46, '', 22, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }));
    const combo = fix(label(this, W - 40, 150, '', 40, C.goldHi, { display: true, weight: 900, origin: [1, 0.5] }));
    combo.setStroke('#140a05', 8);
    const xpBar = fix(this.add.graphics());
    const xpText = fix(label(this, W / 2, H - 30, '', 13, C.text, { weight: 700, origin: [0.5, 0.5] }));
    const skills = fix(this.add.graphics());
    const sx = W / 2 + 310;
    [['Space', '대시'], ['우클릭', '강공격'], ['Q', '속성'], ['E', '잠김'], ['R', '잠김']].forEach(([k, n], i) => {
      fix(label(this, sx + i * 62 + 26, H - 64, k, 11, C.text, { weight: 900, origin: [0.5, 0.5] }));
      fix(label(this, sx + i * 62 + 26, H - 16, n, 10, C.mute, { weight: 700, origin: [0.5, 0.5] }));
    });
    fix(label(this, 20, H - 22, `WASD 이동 · 마우스 조준 · 좌클릭 콤보(누르고 있으면 연속) · Esc 포기 | 목숨 ${this.core.state.lives}`, 12, C.dim, { origin: [0, 0.5] }));
    this.hud = { hpBar, hpText, rivals, combo, xpBar, xpText, skills };
  }

  private intro() {
    const t = label(this, W / 2, H / 2 - 70, `DAY ${this.nd.day} · 밤`, 46, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(110);
    const s = label(this, W / 2, H / 2 - 22, `차원의 균열이 열린다 — 다른 세계의 대장장이 ${this.nd.lineup.length}명`, 18, C.text, { weight: 700, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(110);
    const s2 = label(this, W / 2, H / 2 + 8, '그들이 몇 강을 벼려 왔는지는 아무도 모른다', 15, 0xc9b2ff, { weight: 700, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(110);
    for (const o of [t, s, s2]) {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 300 });
      this.tweens.add({ targets: o, alpha: 0, delay: 2000, duration: 500, onComplete: () => o.destroy() });
    }
  }

  // ───────────────────────── rivals
  private arrive(d: Doppelganger, i: number) {
    if (this.ended) return;
    const ang = -Math.PI / 2 + (i - (this.nd.lineup.length - 1) / 2) * 0.8;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(ang) * 420, 80, ARENA.width - 80);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(ang) * 380, 80, ARENA.height - 80);
    // the rift
    const rift = this.add.image(x, y, 'ring').setTint(0x9b5cff).setBlendMode('ADD').setScale(0.1).setDepth(7);
    this.tweens.add({ targets: rift, scale: 1.6, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => rift.destroy() });
    this.sfx.boom();

    const anim = this.textures.exists(`anim-hero_${d.weapon.cls}_walk`) ? `hero_${d.weapon.cls}` : '';
    const s = this.physics.add.sprite(x, y, anim ? `anim-${anim}_walk` : 'player', 0).setDepth(9).setTint(RIVAL_TINT);
    this.fitBody(s, 96, 17);
    s.setCollideWorldBounds(true);
    if (anim) s.play({ key: `anim-${anim}_walk`, startFrame: Phaser.Math.Between(0, 8) });
    s.setAlpha(0);
    this.tweens.add({ targets: s, alpha: 1, duration: 500 });

    // clues (spec §3.4): glow and sparks scale with the hidden level, bent by its temperament (bluff)
    const t = TEMPERAMENTS[d.temperament];
    const loud = Phaser.Math.Clamp((d.weapon.level / 30) * (1 + t.glowBias), 0, 1.4);
    const aura = this.add.graphics().setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    const glow = ELEMENT_INFO[d.weapon.element].glow;
    for (let k = 4; k >= 1; k--) {
      aura.fillStyle(glow, (0.025 + loud * 0.05) * k);
      aura.fillEllipse(0, 0, 70 + k * 18 + loud * 40, 40 + k * 10 + loud * 20);
    }
    this.tweens.add({ targets: aura, alpha: 0.4, duration: 600 - loud * 250, yoyo: true, repeat: -1 });
    const sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 20, max: 60 + loud * 120 },
      lifespan: 500,
      scale: { start: 0.25 + loud * 0.25, end: 0 },
      tint: glow,
      blendMode: 'ADD',
      frequency: Math.max(40, 600 - loud * 520),
    }).setDepth(9);
    const plate = label(this, x, y - 70, '', 13, C.text, { weight: 900, origin: [0.5, 0.5] }).setDepth(30);
    plate.setStroke('#140a05', 5);
    const tagSize = 34 + Math.min(30, d.weapon.level * 0.6);
    const levelTag = this.add
      .text(x, y - 112, `+${d.weapon.level}`, { fontFamily: DISPLAY, fontSize: `${Math.round(tagSize)}px`, fontStyle: '900', color: css(this.tierColor(d.weapon.level)), stroke: '#140a05', strokeThickness: 8, resolution: 2 })
      .setOrigin(0.5, 1)
      .setDepth(31);
    const hpBar = this.add.graphics().setDepth(30);
    const telegraph = this.add.graphics().setDepth(6);
    const maxHp = Math.round(DOPPEL_COMBAT.hp.base * Math.pow(DOPPEL_COMBAT.hp.growth, this.nd.day - 1) * Math.pow(DOPPEL_COMBAT.hp.levelGrowth, d.weapon.level));
    const shape = COMBOS[d.weapon.cls].steps[0].shape;
    const r: Rival = {
      d, sprite: s, aura, telegraph, plate, levelTag, hpBar, sparks, hp: maxHp, maxHp, state: 'arrive', t: 0.6, heavy: false, aim: 0,
      strafeDir: Math.random() < 0.5 ? 1 : -1, dodgeCd: 0, flinch: 0, revealed: REVEAL.openFromStart, engagedAt: this.elapsed, shape, anim,
    };
    this.physics.add.collider(s, this.player);
    for (const o of this.rivals) this.physics.add.collider(s, o.sprite);
    this.rivals.push(r);
    this.updatePlate(r);
  }

  private updatePlate(r: Rival) {
    r.plate.setText(`${r.d.name}\n${weaponLabel(r.d, r.revealed)}`);
    r.plate.setColor(css(r.revealed ? this.tierColor(r.d.weapon.level) : 0xe8dcff));
  }

  private tierColor(level: number): number {
    return level >= 40 ? 0xd86bff : level >= 30 ? 0xff4a3a : level >= 20 ? 0xff9a2a : level >= 10 ? C.goldHi : C.text;
  }

  private rivalDamage(r: Rival): number {
    const base = DOPPEL_COMBAT.damage.base * Math.pow(DOPPEL_COMBAT.damage.growth, r.d.weapon.level);
    return Math.round(base * (r.heavy ? DOPPEL_COMBAT.damage.heavyMul : 1));
  }

  private windupsActive(): number {
    return this.rivals.filter((o) => o.state === 'windup').length;
  }

  private thinkRival(r: Rival, dt: number) {
    const s = r.sprite;
    const px = this.player.x;
    const py = this.player.y;
    const dist = Phaser.Math.Distance.Between(s.x, s.y, px, py);
    const toward = Math.atan2(py - s.y, px - s.x);
    const temper = TEMPERAMENTS[r.d.temperament];
    r.t -= dt;
    r.dodgeCd = Math.max(0, r.dodgeCd - dt);
    r.flinch = Math.max(0, r.flinch - dt);
    if (!r.revealed && this.elapsed - r.engagedAt > REVEAL.afterSeconds) this.reveal(r, '오래 맞선 끝에 정체가 드러났다');

    // dodge a charging heavy blow (careful smiths more often)
    if (this.charging && r.dodgeCd <= 0 && dist < 220 && (r.state === 'approach' || r.state === 'circle') && Math.random() < (0.6 - temper.aggression * 0.5) * dt * 6) {
      r.state = 'dash';
      r.t = 0.2;
      r.dodgeCd = DOPPEL_AI.dodgeCooldown;
      const side = toward + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) + Math.PI * 0.25;
      s.setVelocity(Math.cos(side) * (DOPPEL_AI.dash / 0.2), Math.sin(side) * (DOPPEL_AI.dash / 0.2));
    }

    switch (r.state) {
      case 'arrive':
        s.setVelocity(0, 0);
        if (r.t <= 0) r.state = 'approach';
        break;
      case 'dash':
        if (r.t <= 0) {
          r.state = 'circle';
          r.t = 0.6;
        }
        break;
      case 'stagger':
        s.setVelocity(s.body!.velocity.x * 0.9, s.body!.velocity.y * 0.9);
        if (r.t <= 0) {
          r.state = 'circle';
          r.t = 0.4;
          s.clearTint().setTint(RIVAL_TINT);
        }
        break;
      case 'recover':
        s.setVelocity(0, 0);
        if (r.t <= 0) {
          r.state = 'circle';
          r.t = Phaser.Math.FloatBetween(0.5, 1.3) * (1.2 - temper.aggression * 0.6);
        }
        break;
      case 'approach': {
        const reach = r.shape.range * DOPPEL_AI.keepDistance;
        if (dist > reach) {
          const sp = DOPPEL_AI.approach * (0.85 + temper.aggression * 0.3) * (r.flinch > 0 ? 0.3 : 1);
          s.setVelocity(Math.cos(toward) * sp, Math.sin(toward) * sp);
        } else {
          r.state = 'circle';
          r.t = Phaser.Math.FloatBetween(0.3, 1.0) * (1.2 - temper.aggression * 0.7);
        }
        break;
      }
      case 'circle': {
        const reach = r.shape.range * DOPPEL_AI.keepDistance;
        const side = toward + (Math.PI / 2) * r.strafeDir;
        const inward = dist > reach * 1.2 ? 0.7 : dist < reach * 0.6 ? -0.6 : 0;
        const vx = Math.cos(side) * DOPPEL_AI.strafe + Math.cos(toward) * DOPPEL_AI.strafe * inward;
        const vy = Math.sin(side) * DOPPEL_AI.strafe + Math.sin(toward) * DOPPEL_AI.strafe * inward;
        s.setVelocity(vx * (r.flinch > 0 ? 0.3 : 1), vy * (r.flinch > 0 ? 0.3 : 1));
        if (r.t <= 0) {
          if (dist <= reach * 1.25 && this.windupsActive() < DOPPEL_AI.maxSimultaneousWindups) this.startWindup(r, toward);
          else if (dist > reach * 1.25) r.state = 'approach';
          else r.t = 0.3;
          if (Math.random() < 0.3) r.strafeDir *= -1;
        }
        break;
      }
      case 'windup': {
        s.setVelocity(0, 0);
        // the attack locks its direction: what you see is exactly where it will land
        this.drawTelegraph(r, 1 - r.t / (r.heavy ? DOPPEL_COMBAT.windup.heavy : DOPPEL_COMBAT.windup.light));
        if (r.t <= 0) this.strikeRival(r);
        break;
      }
    }
    s.setFlipX(Math.cos(r.state === 'windup' ? r.aim : toward) < 0);
    if (r.anim && (r.state === 'approach' || r.state === 'circle') && !s.anims.isPlaying) s.play(`anim-${r.anim}_walk`);
    // follow-ups
    r.aura.setPosition(s.x, s.y + 20);
    r.sparks.setPosition(s.x, s.y);
    r.plate.setPosition(s.x, s.y - 74);
    r.levelTag.setPosition(s.x, s.y - 100);
    r.hpBar.clear();
    r.hpBar.fillStyle(0x000000, 0.6);
    r.hpBar.fillRoundedRect(s.x - 40, s.y - 52, 80, 7, 3);
    r.hpBar.fillStyle(0xb35cff, 1);
    r.hpBar.fillRoundedRect(s.x - 40, s.y - 52, Math.max(0, (80 * r.hp) / r.maxHp), 7, 3);
  }

  private startWindup(r: Rival, toward: number) {
    r.heavy = Math.random() < DOPPEL_AI.heavyChance + TEMPERAMENTS[r.d.temperament].aggression * 0.1;
    r.state = 'windup';
    r.aim = toward;
    r.t = r.heavy ? DOPPEL_COMBAT.windup.heavy : DOPPEL_COMBAT.windup.light;
    r.shape = r.heavy
      ? { ...COMBOS[r.d.weapon.cls].steps[COMBOS[r.d.weapon.cls].steps.length - 1].shape }
      : { ...COMBOS[r.d.weapon.cls].steps[0].shape };
    r.sprite.anims.stop();
    if (r.heavy) {
      r.sprite.setTint(0xff8a8a);
      // SHOWDOWN: its first heavy blow shows what it really forged
      if (!r.revealed) this.reveal(r, '강공격 준비 — 무기가 정체를 드러낸다');
    }
  }

  /** The attack area, filling up over the wind-up so the timing is readable (spec §3.4, §4.5). */
  private drawTelegraph(r: Rival, p: number) {
    const g = r.telegraph;
    const s = r.sprite;
    const shape = r.shape;
    const col = r.heavy ? 0xff3a3a : 0xff9a3a;
    g.clear();
    g.lineStyle(2, col, 0.9);
    g.fillStyle(col, 0.12 + p * 0.28);
    if (shape.kind === 'circle') {
      g.strokeCircle(s.x, s.y, shape.range);
      g.fillCircle(s.x, s.y, shape.range * p);
    } else if (shape.kind === 'arc') {
      const half = ((shape.arcDeg ?? 90) * Math.PI) / 360;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.arc(s.x, s.y, shape.range, r.aim - half, r.aim + half, false);
      g.closePath();
      g.strokePath();
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.arc(s.x, s.y, shape.range * p, r.aim - half, r.aim + half, false);
      g.closePath();
      g.fillPath();
    } else {
      const wd = (shape.width ?? 40) / 2;
      const c = Math.cos(r.aim), sn = Math.sin(r.aim);
      const pts = (len: number) => [
        new Phaser.Math.Vector2(s.x - sn * wd, s.y + c * wd),
        new Phaser.Math.Vector2(s.x + c * len - sn * wd, s.y + sn * len + c * wd),
        new Phaser.Math.Vector2(s.x + c * len + sn * wd, s.y + sn * len - c * wd),
        new Phaser.Math.Vector2(s.x + sn * wd, s.y - c * wd),
      ];
      g.strokePoints(pts(shape.range), true);
      g.fillPoints(pts(shape.range * p), true);
    }
  }

  private strikeRival(r: Rival) {
    r.telegraph.clear();
    r.sprite.setTint(RIVAL_TINT);
    if (r.anim) r.sprite.play({ key: `anim-${r.anim}_attack`, timeScale: 2 });
    this.sfx.swing(r.heavy);
    const s = r.sprite;
    this.slashFx(s.x, s.y, r.aim, r.shape, r.heavy ? 0xff5a3a : ELEMENT_INFO[r.d.weapon.element].glow, r.heavy ? 1.3 : 0.9);
    if (hits(r.shape, s.x, s.y, r.aim, this.player.x, this.player.y, PLAYER_COMBAT.radius) && this.dashT <= 0) {
      const dmg = this.rivalDamage(r);
      this.hurtPlayer(dmg, r.heavy);
      if (!r.revealed && dmg >= this.maxHp * 0.35) this.reveal(r, '이 위력…!');
    }
    r.state = 'recover';
    r.t = DOPPEL_AI.recover * (r.heavy ? 1.4 : 1);
  }

  /** SHOWDOWN (spec §3.5): short, loud, scaled to how high the weapon was forged. Never pauses the fight. */
  private reveal(r: Rival, why: string) {
    r.revealed = true;
    this.updatePlate(r);
    const lv = r.d.weapon.level;
    const tier = Math.min(5, Math.floor(lv / 10));
    const col = this.tierColor(lv);
    this.sfx.strike(Math.max(1, tier));
    if (tier >= 2) this.sfx.awaken(tier);
    if (tier >= 2) this.cameras.main.shake(140 + tier * 60, 0.004 + tier * 0.002);
    if (tier >= 3) this.cameras.main.flash(180, (col >> 16) & 255, (col >> 8) & 255, col & 255);
    const ring = this.add.image(r.sprite.x, r.sprite.y, 'ring').setTint(col).setBlendMode('ADD').setScale(0.2).setDepth(29);
    this.tweens.add({ targets: ring, scale: 2 + tier * 0.8, alpha: 0, duration: 500 + tier * 100, onComplete: () => ring.destroy() });
    const head = label(this, W / 2, 128, 'WEAPON REVEALED!', 20 + tier * 2, C.text, { display: true, weight: 900, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(120);
    const main = this.add
      .text(W / 2, 176, weaponLabel(r.d, true), { fontFamily: DISPLAY, fontSize: `${40 + tier * 8}px`, fontStyle: '900', color: css(col), stroke: '#140a05', strokeThickness: 10, resolution: 2 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120);
    const sub = label(this, W / 2, 218 + tier * 4, `${r.d.name} · ${TEMPERAMENTS[r.d.temperament].name} · ${why}`, 14, C.mute, { weight: 700, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(120);
    head.setStroke('#140a05', 7);
    for (const o of [head, main, sub]) {
      o.setScale(1.6).setAlpha(0);
      this.tweens.add({ targets: o, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
      this.tweens.add({ targets: o, alpha: 0, delay: 1300 + tier * 150, duration: 400, onComplete: () => o.destroy() });
    }
  }

  // ───────────────────────── player
  update(_time: number, deltaMs: number) {
    if (this.ended) return;
    const dt = Math.min(0.05, deltaMs / 1000);
    if (this.freeze > 0) {
      // hit-stop: the world holds its breath for a few frames
      this.freeze -= dt;
      this.physics.world.pause();
      this.anims.pauseAll();
      if (this.freeze > 0) return;
      this.physics.world.resume();
      this.anims.resumeAll();
    }
    this.elapsed += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.heavyCd = Math.max(0, this.heavyCd - dt);
    this.skillCd = Math.max(0, this.skillCd - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.comboCount = 0;
    if (this.sk.regen > 0) this.hp = Math.min(this.maxHp, this.hp + this.sk.regen * dt);

    const p = this.input.activePointer;
    const wp = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.aim = Math.atan2(wp.y - this.player.y, wp.x - this.player.x);

    this.movePlayer(dt);
    this.attackLoop(dt, p);
    for (const r of this.rivals) if (r.state !== 'dead') this.thinkRival(r, dt);
    this.heroLight.setPosition(this.player.x, this.player.y + 14);
    this.drawCharge();
    this.renderHud();
  }

  private movePlayer(dt: number) {
    const k = this.keys;
    const dir = new Phaser.Math.Vector2((k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0), (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0));
    if (dir.lengthSq() > 0) dir.normalize();
    if (this.dashT > 0) {
      this.dashT -= dt;
      const v = this.dashDir.clone().scale(DASH.distance / DASH.time);
      this.player.setVelocity(v.x, v.y);
      if (Math.random() < 0.7) this.ghost();
      return;
    }
    const swinging = this.swingT > 0;
    const mul = (swinging ? COMBOS[this.cls].moveWhileAttacking : 1) * (this.charging ? 0.45 : 1);
    const speed = PLAYER_COMBAT.speed * (1 + this.sk.moveSpeed) * mul;
    this.player.setVelocity(dir.x * speed, dir.y * speed);
    // face the mouse while fighting, the walking direction otherwise
    this.player.setFlipX(Math.cos(this.aim) < 0);
    if (this.heroAnim && !swinging) {
      if (dir.lengthSq() > 0) {
        if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key.endsWith('_attack')) this.player.play(`anim-${this.heroAnim}_walk`);
      } else if (this.player.anims.isPlaying && !this.player.anims.currentAnim?.key.endsWith('_attack')) this.player.anims.stop();
    }
    this.player.setAlpha(this.invuln > 0 && this.dashT <= 0 ? 0.55 + 0.45 * Math.sin(this.elapsed * 40) : 1);
  }

  private tryDash() {
    if (this.ended || this.dashCd > 0) return;
    const k = this.keys;
    const dir = new Phaser.Math.Vector2((k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0), (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0));
    this.dashDir = dir.lengthSq() > 0 ? dir.normalize() : new Phaser.Math.Vector2(Math.cos(this.aim), Math.sin(this.aim));
    this.dashT = DASH.time;
    this.dashCd = DASH.cooldown * (1 - Math.min(0.6, this.sk.dodgeCooldown));
    this.invuln = Math.max(this.invuln, DASH.iframes);
    this.charging = false;
    this.sfx.dodge();
  }

  private ghost() {
    const g = this.add.image(this.player.x, this.player.y, this.player.texture.key, this.player.frame.name).setScale(this.player.scaleX).setFlipX(this.player.flipX).setTint(0x7fc8ff).setAlpha(0.45).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  /** Left button: press or hold to chain the combo; each step must finish before the next. */
  private attackLoop(dt: number, p: Phaser.Input.Pointer) {
    const combo = COMBOS[this.cls];
    if (this.swingT > 0) {
      this.swingT -= dt;
      if (this.swingT <= 0) this.comboWindow = combo.window;
      return;
    }
    if (this.comboWindow > 0) {
      this.comboWindow -= dt;
      if (this.comboWindow <= 0) this.comboStep = 0;
    }
    const wants = this.queued || (p.leftButtonDown() && !this.charging);
    this.queued = false;
    if (!wants || this.charging || this.dashT > 0) return;
    const step = combo.steps[this.comboStep];
    this.swing(step.shape, step.mul, step.time * (1 / (1 + this.sk.attackSpeed)), step.lunge ?? 0, this.comboStep === combo.steps.length - 1);
    this.comboStep = (this.comboStep + 1) % combo.steps.length;
  }

  private swing(shape: AttackShape, mul: number, time: number, lunge: number, finisher: boolean) {
    this.swingT = time;
    const ang = this.aim;
    if (this.heroAnim) {
      const key = `anim-${this.heroAnim}_attack`;
      const natural = this.anims.get(key)?.duration ?? 400;
      this.player.play({ key, timeScale: natural / (time * 1000) });
    }
    if (lunge) this.tweens.add({ targets: this.player, x: this.player.x + Math.cos(ang) * lunge, y: this.player.y + Math.sin(ang) * lunge, duration: time * 400, ease: 'Cubic.easeOut' });
    this.time.delayedCall(time * 1000 * 0.4, () => {
      if (this.ended) return;
      this.sfx.swing(finisher || this.cls === 'axe');
      const sh = { ...shape, range: shape.range * (1 + this.sk.area) };
      this.slashFx(this.player.x, this.player.y, ang, sh, this.glowColor, 0.8 + this.levelGlow * 0.12 + (finisher ? 0.3 : 0));
      this.resolveHit(sh, ang, mul, finisher ? 0.25 : 0.1, finisher);
    });
  }

  private startCharge() {
    if (this.heavyCd > 0 || this.dashT > 0) return;
    this.charging = true;
    this.chargeT = 0;
  }

  private releaseCharge() {
    if (!this.charging) return;
    this.charging = false;
    const c = Math.min(1, this.chargeT / HEAVY.chargeTime);
    this.heavyCd = HEAVY.cooldown;
    this.swingT = 0.32;
    if (this.heroAnim) this.player.play({ key: `anim-${this.heroAnim}_attack`, timeScale: 1.6 });
    this.time.delayedCall(140, () => {
      if (this.ended) return;
      const mul = HEAVY.mul[0] + (HEAVY.mul[1] - HEAVY.mul[0]) * c;
      // shockwave
      const ring = this.add.image(this.player.x, this.player.y, 'ring').setTint(this.glowColor).setBlendMode('ADD').setScale(0.2).setDepth(12);
      this.tweens.add({ targets: ring, scale: (HEAVY.radius * 2) / 128 * (1 + c * 0.3), alpha: 0, duration: 340, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
      this.cameras.main.shake(140, 0.006 + c * 0.006);
      this.sfx.strike(1 + Math.round(c * 2));
      const shape: AttackShape = { kind: 'circle', range: HEAVY.radius * (1 + c * 0.3), interval: 0, damageMul: 1, knockback: HEAVY.knockback, engage: 1 };
      this.resolveHit(shape, this.aim, mul, HEAVY.stagger, true, HEAVY.knockback);
    });
  }

  private drawCharge() {
    const g = this.chargeRing;
    g.clear();
    if (!this.charging) return;
    this.chargeT += this.game.loop.delta / 1000;
    const c = Math.min(1, this.chargeT / HEAVY.chargeTime);
    g.lineStyle(4, c >= 1 ? 0xffffff : this.glowColor, 0.9);
    g.strokeCircle(this.player.x, this.player.y, 30 + c * 40);
    if (c >= 1) {
      g.fillStyle(this.glowColor, 0.15);
      g.fillCircle(this.player.x, this.player.y, HEAVY.radius);
    }
  }

  /** Q: the weapon's element unleashed (E and R unlock later through the skill tree). */
  private elementSkill() {
    if (this.ended || this.skillCd > 0) return;
    this.skillCd = ELEMENT_SKILL.cooldown;
    const el = this.element ?? 'earth';
    const col = ELEMENT_INFO[el].glow;
    const px = this.player.x, py = this.player.y;
    const tx = px + Math.cos(this.aim) * Math.min(ELEMENT_SKILL.range, 200);
    const ty = py + Math.sin(this.aim) * Math.min(ELEMENT_SKILL.range, 200);
    const burst = (x: number, y: number, radius: number) => {
      const ring = this.add.image(x, y, 'ring').setTint(col).setBlendMode('ADD').setScale(0.2).setDepth(12);
      this.tweens.add({ targets: ring, scale: (radius * 2) / 128, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
      const b = this.add.particles(x, y, 'spark', { speed: { min: 80, max: 340 }, lifespan: 500, scale: { start: 0.7, end: 0 }, tint: col, blendMode: 'ADD', emitting: false }).setDepth(12);
      b.explode(30);
      this.time.delayedCall(560, () => b.destroy());
    };
    this.sfx.boom();
    const circleAt = (x: number, y: number, radius: number, mul: number, stagger: number, kb = 260) => {
      for (const r of this.living()) if (Phaser.Math.Distance.Between(x, y, r.sprite.x, r.sprite.y) <= radius + 17) this.damageRival(r, this.baseDamage * mul, stagger, Math.atan2(r.sprite.y - y, r.sprite.x - x), kb, true);
    };
    if (el === 'fire') {
      burst(tx, ty, 120);
      circleAt(tx, ty, 120, 2.6, 0.3);
    } else if (el === 'lightning') {
      const targets = this.living().sort((a, b) => Phaser.Math.Distance.Between(px, py, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Between(px, py, b.sprite.x, b.sprite.y)).slice(0, 4);
      const g = this.add.graphics().setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
      g.lineStyle(4, 0xb9e8ff, 1);
      let sx = px, sy = py;
      for (const r of targets) {
        if (Phaser.Math.Distance.Between(sx, sy, r.sprite.x, r.sprite.y) > ELEMENT_SKILL.range + 80) break;
        g.lineBetween(sx, sy, r.sprite.x, r.sprite.y);
        this.damageRival(r, this.baseDamage * 1.9, 0.35, Math.atan2(r.sprite.y - sy, r.sprite.x - sx), 120, true);
        sx = r.sprite.x;
        sy = r.sprite.y;
      }
      this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
    } else if (el === 'ice') {
      burst(px, py, 180);
      circleAt(px, py, 180, 1.3, 1.6, 80);
    } else if (el === 'earth') {
      burst(px, py, 200);
      this.cameras.main.shake(180, 0.008);
      circleAt(px, py, 200, 1.6, 1.2, 320);
    } else {
      burst(tx, ty, 150);
      circleAt(tx, ty, 150, 1.5, 0.4, 480);
      this.hp = Math.min(this.maxHp, this.hp + 18);
      this.number(px, py - 40, '+18', 0x6fe0ff, 20);
    }
  }

  private lockedSkill(k: string) {
    if (this.ended) return;
    this.sfx.denied();
    const t = label(this, this.player.x, this.player.y - 70, `${k} 스킬: 스킬트리에서 해금 예정`, 13, C.mute, { weight: 700, origin: [0.5, 0.5] }).setDepth(41);
    t.setStroke('#140a05', 4);
    this.tweens.add({ targets: t, y: t.y - 24, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  private living(): Rival[] {
    return this.rivals.filter((r) => r.state !== 'dead');
  }

  private resolveHit(shape: AttackShape, ang: number, mul: number, stagger: number, heavy: boolean, knock = 160) {
    let any = false;
    for (const r of this.living()) {
      if (r.state === 'arrive') continue;
      if (!hits(shape, this.player.x, this.player.y, ang, r.sprite.x, r.sprite.y, 17)) continue;
      any = true;
      this.damageRival(r, this.baseDamage * mul, stagger, Math.atan2(r.sprite.y - this.player.y, r.sprite.x - this.player.x), knock, heavy);
    }
    if (any) this.freeze = Math.max(this.freeze, heavy ? HITSTOP.heavy : HITSTOP.light);
  }

  private damageRival(r: Rival, raw: number, stagger: number, ang: number, knock: number, heavy: boolean) {
    if (r.state === 'dead') return;
    const crit = Math.random() < this.sk.critChance;
    const amount = Math.round(raw * (crit ? CRIT_BASE + this.sk.critDamage : 1));
    r.hp -= amount;
    this.damageDealt += amount;
    this.sfx.hit(1);
    this.comboCount++;
    this.comboTimer = COMBO_COUNTER_WINDOW;
    this.bestCombo = Math.max(this.bestCombo, this.comboCount);
    const killed = r.hp <= 0;
    this.number(r.sprite.x, r.sprite.y - 30, crit ? `${formatDamage(amount)}!` : formatDamage(amount), crit ? 0xff5a2a : killed ? 0xffb21f : 0xfff0b8, crit ? 32 : heavy ? 28 : 24);
    const sparks = this.add.particles(r.sprite.x, r.sprite.y, 'spark', { speed: { min: 80, max: 260 + this.levelGlow * 30 }, lifespan: 320, scale: { start: 0.5, end: 0 }, tint: [this.glowColor, 0xffffff], blendMode: 'ADD', emitting: false }).setDepth(12);
    sparks.explode(8 + Math.round(this.levelGlow * 2));
    this.time.delayedCall(400, () => sparks.destroy());
    if (killed) {
      this.killRival(r);
      return;
    }
    if (!r.revealed && r.hp / r.maxHp < REVEAL.hpBelow) this.reveal(r, '궁지에 몰리자 숨긴 힘이 드러났다');
    r.sprite.setTintFill(0xffffff);
    this.time.delayedCall(60, () => r.state !== 'dead' && r.sprite.setTint(r.state === 'windup' && r.heavy ? 0xff8a8a : RIVAL_TINT));
    r.sprite.setVelocity(Math.cos(ang) * knock, Math.sin(ang) * knock);
    r.flinch = 0.15;
    // heavy blows and combo finishers break a wind-up: the reward for reading it
    if (stagger >= 0.25 || heavy) {
      r.telegraph.clear();
      r.state = 'stagger';
      r.t = stagger;
    }
  }

  private killRival(r: Rival) {
    r.state = 'dead';
    r.telegraph.clear();
    r.hpBar.clear();
    r.sparks.stop();
    this.kills++;
    this.sfx.kill();
    this.freeze = Math.max(this.freeze, HITSTOP.kill);
    this.cameras.main.shake(120, 0.006);
    if (!r.revealed) this.reveal(r, '쓰러지며 정체가 드러났다');
    r.sprite.disableBody(true, false);
    this.tweens.add({ targets: [r.sprite, r.aura], alpha: 0, duration: 700, onComplete: () => r.sprite.setVisible(false) });
    this.tweens.add({ targets: [r.plate, r.levelTag], alpha: 0, delay: 1200, duration: 400 });
    const xp = Math.round(DOPPEL_COMBAT.xp * (1 + r.d.weapon.level * 0.1) * (1 + this.sk.xp));
    this.gainXp(xp);
    this.defeated.push(r.d);
    this.recordCard(r.d);
    if (this.living().length === 0 && this.rivals.length === this.nd.lineup.length) this.time.delayedCall(900, () => this.dawn());
  }

  /** Spec §3.6: the honest forge record of the smith you just beat. */
  private recordCard(d: Doppelganger) {
    const rec = d.record;
    const lines = [
      `무기  ${weaponLabel(d, true)}`,
      `강화 시도 ${rec.attempts}회 · 대성공 ${rec.great} · 하락 ${rec.down}`,
      rec.lastStep ? `마지막 강화  +${rec.lastStep[0]} → +${rec.lastStep[1]}` : '강화하지 않은 무기',
      rec.destroyedWeapons ? `이 무기 전에 ${rec.destroyedWeapons}자루를 부쉈다 (${rec.lostAttempts}회)` : `${TEMPERAMENTS[d.temperament].name} · 부순 무기 없음`,
    ];
    const card = this.add.container(W - 20, 220 + this.cards.length * 112).setScrollFactor(0).setDepth(115);
    const g = this.add.graphics();
    g.fillStyle(0x0d0812, 0.88);
    g.fillRoundedRect(-330, 0, 330, 104, 10);
    g.lineStyle(2, this.tierColor(d.weapon.level), 1);
    g.strokeRoundedRect(-329, 1, 328, 102, 10);
    card.add(g);
    card.add(label(this, -316, 10, `DEFEATED  ${d.name}`, 14, this.tierColor(d.weapon.level), { weight: 900 }));
    lines.forEach((l, i) => card.add(label(this, -316, 32 + i * 17, l, 12, i === 0 ? C.text : C.mute, { weight: 700 })));
    card.setAlpha(0).setX(W + 40);
    this.tweens.add({ targets: card, x: W - 20, alpha: 1, duration: 260, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: card, alpha: 0, delay: 6000, duration: 500, onComplete: () => card.destroy() });
    this.cards.push(card);
  }

  private slashFx(x: number, y: number, ang: number, shape: AttackShape, col: number, power: number) {
    const g = this.add.graphics().setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
    g.fillStyle(col, 0.28 * power);
    const r = shape.range;
    if (shape.kind === 'arc') {
      const half = ((shape.arcDeg ?? 90) * Math.PI) / 360;
      g.beginPath();
      g.arc(x, y, r, ang - half, ang + half, false);
      g.arc(x, y, r * 0.5, ang + half, ang - half, true);
      g.closePath();
      g.fillPath();
      g.lineStyle(3 * power, 0xffffff, 0.7);
      g.beginPath();
      g.arc(x, y, r * 0.96, ang - half, ang + half, false);
      g.strokePath();
    } else if (shape.kind === 'line') {
      const wd = (shape.width ?? 40) / 2;
      const c = Math.cos(ang), sn = Math.sin(ang);
      g.fillPoints([
        new Phaser.Math.Vector2(x - sn * wd, y + c * wd),
        new Phaser.Math.Vector2(x + c * r, y + sn * r),
        new Phaser.Math.Vector2(x + sn * wd, y - c * wd),
      ], true);
    } else {
      g.lineStyle(22 * power, col, 0.35);
      g.strokeCircle(x, y, r * 0.8);
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  private hurtPlayer(raw: number, heavy: boolean) {
    if (this.invuln > 0 || this.ended) return;
    const low = this.hp / this.maxHp < LAST_STAND_HP ? this.sk.lastStand : 0;
    const amount = Math.max(1, Math.round(raw * (1 - Math.min(ARMOR_CAP, this.sk.armor + low))));
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = PLAYER_COMBAT.hurtInvuln + this.sk.iframes;
    this.sfx.hurt();
    this.cameras.main.shake(heavy ? 200 : 100, heavy ? 0.012 : 0.006);
    this.player.setTintFill(0xff4a4a);
    this.time.delayedCall(80, () => this.player.clearTint());
    this.number(this.player.x, this.player.y - 40, `-${amount}`, 0xff6b6b, heavy ? 30 : 22);
    this.comboCount = 0;
    if (this.hp <= 0 && !this.revive()) this.fall();
  }

  private revive(): boolean {
    if (this.core.dispatch({ type: 'USE_REVIVE' }).type !== 'revived') return false;
    this.hp = Math.round(this.maxHp * REVIVE.hpFraction);
    this.invuln = REVIVE.invuln;
    this.sfx.revive();
    this.cameras.main.flash(500, 255, 220, 120);
    const ring = this.add.image(this.player.x, this.player.y, 'ring').setTint(ITEMS.revive.color).setDepth(30).setBlendMode('ADD').setScale(0.2);
    this.tweens.add({ targets: ring, scale: 3.2, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    for (const r of this.living()) {
      const a = Phaser.Math.Angle.Between(this.player.x, this.player.y, r.sprite.x, r.sprite.y);
      r.sprite.setVelocity(Math.cos(a) * 520, Math.sin(a) * 520);
      r.telegraph.clear();
      r.state = 'stagger';
      r.t = 0.8;
    }
    return true;
  }

  private gainXp(v: number) {
    this.xpTotal += v;
    const r = addXp(this.level, this.xp, v);
    this.level = r.level;
    this.xp = r.xp;
    if (r.levelsGained > 0) {
      this.sfx.levelUp();
      const t = label(this, this.player.x, this.player.y - 56, 'LEVEL UP', 22, 0x7fe9ff, { display: true, weight: 900, origin: [0.5, 0.5] }).setDepth(41);
      this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    }
  }

  // ───────────────────────── numbers and HUD
  private number(x: number, y: number, text: string, color: number, size: number) {
    const t = this.numbers[this.numberIdx++ % this.numbers.length];
    this.tweens.killTweensOf(t);
    const digits = text.replace(/[^0-9]/g, '').length;
    const big = size >= 24;
    const px = Math.round(size * 1.35 + (big ? Math.min(14, digits * 1.6) : 0));
    t.setText(text).setPosition(x + Phaser.Math.Between(-10, 10), y).setColor(css(color)).setFontSize(px).setStroke('#140a05', big ? 9 : 7).setAlpha(1).setScale(big ? 1.9 : 1.5).setDepth(40 + (this.numberIdx % 1000) / 1000).setVisible(true);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - (big ? 62 : 46), duration: 760, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: big ? 620 : 480, duration: 260, onComplete: () => t.setVisible(false) });
  }

  private renderHud() {
    const h = this.hud;
    const hpw = 288;
    h.hpBar.clear();
    h.hpBar.fillStyle(0x2a1416, 1);
    h.hpBar.fillRoundedRect(32, 42, hpw, 14, 4);
    h.hpBar.fillStyle(this.hp / this.maxHp < 0.3 ? C.dangerHi : C.danger, 1);
    h.hpBar.fillRoundedRect(32, 42, Math.max(0, (hpw * this.hp) / this.maxHp), 14, 4);
    h.hpText.setText(`HP ${Math.ceil(this.hp)} / ${this.maxHp}`);
    const left = this.nd.lineup.length - this.kills;
    h.rivals.setText(left > 0 ? `남은 대장장이 ${left}` : '새벽이 온다');
    h.combo.setText(this.comboCount >= 3 ? `${this.comboCount} COMBO` : '');
    h.combo.setScale(1 + Math.min(0.4, this.comboCount * 0.01));
    const xw = 460;
    const need = xpToNext(this.level);
    h.xpBar.clear();
    h.xpBar.fillStyle(0x000000, 0.6);
    h.xpBar.fillRoundedRect(W / 2 - xw / 2 - 4, H - 44, xw + 8, 28, 8);
    h.xpBar.fillStyle(0x15303a, 1);
    h.xpBar.fillRoundedRect(W / 2 - xw / 2, H - 40, xw, 20, 6);
    h.xpBar.fillStyle(0x3fc6e8, 1);
    h.xpBar.fillRoundedRect(W / 2 - xw / 2, H - 40, Math.max(4, (xw * this.xp) / need), 20, 6);
    h.xpText.setText(`Lv ${this.level}   ${this.xp} / ${need} XP`);
    // skill slots: Space, RMB, Q, E, R
    const g = h.skills;
    g.clear();
    const sx = W / 2 + 310;
    const fills = [
      1 - this.dashCd / (DASH.cooldown * (1 - Math.min(0.6, this.sk.dodgeCooldown))),
      this.charging ? Math.min(1, this.chargeT / HEAVY.chargeTime) : 1 - this.heavyCd / HEAVY.cooldown,
      1 - this.skillCd / ELEMENT_SKILL.cooldown,
      0,
      0,
    ];
    fills.forEach((f, i) => {
      const x = sx + i * 62;
      g.fillStyle(0x000000, 0.6);
      g.fillRoundedRect(x, H - 82, 52, 52, 8);
      const ready = f >= 1 && i < 3;
      g.fillStyle(i >= 3 ? 0x2a2430 : ready ? (i === 2 ? this.glowColor : 0x7fe9ff) : 0x3a4a55, i >= 3 ? 1 : 0.85);
      g.fillRoundedRect(x + 4, H - 78 + 44 * (1 - Math.max(0, Math.min(1, f))), 44, 44 * Math.max(0, Math.min(1, f)) || 1, 6);
      g.lineStyle(2, ready ? 0xffffff : 0x4a3c2c, 1);
      g.strokeRoundedRect(x, H - 82, 52, 52, 8);
    });
  }

  // ───────────────────────── endings
  private openModal(data: ModalRequest) {
    const full: ModalData = { ...data, returnTo: 'Night' };
    this.scene.launch('Modal', full);
    this.scene.pause();
  }

  private askLeave() {
    if (this.ended) return;
    const lives = this.core.state.lives;
    this.openModal({
      kind: 'confirm',
      title: '전투를 포기할까요?',
      body:
        lives <= 1
          ? '포기하면 패배로 처리됩니다.\n마지막 목숨입니다 — 모든 성장이 초기화됩니다.'
          : `포기하면 패배로 처리됩니다 (목숨 −1, 남은 목숨 ${lives - 1}).\n이번 밤의 경험치는 사라지고 같은 날로 돌아갑니다.`,
      confirmLabel: '포기하기',
      cancelLabel: '계속 싸우기',
      danger: true,
      onConfirm: () => {
        this.ended = true;
        this.lose('abandon');
      },
    });
  }

  private summaryRows(): [string, string][] {
    const m = Math.floor(this.elapsed / 60);
    const s = String(Math.floor(this.elapsed % 60)).padStart(2, '0');
    return [
      ['전투 시간', `${m}:${s}`],
      ['쓰러뜨린 대장장이', `${this.kills} / ${this.nd.lineup.length}`],
      ['최고 콤보', `${this.bestCombo}`],
      ['획득 경험치', `${this.xpTotal}`],
    ];
  }

  /** "+43 THUNDER SPEAR — 87회, 대성공 9" for every rival met tonight. */
  private rivalSummary(): string {
    return this.nd.lineup
      .map((d) => `${weaponLabel(d, this.defeated.includes(d) || this.rivals.find((r) => r.d === d)?.revealed === true)} — ${d.name}${this.defeated.includes(d) ? ` · 시도 ${d.record.attempts}회` : ''}`)
      .join('\n');
  }

  private lose(reason: 'death' | 'abandon') {
    const r = this.core.dispatch({ type: 'NIGHT_LOST', reason, kills: this.kills, seconds: this.elapsed });
    if (r.type !== 'nightLost') {
      this.scene.start('Forge');
      return;
    }
    if (r.gameOver) {
      this.goGameOver(r.gameOver);
      return;
    }
    const left = r.livesLeft;
    this.openModal({
      kind: 'result',
      tone: 'defeat',
      title: reason === 'death' ? '밤에 쓰러졌습니다' : '전투를 포기했습니다',
      subtitle: `목숨 −1 · 남은 목숨 ${left}`,
      rows: this.summaryRows(),
      note:
        `같은 상대들이 다시 찾아온다. DAY ${this.nd.day} 낮으로 돌아가 더 벼려 오세요.` +
        (left === 1 ? '\n⚠ 마지막 목숨입니다. 다음 패배는 모든 것을 잃습니다.' : ''),
      buttonLabel: `DAY ${this.nd.day} 다시 도전`,
      onClose: () => this.scene.start('Forge'),
    });
  }

  private goGameOver(summary: GameOverSummary) {
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('GameOver', { summary, reason: 'died' }));
  }

  private dawn() {
    if (this.ended) return;
    this.ended = true;
    this.player.setVelocity(0, 0);
    this.sfx.dawn();
    this.cameras.main.flash(700, 255, 240, 200);
    const t = label(this, W / 2, H / 2 - 40, '새벽이 밝았다', 48, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(110);
    t.setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 400 });
    // Save first: the win is kept even if the game closes during the celebration.
    const r = this.core.dispatch({ type: 'NIGHT_WON', kills: this.kills, seconds: this.elapsed, xp: this.xpTotal });
    this.time.delayedCall(1500, () => {
      if (r.type !== 'nightWon') {
        this.scene.start('Forge');
        return;
      }
      const rows = this.summaryRows();
      rows.push(['대장장이 레벨', r.levelsGained > 0 ? `Lv ${r.levelBefore} → Lv ${r.level}` : `Lv ${r.level}`]);
      const notes = [this.rivalSummary()];
      if (r.levelsGained > 0) notes.push(`스킬 포인트 +${r.levelsGained}`);
      notes.push(r.cleared ? '마지막 밤을 버텼습니다.' : `DAY ${r.day} 아침 · 모루가 새 무기 ${r.granted}자루를 벼려 냈습니다`);
      this.openModal({
        kind: 'result',
        tone: 'victory',
        title: '살아남았습니다',
        subtitle: `DAY ${this.nd.day} — 다른 세계의 대장장이 ${this.kills}명을 쓰러뜨렸다`,
        rows,
        note: notes.join('\n'),
        buttonLabel: r.cleared ? '대장간으로' : `DAY ${r.day} 시작`,
        onClose: () => this.scene.start('Forge'),
      });
    });
  }

  private fall() {
    this.ended = true;
    this.player.setVelocity(0, 0);
    this.sfx.fall();
    this.physics.pause();
    this.cameras.main.shake(260, 0.01);
    this.tweens.add({ targets: this.player, angle: 90, alpha: 0.4, duration: 700 });
    const t = label(this, W / 2, H / 2 - 40, '쓰러졌습니다', 48, C.dangerHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(110);
    t.setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 400 });
    this.time.delayedCall(1500, () => this.lose('death'));
  }
}

/** Kept for other modules that read tiers (e.g. future boss UI). */
export const revealTier = (level: number) => milestoneTier(level);
