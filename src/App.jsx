import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import ACTIONS from "./actions.json";

/**
 * Decision Router (ACTIONS版 / 体力なし)
 *
 * ✅ 条件:
 *  - 所要時間 time
 *  - 場所 place
 *  - 目的 goal
 *  - お金 money
 *
 * ✅ 仕様:
 *  - 条件を設定 → 条件に合う「行動」をランダムで3つ生成
 *  - 厳密一致が足りない場合は、近い（スコア上位帯）から補完
 *  - URLクエリに条件を反映（共有可能）
 *
 * URL例:
 *  /?time=30&goal=recover&place=home&money=0
 */

/** =========================
 *  OPTIONS / DEFAULTS
 *  ========================= */
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function labelFor(key, value) {
  return OPTIONS[key].find((o) => o.value === value)?.label ?? value;
}

/** =========================
 *  URL sync
 *  ========================= */
function readQuery() {
  const sp = new URLSearchParams(window.location.search);
  const time = sp.get("time") ?? DEFAULTS.time;
  const goal = sp.get("goal") ?? DEFAULTS.goal;
  const place = sp.get("place") ?? DEFAULTS.place;
  const money = sp.get("money") ?? DEFAULTS.money;

  const valid = (key, value) => OPTIONS[key].some((o) => o.value === value);

  return {
    time: valid("time", time) ? time : DEFAULTS.time,
    goal: valid("goal", goal) ? goal : DEFAULTS.goal,
    place: valid("place", place) ? place : DEFAULTS.place,
    money: valid("money", money) ? money : DEFAULTS.money,
  };
}

function writeQuery(state) {
  const sp = new URLSearchParams();
  sp.set("time", state.time);
  sp.set("goal", state.goal);
  sp.set("place", state.place);
  sp.set("money", state.money);
  const next = `${window.location.pathname}?${sp.toString()}`;
  window.history.replaceState({}, "", next);
}

/** =========================
 *  ACTIONS (行動プール)
 *  - 将来は actions.json に移すの推奨
 *  ========================= */


/** =========================
 *  Matching / Scoring
 *  ========================= */
const KEYS = ["time", "goal", "place", "money"];

function matchesAllAction(action, sel) {
  return KEYS.every((k) => action.tags[k]?.includes(sel[k]));
}

function scoreAction(action, sel) {
  let s = 0;
  if (action.tags.time?.includes(sel.time)) s += 3;
  if (action.tags.goal?.includes(sel.goal)) s += 4;
  if (action.tags.place?.includes(sel.place)) s += 3;
  if (action.tags.money?.includes(sel.money)) s += 3;
  return s;
}

function maxScoreForAction(action) {
  let m = 0;
  if (action.tags.time?.length) m += 3;
  if (action.tags.goal?.length) m += 4;
  if (action.tags.place?.length) m += 3;
  if (action.tags.money?.length) m += 3;
  return m || 1;
}

