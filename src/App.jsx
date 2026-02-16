// App.js（このファイルを“まるごと”置き換えてコピペ）
// ✅ あなたの actions.json（title/tags/modesのみ・steps無し）でも落ちない版
// ✅ 「生成（結果を見る）」で必ず #/result に遷移する版（hashchange待ちしない）
// ✅ Gate は「10歩歩く」で固定（1日1回）
// ✅ student/general モード対応（actions.json の modes でちゃんと絞る）
//
// 使い方：src/App.js をこれで全置換 → 保存 → npm run dev / npm start
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
  student: { time: "30", goal: "recover", place: "home", money: "0" },
  general: { time: "30", goal: "recover", place: "home", money: "0" },
};

const KEYS = ["time", "goal", "place", "money"];

// Gate（1日1回）
const GATE_DONE_KEY = "decision_router_gate_done_ymd_v3";

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
 * ========================= */
function parseHash() {
  const raw = window.location.hash || "#/";
  const withoutHash = raw.startsWith("#") ? raw.slice(1) : raw; // "/result?..."
  const [pathPart, queryPart = ""] = withoutHash.split("?");
  const path = pathPart || "/";
  const sp = new URLSearchParams(queryPart);
  return { path, sp };
}

// URL互換: 旧campusが来た時の変換（URL側）
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

function buildHash(path, mode, sel) {
  const sp = new URLSearchParams();
  sp.set("mode", mode);
  if (sel) {
    sp.set("time", sel.time);
    sp.set("goal", sel.goal);
    sp.set("place", sel.place);
    sp.set("money", sel.money);
  }
  const q = sp.toString();
  return q ? `#${path}?${q}` : `#${path}`;
}

/** =========================
 * Matching / Scoring（campus互換 + modes対応 + steps無しでも落ちない）
 * ========================= */
function normalizePlaceForMatch(value, mode) {
  if (value === "campus") return mode === "student" ? "school" : "outside";
  return value;
}

function ensureSteps(action) {
  // actions.json に steps が無くても結果画面で落ちないようにする
  if (Array.isArray(action.steps) && action.steps.length) return action;
  return { ...action, steps: [action.title] };
}

function inMode(action, mode) {
  // modes が無い行動は両対応扱い（安全）
  if (!Array.isArray(action.modes) || action.modes.length === 0) return true;
  return action.modes.includes(mode);
}

function actionHasTag(action, key, value, mode) {
  const tags = action.tags?.[key] ?? [];
  if (key !== "place") return tags.includes(value);

  const normalizedTags = tags.map((t) => normalizePlaceForMatch(t, mode));
  const normalizedValue = normalizePlaceForMatch(value, mode);
  return normalizedTags.includes(normalizedValue);
}

function matchesAllAction(action, sel, mode) {
  return KEYS.every((k) => actionHasTag(action, k, sel[k], mode));
}

function scoreAction(action, sel, mode) {
  let s = 0;
  if (actionHasTag(action, "time", sel.time, mode)) s += 3;
  if (actionHasTag(action, "goal", sel.goal, mode)) s += 4;
  if (actionHasTag(action, "place", sel.place, mode)) s += 3;
  if (actionHasTag(action, "money", sel.money, mode)) s += 3;
  return s;
}

