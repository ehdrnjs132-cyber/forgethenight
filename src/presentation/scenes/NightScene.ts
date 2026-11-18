// Night combat (§3 NIGHT, §10, §11): WASD movement, dodge, automatic attacks with the equipped
// weapon, waves of enemies, XP gems, damage numbers and survival until dawn.
// The outcome goes to the core: a won night advances the day, a lost one costs a life (§13).
import Phaser from 'phaser';
import type { GameCore } from '../../core/game';
import type { NightWeapon } from '../../core/systems/daynight';
import type { GameOverSummary } from '../../core/state/types';
import { ENEMIES, HAMMER, PLAYER, SPAWN, WEAPON_ATTACK, WORLD, type AttackShape, type EnemyKind } from '../../config/combat';
import { CLASS_INFO, ELEMENT_INFO } from '../../config/weapons';
import { NIGHT_SECONDS } from '../../config/rules';
import { ITEMS, REVIVE } from '../../config/economy';
import { ARMOR_CAP, BLAST, CHAIN, CHILL, CRIT_BASE, HEAL_ON_KILL, LAST_STAND_HP, QUAKE, type SkillEffects } from '../../config/skills';
import { skillTotals } from '../../core/systems/skills';
import { addXp, aliveTarget, enemyStats, formatDamage, hits, pickEnemy, weaponDamage, xpToNext } from '../../combat/rules';
import { C, DISPLAY, H, W, css, label } from '../theme';
import { Sfx } from '../audio/sfx';
import { drawWeapon, weaponTexture } from '../weaponArt';
import type { ModalData, ModalRequest } from './ModalScene';

export interface NightData {
  weapon: NightWeapon;
  day: number;
}

interface EnemyFields {
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  atk: number;
  speed: number;
  radius: number;
  knockT: number;
  flashT: number;
  // skill status effects
  burnT: number;
  burnDps: number;
  burnTick: number;
  slowT: number;
  slow: number;
  frozenT: number;
  stunT: number;
}

/** A pending fire blast or ice shatter, processed a few per frame (§19 프레임당 처리 횟수). */
interface Blast {
  x: number;
  y: number;
  radius: number;
  damage: number;
  gen: number;
  kind: 'fire' | 'ice';
}

const STATUS_RESET = { burnT: 0, burnDps: 0, burnTick: 0, slowT: 0, slow: 0, frozenT: 0, stunT: 0 };
type Enemy = Phaser.Physics.Arcade.Sprite & EnemyFields;

const SWING_WIDTH: Record<string, number> = { sword: 118, spear: 214, axe: 128, hammer: 96 };

export class NightScene extends Phaser.Scene {
  private core!: GameCore;
  private nd!: NightData;
  private shape!: AttackShape;
  private damage = 0;
  private sk!: Required<SkillEffects>;
  private maxHp = PLAYER.maxHp;
  private attackCount = 0;
  private blasts: Blast[] = [];
  private duration = NIGHT_SECONDS;
  private sfx = new Sfx();

  private player!: Phaser.Physics.Arcade.Sprite;
  private enemies!: Phaser.Physics.Arcade.Group;
  private gems: Phaser.GameObjects.Image[] = [];
  private swingImg!: Phaser.GameObjects.Image;
  private swing = { rot: 0, off: 0, alpha: 0 };
  private numbers: Phaser.GameObjects.Text[] = [];
  private numberIdx = 0;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SPACE' | 'SHIFT' | 'ESC', Phaser.Input.Keyboard.Key>;

  private hp = PLAYER.maxHp;
  private invuln = 0;
  private dodgeCd = 0;
  private dodgeT = 0;
  private dodgeDir = new Phaser.Math.Vector2(1, 0);
  private facing = 0;
  private elapsed = 0;
  private attackT = 0.4;
  private spawnT = 0;
  private kills = 0;
  private level = 1;
  private xp = 0;
  private xpTotal = 0;
  private ended = false;
  private damageDealt = 0;
  private hitsTaken = 0;

  private hud!: {
    hpBar: Phaser.GameObjects.Graphics;
    hpText: Phaser.GameObjects.Text;
    timer: Phaser.GameObjects.Text;
    kills: Phaser.GameObjects.Text;
    xpBar: Phaser.GameObjects.Graphics;
    xpText: Phaser.GameObjects.Text;
    dodge: Phaser.GameObjects.Graphics;
  };

  constructor() {
    super('Night');
  }

