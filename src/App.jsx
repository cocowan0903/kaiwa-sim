import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import ACTIONS from "./actions.json";

/**
 * Decision Router
 * - URL直後は「今の行動」ゲート表示
 * - 1日1回のみ
 * - 今日のゲート行動は固定
 */

const OPTIONS = {
  time: [
    { value: "10", label: "10分" },
    { value: "30", label: "30分" },
    { value: "60", label: "1時間" },
    { value: "180", label: "半日" },
  ],
  goal: [
    { value: "recover", label: "回復" },
    { value: "growth", label: "成長" },
    { value: "life", label: "生活" },
    { value: "fun", label: "遊び" },
  ],
  place: [
    { value: "home", label: "家" },
    { value: "campus", label: "大学" },
    { value: "outside", label: "外" },
    { value: "online", label: "オンライン" },
  ],
  money: [
    { value: "0", label: "0円" },
    { value: "low", label: "少し（〜500円）" },
    { value: "mid", label: "まあまあ（〜2000円）" },
    { value: "high", label: "気にしない" },
  ],
};

const DEFAULTS = {
  time: "30",
  goal: "recover",
  place: "home",
  money: "0",
};

const KEYS = ["time", "goal", "place", "money"];

const GATE_DONE_KEY = "decision_router_gate_done_ymd";
const GATE_ACTION_KEY = "decision_router_gate_action_v1";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function isGateDoneToday() {
  return localStorage.getItem(GATE_DONE_KEY) === todayKey();
}

function markGateDoneToday() {
  localStorage.setItem(GATE_DONE_KEY, todayKey());
}

function loadGateActionForToday() {
  const raw = localStorage.getItem(GATE_ACTION_KEY);
  if (!raw) return null;
  const obj = JSON.parse(raw);
  if (obj?.ymd !== todayKey()) return null;
  return obj.action ?? null;
}

function saveGateActionForToday(action) {
  localStorage.setItem(
    GATE_ACTION_KEY,
    JSON.stringify({ ymd: todayKey(), action })
  );
}

function readQuery() {
  const sp = new URLSearchParams(window.location.search);
  return {
    time: sp.get("time") ?? DEFAULTS.time,
    goal: sp.get("goal") ?? DEFAULTS.goal,
    place: sp.get("place") ?? DEFAULTS.place,
    money: sp.get("money") ?? DEFAULTS.money,
  };
}

function writeQuery(state) {
  const sp = new URLSearchParams(state);
  window.history.replaceState({}, "", `?${sp.toString()}`);
}

function matchesAll(action, sel) {
  return KEYS.every((k) => action.tags[k]?.includes(sel[k]));
}

function score(action, sel) {
  let s = 0;
  if (action.tags.time?.includes(sel.time)) s += 3;
  if (action.tags.goal?.includes(sel.goal)) s += 4;
  if (action.tags.place?.includes(sel.place)) s += 3;
  if (action.tags.money?.includes(sel.money)) s += 3;
  return s;
}

function pick3(sel) {
  const strict = ACTIONS.filter((a) => matchesAll(a, sel));
  if (strict.length >= 3)
    return strict.sort(() => 0.5 - Math.random()).slice(0, 3);

  const sorted = [...ACTIONS]
    .map((a) => ({ ...a, _s: score(a, sel) }))
    .sort((a, b) => b._s - a._s);

  return sorted.slice(0, 3);
}

export default function App() {
  const [sel, setSel] = useState(readQuery());
  const [generated, setGenerated] = useState(() => pick3(readQuery()));
  const [gateOpen, setGateOpen] = useState(() => !isGateDoneToday());
  const [gateChecked, setGateChecked] = useState(false);

  const [gateAction, setGateAction] = useState(() => {
    const saved = loadGateActionForToday();
    if (saved) return saved;
    const first = pick3(readQuery())[0];
    saveGateActionForToday(first);
    return first;
  });

  useEffect(() => {
    writeQuery(sel);
  }, [sel]);

  useEffect(() => {
    if (!gateOpen) return;
    const next = pick3(sel)[0];
    setGateAction(next);
    saveGateActionForToday(next);
    setGateChecked(false);
  }, [sel]);

  const proceedGate = () => {
    saveGateActionForToday(gateAction);
    markGateDoneToday();
    setGateOpen(false);
  };

  const regenerate = () => {
    setGenerated(pick3(sel));
  };

  return (
    <>
      {gateOpen && (
        <div className="overlay">
          <div className="card">
            <h2>今の行動</h2>
            <p><b>{gateAction?.title}</b></p>
            <ol>
              {gateAction?.steps?.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>

            <label>
              <input
                type="checkbox"
                checked={gateChecked}
                onChange={() => setGateChecked((v) => !v)}
              />
              できた
            </label>

            <button disabled={!gateChecked} onClick={proceedGate}>
              次へ
            </button>
          </div>
        </div>
      )}

      <div className="wrap">
        <h1>Decision Router</h1>

        <div className="controls">
          {Object.keys(OPTIONS).map((k) => (
            <div key={k}>
              <p>{k}</p>
              {OPTIONS[k].map((o) => (
                <button
                  key={o.value}
                  onClick={() => setSel({ ...sel, [k]: o.value })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        <button onClick={regenerate}>生成</button>

        <div>
          {generated.map((a) => (
            <div key={a.id}>
              <h3>{a.title}</h3>
              <ol>
                {a.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