function maxScoreForAction(action) {
  let m = 0;
  if (action.tags?.time?.length) m += 3;
  if (action.tags?.goal?.length) m += 4;
  if (action.tags?.place?.length) m += 3;
  if (action.tags?.money?.length) m += 3;
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

function pick3Actions(sel, mode) {
  const base = ACTIONS.filter((a) => inMode(a, mode)).map(ensureSteps);

  const strict = base.filter((a) => matchesAllAction(a, sel, mode));
  const pickedStrict = pickNRandomUnique(strict, 3).map((a) => ({
    ...a,
    _mode: "strict",
    _score: scoreAction(a, sel, mode),
  }));

  if (pickedStrict.length === 3) return pickedStrict;

  const rest = base
    .filter((a) => !pickedStrict.some((p) => p.id === a.id))
    .map((a) => ({ ...a, _score: scoreAction(a, sel, mode) }))
    .sort((a, b) => b._score - a._score);

  const top = rest[0]?._score ?? 0;
  const band = rest.filter((a) => a._score >= top - 2);
  const pool = band.length ? band : rest;

  const fill = pickNRandomUnique(pool, 3 - pickedStrict.length).map((a) => ({
    ...a,
    _mode: "fallback",
    _score: a._score ?? scoreAction(a, sel, mode),
  }));

  return [...pickedStrict, ...fill];
}

function maxPossiblePercent(sel, mode) {
  let best = 0;
  for (const rawAction of ACTIONS) {
    if (!inMode(rawAction, mode)) continue;
    const a = ensureSteps(rawAction);
    const raw = scoreAction(a, sel, mode);
    const max = maxScoreForAction(a);
    const pct = Math.round((raw / max) * 100);
    if (pct > best) best = pct;
    if (best === 100) break;
  }
  return clamp(best, 0, 100);
}

/** =========================
 * Gate helpers
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

// ✅ Gate固定行動：10歩歩く
const FIXED_GATE_ACTION = {
  id: "gate_fixed_10steps",
  title: "10歩歩く",
  steps: ["いま立つ", "部屋の中で10歩だけ歩く", "席に戻る（OK）"],
  note: "小さくていい。脳に「始めた」旗を立てるだけ。",
};

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

          <ol className="routeSteps" style={{ marginTop: 8 }}>
            {(action?.steps?.length ? action.steps : [action?.title]).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>

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
                生成（結果を見る） →
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
            <p style={{ opacity: 0.75, marginTop: 0 }}>生成を押すと結果ページへ移動するよ。</p>
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
                  {(a.steps?.length ? a.steps : [a.title]).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>

                <div className="smallNote">
                  <span style={{ opacity: 0.75 }}>
                    一致: {a._mode === "strict" ? "厳密" : "近い候補から救済"} / スコア {a._score ?? 0}
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

  // mode + selection
  const [mode, setMode] = useState(() => readModeFromSP(sp));
  const options = useMemo(() => OPTIONS_BY_MODE[mode], [mode]);
  const [sel, setSel] = useState(() => readSelFromSP(sp, mode));

  // ✅ ルート変更に追従
  useEffect(() => {
    const nextMode = readModeFromSP(sp);
    setMode(nextMode);
    setSel(readSelFromSP(sp, nextMode));
  }, [path, sp.toString()]);

  // ✅ 生成結果（resultページで固定）
  const [generatedActions, setGeneratedActions] = useState(() =>
    pick3Actions(readSelFromSP(sp, readModeFromSP(sp)), readModeFromSP(sp))
  );

  // ✅ Gate（固定で10歩歩く）
  const [gateOpen, setGateOpen] = useState(() => !isGateDoneToday());
  const [gateChecked, setGateChecked] = useState(false);

  const pills = useMemo(
    () => ({
      time: labelFor(options, "time", sel.time),
      goal: labelFor(options, "goal", sel.goal),
      place: labelFor(options, "place", sel.place),
      money: labelFor(options, "money", sel.money),
    }),
    [options, sel]
  );

  const fitScore = useMemo(() => maxPossiblePercent(sel, mode), [sel, mode]);

  // ✅ 遷移を“確実に”反映（hashchange待ちしない）
  const go = (nextPath, nextMode, nextSel) => {
    window.location.hash = buildHash(nextPath, nextMode, nextSel);
    setRoute(parseHash()); // 即同期（これが「生成押しても開かない」対策の核）
  };

  // ✅ モード切替
  const changeMode = (nextMode) => {
    const nextOptions = OPTIONS_BY_MODE[nextMode];
    const nextDefaults = DEFAULTS_BY_MODE[nextMode];

    const nextSel = {
      ...sel,
      place: validOption(nextOptions, "place", sel.place) ? sel.place : nextDefaults.place,
    };

    setMode(nextMode);
    setSel(nextSel);
    go(path || "/", nextMode, nextSel);

    // 結果ページなら、モードに合わせて中身も更新
    if (path === "/result") {
      setGeneratedActions(pick3Actions(nextSel, nextMode));
    }
  };

  // ✅ チップ更新 + URL更新
  const setKey = (key, value) => {
    const next = { ...sel, [key]: value };
    setSel(next);
    go(path || "/", mode, next);
  };

  const onReset = () => {
    const next = { ...DEFAULTS_BY_MODE[mode] };
    setSel(next);
    go("/", mode, next);
  };

  const onGenerate = () => {
    setGeneratedActions(pick3Actions(sel, mode));
    go("/result", mode, sel);
  };

  const onBack = () => go("/", mode, sel);

  const onReroll = () => setGeneratedActions(pick3Actions(sel, mode));

  const proceedGate = () => {
    markGateDoneToday();
    setGateOpen(false);
  };

  const isResult = path === "/result";

  return (
    <>
      {gateOpen ? (
        <Gate
          action={FIXED_GATE_ACTION}
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
