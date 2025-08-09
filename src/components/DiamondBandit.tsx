import React, { useEffect, useMemo, useRef, useState } from 'react';

type Vec = { x: number; y: number };

type EnemyKind = 'square' | 'ball' | 'shard' | 'gust' | 'void';

type EnemyMode = 'wander' | 'seek';

type Enemy = { pos: Vec; vel: Vec; size: number; color: string; kind: EnemyKind; alpha?: number; speed: number; detectRadius: number; mode: EnemyMode; willSeek: boolean };

type ThemeName = 'Desert' | 'Ice' | 'Fire' | 'Wind' | 'Void';

type Particle = { x: number; y: number; vx: number; vy: number; size: number; alpha: number; shape: 'dot' | 'line'; color: string };

type GameState =
  | { kind: 'menu' }
  | { kind: 'playing'; level: number; enemies: Enemy[]; player: Vec; diamond: Vec }
  | { kind: 'victory' };

const CANVAS_LOGICAL: Vec = { x: 900, y: 540 }; // 5:3 aspect, good for most screens
const PLAYER_SIZE = 20; // logical size of the car body
const ENEMY_SIZE = 20;
const DIAMOND_SIZE = 24;
const PLAYER_SPEED = 240; // px/s (reduced for higher difficulty)
const ENEMY_SPEED_BASE = 140; // base px/s (increased for higher difficulty)
const LEVEL_ENEMIES = [3, 5, 7, 10, 12];
const LEVEL_NAMES = ['Desert', 'Ice', 'Fire', 'Wind', 'Void'] as const;

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function aabb(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function diamondHit(player: Vec, diamond: Vec) {
  // Treat diamond as AABB for hit purposes to keep it simple
  const half = DIAMOND_SIZE / 2;
  return aabb(
    { x: player.x, y: player.y, w: PLAYER_SIZE, h: PLAYER_SIZE },
    { x: diamond.x - half, y: diamond.y - half, w: DIAMOND_SIZE, h: DIAMOND_SIZE }
  );
}

function randomNonOverlappingPos(pad: number, existing: { x: number; y: number; w: number; h: number }[]) {
  for (let i = 0; i < 1000; i++) {
    const x = rand(pad, CANVAS_LOGICAL.x - pad);
    const y = rand(pad, CANVAS_LOGICAL.y - pad);
    const box = { x: x - pad / 2, y: y - pad / 2, w: pad, h: pad };
    if (!existing.some((e) => aabb(e, box))) return { x, y };
  }
  return { x: pad, y: pad };
}

function themeForLevel(level: number) {
  const idx = Math.max(1, Math.min(level, 5));
  switch (idx) {
    case 1: // Desert
      return {
        name: 'Desert',
        bg: (ctx: CanvasRenderingContext2D) => {
          const g = ctx.createLinearGradient(0, 0, 0, CANVAS_LOGICAL.y);
          g.addColorStop(0, '#fef3c7');
          g.addColorStop(1, '#fde68a');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, CANVAS_LOGICAL.x, CANVAS_LOGICAL.y);
          // dunes
          ctx.fillStyle = '#f59e0b22';
          for (let i = 0; i < 5; i++) {
            const y = CANVAS_LOGICAL.y * (0.3 + i * 0.12);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(CANVAS_LOGICAL.x * 0.25, y - 20, CANVAS_LOGICAL.x * 0.5, y + 10, CANVAS_LOGICAL.x, y - 10);
            ctx.lineTo(CANVAS_LOGICAL.x, y + 40);
            ctx.lineTo(0, y + 40);
            ctx.closePath();
            ctx.fill();
          }
        },
        enemyKind: 'square' as EnemyKind,
        enemyColor: '#b45309',
        enemySize: 20,
        speedBonus: 0,
      };
    case 2: // Ice
      return {
        name: 'Ice',
        bg: (ctx: CanvasRenderingContext2D) => {
          const g = ctx.createLinearGradient(0, 0, CANVAS_LOGICAL.x, CANVAS_LOGICAL.y);
          g.addColorStop(0, '#e0f2fe');
          g.addColorStop(1, '#bfdbfe');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, CANVAS_LOGICAL.x, CANVAS_LOGICAL.y);
          // frost shards
          ctx.strokeStyle = '#60a5fa55';
          for (let i = 0; i < 80; i++) {
            const x = Math.random() * CANVAS_LOGICAL.x;
            const y = Math.random() * CANVAS_LOGICAL.y;
            ctx.beginPath();
            ctx.moveTo(x - 6, y);
            ctx.lineTo(x + 6, y);
            ctx.moveTo(x, y - 6);
            ctx.lineTo(x, y + 6);
            ctx.stroke();
          }
        },
        enemyKind: 'shard' as EnemyKind,
        enemyColor: '#38bdf8',
        enemySize: 22,
        speedBonus: 10,
      };
    case 3: // Fire
      return {
        name: 'Fire',
        bg: (ctx: CanvasRenderingContext2D) => {
          const g = ctx.createLinearGradient(0, 0, 0, CANVAS_LOGICAL.y);
          g.addColorStop(0, '#fca5a5');
          g.addColorStop(1, '#ef4444');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, CANVAS_LOGICAL.x, CANVAS_LOGICAL.y);
          // heat waves
          ctx.strokeStyle = '#faf5ff22';
          for (let i = 0; i < 10; i++) {
            const y = (i + 1) * 40;
            ctx.beginPath();
            for (let x = 0; x < CANVAS_LOGICAL.x; x += 8) {
              const yy = y + Math.sin((x + i * 20) / 20) * 3;
              if (x === 0) ctx.moveTo(x, yy);
              else ctx.lineTo(x, yy);
            }
            ctx.stroke();
          }
        },
        enemyKind: 'ball' as EnemyKind,
        enemyColor: '#fb923c',
        enemySize: 20,
        speedBonus: 20,
      };
    case 4: // Wind
      return {
        name: 'Wind',
        bg: (ctx: CanvasRenderingContext2D) => {
          const g = ctx.createLinearGradient(0, 0, CANVAS_LOGICAL.x, 0);
          g.addColorStop(0, '#e5e7eb');
          g.addColorStop(1, '#cbd5e1');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, CANVAS_LOGICAL.x, CANVAS_LOGICAL.y);
          // gust lines
          ctx.strokeStyle = '#94a3b855';
          for (let y = 30; y < CANVAS_LOGICAL.y; y += 40) {
            ctx.beginPath();
            for (let x = -40; x < CANVAS_LOGICAL.x + 40; x += 20) {
              const yy = y + Math.sin((x + y) / 30) * 5;
              if (x <= -40) ctx.moveTo(x, yy);
              else ctx.lineTo(x, yy);
            }
            ctx.stroke();
          }
        },
        enemyKind: 'gust' as EnemyKind,
        enemyColor: '#64748b',
        enemySize: 26,
        speedBonus: 30,
      };
    case 5: // Void
    default:
      return {
        name: 'Void',
        bg: (ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = '#0b1020';
          ctx.fillRect(0, 0, CANVAS_LOGICAL.x, CANVAS_LOGICAL.y);
          // stars
          for (let i = 0; i < 200; i++) {
            const x = Math.random() * CANVAS_LOGICAL.x;
            const y = Math.random() * CANVAS_LOGICAL.y;
            const a = Math.random() * 0.6 + 0.2;
            ctx.fillStyle = `rgba(180, 160, 255, ${a})`;
            ctx.fillRect(x, y, 1, 1);
          }
        },
        enemyKind: 'void' as EnemyKind,
        enemyColor: '#7c3aed',
        enemySize: 20,
        speedBonus: 25,
      };
  }
}

