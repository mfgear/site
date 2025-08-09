import React, { useEffect, useMemo, useRef, useState } from 'react';

type Vec = { x: number; y: number };

type Enemy = { pos: Vec; vel: Vec; size: number; color: string };

type GameState =
  | { kind: 'menu' }
  | { kind: 'playing'; level: number; enemies: Enemy[]; player: Vec; diamond: Vec }
  | { kind: 'victory' };

const CANVAS_LOGICAL: Vec = { x: 900, y: 540 }; // 5:3 aspect, good for most screens
const PLAYER_SIZE = 20;
const ENEMY_SIZE = 20;
const DIAMOND_SIZE = 24;
const PLAYER_SPEED = 280; // px/s
const ENEMY_SPEED_BASE = 110; // base px/s
const LEVEL_ENEMIES = [2, 3, 5, 7, 9];

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
      const spd = ENEMY_SPEED_BASE + level * 18 + rand(-10, 10);
      const velNorm = { x: rand(-1, 1), y: rand(-1, 1) };
      const len = Math.hypot(velNorm.x, velNorm.y) || 1;
      const vel = { x: (velNorm.x / len) * spd, y: (velNorm.y / len) * spd };
      enemies.push({ pos: { x: pos.x, y: pos.y }, vel, size: ENEMY_SIZE, color: '#ef4444' });
      items.push({ x: pos.x - ENEMY_SIZE / 2, y: pos.y - ENEMY_SIZE / 2, w: ENEMY_SIZE, h: ENEMY_SIZE });
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
        const enemyBox = { x: e.pos.x, y: e.pos.y, w: ENEMY_SIZE, h: ENEMY_SIZE };
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
      // Border/playfield
      ctx.strokeStyle = '#e5e7eb';
      if (matchMedia('(prefers-color-scheme: dark)').matches) ctx.strokeStyle = '#27272a';
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
      ctx.fillText(`Diamond Bandit — Level ${state.level}`, 16, 26);

      // Diamond
      drawDiamond(ctx, state.diamond.x, state.diamond.y, DIAMOND_SIZE, '#22c55e');

      // Player
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(state.player.x, state.player.y, PLAYER_SIZE, PLAYER_SIZE);

      // Enemies
      for (const e of state.enemies) {
        ctx.fillStyle = e.color;
        ctx.fillRect(e.pos.x, e.pos.y, ENEMY_SIZE, ENEMY_SIZE);
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