function pickNRandomUnique(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

/**
 * ✅ 3つ生成:
 *  1) 厳密一致から最大3つ
 *  2) 足りない分は「上位帯（トップ-2点）」からランダム補完
 */
function pick3Actions(sel) {
  const strict = ACTIONS.filter((a) => matchesAllAction(a, sel));
  const pickedStrict = pickNRandomUnique(strict, 3).map((a) => ({
    ...a,
    _mode: "strict",
    _score: scoreAction(a, sel),
  }));

  if (pickedStrict.length === 3) return pickedStrict;

  const rest = ACTIONS.filter((a) => !pickedStrict.some((p) => p.id === a.id))
    .map((a) => ({ ...a, _score: scoreAction(a, sel) }))
    .sort((a, b) => b._score - a._score);

  const top = rest[0]?._score ?? 0;
  const band = rest.filter((a) => a._score >= top - 2);
  const pool = band.length ? band : rest;

  const fill = pickNRandomUnique(pool, 3 - pickedStrict.length).map((a) => ({
    ...a,
    _mode: "fallback",
  }));

  return [...pickedStrict, ...fill];
}

/** =========================
 *  UI bits
 *  ========================= */
function Chip({ label, selected, onClick }) {
  return (
    <button
      type="button"
      className="chip"
      data-selected={selected ? "true" : "false"}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function App() {
  const [sel, setSel] = useState(() => readQuery());
  const [generatedSel, setGeneratedSel] = useState(() => readQuery());
  const [step, setStep] = useState(1);

  // ✅ 結果を固定表示するため、生成結果をstateに持つ
  const [generatedActions, setGeneratedActions] = useState(() =>
    pick3Actions(readQuery())
  );

  useEffect(() => {
    writeQuery(sel);
  }, [sel]);

  useEffect(() => {
    const onPop = () => setSel(readQuery());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const pills = useMemo(() => {
    return {
      time: labelFor("time", sel.time),
      goal: labelFor("goal", sel.goal),
      place: labelFor("place", sel.place),
      money: labelFor("money", sel.money),
    };
  }, [sel]);

  const setKey = (key, value) => {
    setSel((prev) => ({ ...prev, [key]: value }));
    setStep((s) => (key === "goal" ? Math.max(s, 2) : 1));
  };

  const onGenerate = () => {
    setGeneratedSel(sel);
    setGeneratedActions(pick3Actions(sel));
    setStep(3);
  };

  const onReset = () => {
    setSel(DEFAULTS);
    setGeneratedSel(DEFAULTS);
    setGeneratedActions(pick3Actions(DEFAULTS));
    setStep(1);
  };

  const fitScore = useMemo(() => {
    // 3つのうち一番合うやつの適合を表示
    const scored = generatedActions
      .map((a) => {
        const raw = scoreAction(a, generatedSel);
        const max = maxScoreForAction(a);
        return Math.round((raw / max) * 100);
      })
      .sort((a, b) => b - a);

    return clamp(scored[0] ?? 0, 0, 100);
  }, [generatedActions, generatedSel]);

  return (
    <div className="wrap">
      <div className="card">
        <div className="header">
          <div className="hgroup">
            <h1 className="title">Decision Router</h1>
            <p className="subtitle">
              所要時間・目的・場所・お金を選ぶだけ。条件に合う「行動」をランダムで3つ出す。
            </p>
          </div>

          <div className="pills">
            <div className="pill">
              ⏱️ <b>{pills.time}</b>
            </div>
            <div className="pill">
              🎯 <b>{pills.goal}</b>
            </div>
            <div className="pill">
              📍 <b>{pills.place}</b>
            </div>
            <div className="pill">
              💸 <b>{pills.money}</b>
            </div>
            <div className="pill">
              適合 <b>{fitScore}</b>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="stepper">
          <div className={`step ${step === 1 ? "active" : ""}`}>1 条件</div>
          <div className={`step ${step === 2 ? "active" : ""}`}>2 目的</div>
          <div className={`step ${step === 3 ? "active" : ""}`}>3 結果</div>
        </div>

        <div className="divider" />

        <div className="grid">
          <div className="panel">
            <h2 className="panelTitle">条件を選ぶ</h2>

            <p className="kicker">⏱️ 所要時間</p>
            <div className="chipRow">
              {OPTIONS.time.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={sel.time === o.value}
                  onClick={() => setKey("time", o.value)}
                />
              ))}
            </div>

            <div className="divider" />

            <p className="kicker">📍 場所</p>
            <div className="chipRow">
              {OPTIONS.place.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={sel.place === o.value}
                  onClick={() => setKey("place", o.value)}
                />
              ))}
            </div>

            <div className="divider" />

            <p className="kicker">💸 お金</p>
            <div className="chipRow">
              {OPTIONS.money.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={sel.money === o.value}
                  onClick={() => setKey("money", o.value)}
                />
              ))}
            </div>

            <div className="divider" />

            <p className="kicker">🎯 目的</p>
            <div className="chipRow">
              {OPTIONS.goal.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={sel.goal === o.value}
                  onClick={() => setKey("goal", o.value)}
                />
              ))}
            </div>

            <div className="divider" />

            <div className="actions">
              <button className="btn" type="button" onClick={onReset}>
                リセット
              </button>
              <button className="btn primary" type="button" onClick={onGenerate}>
                生成
              </button>
            </div>

            <div className="spacer" />
            <p
              className="muted"
              style={{ margin: 0, fontSize: 12, lineHeight: 1.4, textAlign: "center" }}
            >
              ※ URLに条件が反映されます（共有可能）。
              <br />
              <span style={{ opacity: 0.9 }}>
                ?time=30&amp;goal=recover&amp;place=home&amp;money=0
              </span>
            </p>
          </div>

          <div className="panel resultsPanel">
            <h2 className="panelTitle">今日の行動（ランダム3つ）</h2>

            {generatedActions.map((a, idx) => (
              <React.Fragment key={a.id}>
                <div className="resultCard">
                  <p className="routeTitle">
                    {idx === 0 ? "行動A（おすすめ）" : idx === 1 ? "行動B" : "行動C"}
                    {" "}
                    <span style={{ opacity: 0.8, fontWeight: 400 }}>· {a.title}</span>
                  </p>

                  <ol className="routeSteps">
                    {a.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>

                  <div className="smallNote">
                    {a.note ? <>メモ: {a.note}<br /></> : null}
                    <span style={{ opacity: 0.75 }}>
                      一致: {a._mode === "strict" ? "厳密" : "近い候補から救済"} / スコア {scoreAction(a, generatedSel)}
                    </span>
                  </div>
                </div>

                {idx < generatedActions.length - 1 ? <div className="divider" /> : null}
              </React.Fragment>
            ))}

            <div className="divider" />

            <div className="actions" style={{ justifyContent: "center" }}>
              <button className="btn primary" type="button" onClick={onGenerate}>
                もう一回生成 🎲
              </button>
            </div>

            <div className="spacer" />
          </div>
        </div>
      </div>
    </div>
  );
}
