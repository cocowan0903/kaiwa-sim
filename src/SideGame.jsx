// src/SideGame.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./SideGame.css";

const LS_KEY = "dr_math_game_v1";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeGet() {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function safeSet(v) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(v));
  } catch {
    // ignore
  }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 割り算は割り切れる形だけ作る
 * 例: a ÷ b = q → a = b*q
 */
function makeProblem(level) {
  const ops = ["+", "-", "×", "÷"];
  const op = ops[randInt(0, ops.length - 1)];

  const max = [0, 10, 20, 50, 100, 200][Math.max(1, Math.min(5, level))];
  const min = 0;

  if (op === "+") {
    const a = randInt(min, max);
    const b = randInt(min, max);
    return { op, ans: a + b, text: `${a} + ${b}` };
  }

  if (op === "-") {
    const a = randInt(min, max);
    const b = randInt(min, max);
    const x = Math.max(a, b);
    const y = Math.min(a, b);
    return { op, ans: x - y, text: `${x} - ${y}` };
  }

  if (op === "×") {
    const a = randInt(0, Math.ceil(max / 10));
    const b = randInt(0, Math.ceil(max / 10));
    return { op, ans: a * b, text: `${a} × ${b}` };
  }

  // ÷（必ず割り切れる）
  const b = randInt(1, Math.max(2, Math.ceil(max / 20)));
  const q = randInt(0, Math.max(3, Math.ceil(max / 10)));
  const a = b * q;
  return { op, ans: q, text: `${a} ÷ ${b}` };
}