  init(data: NightData) {
    this.core = this.registry.get('core') as GameCore;
    this.nd = data;
    const w = data.weapon;
    // Skills (§17): element nodes only count for the weapon's element (or at 50% with resonance).
    const sk = skillTotals(this.core.state, w.kind === 'weapon' ? w.weapon.element : null);
    this.sk = sk;
    const base = w.kind === 'weapon' ? WEAPON_ATTACK[w.weapon.cls] : HAMMER.attack;
    this.shape = {
      ...base,
      range: base.range * (1 + sk.area),
      width: base.width ? base.width * (1 + sk.area * 0.5) : base.width,
      interval: base.interval / (1 + sk.attackSpeed),
      knockback: base.knockback * (1 + sk.knockback + sk.waterKnock),
    };
    const raw = w.kind === 'weapon' ? weaponDamage(w.weapon.level, w.weapon.cls) : HAMMER.damage;
    const high = w.kind === 'weapon' && w.weapon.level >= 20 ? sk.highLevel : 0;
    this.damage = Math.round(raw * (1 + sk.damage + sk.mastery + high));
    this.maxHp = Math.round(PLAYER.maxHp + sk.maxHp);
    const override = Number(new URLSearchParams(location.search).get('night'));
    this.duration = override > 0 ? override : NIGHT_SECONDS;
    const p = this.core.state.player;
    Object.assign(this, {
      hp: this.maxHp, attackCount: 0, blasts: [], invuln: 0, dodgeCd: 0, dodgeT: 0, facing: 0, elapsed: 0, attackT: 0.4, spawnT: 0,
      kills: 0, level: p.level, xp: p.xp, xpTotal: 0, ended: false, damageDealt: 0, hitsTaken: 0, gems: [], numbers: [], numberIdx: 0,
    });
    this.swing = { rot: 0, off: 0, alpha: 0 };
  }

  private get dodgeCooldown(): number {
    return PLAYER.dodge.cooldown * (1 - Math.min(0.6, this.sk.dodgeCooldown));
  }

  private get cls(): string {
    return this.nd.weapon.kind === 'weapon' ? this.nd.weapon.weapon.cls : 'hammer';
  }

  private get glowColor(): number {
    return this.nd.weapon.kind === 'weapon' ? ELEMENT_INFO[this.nd.weapon.weapon.element].glow : 0xd8d0bb;
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.add.tileSprite(0, 0, WORLD.width, WORLD.height, 'ground').setOrigin(0);
    const edge = this.add.graphics();
    edge.lineStyle(6, 0x3b2d1e, 1);
    edge.strokeRect(3, 3, WORLD.width - 6, WORLD.height - 6);

    this.player = this.physics.add.sprite(WORLD.width / 2, WORLD.height / 2, 'player').setDepth(10);
    this.player.setCircle(PLAYER.radius, 28 - PLAYER.radius, 32 - PLAYER.radius);
    this.player.setCollideWorldBounds(true);

    this.enemies = this.physics.add.group({ maxSize: SPAWN.maxAlive });
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.touch(e as Enemy));

    this.swingImg = this.add.image(0, 0, this.weaponKey()).setOrigin(0.1, 0.5).setDepth(12).setAlpha(0);
    this.swingImg.setScale(SWING_WIDTH[this.cls] / this.swingImg.width);

    for (let i = 0; i < 60; i++) {
      this.numbers.push(
        this.add.text(0, 0, '', { fontFamily: DISPLAY, fontSize: '20px', fontStyle: '800', color: '#ffffff', stroke: '#000000', strokeThickness: 5, resolution: 2 }).setOrigin(0.5).setDepth(40).setVisible(false),
      );
    }

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.fadeIn(400, 0, 0, 0);
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setScrollFactor(0).setDepth(90);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,ESC') as typeof this.keys;
    kb.addCapture('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT');
    this.keys.ESC.on('down', () => this.askLeave());

