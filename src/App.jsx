import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import ACTIONS from "./actions.json";

/**
 * Decision Router
 * ✅ 仕様
 * - 条件選択ページ（#/）
 * - 結果ページ（#/result?...）
 * - 生成ボタンで「結果ページへ遷移」
 * - Vercel 404回避のため hash routing（#/...）を採用
 * - URL共有可能（modeも含める）
 * - Gate（今の行動）1日1回（localStorage）
 *
 * ✅ 追加仕様（学生編 / 一般編）
 * - 条件より上にタブ設置
 * - 学生編: placeに「学校(school)」を含む（旧campusはschool扱い）
 * - 一般編: placeから「学校(school)」を除外
 */

const OPTIONS_BY_MODE = {
  student: {
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
      { value: "school", label: "学校" },
      { value: "outside", label: "外" },
      { value: "online", label: "オンライン" },
    ],
    money: [
      { value: "0", label: "0円" },
      { value: "low", label: "少し（〜500円）" },
      { value: "mid", label: "まあまあ（〜2000円）" },
      { value: "high", label: "気にしない" },
    ],
  },
  general: {
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
      { value: "outside", label: "外" },
      { value: "online", label: "オンライン" },
    ],
    money: [
      { value: "0", label: "0円" },
      { value: "low", label: "少し（〜500円）" },
      { value: "mid", label: "まあまあ（〜2000円）" },
      { value: "high", label: "気にしない" },
    ],
  },
};

const DEFAULTS_BY_MODE = {
  student: {
    time: "30",
    goal: "recover",
    place: "home",
    money: "0",
  },
  general: {
    time: "30",
    goal: "recover",
    place: "home",
    money: "0",
  },
};

const KEYS = ["time", "goal", "place", "money"];
const GATE_DONE_KEY = "decision_router_gate_done_ymd";
const GATE_ACTION_KEY = "decision_router_gate_action_v1";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function validOption(options, key, value) {
  return options[key].some((o) => o.value === value);
}

function labelFor(options, key, value) {
  return options[key].find((o) => o.value === value)?.label ?? value;
}

/** =========================
 * Hash Router helpers
 *  - #/            (select)
 *  - #/result?...  (result)
 * ========================= */
function parseHash() {
  const raw = window.location.hash || "#/";
  const withoutHash = raw.startsWith("#") ? raw.slice(1) : raw; // "/result?..."
  const [pathPart, queryPart = ""] = withoutHash.split("?");
  const path = pathPart || "/";
  const sp = new URLSearchParams(queryPart);
  return { path, sp };
}

// URL互換: 旧campusが来た時の変換
function normalizePlaceFromUrl(place, mode) {
  if (place === "campus") return mode === "student" ? "school" : "outside";
  return place;
}

function readModeFromSP(sp) {
  const m = sp.get("mode");
  return m === "general" ? "general" : "student";
}

function readSelFromSP(sp, mode) {
  const options = OPTIONS_BY_MODE[mode];
  const defaults = DEFAULTS_BY_MODE[mode];

  const time = sp.get("time") ?? defaults.time;
  const goal = sp.get("goal") ?? defaults.goal;
  const rawPlace = sp.get("place") ?? defaults.place;
  const place = normalizePlaceFromUrl(rawPlace, mode);
  const money = sp.get("money") ?? defaults.money;

  return {
    time: validOption(options, "time", time) ? time : defaults.time,
    goal: validOption(options, "goal", goal) ? goal : defaults.goal,
    place: validOption(options, "place", place) ? place : defaults.place,
    money: validOption(options, "money", money) ? money : defaults.money,
  };
}

function navigateHash(path, mode, sel) {
  const sp = new URLSearchParams();
  sp.set("mode", mode);
  if (sel) {
    sp.set("time", sel.time);
    sp.set("goal", sel.goal);
    sp.set("place", sel.place);
    sp.set("money", sel.money);
  }
  const q = sp.toString();
  window.location.hash = q ? `#${path}?${q}` : `#${path}`;
}

