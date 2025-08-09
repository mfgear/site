import React, { useEffect, useMemo, useRef, useState } from 'react';

type Vec = { x: number; y: number };

type EnemyKind = 'square' | 'ball' | 'shard' | 'gust' | 'void';

type Enemy = { pos: Vec; vel: Vec; size: number; color: string; kind: EnemyKind; alpha?: number; speed: number };

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
const LEVEL_ENEMIES = [3, 5, 7, 10, 14];
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
        enemySize: 22,
        speedBonus: 40,
      };
  }
}

export default function DiamondBandit() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<GameState>({ kind: 'menu' });
  const keys = useRef<Record<string, boolean>>({});
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  const scaleCss = useMemo(() => ({ width: '100%', height: 'auto', aspectRatio: `${CANVAS_LOGICAL.x} / ${CANVAS_LOGICAL.y}` }), []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', ' '].includes(k)) e.preventDefault();
      keys.current[k] = true;
      if (state.kind === 'menu' && (k === ' ' || k === 'enter')) startLevel(1);
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
    const theme = themeForLevel(level);
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
      enemies.push({ pos: { x: pos.x, y: pos.y }, vel, size: theme.enemySize, color: theme.enemyColor, kind: theme.enemyKind, alpha: theme.enemyKind === 'gust' ? 0.6 : 1, speed: spd });
      const s = theme.enemySize;
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
      lastRef.current = ts;
      update(dt);
      render();
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
        // Slight homing for select enemy types to increase difficulty
        const homingKinds: EnemyKind[] = ['ball', 'void', 'shard'];
        if (homingKinds.includes(e.kind)) {
          const toPlayer = { x: (next.player.x + PLAYER_SIZE / 2) - (e.pos.x + e.size / 2), y: (next.player.y + PLAYER_SIZE / 2) - (e.pos.y + e.size / 2) };
          const len = Math.hypot(toPlayer.x, toPlayer.y) || 1;
          const ax = (toPlayer.x / len);
          const ay = (toPlayer.y / len);
          const homing = (4 + next.level * 2) * dt; // acceleration toward player
          e.vel.x += ax * homing * e.speed;
          e.vel.y += ay * homing * e.speed;
          // re-normalize velocity to maintain target speed budget
          const vlen = Math.hypot(e.vel.x, e.vel.y) || 1;
          e.vel.x = (e.vel.x / vlen) * e.speed;
          e.vel.y = (e.vel.y / vlen) * e.speed;
        }
        e.pos.x += e.vel.x * dt;
        e.pos.y += e.vel.y * dt;
        if (e.pos.x < 0 || e.pos.x > CANVAS_LOGICAL.x - ENEMY_SIZE) {
          e.vel.x *= -1;
          e.pos.x = clamp(e.pos.x, 0, CANVAS_LOGICAL.x - ENEMY_SIZE);
        }
        if (e.pos.y < 0 || e.pos.y > CANVAS_LOGICAL.y - ENEMY_SIZE) {
          e.vel.y *= -1;
          e.pos.y = clamp(e.pos.y, 0, CANVAS_LOGICAL.y - ENEMY_SIZE);
        }
      }

      // Collisions
      const playerBox = { x: next.player.x, y: next.player.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
      for (const e of next.enemies) {
        const enemyBox = { x: e.pos.x, y: e.pos.y, w: e.size, h: e.size };
        if (aabb(playerBox, enemyBox)) {
          // Reset to level 1
          startLevel(1);
          return;
        }
      }

      if (diamondHit(next.player, next.diamond)) {
        const nextLevel = next.level + 1;
        if (nextLevel > 5) {
          setState({ kind: 'victory' });
          return;
        } else {
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

    function render() {
      clear();
      // Background per level
      if (state.kind === 'playing') {
        themeForLevel(state.level).bg(ctx);
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
      ctx.fillStyle = matchMedia('(prefers-color-scheme: dark)').matches ? '#e5e7eb' : '#111827';
      ctx.font = 'bold 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Diamond Bandit', CANVAS_LOGICAL.x / 2, CANVAS_LOGICAL.y / 2 - 40);
      ctx.font = '18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText('WASD to move. Avoid red squares. Touch the diamond to advance.', CANVAS_LOGICAL.x / 2, CANVAS_LOGICAL.y / 2);
      ctx.fillText('Press Space or Enter to start', CANVAS_LOGICAL.x / 2, CANVAS_LOGICAL.y / 2 + 36);
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