    this.buildHud();
    this.intro();
    for (let i = 0; i < aliveTarget(this.nd.day, 0, this.duration); i++) this.spawnOne();
  }

  // ───────────────────────── setup helpers
  private weaponKey(): string {
    if (this.nd.weapon.kind === 'hammer') return 'weapon-hammer';
    const { cls, element, level } = this.nd.weapon.weapon;
    const key = weaponTexture(cls, element);
    if (this.textures.exists(key)) return key;
    const fallback = `weapon-fallback-${cls}-${element}`;
    if (!this.textures.exists(fallback)) {
      const g = this.add.graphics();
      g.setPosition(160, 60);
      drawWeapon(g, { cls, element, level }, 300);
      g.generateTexture(fallback, 320, 120);
      g.destroy();
    }
    return fallback;
  }

  private buildHud() {
    const nw = this.nd.weapon;
    const name = nw.kind === 'weapon' ? `${ELEMENT_INFO[nw.weapon.element].name} ${CLASS_INFO[nw.weapon.cls].name} +${nw.weapon.level}` : HAMMER.name;
    const style = nw.kind === 'weapon' ? CLASS_INFO[nw.weapon.cls].style : '무기가 없을 때의 임시 무기';
    const fix = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(100);
    const back = fix(this.add.graphics());
    back.fillStyle(0x000000, 0.55);
    back.fillRoundedRect(16, 14, 300, 92, 10);
    back.fillRoundedRect(W - 196, 14, 180, 64, 10);
    back.fillRoundedRect(W / 2 - 90, 10, 180, 70, 10);
    const hpBar = fix(this.add.graphics());
    const hpText = fix(label(this, 32, 22, '', 14, C.text, { weight: 700 }));
    fix(label(this, 32, 66, name, 15, this.glowColor, { weight: 900 }));
    fix(label(this, 32, 86, `한 번에 ${formatDamage(this.damage)} · ${style}`, 12, C.mute, { weight: 700 }));
    const dodge = fix(this.add.graphics());
    fix(label(this, W / 2, 22, '새벽까지', 12, C.mute, { weight: 700, origin: [0.5, 0] }));
    const timer = fix(label(this, W / 2, 50, '', 30, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }));
    const kills = fix(label(this, W - 32, 46, '', 20, C.text, { weight: 900, origin: [1, 0.5] }));
    fix(label(this, W - 180, 46, `DAY ${this.nd.day}`, 14, C.mute, { weight: 700, origin: [0, 0.5] }));
    const xpBar = fix(this.add.graphics());
    const xpText = fix(label(this, W / 2, H - 30, '', 13, C.text, { weight: 700, origin: [0.5, 0.5] }));
    fix(label(this, 20, H - 22, `WASD 이동 · Space 회피 · Esc 포기   |   남은 목숨 ${this.core.state.lives}`, 12, C.dim, { origin: [0, 0.5] }));
    this.hud = { hpBar, hpText, timer, kills, xpBar, xpText, dodge };
  }

  private intro() {
    const t = label(this, W / 2, H / 2 - 60, `DAY ${this.nd.day} · 밤`, 46, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(110);
    const s = label(this, W / 2, H / 2 - 12, `새벽까지 ${Math.round(this.duration)}초를 버티세요`, 18, C.text, { weight: 700, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(110);
    for (const o of [t, s]) {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 300 });
      this.tweens.add({ targets: o, alpha: 0, delay: 1700, duration: 500, onComplete: () => o.destroy() });
    }
  }

  // ───────────────────────── loop
  update(_time: number, deltaMs: number) {
    if (this.ended) return;
    const dt = Math.min(0.05, deltaMs / 1000);
    this.elapsed += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);

    if (this.sk.regen > 0) this.hp = Math.min(this.maxHp, this.hp + this.sk.regen * dt);
    this.movePlayer(dt);
    this.steerEnemies(dt);
    this.spawn(dt);
    this.attack(dt);
    this.processBlasts();
    this.collectGems(dt);
    this.placeSwing();
    this.renderHud();

    if (this.elapsed >= this.duration) this.dawn();
  }

  private movePlayer(dt: number) {
    const k = this.keys;
    const dir = new Phaser.Math.Vector2((k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0), (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0));
    if (dir.lengthSq() > 0) dir.normalize();

    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      const v = this.dodgeDir.clone().scale(PLAYER.dodge.distance / PLAYER.dodge.duration);
      this.player.setVelocity(v.x, v.y);
      if (Math.random() < 0.6) this.ghost();
      return;
    }
    if ((Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.SHIFT)) && this.dodgeCd <= 0) {
      this.dodgeDir = dir.lengthSq() > 0 ? dir.clone() : new Phaser.Math.Vector2(Math.cos(this.facing), Math.sin(this.facing));
      this.dodgeT = PLAYER.dodge.duration;
      this.dodgeCd = this.dodgeCooldown;
      this.invuln = Math.max(this.invuln, PLAYER.dodge.iframes);
      this.sfx.dodge();
      return;
    }
    const speed = PLAYER.speed * (1 + this.sk.moveSpeed);
    this.player.setVelocity(dir.x * speed, dir.y * speed);
    if (dir.x !== 0) this.player.setFlipX(dir.x < 0);
    this.player.setAlpha(this.invuln > 0 && this.dodgeT <= 0 ? 0.55 + 0.45 * Math.sin(this.elapsed * 40) : 1);
  }

  private ghost() {
    const g = this.add.image(this.player.x, this.player.y, 'player').setFlipX(this.player.flipX).setTint(0x7fc8ff).setAlpha(0.45).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  private steerEnemies(dt: number) {
    const px = this.player.x;
    const py = this.player.y;
    this.enemies.children.each((obj) => {
      const e = obj as Enemy;
      if (!e.active) return true;
      if (e.flashT > 0) {
        e.flashT -= dt;
        if (e.flashT <= 0) this.statusTint(e);
      }
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          this.hurtEnemy(e, Math.max(1, Math.round(e.burnDps * 0.5)), { quiet: true, color: 0xff8a3a });
          if (!e.active) return true;
        }
      }
      if (e.slowT > 0) e.slowT -= dt;
      if (e.frozenT > 0 || e.stunT > 0) {
        e.frozenT = Math.max(0, e.frozenT - dt);
        e.stunT = Math.max(0, e.stunT - dt);
        if (e.knockT <= 0) e.setVelocity(0, 0);
        else e.knockT -= dt;
        if (e.frozenT <= 0 && e.stunT <= 0) this.statusTint(e);
        return true;
      }
      if (e.knockT > 0) {
        e.knockT -= dt;
        return true;
      }
      const a = Math.atan2(py - e.y, px - e.x);
      const sp = e.speed * (e.slowT > 0 ? 1 - e.slow : 1);
      e.setVelocity(Math.cos(a) * sp, Math.sin(a) * sp);
      e.setFlipX(px < e.x);
      return true;
    });
  }

  private spawn(dt: number) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = SPAWN.every;
    const want = aliveTarget(this.nd.day, this.elapsed, this.duration);
    for (let i = 0; i < SPAWN.burst && this.enemies.countActive(true) < want; i++) this.spawnOne();
  }

  private spawnOne() {
    const kind = pickEnemy(Math.random());
    const def = ENEMIES[kind];
    const a = Math.random() * Math.PI * 2;
    const d = Phaser.Math.Between(SPAWN.minDist, SPAWN.maxDist);
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * d, 40, WORLD.width - 40);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * d, 40, WORLD.height - 40);
    const e = this.enemies.get(x, y, `enemy-${kind}`) as Enemy | null;
    if (!e) return;
    const stats = enemyStats(kind, this.nd.day);
    e.setTexture(`enemy-${kind}`).setActive(true).setVisible(true).setAlpha(1).clearTint().setDepth(8);
    e.enableBody(true, x, y, true, true);
    e.setCircle(def.radius, e.width / 2 - def.radius, e.height / 2 - def.radius);
    Object.assign(e, { kind, hp: stats.hp, maxHp: stats.hp, atk: stats.atk, speed: def.speed * Phaser.Math.FloatBetween(0.9, 1.15), radius: def.radius, knockT: 0, flashT: 0, ...STATUS_RESET });
  }

  // ───────────────────────── attacking
  private nearestEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    this.enemies.children.each((obj) => {
      const e = obj as Enemy;
      if (!e.active) return true;
      const d = Phaser.Math.Distance.Squared(this.player.x, this.player.y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
      return true;
    });
    return best;
  }

  private attack(dt: number) {
    this.attackT -= dt;
    if (this.attackT > 0) return;
    const target = this.nearestEnemy();
    if (!target || Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y) > this.shape.range * this.shape.engage) {
      this.attackT = 0.08;
      return;
    }
    this.attackT = this.shape.interval;
    this.attackCount++;
    this.facing = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    this.swingFx(this.facing);
    const px = this.player.x;
    const py = this.player.y;
    const hit: Enemy[] = [];
    this.enemies.children.each((obj) => {
      const e = obj as Enemy;
      if (e.active && hits(this.shape, px, py, this.facing, e.x, e.y, e.radius)) hit.push(e);
      return true;
    });
    for (const e of hit) this.strike(e, this.damage);
    if (hit.length) this.sfx.hit(hit.length);
    if (this.sk.chainCount > 0 && hit.length) this.chain(hit[hit.length - 1], new Set(hit));
    if (this.sk.quake > 0 && this.attackCount % QUAKE.every === 0) this.quake();
  }

  /** A weapon hit: crit roll, then the element riders (burn, chill, freeze). */
  private strike(e: Enemy, base: number, scale = 1) {
    const crit = Math.random() < this.sk.critChance;
    const amount = Math.round(base * scale * (crit ? CRIT_BASE + this.sk.critDamage : 1));
    if (this.sk.burn > 0) {
      e.burnT = 2;
      e.burnDps = Math.max(e.burnDps, (amount * this.sk.burn) / 2);
    }
    if (this.sk.chill > 0) {
      e.slowT = CHILL.seconds;
      e.slow = Math.min(0.8, this.sk.chill);
    }
    if (this.sk.freezeChance > 0 && Math.random() < this.sk.freezeChance) e.frozenT = CHILL.freezeSeconds;
    this.hurtEnemy(e, amount, { crit });
  }

  /** 번개 연쇄: jump from the last target to the nearest enemies not yet hit. */
  private chain(from: Enemy, done: Set<Enemy>) {
    let src = { x: from.x, y: from.y };
    const g = this.add.graphics().setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(3, 0xb9e8ff, 1);
    for (let i = 0; i < Math.round(this.sk.chainCount); i++) {
      let best: Enemy | null = null;
      let bestD = CHAIN.range * CHAIN.range;
      this.enemies.children.each((obj) => {
        const e = obj as Enemy;
        if (!e.active || done.has(e)) return true;
        const d = Phaser.Math.Distance.Squared(src.x, src.y, e.x, e.y);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
        return true;
      });
      if (!best) break;
      const t = best as Enemy;
      done.add(t);
      // jagged bolt
      g.beginPath();
      g.moveTo(src.x, src.y);
      for (let k = 1; k < 4; k++) g.lineTo(src.x + ((t.x - src.x) * k) / 4 + Phaser.Math.Between(-10, 10), src.y + ((t.y - src.y) * k) / 4 + Phaser.Math.Between(-10, 10));
      g.lineTo(t.x, t.y);
      g.strokePath();
      src = { x: t.x, y: t.y };
      this.strike(t, this.damage, this.sk.chainDamage);
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
  }

  /** 대지 충격파: a ring around the smith that pushes and stuns. */
  private quake() {
    const px = this.player.x;
    const py = this.player.y;
    const ring = this.add.image(px, py, 'ring').setTint(0xd9a066).setDepth(7).setScale(0.3).setAlpha(0.9);
    this.tweens.add({ targets: ring, scale: (QUAKE.radius * 2) / 128, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    this.cameras.main.shake(70, 0.003);
    this.enemies.children.each((obj) => {
      const e = obj as Enemy;
      if (!e.active || Phaser.Math.Distance.Between(px, py, e.x, e.y) > QUAKE.radius + e.radius) return true;
      if (this.sk.stun > 0) e.stunT = Math.max(e.stunT, this.sk.stun);
      this.hurtEnemy(e, Math.round(this.damage * this.sk.quake), { knock: 2.2, color: 0xe8c08a });
      return true;
    });
  }

  private statusTint(e: Enemy) {
    if (e.frozenT > 0) e.setTint(0x9fdcff);
    else if (e.stunT > 0) e.setTint(0xe8c08a);
    else e.clearTint();
  }

  /** Fire blasts and ice shatters, at most BLAST.perFrame per frame. */
  private processBlasts() {
    for (let n = 0; n < BLAST.perFrame && this.blasts.length; n++) {
      const b = this.blasts.shift()!;
      const col = b.kind === 'fire' ? 0xff7a2a : 0x9fdcff;
      const ring = this.add.image(b.x, b.y, 'ring').setTint(col).setDepth(9).setBlendMode('ADD').setScale(0.2);
      this.tweens.add({ targets: ring, scale: (b.radius * 2) / 128, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
      this.enemies.children.each((obj) => {
        const e = obj as Enemy;
        if (e.active && Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y) <= b.radius + e.radius) this.hurtEnemy(e, b.damage, { gen: b.gen + 1, quiet: true, color: col });
        return true;
      });
    }
  }

  private swingFx(angle: number) {
    const cls = this.cls;
    const glow = this.glowColor;
    this.sfx.swing(cls === 'axe' || cls === 'hammer');
    this.tweens.killTweensOf(this.swing);
    const s = this.swing;
    if (cls === 'sword' || cls === 'hammer') {
      Object.assign(s, { rot: angle - 1.15, off: 8, alpha: 1 });
      this.tweens.add({ targets: s, rot: angle + 1.15, duration: 150, ease: 'Cubic.easeOut' });
    } else if (cls === 'spear') {
      Object.assign(s, { rot: angle, off: -10, alpha: 1 });
      this.tweens.add({ targets: s, off: this.shape.range * 0.42, duration: 90, yoyo: true, ease: 'Cubic.easeOut' });
    } else {
      Object.assign(s, { rot: angle, off: 6, alpha: 1 });
      this.tweens.add({ targets: s, rot: angle + Math.PI * 2, duration: 260, ease: 'Cubic.easeOut' });
    }
    this.tweens.add({ targets: s, alpha: 0, delay: cls === 'axe' ? 220 : 150, duration: 140 });

    // slash trail
    const g = this.add.graphics().setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
    const px = this.player.x;
    const py = this.player.y;
    const r = this.shape.range;
    g.fillStyle(glow, 0.32);
    if (this.shape.kind === 'arc') {
      const half = ((this.shape.arcDeg ?? 90) * Math.PI) / 360;
      g.beginPath();
      g.arc(px, py, r, angle - half, angle + half, false);
      g.arc(px, py, r * 0.45, angle + half, angle - half, true);
      g.closePath();
      g.fillPath();
    } else if (this.shape.kind === 'line') {
      const wd = (this.shape.width ?? 40) / 2;
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      g.fillPoints([
        new Phaser.Math.Vector2(px - sn * wd, py + c * wd),
        new Phaser.Math.Vector2(px + c * r - sn * wd * 0.3, py + sn * r + c * wd * 0.3),
        new Phaser.Math.Vector2(px + c * r + sn * wd * 0.3, py + sn * r - c * wd * 0.3),
        new Phaser.Math.Vector2(px + sn * wd, py - c * wd),
      ], true);
    } else {
      g.lineStyle(26, glow, 0.3);
      g.strokeCircle(px, py, r * 0.78);
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  private placeSwing() {
    const s = this.swing;
    this.swingImg.setAlpha(s.alpha);
    if (s.alpha <= 0) return;
    this.swingImg.setRotation(s.rot);
    this.swingImg.setPosition(this.player.x + Math.cos(s.rot) * s.off, this.player.y + 6 + Math.sin(s.rot) * s.off);
  }

  private hurtEnemy(e: Enemy, amount: number, o: { gen?: number; quiet?: boolean; crit?: boolean; knock?: number; color?: number } = {}) {
    if (!e.active) return;
    e.hp -= amount;
    this.damageDealt += Math.min(amount, e.hp + amount);
    const killed = e.hp <= 0;
    // Riders (burn ticks, blasts) only show a number now and then to keep the screen readable.
    if (!o.quiet || killed || Math.random() < 0.25) {
      const color = o.crit ? 0xff9a2a : killed ? 0xffd34d : (o.color ?? 0xffffff);
      this.number(e.x, e.y - 18, o.crit ? `${formatDamage(amount)}!` : formatDamage(amount), color, o.crit ? 28 : killed ? 24 : o.quiet ? 15 : 18);
    }
    if (killed) {
      this.killEnemy(e, o.gen ?? 0);
      return;
    }
    if (o.quiet) return;
    e.setTintFill(0xffffff);
    e.flashT = 0.06;
    const a = Math.atan2(e.y - this.player.y, e.x - this.player.x);
    const kb = this.shape.knockback * (o.knock ?? 1);
    e.setVelocity(Math.cos(a) * kb, Math.sin(a) * kb);
    e.knockT = 0.14;
  }

  private killEnemy(e: Enemy, gen = 0) {
    const { x, y, kind } = e;
    const def = ENEMIES[kind];
    const wasFrozen = e.frozenT > 0;
    e.disableBody(true, true);
    this.kills++;
    // 화염 폭발 (§18): the first blast is a roll, blast kills always chain; 5 generations, −20% each.
    if (this.sk.blastChance > 0 && gen < BLAST.maxGen && (gen > 0 || Math.random() < this.sk.blastChance))
      this.blasts.push({ x, y, radius: BLAST.radius, damage: Math.round(this.damage * this.sk.blastDamage * Math.pow(BLAST.falloff, gen)), gen, kind: 'fire' });
    // 빙결 파쇄: shatter once; shatter kills do not shatter again.
    if (wasFrozen && this.sk.shatter > 0 && gen < BLAST.maxGen)
      this.blasts.push({ x, y, radius: CHILL.shatterRadius, damage: Math.round(this.damage * this.sk.shatter), gen: BLAST.maxGen - 1, kind: 'ice' });
    if (this.sk.healOnKill > 0 && Math.random() < this.sk.healOnKill && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + HEAL_ON_KILL);
      this.number(this.player.x, this.player.y - 34, `+${HEAL_ON_KILL}`, 0x6fe0ff, 16);
    }
    this.sfx.kill();
    const burst = this.add.particles(x, y, 'spark', {
      speed: { min: 60, max: 220 },
      lifespan: 360,
      scale: { start: 0.45, end: 0 },
      tint: kind === 'slime' ? [0x7ccf4a, 0xb6ff7a] : [0xece6d4, 0xbdb6ad],
      emitting: false,
    }).setDepth(9);
    burst.explode(10);
    this.time.delayedCall(420, () => burst.destroy());
    this.dropGem(x, y, def.xp * (1 + this.sk.xp));
    if (def.explode) this.slimeBlast(x, y, def.explode, e.atk);
  }

  private slimeBlast(x: number, y: number, ex: { radius: number; atkMul: number; delay: number }, atk: number) {
    const ring = this.add.graphics().setDepth(7);
    const warn = { t: 0 };
    this.tweens.add({
      targets: warn,
      t: 1,
      duration: ex.delay * 1000,
      onUpdate: () => {
        ring.clear();
        ring.fillStyle(0xff7a2a, 0.12 + warn.t * 0.18);
        ring.fillCircle(x, y, ex.radius * warn.t);
        ring.lineStyle(2, 0xffb347, 0.8);
        ring.strokeCircle(x, y, ex.radius);
      },
      onComplete: () => {
        ring.destroy();
        if (this.ended) return;
        this.sfx.boom();
        this.cameras.main.shake(90, 0.004);
        const b = this.add.particles(x, y, 'spark', { speed: { min: 80, max: 320 }, lifespan: 420, scale: { start: 0.8, end: 0 }, tint: [0xff7a2a, 0xffd34d], blendMode: 'ADD', emitting: false }).setDepth(9);
        b.explode(26);
        this.time.delayedCall(480, () => b.destroy());
        if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) <= ex.radius + PLAYER.radius) this.hurtPlayer(Math.round(atk * ex.atkMul));
      },
    });
  }

  // ───────────────────────── player damage
  private touch(e: Enemy) {
    if (!e.active || this.ended) return;
    this.hurtPlayer(e.atk);
  }

  private hurtPlayer(raw: number) {
    if (this.invuln > 0 || this.ended) return;
    const low = this.hp / this.maxHp < LAST_STAND_HP ? this.sk.lastStand : 0;
    const amount = Math.max(1, Math.round(raw * (1 - Math.min(ARMOR_CAP, this.sk.armor + low))));
    this.hp = Math.max(0, this.hp - amount);
    this.hitsTaken++;
    this.invuln = PLAYER.hurtInvuln + this.sk.iframes;
    this.sfx.hurt();
    this.cameras.main.shake(90, 0.005);
    this.player.setTintFill(0xff4a4a);
    this.time.delayedCall(80, () => this.player.clearTint());
    this.number(this.player.x, this.player.y - 30, `-${amount}`, 0xff6b6b, 20);
    if (this.hp <= 0 && !this.revive()) this.fall();
  }

  /** Revive stone (§15): used automatically on a fatal hit, saved at once. */
  private revive(): boolean {
    if (this.core.dispatch({ type: 'USE_REVIVE' }).type !== 'revived') return false;
    this.hp = Math.round(this.maxHp * REVIVE.hpFraction);
    this.invuln = REVIVE.invuln;
    this.sfx.revive();
    this.cameras.main.flash(500, 255, 220, 120);
    const ring = this.add.image(this.player.x, this.player.y, 'ring').setTint(ITEMS.revive.color).setDepth(30).setBlendMode('ADD').setScale(0.2);
    this.tweens.add({ targets: ring, scale: 3.2, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    // push the crowd back so the revive is not wasted on the same hit
    this.enemies.children.each((obj) => {
      const e = obj as Enemy;
      if (e.active && Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < 260) {
        const a = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y);
        e.setVelocity(Math.cos(a) * 520, Math.sin(a) * 520);
      }
      return true;
    });
    this.tweens.add({ targets: this.player, alpha: 0.45, duration: 120, yoyo: true, repeat: Math.floor((REVIVE.invuln * 1000) / 240) - 1 });
    const left = this.core.state.items.revive ?? 0;
    const t = label(this, W / 2, H / 2 - 120, '부활석이 빛난다', 34, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(110);
    const sub = label(this, W / 2, H / 2 - 82, `목숨 감소 없이 부활 · 남은 부활석 ${left}`, 15, C.text, { weight: 700, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(110);
    this.tweens.add({ targets: [t, sub], alpha: 0, delay: 1400, duration: 500, onComplete: () => { t.destroy(); sub.destroy(); } });
    return true;
  }

  // ───────────────────────── XP
  private dropGem(x: number, y: number, value: number) {
    let gem = this.gems.find((g) => !g.active);
    if (!gem) {
      gem = this.add.image(0, 0, 'xp').setDepth(6);
      this.gems.push(gem);
    }
    gem.setPosition(x + Phaser.Math.Between(-6, 6), y + Phaser.Math.Between(-6, 6)).setActive(true).setVisible(true).setScale(1).setData('v', value).setData('pull', 0);
  }

  private collectGems(dt: number) {
    const px = this.player.x;
    const py = this.player.y;
    for (const g of this.gems) {
      if (!g.active) continue;
      const d = Phaser.Math.Distance.Between(g.x, g.y, px, py);
      let pull = g.getData('pull') as number;
      if (d < PLAYER.pickupRadius * (1 + this.sk.pickup) || pull > 0) {
        pull = Math.min(900, pull + 1600 * dt + 120);
        g.setData('pull', pull);
        const a = Math.atan2(py - g.y, px - g.x);
        g.x += Math.cos(a) * pull * dt;
        g.y += Math.sin(a) * pull * dt;
      }
      if (d < 22) {
        g.setActive(false).setVisible(false);
        this.gainXp(g.getData('v') as number);
      }
    }
  }

  private gainXp(v: number) {
    this.sfx.gem();
    this.xpTotal += v;
    const r = addXp(this.level, this.xp, v);
    this.level = r.level;
    this.xp = r.xp;
    if (r.levelsGained > 0) {
      this.sfx.levelUp();
      const t = label(this, this.player.x, this.player.y - 46, 'LEVEL UP', 22, 0x7fe9ff, { display: true, weight: 900, origin: [0.5, 0.5] }).setDepth(41);
      this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    }
  }

  // ───────────────────────── numbers and HUD
  private number(x: number, y: number, text: string, color: number, size: number) {
    const t = this.numbers[this.numberIdx++ % this.numbers.length];
    this.tweens.killTweensOf(t);
    t.setText(text).setPosition(x + Phaser.Math.Between(-8, 8), y).setColor(css(color)).setFontSize(size).setAlpha(1).setScale(1.25).setVisible(true);
    this.tweens.add({ targets: t, y: y - 38, scale: 1, duration: 520, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 380, duration: 260, onComplete: () => t.setVisible(false) });
  }

  private renderHud() {
    const h = this.hud;
    const hpw = 268;
    h.hpBar.clear();
    h.hpBar.fillStyle(0x2a1416, 1);
    h.hpBar.fillRoundedRect(32, 42, hpw, 14, 4);
    h.hpBar.fillStyle(this.hp / this.maxHp < 0.3 ? C.dangerHi : C.danger, 1);
    h.hpBar.fillRoundedRect(32, 42, Math.max(0, (hpw * this.hp) / this.maxHp), 14, 4);
    h.hpText.setText(`HP ${Math.ceil(this.hp)} / ${this.maxHp}`);
    const left = Math.max(0, this.duration - this.elapsed);
    h.timer.setText(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`);
    h.kills.setText(`처치 ${this.kills}`);
    const xw = 560;
    const need = xpToNext(this.level);
    h.xpBar.clear();
    h.xpBar.fillStyle(0x000000, 0.6);
    h.xpBar.fillRoundedRect(W / 2 - xw / 2 - 4, H - 44, xw + 8, 28, 8);
    h.xpBar.fillStyle(0x15303a, 1);
    h.xpBar.fillRoundedRect(W / 2 - xw / 2, H - 40, xw, 20, 6);
    h.xpBar.fillStyle(0x3fc6e8, 1);
    h.xpBar.fillRoundedRect(W / 2 - xw / 2, H - 40, Math.max(4, (xw * this.xp) / need), 20, 6);
    h.xpText.setText(`Lv ${this.level}   ${this.xp} / ${need} XP`);
    const ready = 1 - this.dodgeCd / this.dodgeCooldown;
    h.dodge.clear();
    h.dodge.fillStyle(0x15303a, 1);
    h.dodge.fillRoundedRect(220, 64, 80, 8, 3);
    h.dodge.fillStyle(ready >= 1 ? 0x7fe9ff : 0x3a6a7a, 1);
    h.dodge.fillRoundedRect(220, 64, 80 * ready, 8, 3);
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
      ['생존 시간', `${m}:${s}`],
      ['처치', `${this.kills}`],
      ['획득 경험치', `${this.xpTotal}`],
      ['가한 피해', formatDamage(this.damageDealt)],
    ];
  }

  /** Records the loss (saved at once) and shows retry or game over. */
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
        `이번 밤의 경험치는 사라졌습니다. DAY ${this.nd.day} 낮으로 돌아가 다시 준비하세요.` +
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
    this.ended = true;
    this.player.setVelocity(0, 0);
    this.sfx.dawn();
    this.cameras.main.flash(700, 255, 240, 200);
    this.enemies.children.each((obj) => {
      const e = obj as Enemy;
      if (e.active) {
        e.body!.enable = false;
        this.tweens.add({ targets: e, alpha: 0, duration: 600 });
      }
      return true;
    });
    const t = label(this, W / 2, H / 2 - 40, '새벽이 밝았다', 48, C.goldHi, { display: true, weight: 900, origin: [0.5, 0.5] }).setScrollFactor(0).setDepth(110);
    t.setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 400 });
    // Save first (§19): the win is kept even if the game closes during the celebration.
    const r = this.core.dispatch({ type: 'NIGHT_WON', kills: this.kills, seconds: this.elapsed, xp: this.xpTotal });
    this.time.delayedCall(1500, () => {
      if (r.type !== 'nightWon') {
        this.scene.start('Forge');
        return;
      }
      const rows = this.summaryRows();
      rows.push(['대장장이 레벨', r.levelsGained > 0 ? `Lv ${r.levelBefore} → Lv ${r.level}` : `Lv ${r.level}`]);
      const notes: string[] = [];
      if (r.levelsGained > 0) notes.push(`스킬 포인트 +${r.levelsGained}`);
      notes.push(r.cleared ? '마지막 밤을 버텼습니다.' : `DAY ${r.day} 아침 · 새 무기 ${r.granted}자루가 도착했습니다`);
      this.openModal({
        kind: 'result',
        tone: 'victory',
        title: '살아남았습니다',
        subtitle: `DAY ${this.nd.day}의 밤을 버텼습니다`,
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