/** =========================
 *  Matching / Scoring
 * ========================= */
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
 * Gate helpers (1日1回 + 今日の行動固定)
 * ========================= */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isGateDoneToday() {
  try {
    return localStorage.getItem(GATE_DONE_KEY) === todayKey();
  } catch {
    return false;
  }
}

function markGateDoneToday() {
  try {
    localStorage.setItem(GATE_DONE_KEY, todayKey());
  } catch {
    // ignore
  }
}

function loadGateActionForToday() {
  try {
    const raw = localStorage.getItem(GATE_ACTION_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj?.ymd !== todayKey()) return null;
    return obj.action ?? null;
  } catch {
    return null;
  }
}

function saveGateActionForToday(action) {
  try {
    localStorage.setItem(
      GATE_ACTION_KEY,
      JSON.stringify({ ymd: todayKey(), action })
    );
  } catch {
    // ignore
  }
}

/** =========================
 * UI bits
 * ========================= */
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

function ModeTabs({ mode, onChange }) {
  return (
    <div className="modeTabs">
      <button
        type="button"
        className={`modeTab ${mode === "student" ? "active" : ""}`}
        onClick={() => onChange("student")}
      >
        学生編
      </button>
      <button
        type="button"
        className={`modeTab ${mode === "general" ? "active" : ""}`}
        onClick={() => onChange("general")}
      >
        一般編
      </button>
    </div>
  );
}

function Gate({ action, checked, onToggle, onProceed }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div className="card" style={{ maxWidth: 680, width: "100%", margin: 0 }}>
        <div className="header" style={{ paddingBottom: 8 }}>
          <div className="hgroup">
            <h1 className="title" style={{ marginBottom: 6 }}>
              今の行動 ✅
            </h1>
            <p className="subtitle" style={{ margin: 0 }}>
              一つだけやってみよう！終わったらチェックして次へ。
            </p>
          </div>
        </div>

        <div className="divider" />

        <div style={{ padding: 16 }}>
          <p style={{ marginTop: 0, opacity: 0.9 }}>
            <b>{action?.title ?? "（行動が見つからない）"}</b>
          </p>

          {action?.steps?.length ? (
            <ol className="routeSteps" style={{ marginTop: 8 }}>
              {action.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          ) : (
            <p style={{ opacity: 0.7 }}>
              actions.json に候補が足りないか、タグが合ってないかも。
            </p>
          )}

          {action?.note ? (
            <p style={{ marginBottom: 0, opacity: 0.75 }}>メモ: {action.note}</p>
          ) : null}

          <div className="divider" style={{ margin: "16px 0" }} />

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={checked} onChange={onToggle} />
            <span>できた</span>
          </label>

          <div className="actions" style={{ marginTop: 16, justifyContent: "center" }}>
            <button
              className="btn primary"
              type="button"
              onClick={onProceed}
              disabled={!checked}
              title={!checked ? "チェックしてから進める" : "進む"}
            >
              次へ →
            </button>
          </div>

          <p style={{ textAlign: "center", fontSize: 12, opacity: 0.65, marginBottom: 0 }}>
            ※ 1日1回
          </p>
        </div>
      </div>
    </div>
  );
}

/** =========================
 * Pages
 * ========================= */
