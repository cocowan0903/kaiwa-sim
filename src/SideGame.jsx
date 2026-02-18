import React, { useEffect, useMemo, useRef, useState } from "react";
import "./SideGame.css";
import { supabase, getOrCreateLocalUserId } from "./supabaseClient.js";

const LEVELS = [
  { value: "easy", label: "EASY", max: 9 },
  { value: "normal", label: "NORMAL", max: 20 },
  { value: "hard", label: "HARD", max: 50 },
];

const TIMES = [
  { value: "off", label: "OFF" },
  { value: "30", label: "30s" },
  { value: "60", label: "60s" },
  { value: "120", label: "120s" },
];

function randInt(n) {
  return Math.floor(Math.random() * (n + 1));
}

function makeQuestion(level) {
  const max = LEVELS.find((l) => l.value === level)?.max ?? 20;
  const ops = ["+", "-", "×"];
  const op = ops[Math.floor(Math.random() * ops.length)];

  let a = randInt(max);
  let b = randInt(max);

  if (op === "-" && b > a) [a, b] = [b, a];

  if (op === "×") {
    a = randInt(Math.max(5, Math.floor(max / 2)));
    b = randInt(Math.max(5, Math.floor(max / 2)));
  }

  const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
  return { text: `${a} ${op} ${b} = ?`, answer };
}

async function upsertBestScore(score) {
  if (!supabase) return;

  try {
    const user_id = getOrCreateLocalUserId();
    const payload = {
      user_id,
      mode: "sidegame",
      best_score: score,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("best_scores")
      .upsert(payload, { onConflict: "user_id,mode" });

    if (error) console.warn("upsert error:", error.message);
  } catch {
    console.warn("upsert exception");
  }
}

async function fetchMyBest() {
  if (!supabase) return 0;

  try {
    const user_id = getOrCreateLocalUserId();
    const { data, error } = await supabase
      .from("best_scores")
      .select("best_score")
      .eq("user_id", user_id)
      .eq("mode", "sidegame")
      .maybeSingle();

    if (error) return 0;
    return data?.best_score ?? 0;
  } catch {
    return 0;
  }
}

export default function SideGame() {
  const [level, setLevel] = useState("normal");
  const [timeOpt, setTimeOpt] = useState("60");

  const [running, setRunning] = useState(false);
  const [q, setQ] = useState(() => makeQuestion("normal"));
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  const [best, setBest] = useState(0);
  const [left, setLeft] = useState(60);

  const timerRef = useRef(null);

  const timeLimit = useMemo(() => {
    if (timeOpt === "off") return null;
    const n = Number(timeOpt);
    return Number.isFinite(n) ? n : 60;
  }, [timeOpt]);

  useEffect(() => {
    fetchMyBest().then(setBest);
  }, []);

  useEffect(() => {
    if (!running) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    if (timeLimit == null) return;

    setLeft(timeLimit);
    timerRef.current = setInterval(() => setLeft((t) => t - 1), 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [running, timeLimit]);

  useEffect(() => {
    if (!running) return;
    if (timeLimit == null) return;
    if (left > 0) return;
    setRunning(false);
  }, [left, running, timeLimit]);

  function start() {
    setScore(0);
    setStreak(0);
    setInput("");
    setQ(makeQuestion(level));
    setRunning(true);
    if (timeLimit != null) setLeft(timeLimit);
  }

  async function finish() {
    setRunning(false);
    if (score > best) {
      setBest(score);
      await upsertBestScore(score);
    }
  }

  async function submit() {
    if (!running) return;

    const v = Number(input);
    if (!Number.isFinite(v)) return;

    if (v === q.answer) {
      const nextStreak = streak + 1;
      const bonus = nextStreak > 0 && nextStreak % 5 === 0 ? 2 : 0;
      const nextScore = score + 1 + bonus;

      setStreak(nextStreak);
      setScore(nextScore);
      setQ(makeQuestion(level));
      setInput("");

      if (nextScore > best) {
        setBest(nextScore);
        upsertBestScore(nextScore);
      }
    } else {
      setStreak(0);
      setInput("");
    }
  }

  return (
    <div className="sg">
      <div className="sgRow">
        <div className="sgMeta">
          <div>今日: {running ? score : 0}</div>
          <div>ベスト: {best}</div>
          <div>連続: {streak}</div>
        </div>

        <div className="sgTimer">⏳ {timeLimit != null ? `${Math.max(0, left)}s` : "OFF"}</div>
      </div>

      <div className="sgControls">
        <div className="sgControl">
          <div className="sgLabel">レベル</div>
          <select value={level} onChange={(e) => setLevel(e.target.value)} disabled={running}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sgControl">
          <div className="sgLabel">タイム</div>
          <select value={timeOpt} onChange={(e) => setTimeOpt(e.target.value)} disabled={running}>
            {TIMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sgQ">{q.text}</div>

      <div className="sgInputRow">
        <input
          className="sgInput"
          value={input}
          inputMode="numeric"
          placeholder="答え"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={!running}
        />

        {!running ? (
          <button className="sgBtn" onClick={start} type="button">
            スタート
          </button>
        ) : (
          <button className="sgBtn ghost" onClick={finish} type="button">
            終了
          </button>
        )}
      </div>

      <div className="sgBtns">
        <button className="sgBtn" onClick={submit} type="button" disabled={!running}>
          OK
        </button>
      </div>
    </div>
  );
}