// Simple sound synthesizer
class Sound {
  private ctx: AudioContext | null = null;
  private ensure() { if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
  private tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.05) {
    this.ensure();
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(ctx.destination);
    const now = ctx.currentTime;
    // short attack/decay envelope
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
  start() { this.tone(660, 0.2, 'triangle', 0.06); this.tone(990, 0.15, 'sine', 0.04); }
  levelUp() { this.tone(740, 0.12, 'triangle'); setTimeout(() => this.tone(880, 0.12, 'triangle'), 90); }
  diamond() { this.tone(1046, 0.1, 'sine', 0.04); }
  hit() { this.tone(196, 0.18, 'sawtooth', 0.06); }
  victory() { this.tone(784, 0.15, 'square', 0.05); setTimeout(() => this.tone(988, 0.15, 'square', 0.05), 120); setTimeout(() => this.tone(1174, 0.2, 'square', 0.05), 240); }
}

export default function DiamondBandit() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<GameState>({ kind: 'menu' });
  const keys = useRef<Record<string, boolean>>({});
  const rafRef = useRef<number | null>(null);
  const timeRef = useRef<number>(0);
  const parallaxRef = useRef<Particle[] | null>(null);
  const soundRef = useRef<Sound | null>(null);
  const lastRef = useRef<number | null>(null);