function SelectPage({ mode, setMode, options, sel, setKey, onReset, onGenerate, pills, fitScore }) {
  return (
    <div className="wrap">
      <div className="card">
        <div className="header">
          {/* ✅ 追加：学生編 / 一般編 */}
          <ModeTabs mode={mode} onChange={setMode} />

          <div className="hgroup">
            <h1 className="title">Decision Router</h1>
            <p className="subtitle">条件選択 → 生成で「結果ページ」に移動。</p>
          </div>

          <div className="pills">
            <div className="pill">⏱️ <b>{pills.time}</b></div>
            <div className="pill">🎯 <b>{pills.goal}</b></div>
            <div className="pill">📍 <b>{pills.place}</b></div>
            <div className="pill">💸 <b>{pills.money}</b></div>
            <div className="pill">適合 <b>{fitScore}</b></div>
          </div>
        </div>

        <div className="divider" />

        <div className="grid">
          <div className="panel">
            <h2 className="panelTitle">条件を選ぶ</h2>

            <p className="kicker">⏱️ 所要時間</p>
            <div className="chipRow">
              {options.time.map((o) => (
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
              {options.place.map((o) => (
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
              {options.money.map((o) => (
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
              {options.goal.map((o) => (
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
                生成（結果へ） →
              </button>
            </div>

            <div className="spacer" />
            <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.4, textAlign: "center" }}>
              ※ URLに条件が反映されます（共有可能）。
              <br />
              <span style={{ opacity: 0.9 }}>
                #/result?mode=student&amp;time=30&amp;goal=recover&amp;place=home&amp;money=0
              </span>
            </p>
          </div>

          <div className="panel resultsPanel">
            <h2 className="panelTitle">プレビュー（参考）</h2>
            <p style={{ opacity: 0.75, marginTop: 0 }}>
              生成を押すと結果ページへ移動するよ。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultPage({ mode, setMode, options, sel, actions, onBack, onReroll }) {
  return (
    <div className="wrap">
      <div className="card">
        <div className="header">
          {/* ✅ 追加：学生編 / 一般編 */}
          <ModeTabs mode={mode} onChange={setMode} />

          <div className="hgroup">
            <h1 className="title">結果</h1>
            <p className="subtitle">今日の行動（ランダム3つ）</p>
          </div>

          <div className="pills">
            <div className="pill">⏱️ <b>{labelFor(options, "time", sel.time)}</b></div>
            <div className="pill">🎯 <b>{labelFor(options, "goal", sel.goal)}</b></div>
            <div className="pill">📍 <b>{labelFor(options, "place", sel.place)}</b></div>
            <div className="pill">💸 <b>{labelFor(options, "money", sel.money)}</b></div>
          </div>
        </div>

        <div className="divider" />

        <div className="actions" style={{ justifyContent: "space-between" }}>
          <button className="btn" type="button" onClick={onBack}>
            ← 条件に戻る
          </button>
          <button className="btn primary" type="button" onClick={onReroll}>
            もう一回生成 🎲
          </button>
        </div>

        <div className="divider" />

        <div className="panel resultsPanel">
          {actions.map((a, idx) => (
            <React.Fragment key={a.id}>
              <div className="resultCard">
                <p className="routeTitle">
                  {idx === 0 ? "行動A（おすすめ）" : idx === 1 ? "行動B" : "行動C"}{" "}
                  <span style={{ opacity: 0.8, fontWeight: 400 }}>· {a.title}</span>
                </p>

                <ol className="routeSteps">
                  {a.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>

                <div className="smallNote">
                  {a.note ? (
                    <>
                      メモ: {a.note}
                      <br />
                    </>
                  ) : null}
                  <span style={{ opacity: 0.75 }}>
                    一致: {a._mode === "strict" ? "厳密" : "近い候補から救済"} / スコア{" "}
                    {scoreAction(a, sel)}
                  </span>
                </div>
              </div>

              {idx < actions.length - 1 ? <div className="divider" /> : null}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

/** =========================
 * App
 * ========================= */
export default function App() {
  useEffect(() => {
    console.log("✅ App loaded");
    console.log("ACTIONS length =", ACTIONS.length);
    console.log("last id =", ACTIONS[ACTIONS.length - 1]?.id);
  }, []);

  // hash state
  const [{ path, sp }, setRoute] = useState(() => parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // mode: from URL (default student)
  const [mode, setMode] = useState(() => readModeFromSP(sp));
  const options = useMemo(() => OPTIONS_BY_MODE[mode], [mode]);

  // selection based on current route query if exists; else defaults (mode-aware)
  const [sel, setSel] = useState(() => readSelFromSP(sp, mode));

  // keep mode + sel synced when route query changes
  useEffect(() => {
    const nextMode = readModeFromSP(sp);
    setMode(nextMode);
    setSel(readSelFromSP(sp, nextMode));
  }, [path, sp.toString()]);

  // generated actions are stored to keep result stable on the result page
  const [generatedActions, setGeneratedActions] = useState(() =>
    pick3Actions(readSelFromSP(sp, readModeFromSP(sp)))
  );

  // Gate
  const [gateOpen, setGateOpen] = useState(() => !isGateDoneToday());
  const [gateChecked, setGateChecked] = useState(false);

  const [gateAction, setGateAction] = useState(() => {
    const saved = loadGateActionForToday();
    if (saved) return saved;
    const first = pick3Actions(readSelFromSP(sp, readModeFromSP(sp)))[0] ?? null;
    if (first) saveGateActionForToday(first);
    return first;
  });

  // If gate is open and selection changes, update today's gate action (and reset checkbox)
  useEffect(() => {
    if (!gateOpen) return;
    const next = pick3Actions(sel)[0] ?? null;
    setGateAction(next);
    if (next) saveGateActionForToday(next);
    setGateChecked(false);
  }, [sel, gateOpen]);

  const pills = useMemo(
    () => ({
      time: labelFor(options, "time", sel.time),
      goal: labelFor(options, "goal", sel.goal),
      place: labelFor(options, "place", sel.place),
      money: labelFor(options, "money", sel.money),
    }),
    [options, sel]
  );

  const fitScore = useMemo(() => {
    const preview = pick3Actions(sel);
    const scored = preview
      .map((a) => {
        const raw = scoreAction(a, sel);
        const max = maxScoreForAction(a);
        return Math.round((raw / max) * 100);
      })
      .sort((a, b) => b - a);

    return clamp(scored[0] ?? 0, 0, 100);
  }, [sel]);

  // ✅ タブ切り替え（学生/一般）
  const changeMode = (nextMode) => {
    const nextOptions = OPTIONS_BY_MODE[nextMode];
    const nextDefaults = DEFAULTS_BY_MODE[nextMode];

    const nextSel = {
      ...sel,
      // 一般編でschoolが無効になるので自動補正
      place: validOption(nextOptions, "place", sel.place) ? sel.place : nextDefaults.place,
    };

    setMode(nextMode);
    setSel(nextSel);

    // 今いるページのまま URL を更新（共有URLが常に正しい）
    navigateHash(path || "/", nextMode, nextSel);
  };

  // ✅ チップ押したら URL も更新（元コードの狙いを維持）
  const setKey = (key, value) => {
    const next = { ...sel, [key]: value };
    setSel(next);
    navigateHash(path || "/", mode, next);
  };

  const onReset = () => {
    const next = { ...DEFAULTS_BY_MODE[mode] };
    setSel(next);
    navigateHash("/", mode, next);
  };

  const onGenerate = () => {
    const picked = pick3Actions(sel);
    setGeneratedActions(picked);
    // result page へ
    navigateHash("/result", mode, sel);
  };

  const onBack = () => {
    navigateHash("/", mode, sel);
  };

  const onReroll = () => {
    const picked = pick3Actions(sel);
    setGeneratedActions(picked);
  };

  const proceedGate = () => {
    if (gateAction) saveGateActionForToday(gateAction);
    markGateDoneToday();
    setGateOpen(false);
  };

  const isResult = path === "/result";

  return (
    <>
      {gateOpen ? (
        <Gate
          action={gateAction}
          checked={gateChecked}
          onToggle={() => setGateChecked((v) => !v)}
          onProceed={proceedGate}
        />
      ) : null}

      {isResult ? (
        <ResultPage
          mode={mode}
          setMode={changeMode}
          options={options}
          sel={sel}
          actions={generatedActions}
          onBack={onBack}
          onReroll={onReroll}
        />
      ) : (
        <SelectPage
          mode={mode}
          setMode={changeMode}
          options={options}
          sel={sel}
          setKey={setKey}
          onReset={onReset}
          onGenerate={onGenerate}
          pills={pills}
          fitScore={fitScore}
        />
      )}
    </>
  );
}