export default function SideGame() {
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  const [level, setLevel] = useState(2); // 1..5
  const [timed, setTimed] = useState(true);
  const [seconds, setSeconds] = useState(15);

  const [running, setRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);

  const [state, setState] = useState(() => {
    const saved = safeGet();
    const t = todayKey();
    if (!saved) return { day: t, today: 0, best: 0, streak: 0 };
    if (saved.day !== t) return { ...saved, day: t, today: 0, streak: 0 };
    return saved;
  });

  // ✅ stale対策：常に最新stateを参照できるref
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [problem, setProblem] = useState(() => makeProblem(level));
  const problemRef = useRef(problem);
  useEffect(() => {
    problemRef.current = problem;
  }, [problem]);

  const [value, setValue] = useState("");
  const [msg, setMsg] = useState({ type: "hint", text: "スタートで開始" });

  const bestLabel = useMemo(() => state.best, [state.best]);

  function persist(next) {
    setState(next);
    safeSet(next);
  }

  function focusInput() {
    queueMicrotask(() => {
      try {
        inputRef.current?.focus();
      } catch {}
    });
  }

  function nextProblem(nextLevel = level) {
    setProblem(makeProblem(nextLevel));
    setValue("");
    focusInput();
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function startTimer() {
    stopTimer();
    setTimeLeft(seconds);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);
  }

  // ✅ 秒数変更に追随（停止中だけ）
  useEffect(() => {
    if (!running) setTimeLeft(seconds);
  }, [seconds, running]);

  // ✅ 日付が変わったらリセット（開きっぱなし対策）
  useEffect(() => {
    const id = setInterval(() => {
      const t = todayKey();
      setState((s) => {
        if (s.day === t) return s;
        const next = { ...s, day: t, today: 0, streak: 0 };
        safeSet(next);
        return next;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // ✅ running/timed/seconds にだけ反応してタイマー制御
  useEffect(() => {
    if (!running) {
      stopTimer();
      return;
    }
    if (timed) startTimer();
    else stopTimer();

    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, timed, seconds]);

  // ✅ タイムアップ処理（refで最新state/problemを見る）
  useEffect(() => {
    if (!running || !timed) return;
    if (timeLeft > 0) return;

    stopTimer();
    setRunning(false);

    const s = stateRef.current;
    const p = problemRef.current;

    const next = {
      ...s,
      today: Math.max(0, s.today - 1),
      streak: 0,
    };
    persist(next);
    setMsg({ type: "bad", text: `⏰ タイムアップ（答え: ${p.ans}）` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, running, timed]);

  function start() {
    setMsg({ type: "hint", text: "いくよ" });
    setRunning(true);
    nextProblem(level);
  }

  function pause() {
    setRunning(false);
    stopTimer();
    setMsg({ type: "hint", text: "一時停止" });
  }

  function resetToday() {
    const t = todayKey();
    const s = stateRef.current;
    const next = { ...s, day: t, today: 0, streak: 0 };
    persist(next);
    setMsg({ type: "hint", text: "今日スコアをリセット" });
  }

  function submit() {
    if (!running) return;

    const n = Number(value);
    if (!Number.isFinite(n)) {
      setMsg({ type: "bad", text: "数字を入れてね" });
      return;
    }

    const p = problemRef.current;
    const s = stateRef.current;

    const correct = n === p.ans;

    if (correct) {
      const nextToday = s.today + 1;
      const nextStreak = s.streak + 1;
      const nextBest = Math.max(s.best, nextToday);

      persist({ ...s, today: nextToday, best: nextBest, streak: nextStreak });
      setMsg({ type: "good", text: `✅ 正解！ 連続${nextStreak}` });

      if (timed) setTimeLeft((t) => Math.min(seconds, t + 2));
      nextProblem(level);
      return;
    }

    // wrong
    persist({ ...s, today: Math.max(0, s.today - 1), streak: 0 });
    setMsg({ type: "bad", text: `❌ ${p.text} = ${p.ans}` });
    nextProblem(level);
  }

  function onKeyDown(e) {
    if (e.key === "Enter") submit();
  }

  // ✅ レベル変えたら「次の問題」から反映（押してる最中に問題が変わらない）
  function onChangeLevel(v) {
    const nextLevel = Number(v);
    setLevel(nextLevel);
    if (!running) {
      setProblem(makeProblem(nextLevel));
      setValue("");
    }
  }

  return (
    <aside className="sideGame" aria-label="Mini game">
      <div className="sideGameHead">
        <div>
          <div className="sideGameTitle">ランダム四則演算</div>
          <div className="sideGameHint">
            今日: <b>{state.today}</b> / ベスト: <b>{bestLabel}</b> / 連続: <b>{state.streak}</b>
          </div>
        </div>

        <button className="btn" type="button" onClick={() => (running ? pause() : start())}>
          {running ? "一時停止" : "スタート"}
        </button>
      </div>

      <div className="sideGameBody">
        <div className="sgControls">
          <label className="muted small sgControl">
            難易度
            <select value={level} onChange={(e) => onChangeLevel(e.target.value)}>
              <option value={1}>1（やさしい）</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5（きつい）</option>
            </select>
          </label>

          <label className="muted small sgCheck">
            <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
            タイムアタック
          </label>

          {timed && (
            <label className="muted small sgControl">
              制限
              <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
                <option value={10}>10秒</option>
                <option value={15}>15秒</option>
                <option value={20}>20秒</option>
                <option value={30}>30秒</option>
              </select>
            </label>
          )}
        </div>

        <div className="sgCard">
          <div className="muted small sgTopLine">
            <span>{running ? "解いてください" : "停止中"}</span>
            {timed && (
              <span>
                ⏳ <b>{Math.max(0, timeLeft)}</b>
              </span>
            )}
          </div>

          <div className="sgProblem">{problem.text} = ?</div>

          <div className="sgAnswerRow">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              inputMode="numeric"
              placeholder="答え"
              className="sgInput"
              disabled={!running}
            />
            <button className="btnPrimary" type="button" onClick={submit} disabled={!running}>
              送信
            </button>
          </div>

          <div className={`small sgMsg ${msg.type === "good" ? "good" : msg.type === "bad" ? "bad" : ""}`}>
            {msg.text}
          </div>

          <div className="sgBtns">
            <button className="btnGhost" type="button" onClick={() => nextProblem(level)}>
              問題だけ更新
            </button>
            <button className="btnGhost" type="button" onClick={resetToday}>
              今日スコアリセット
            </button>
          </div>
        </div>

        <div className="muted small sgHint">ヒント：Enterで送信。割り算は割り切れる問題だけ出る。</div>
      </div>
    </aside>
  );
}
