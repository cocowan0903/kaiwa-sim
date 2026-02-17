import React, { useEffect, useMemo, useRef, useState } from "react";

export default function SideGame() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  const keysRef = useRef({ left: false, right: false });
  const runningRef = useRef(false);
  const scoreRef = useRef(0);

  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);

  const cfg = useMemo(
    () => ({
      playerW: 22,
      playerH: 10,
      speed: 2.6,
      fallBase: 2.2,
      spawnEvery: 28, // frames
      maxDrops: 18,
    }),
    []
  );

  // keep ref in sync
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // keyboard
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") keysRef.current.left = true;
      if (e.key === "ArrowRight" || e.key === "d") keysRef.current.right = true;
    };
    const onKeyUp = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") keysRef.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d") keysRef.current.right = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // canvas fit + resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // make focusable for better key handling on Safari
    canvas.tabIndex = 0;

    const fit = () => {
      const parent = canvas.parentElement;
      const w = Math.max(220, parent?.clientWidth ?? 240);
      const h = Math.max(260, parent?.clientHeight ?? 360);

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    fit();
    const ro = new ResizeObserver(() => fit());
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    return () => ro.disconnect();
  }, []);

  // main game loop (mount once)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let t = 0;
    let frame = 0;

    const state = {
      w: () => canvas.clientWidth,
      h: () => canvas.clientHeight,
      player: { x: 0, y: 0, vx: 0 },
      drops: [],
      dead: false,
    };

    const reset = () => {
      state.dead = false;
      state.drops = [];
      state.player.x = state.w() / 2;
      state.player.y = state.h() - 26;
      state.player.vx = 0;
      frame = 0;

      scoreRef.current = 0;
      setScore(0);
    };

    const spawn = () => {
      if (state.drops.length >= cfg.maxDrops) return;
      const x = 10 + Math.random() * (state.w() - 20);
      const r = 6 + Math.random() * 10;
      const vy = cfg.fallBase + Math.random() * 2.8;
      state.drops.push({ x, y: -r, r, vy });
    };

    const hitCircleRect = (cx, cy, r, rx, ry, rw, rh) => {
      const closestX = Math.max(rx, Math.min(cx, rx + rw));
      const closestY = Math.max(ry, Math.min(cy, ry + rh));
      const dx = cx - closestX;
      const dy = cy - closestY;
      return dx * dx + dy * dy <= r * r;
    };

    const draw = () => {
      const w = state.w();
      const h = state.h();

      // bg
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(0, 0, w, h);

      // grid lines
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let y = 20; y < h; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // drops
      ctx.fillStyle = "rgba(255,255,255,0.80)";
      for (const d of state.drops) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // player
      const pw = cfg.playerW;
      const ph = cfg.playerH;
      const px = state.player.x - pw / 2;
      const py = state.player.y - ph / 2;

      ctx.fillStyle = "rgba(78, 201, 255, 0.85)";
      ctx.fillRect(px, py, pw, ph);

      // score (ref is the truth)
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system";
      ctx.fillText(`SCORE ${scoreRef.current}`, 10, 16);

      if (!runningRef.current && !state.dead) {
        ctx.fillStyle = "rgba(255,255,255,0.82)";
        ctx.font = "12px ui-sans-serif, system-ui, -apple-system";
        ctx.fillText("クリックで再開 / 開始", 10, 36);
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fillText("← → / A D で回避", 10, 52);
      }

      if (state.dead) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = "14px ui-sans-serif, system-ui, -apple-system";
        ctx.fillText("GAME OVER", 10, 34);
        ctx.font = "12px ui-sans-serif, system-ui, -apple-system";
        ctx.fillText("クリックでリトライ", 10, 54);
      }
    };

    const step = (ts) => {
      if (!t) t = ts;
      const dt = Math.min(32, ts - t);
      t = ts;

      // update only when running and alive
      if (runningRef.current && !state.dead) {
        frame++;

        // input
        const k = keysRef.current;
        let dir = 0;
        if (k.left) dir -= 1;
        if (k.right) dir += 1;

        state.player.vx = dir * cfg.speed;
        state.player.x += state.player.vx * (dt / 16);

        // clamp
        const w = state.w();
        state.player.x = Math.max(12, Math.min(w - 12, state.player.x));

        // spawn
        if (frame % cfg.spawnEvery === 0) spawn();

        // update drops
        const h = state.h();
        for (const d of state.drops) d.y += d.vy * (dt / 16);

        // remove passed + score
        const before = state.drops.length;
        state.drops = state.drops.filter((d) => d.y < h + d.r + 4);
        const passed = before - state.drops.length;
        if (passed > 0) {
          scoreRef.current += passed;
          setScore(scoreRef.current);
        }

        // collision
        const pw = cfg.playerW;
        const ph = cfg.playerH;
        const px = state.player.x - pw / 2;
        const py = state.player.y - ph / 2;

        for (const d of state.drops) {
          if (hitCircleRect(d.x, d.y, d.r, px, py, pw, ph)) {
            state.dead = true;
            runningRef.current = false;
            setRunning(false);
            break;
          }
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(step);
    };

    // click behavior
    const onClick = () => {
      // focus canvas for key controls stability
      try {
        canvas.focus();
      } catch {}

      if (state.dead) {
        reset();
        runningRef.current = true;
        setRunning(true);
        return;
      }

      // toggle resume (if paused -> start; if running -> pause)
      runningRef.current = !runningRef.current;
      setRunning(runningRef.current);
    };

    reset();
    rafRef.current = requestAnimationFrame(step);
    canvas.addEventListener("pointerdown", onClick);

    return () => {
      canvas.removeEventListener("pointerdown", onClick);
      cancelAnimationFrame(rafRef.current);
    };
  }, [cfg]);

  return (
    <aside className="sideGame" aria-label="Mini game">
      <div className="sideGameHead">
        <div>
          <div className="sideGameTitle">余白で回避ゲーム</div>
          <div className="sideGameHint">← → / A D</div>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => setRunning((v) => !v)}
        >
          {running ? "一時停止" : "再開"}
        </button>
      </div>

      <div className="sideGameCanvasWrap">
        <canvas ref={canvasRef} className="sideGameCanvas" />
      </div>

      <div className="sideGameFoot">
        <div className="muted small">Score: {score}</div>
      </div>
    </aside>
  );
}