  const scaleCss = useMemo(() => ({ width: '100%', height: 'auto', aspectRatio: `${CANVAS_LOGICAL.x} / ${CANVAS_LOGICAL.y}` }), []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', ' '].includes(k)) e.preventDefault();
      keys.current[k] = true;
      if (state.kind === 'menu' && (k === ' ' || k === 'enter')) { soundRef.current?.start(); parallaxRef.current = null; startLevel(1); }
      if (state.kind === 'victory' && (k === ' ' || k === 'enter')) setState({ kind: 'menu' });
    };
    const onUp = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [state.kind]);

  function startLevel(level: number) {
    if (!soundRef.current) soundRef.current = new Sound();
    const theme = themeForLevel(level);
    const homingKinds: EnemyKind[] = ['ball', 'void', 'shard'];
    const homingEnabledThisLevel = theme.name !== 'Wind';
    const player: Vec = { x: 40, y: CANVAS_LOGICAL.y - 60 };
    const items: { x: number; y: number; w: number; h: number }[] = [
      { x: player.x, y: player.y, w: PLAYER_SIZE, h: PLAYER_SIZE },
    ];
    const diamond = randomNonOverlappingPos(120, items);
    items.push({ x: diamond.x - 12, y: diamond.y - 12, w: 24, h: 24 });

    const enemies: Enemy[] = [];
    const count = LEVEL_ENEMIES[clamp(level - 1, 0, LEVEL_ENEMIES.length - 1)];
    for (let i = 0; i < count; i++) {
      const pos = randomNonOverlappingPos(80, items);
      const spd = ENEMY_SPEED_BASE + theme.speedBonus + level * 10 + rand(-10, 10);
      const velNorm = { x: rand(-1, 1), y: rand(-1, 1) };
      const len = Math.hypot(velNorm.x, velNorm.y) || 1;
      const vel = { x: (velNorm.x / len) * spd, y: (velNorm.y / len) * spd };
      const scaledSize = Math.round(theme.enemySize + (level - 1) * 2);
      // Slightly smaller detection radius on Void to aid balance
      const baseDetect = 120 + level * 30;
      const detectRadius = theme.name === 'Void' ? Math.round(baseDetect * 0.8) : baseDetect;
      const eligible = homingEnabledThisLevel && homingKinds.includes(theme.enemyKind);
      // 50/50 per-enemy seeking eligibility; Void slightly less likely (35%)
      const followProb = theme.name === 'Void' ? 0.35 : 0.5;
      const willSeek = eligible && Math.random() < followProb;
      enemies.push({ pos: { x: pos.x, y: pos.y }, vel, size: scaledSize, color: theme.enemyColor, kind: theme.enemyKind, alpha: theme.enemyKind === 'gust' ? 0.6 : 1, speed: spd, detectRadius, mode: 'wander', willSeek });
      const s = Math.round(theme.enemySize + (level - 1) * 2);
      items.push({ x: pos.x - s / 2, y: pos.y - s / 2, w: s, h: s });
    }

    setState({ kind: 'playing', level, enemies, player, diamond });
  }

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    function resizeForHiDpi() {
      const dpr = window.devicePixelRatio || 1;
      cvs.width = Math.floor(CANVAS_LOGICAL.x * dpr);
      cvs.height = Math.floor(CANVAS_LOGICAL.y * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeForHiDpi();

    const onResize = () => resizeForHiDpi();
    window.addEventListener('resize', onResize);

    function step(ts: number) {
      if (lastRef.current == null) lastRef.current = ts;
      const dt = Math.min(0.033, (ts - lastRef.current) / 1000);
      timeRef.current += dt;
      lastRef.current = ts;
      update(dt);
      render(dt);
      rafRef.current = requestAnimationFrame(step);
    }

    function update(dt: number) {
      if (state.kind !== 'playing') return;
      const next = { ...state };

      // Player movement
      const move: Vec = { x: 0, y: 0 };
      if (keys.current['w']) move.y -= 1;
      if (keys.current['s']) move.y += 1;
      if (keys.current['a']) move.x -= 1;
      if (keys.current['d']) move.x += 1;
      const len = Math.hypot(move.x, move.y) || 1;
      next.player = {
        x: clamp(next.player.x + (move.x / len) * PLAYER_SPEED * dt, 0, CANVAS_LOGICAL.x - PLAYER_SIZE),
        y: clamp(next.player.y + (move.y / len) * PLAYER_SPEED * dt, 0, CANVAS_LOGICAL.y - PLAYER_SIZE),
      };

      // Enemies movement + bounce
      for (const e of next.enemies) {
        // Determine behavior mode based on static per-enemy follow flag and range
        if (e.willSeek) {
          const dx = (next.player.x + PLAYER_SIZE / 2) - (e.pos.x + e.size / 2);
          const dy = (next.player.y + PLAYER_SIZE / 2) - (e.pos.y + e.size / 2);
          const dist = Math.hypot(dx, dy);
          if (e.mode === 'wander' && dist < e.detectRadius) {
            e.mode = 'seek';
          } else if (e.mode === 'seek' && dist > e.detectRadius * 1.25) {
            e.mode = 'wander';
          }
          if (e.mode === 'seek') {
            const len = Math.max(1, Math.hypot(dx, dy));
            e.vel.x = (dx / len) * e.speed;
            e.vel.y = (dy / len) * e.speed;
          }
        }
        // Wandering enemies occasionally change direction slightly
        if (e.mode === 'wander' && Math.random() < 0.05) {
          const jitter = 0.3;
          e.vel.x += rand(-jitter, jitter) * e.speed * dt;
          e.vel.y += rand(-jitter, jitter) * e.speed * dt;
          const vlen = Math.max(1, Math.hypot(e.vel.x, e.vel.y));
          e.vel.x = (e.vel.x / vlen) * e.speed;
          e.vel.y = (e.vel.y / vlen) * e.speed;
        }
        e.pos.x += e.vel.x * dt;
        e.pos.y += e.vel.y * dt;
        if (e.pos.x < 0 || e.pos.x > CANVAS_LOGICAL.x - e.size) {
          e.vel.x *= -1;
          e.pos.x = clamp(e.pos.x, 0, CANVAS_LOGICAL.x - e.size);
        }
        if (e.pos.y < 0 || e.pos.y > CANVAS_LOGICAL.y - e.size) {
          e.vel.y *= -1;
          e.pos.y = clamp(e.pos.y, 0, CANVAS_LOGICAL.y - e.size);
        }
      }

      // Collisions
      const playerBox = { x: next.player.x, y: next.player.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
      for (const e of next.enemies) {
        const enemyBox = { x: e.pos.x, y: e.pos.y, w: e.size, h: e.size };
        if (aabb(playerBox, enemyBox)) {
          // Drop back by one level (but not below level 1)
          const back = Math.max(1, next.level - 1);
          soundRef.current?.hit();
          startLevel(back);
          return;
        }
      }

      if (diamondHit(next.player, next.diamond)) {
        const nextLevel = next.level + 1;
        if (nextLevel > 5) {
          soundRef.current?.victory();
          setState({ kind: 'victory' });
          return;
        } else {
          soundRef.current?.diamond();
          soundRef.current?.levelUp();
          // reset parallax for new theme
          parallaxRef.current = null;
          startLevel(nextLevel);
          return;
        }
      }

      setState(next);
    }

    function clear() {
      ctx.fillStyle = matchMedia('(prefers-color-scheme: dark)').matches ? '#0a0a0a' : '#ffffff';
      ctx.fillRect(0, 0, CANVAS_LOGICAL.x, CANVAS_LOGICAL.y);
    }

    function ensureParallax(theme: ThemeName) {
      if (parallaxRef.current) return;
      const parts: Particle[] = [];
      const add = (n: number, cfg: { vx: number; vy: number; size: [number, number]; alpha: number; color: string; shape: 'dot' | 'line' }) => {
        for (let i = 0; i < n; i++) {
          parts.push({
            x: Math.random() * CANVAS_LOGICAL.x,
            y: Math.random() * CANVAS_LOGICAL.y,
            vx: cfg.vx * (0.5 + Math.random()),
            vy: cfg.vy * (0.5 + Math.random()),
            size: cfg.size[0] + Math.random() * (cfg.size[1] - cfg.size[0]),
            alpha: cfg.alpha,
            shape: cfg.shape,
            color: cfg.color,
          });
        }
      };
      switch (theme) {
        case 'Desert':
          add(60, { vx: -5, vy: 0, size: [1, 2], alpha: 0.15, color: '#b4530922', shape: 'dot' });
          break;
        case 'Ice':
          add(80, { vx: -8, vy: 4, size: [1, 2], alpha: 0.2, color: '#60a5fa44', shape: 'dot' });
          break;
        case 'Fire':
          add(70, { vx: 0, vy: -12, size: [1, 2], alpha: 0.2, color: '#fb923c44', shape: 'dot' });
          break;
        case 'Wind':
          add(50, { vx: -20, vy: 0, size: [8, 16], alpha: 0.12, color: '#94a3b855', shape: 'line' });
          break;
        case 'Void':
          add(120, { vx: -6, vy: 0, size: [1, 2], alpha: 0.25, color: '#a78bfa66', shape: 'dot' });
          break;
      }
      parallaxRef.current = parts;
    }

    function drawParallax(ctx: CanvasRenderingContext2D, theme: ThemeName, dt: number) {
      ensureParallax(theme);
      const parts = parallaxRef.current!;
      ctx.save();
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0) p.x += CANVAS_LOGICAL.x; else if (p.x > CANVAS_LOGICAL.x) p.x -= CANVAS_LOGICAL.x;
        if (p.y < 0) p.y += CANVAS_LOGICAL.y; else if (p.y > CANVAS_LOGICAL.y) p.y -= CANVAS_LOGICAL.y;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        if (p.shape === 'dot') ctx.fillRect(p.x, p.y, p.size, p.size);
        else {
          ctx.fillRect(p.x, p.y, p.size, 1);
        }
      }
      ctx.restore();
    }

    function render(dt: number) {
      clear();
      // Background per level
      if (state.kind === 'playing') {
        const theme = themeForLevel(state.level);
        theme.bg(ctx);
        drawParallax(ctx, theme.name as ThemeName, dt);
      }
      // Border/playfield overlay
      ctx.strokeStyle = '#00000022';
      ctx.lineWidth = 2;
      ctx.strokeRect(0.5, 0.5, CANVAS_LOGICAL.x - 1, CANVAS_LOGICAL.y - 1);

      if (state.kind === 'menu') {
        drawTitle(ctx);
        return;
      }
      if (state.kind === 'victory') {
        drawVictory(ctx);
        return;
      }
      // HUD
      ctx.fillStyle = matchMedia('(prefers-color-scheme: dark)').matches ? '#e5e7eb' : '#111827';
      ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      const name = LEVEL_NAMES[state.level - 1] ?? `Level ${state.level}`;
      ctx.fillText(`Diamond Bandit — Level ${state.level} (${name})`, 16, 26);

      // Diamond
      drawDiamond(ctx, state.diamond.x, state.diamond.y, DIAMOND_SIZE, '#22c55e');

      // Player: Futuristic square car
      drawCar(ctx, state.player.x, state.player.y, PLAYER_SIZE);

      // Enemies
      for (const e of state.enemies) {
        drawEnemy(ctx, e);
      }
    }

    function drawTitle(ctx: CanvasRenderingContext2D) {
      ctx.save();
      ctx.textAlign = 'center';

      // Animated pulse for the hero diamond
      const t = (performance.now() / 1000) % 1000;
      const pulse = 1 + Math.sin(t * 2) * 0.06;

      // Background subtle vignette
      const bg = ctx.createRadialGradient(
        CANVAS_LOGICAL.x / 2,
        CANVAS_LOGICAL.y / 2,
        60,
        CANVAS_LOGICAL.x / 2,
        CANVAS_LOGICAL.y / 2,
        Math.max(CANVAS_LOGICAL.x, CANVAS_LOGICAL.y)
      );
      bg.addColorStop(0, 'rgba(59,130,246,0.06)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, CANVAS_LOGICAL.x, CANVAS_LOGICAL.y);

      // Glowing diamond
      const dx = CANVAS_LOGICAL.x / 2;
      const dy = CANVAS_LOGICAL.y / 2 - 30;
      const size = 90 * pulse;

      // Outer glow
      ctx.save();
      const glow = ctx.createRadialGradient(dx, dy, 10, dx, dy, size * 1.4);
      glow.addColorStop(0, 'rgba(34,197,94,0.35)');
      glow.addColorStop(1, 'rgba(34,197,94,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(dx, dy, size * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Diamond body (rotated square)
      drawDiamond(ctx, dx, dy, size, '#22c55e');

      // Sparkles
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + t * 0.6;
        const r = size * (1.0 + (i % 2 ? 0.15 : 0.25));
        const sx = dx + Math.cos(ang) * r;
        const sy = dy + Math.sin(ang) * r;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.restore();

      // Title
      ctx.fillStyle = matchMedia('(prefers-color-scheme: dark)').matches ? '#e5e7eb' : '#111827';
      ctx.font = 'bold 48px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText('Diamond Bandit', CANVAS_LOGICAL.x / 2, dy - size * 0.9);

      // Subtitle and prompt
      ctx.font = '18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText('WASD to move. Avoid enemies. Touch the diamond to advance.', CANVAS_LOGICAL.x / 2, dy + size * 0.9 + 8);

      ctx.font = '600 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      const blink = (Math.sin(t * 3) + 1) / 2; // 0..1
      ctx.fillStyle = `rgba(59,130,246,${0.5 + 0.5 * blink})`;
      ctx.fillText('Press Space or Enter to start', CANVAS_LOGICAL.x / 2, dy + size * 0.9 + 36);

      ctx.restore();
    }

    function drawVictory(ctx: CanvasRenderingContext2D) {
      ctx.fillStyle = matchMedia('(prefers-color-scheme: dark)').matches ? '#e5e7eb' : '#111827';
      ctx.font = 'bold 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('You Won! 💎', CANVAS_LOGICAL.x / 2, CANVAS_LOGICAL.y / 2 - 24);
      ctx.font = '18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText('Press Space or Enter to return to menu', CANVAS_LOGICAL.x / 2, CANVAS_LOGICAL.y / 2 + 16);
    }

    function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
      const h = size / 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -h);
      ctx.lineTo(h, 0);
      ctx.lineTo(0, h);
      ctx.lineTo(-h, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
      ctx.save();
      ctx.globalAlpha = e.alpha ?? 1;
      switch (e.kind) {
        case 'square':
          ctx.fillStyle = e.color;
          ctx.fillRect(e.pos.x, e.pos.y, e.size, e.size);
          break;
        case 'ball': {
          ctx.fillStyle = e.color;
          ctx.beginPath();
          ctx.arc(e.pos.x + e.size / 2, e.pos.y + e.size / 2, e.size / 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'shard': {
          ctx.fillStyle = e.color;
          ctx.beginPath();
          const cx = e.pos.x + e.size / 2;
          const cy = e.pos.y + e.size / 2;
          ctx.moveTo(cx, cy - e.size / 2);
          ctx.lineTo(cx + e.size / 3, cy + e.size / 2);
          ctx.lineTo(cx - e.size / 3, cy + e.size / 2);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'gust': {
          ctx.fillStyle = e.color;
          ctx.fillRect(e.pos.x, e.pos.y + e.size * 0.2, e.size, e.size * 0.6);
          break;
        }
        case 'void': {
          const cx = e.pos.x + e.size / 2;
          const cy = e.pos.y + e.size / 2;
          const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, e.size / 2);
          g.addColorStop(0, '#a78bfa');
          g.addColorStop(1, '#1f1140');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, e.size / 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
      ctx.restore();
    }

    function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
      const r = 4; // corner radius
      ctx.save();
      ctx.translate(x, y);
      // chassis
      ctx.fillStyle = '#0ea5e9';
      roundRect(ctx, 0, 0, size, size, r);
      ctx.fill();
      // cabin stripe
      ctx.fillStyle = '#111827aa';
      roundRect(ctx, size * 0.15, size * 0.2, size * 0.7, size * 0.25, 3);
      ctx.fill();
      // neon outline
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      roundRect(ctx, 1, 1, size - 2, size - 2, r);
      ctx.stroke();
      // fins
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(size * 0.1, size * 0.35);
      ctx.lineTo(0, size * 0.5);
      ctx.lineTo(size * 0.1, size * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(size * 0.9, size * 0.35);
      ctx.lineTo(size, size * 0.5);
      ctx.lineTo(size * 0.9, size * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, [state]);

  return (
    <div className="grid gap-3">
      <canvas ref={canvasRef} style={scaleCss} aria-label="Diamond Bandit game canvas" role="img" />
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        WASD to move. Avoid red squares. Touch the green diamond to advance. 5 levels.
      </div>
      {state.kind === 'menu' && (
        <button
          className="self-start rounded-md bg-brand px-3 py-2 text-white hover:bg-brand-600"
          onClick={() => startLevel(1)}
        >
          Start Game
        </button>
      )}
      {state.kind === 'victory' && (
        <button
          className="self-start rounded-md bg-brand px-3 py-2 text-white hover:bg-brand-600"
          onClick={() => setState({ kind: 'menu' })}
        >
          Back to Menu
        </button>
      )}
    </div>
  );
}

