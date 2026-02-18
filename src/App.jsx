// src/App.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./App.css";
import RAW_ACTIONS from "./actions.json";
import SideGame from "./SideGame";

/**
 * Decision Router (hash routing)
 * - 条件選択：#/
 * - 結果：#/result?mode=student&time=30&goal=recover&place=home&money=0
 * - 履歴/お気に入り：localStorage（安全ラッパー + session保険）
 * - Gate（今の行動）：1日1回（localStorage + session保険）
 * - 右側：SideGame（別ファイル）
 *
 * ✅ actions.json 互換
 * - tags が「配列」でも「{time:[...],goal:[...]}」でも動く
 * - place: outside / money: low|mid|high を UI 側も対応
 */

const LS = {
  gateDay: "dr_gate_done_day",
  gateSessionDay: "dr_gate_session_seen_day", // ✅ localStorageが死んでも「このタブでは出さない」保険
  history: "dr_history_v1",
  favs: "dr_favs_v1",
};

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
    { value: "school", label: "学校" },
    { value: "outside", label: "外" },
    { value: "online", label: "オンライン" },
  ],
  money: [
    { value: "0", label: "0円" },
    { value: "low", label: "少し" },
    { value: "mid", label: "まあまあ" },
    { value: "high", label: "気にしない" },
  ],
};

const DEFAULTS = {
  mode: "student",
  time: "30",
  goal: "recover",
  place: "home",
  money: "0",
};

/* =========================
   Safe storage (local + session fallback)
========================= */
function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function safeGetAny(key) {
  // local -> session の順で読む（localが消える環境の保険）
  const a = safeGet(window.localStorage, key);
  if (a !== null && a !== undefined) return a;
  const b = safeGet(window.sessionStorage, key);
  if (b !== null && b !== undefined) return b;
  return null;
}
function safeSetAny(key, value) {
  const s = String(value);
  const okLocal = safeSet(window.localStorage, key, s);
  const okSession = safeSet(window.sessionStorage, key, s);
  return okLocal || okSession;
}

function safeJsonParse(str, fallback) {
  try {
    if (!str) return fallback;
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
function readLS(key, fallback) {
  return safeJsonParse(safeGetAny(key), fallback);
}
function writeLS(key, value) {
  safeSetAny(key, JSON.stringify(value));
}

/* =========================
   Utils
========================= */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeActions(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.actions)) return raw.actions;
  return [];
}

function parseHash() {
  const raw = window.location.hash || "#/";
  const withoutHash = raw.startsWith("#") ? raw.slice(1) : raw;

  const base = withoutHash.trim();
  if (!base || base === "/") return { path: "/", query: {} };

  const normalized = base.startsWith("/") ? base : `/${base}`;
  const [pathPart, queryPart] = normalized.split("?");
  const path = pathPart === "" ? "/" : pathPart;

  const params = new URLSearchParams(queryPart || "");
  const obj = {};
  params.forEach((v, k) => (obj[k] = v));
  return { path, query: obj };
}

function toQueryString(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length > 0) p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

function navigateHash(path, queryObj) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const q = queryObj ? toQueryString(queryObj) : "";
  window.location.hash = `#${p}${q}`;
}

function pickRandom(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

function labelOf(list, value) {
  return list.find((x) => x.value === String(value))?.label ?? String(value);
}

function makeCondKey(mode, cond) {
  return `${mode}|${cond.time}|${cond.goal}|${cond.place}|${cond.money}`;
}

/* =========================
   tags対応（配列型 / オブジェクト型）
========================= */
function getTagObj(action) {
  const t = action?.tags;
  if (t && typeof t === "object" && !Array.isArray(t)) return t;
  return null;
}

function getTagArray(action) {
  const t = action?.tags;
  if (Array.isArray(t)) return t.map(String);
  return null;
}

function listify(v) {
  if (Array.isArray(v)) return v.map(String);
  if (v === undefined || v === null) return [];
  return [String(v)];
}

function actionHasAny(action, key, wantedValue) {
  const want = String(wantedValue);

  const obj = getTagObj(action);
  if (obj) {
    const arr = listify(obj[key]);
    return arr.includes(want);
  }

  const arr = getTagArray(action);
  if (arr) {
    return arr.includes(`${key}:${want}`) || arr.includes(want);
  }

  return false;
}

function prettyTags(action) {
  const obj = getTagObj(action);
  if (obj) {
    const out = [];
    for (const k of ["time", "goal", "place", "money"]) {
      const arr = listify(obj[k]);
      for (const v of arr) out.push(`${k}:${v}`);
    }
    return out;
  }
  const arr = getTagArray(action);
  return arr ? arr : [];
}

function calcFitScore(action, cond) {
  const checks = [
    actionHasAny(action, "time", cond.time),
    actionHasAny(action, "goal", cond.goal),
    actionHasAny(action, "place", cond.place),
    actionHasAny(action, "money", cond.money),
  ];
  const hit = checks.filter(Boolean).length;
  return Math.round((hit / checks.length) * 100);
}

function filterActionsByMode(actions, mode) {
  return (actions || []).filter((a) => {
    const modes = a?.modes;
    if (!modes) return true;
    if (Array.isArray(modes)) return modes.includes(mode);
    if (typeof modes === "string") return modes === mode;
    return true;
  });
}

function filterActionsByConditions(actions, cond) {
  const filtered = (actions || []).filter((a) => {
    const hasTags = !!getTagObj(a) || !!getTagArray(a);
    if (!hasTags) return true;

    return (
      actionHasAny(a, "time", cond.time) ||
      actionHasAny(a, "goal", cond.goal) ||
      actionHasAny(a, "place", cond.place) ||
      actionHasAny(a, "money", cond.money)
    );
  });

  return filtered.length ? filtered : (actions || []);
}

/* =========================
   UI Parts
========================= */
function GateOverlay({ isOpen, onDone }) {
  if (!isOpen) return null;
  return (
    <div className="gateOverlay">
      <div className="gateCard">
        <div className="gateTitle">まずは「今の行動」</div>
        <div className="gateText">
          今日はこれを1回だけクリアしたら先へ進めるよ。
          <br />
          <b>10歩あるく</b>
        </div>
        <div className="gateButtons">
          <button type="button" className="btnPrimary" onClick={onDone}>
            ✅ できた
          </button>
        </div>
        <div className="gateHint">※ 1日1回だけ表示（localStorage / session保険）</div>
      </div>
    </div>
  );
}

function SubTabs({ tab, setTab }) {
  return (
    <div className="subTabs">
      <button
        type="button"
        className={`subTab ${tab === "conditions" ? "active" : ""}`}
        onClick={() => setTab("conditions")}
      >
        条件
      </button>
      <button
        type="button"
        className={`subTab ${tab === "history" ? "active" : ""}`}
        onClick={() => setTab("history")}
      >
        履歴
      </button>
      <button
        type="button"
        className={`subTab ${tab === "favorites" ? "active" : ""}`}
        onClick={() => setTab("favorites")}
      >
        お気に入り
      </button>
    </div>
  );
}

function ModeTabs({ mode, onChange }) {
  return (
    <div className="modeWrap">
      <div className="modeLabel">モード</div>
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
    </div>
  );
}

function ConditionGroup({ title, options, value, onChange }) {
  return (
    <div className="condGroup">
      <div className="condTitle">{title}</div>
      <div className="condRow">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`chip ${String(value) === String(o.value) ? "active" : ""}`}
            onClick={() => onChange(String(o.value))}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoryList({ items, onPick, onClear }) {
  return (
    <div className="listWrap">
      <div className="listHead">
        <div className="listTitle">履歴</div>
        <button type="button" className="btnGhost" onClick={onClear}>
          クリア
        </button>
      </div>

      {items.length === 0 ? (
        <div className="muted">まだ履歴はないよ。</div>
      ) : (
        <div className="list">
          {items.map((h, idx) => (
            <button type="button" key={h.id || idx} className="listItem" onClick={() => onPick(h)}>
              <div className="listMain">
                <div className="listLine">
                  ⏱️ {labelOf(OPTIONS.time, h.time)} / 🎯 {labelOf(OPTIONS.goal, h.goal)} / 📍 {labelOf(OPTIONS.place, h.place)} / 💸{" "}
                  {labelOf(OPTIONS.money, h.money)} / <b>{h.mode === "general" ? "一般編" : "学生編"}</b>
                </div>
                <div className="listSub">{new Date(h.at).toLocaleString()}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FavoritesList({ items, onRemove, onUse }) {
  return (
    <div className="listWrap">
      <div className="listHead">
        <div className="listTitle">お気に入り</div>
      </div>

      {items.length === 0 ? (
        <div className="muted">お気に入りはまだ空っぽ。</div>
      ) : (
        <div className="list">
          {items.map((f, idx) => (
            <div key={f.key || idx} className="favItem">
              <button type="button" className="favUse" onClick={() => onUse(f)}>
                <div className="listLine">
                  ⏱️ {labelOf(OPTIONS.time, f.time)} / 🎯 {labelOf(OPTIONS.goal, f.goal)} / 📍 {labelOf(OPTIONS.place, f.place)} / 💸{" "}
                  {labelOf(OPTIONS.money, f.money)} / <b>{f.mode === "general" ? "一般編" : "学生編"}</b>
                </div>
                <div className="listSub">保存：{new Date(f.at).toLocaleString()}</div>
              </button>
              <button type="button" className="btnGhost" onClick={() => onRemove(idx)}>
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================
   Pages
========================= */
function SelectPage({
  mode,
  setMode,
  cond,
  setCond,
  tab,
  setTab,
  fitScore,
  history,
  favs,
  onGenerate,
  onReset,
  onPickHistory,
  onClearHistory,
  onUseFav,
  onRemoveFav,
}) {
  const pills = useMemo(() => {
    return {
      time: labelOf(OPTIONS.time, cond.time),
      goal: labelOf(OPTIONS.goal, cond.goal),
      place: labelOf(OPTIONS.place, cond.place),
      money: labelOf(OPTIONS.money, cond.money),
    };
  }, [cond]);

  return (
    <div className="page">
      <div className="header">
        <div className="hgroup">
          <h1 className="title">Decision Router</h1>
          <p className="subtitle">条件選択 → 生成で「結果ページ」に移動。</p>
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

        <SubTabs tab={tab} setTab={setTab} />
        <ModeTabs mode={mode} onChange={setMode} />
      </div>

      <div className="contentGrid">
        <div className="card">
          {tab === "conditions" && (
            <>
              <div className="cardTitle">条件を選ぶ</div>

              <ConditionGroup
                title="⏱️ 所要時間"
                options={OPTIONS.time}
                value={cond.time}
                onChange={(v) => setCond((c) => ({ ...c, time: v }))}
              />
              <ConditionGroup
                title="📍 場所"
                options={OPTIONS.place}
                value={cond.place}
                onChange={(v) => setCond((c) => ({ ...c, place: v }))}
              />
              <ConditionGroup
                title="💸 お金"
                options={OPTIONS.money}
                value={cond.money}
                onChange={(v) => setCond((c) => ({ ...c, money: v }))}
              />
              <ConditionGroup
                title="🎯 目的"
                options={OPTIONS.goal}
                value={cond.goal}
                onChange={(v) => setCond((c) => ({ ...c, goal: v }))}
              />

              <div className="actionsRow">
                <button type="button" className="btnGhost" onClick={onReset}>
                  リセット
                </button>
                <button type="button" className="btnPrimary" onClick={onGenerate}>
                  生成（結果を見る） →
                </button>
              </div>

              <div className="muted small">
                ※ URLに条件が反映されます（共有可能）。
                <div className="mono">
                  #/result{toQueryString({ mode, time: cond.time, goal: cond.goal, place: cond.place, money: cond.money })}
                </div>
              </div>
            </>
          )}

          {tab === "history" && (
            <HistoryList items={history} onPick={onPickHistory} onClear={onClearHistory} />
          )}
          {tab === "favorites" && (
            <FavoritesList items={favs} onRemove={onRemoveFav} onUse={onUseFav} />
          )}
        </div>

        <div className="card">
          <div className="cardTitle">プレビュー（参考）</div>
          <div className="muted">生成を押すと結果ページへ移動するよ。</div>
        </div>
      </div>
    </div>
  );
}

function ResultPage({ mode, onChangeMode, cond, results, onBack, onRegenerate, onAddFav, isFav }) {
  const pills = useMemo(() => {
    return {
      time: labelOf(OPTIONS.time, cond.time),
      goal: labelOf(OPTIONS.goal, cond.goal),
      place: labelOf(OPTIONS.place, cond.place),
      money: labelOf(OPTIONS.money, cond.money),
    };
  }, [cond]);

  return (
    <div className="page">
      <div className="header">
        <div className="hgroup">
          <h1 className="title">結果</h1>
          <p className="subtitle">今日の行動（ランダム3つ）</p>
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
        </div>

        <ModeTabs mode={mode} onChange={onChangeMode} />
      </div>

      <div className="card">
        <div className="actionsRow">
          <button type="button" className="btnGhost" onClick={onBack}>
            ← 条件に戻る
          </button>
          <button type="button" className="btnPrimary" onClick={onRegenerate}>
            もう一回生成
          </button>
          <button type="button" className={`btnGhost ${isFav ? "active" : ""}`} onClick={onAddFav}>
            {isFav ? "★ お気に入り済み" : "☆ お気に入りに追加"}
          </button>
        </div>

        <div className="resultList">
          {results.length === 0 ? (
            <div className="muted">候補が見つからなかった。条件を変えてみて。</div>
          ) : (
            results.map((r, idx) => (
              <div key={`${r.id || r.title}-${idx}`} className="resultItem">
                <div className="resultTitle">{r.title}</div>
                <div className="resultMeta muted small">
                  適合 {r.fit} / tags: {prettyTags(r).slice(0, 8).join(", ")}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================
   App
========================= */
export default function App() {
  const [{ path, query }, setRoute] = useState(() => parseHash());

  // ✅ RAW_ACTIONS の更新に追従（HMR/差し替え耐性）
  const ACTIONS = useMemo(() => normalizeActions(RAW_ACTIONS), [RAW_ACTIONS]);

  const [mode, setMode] = useState(query.mode || DEFAULTS.mode);
  const [cond, setCond] = useState({
    time: query.time || DEFAULTS.time,
    goal: query.goal || DEFAULTS.goal,
    place: query.place || DEFAULTS.place,
    money: query.money || DEFAULTS.money,
  });

  const [tab, setTab] = useState("conditions");
  const [history, setHistory] = useState(() => readLS(LS.history, []));
  const [favs, setFavs] = useState(() => readLS(LS.favs, []));
  const [gateOpen, setGateOpen] = useState(false);

  // ✅ 「同じURLでも再生成」を確実にするトリガー
  const [regenTick, setRegenTick] = useState(0);

  // ✅ 最新参照（履歴/お気に入りで“古いstate”掴まない）
  const historyRef = useRef(history);
  const favsRef = useRef(favs);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  useEffect(() => {
    favsRef.current = favs;
  }, [favs]);

  // hash listener
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // route -> state sync（JSON.stringify 地雷を回避）
  useEffect(() => {
    const q = query || {};

    const nextMode = q.mode || mode;
    const nextCond = {
      time: q.time || cond.time,
      goal: q.goal || cond.goal,
      place: q.place || cond.place,
      money: q.money || cond.money,
    };

    const modeChanged = nextMode !== mode;
    const condChanged =
      nextCond.time !== cond.time ||
      nextCond.goal !== cond.goal ||
      nextCond.place !== cond.place ||
      nextCond.money !== cond.money;

    if (modeChanged) setMode(nextMode);
    if (condChanged) setCond(nextCond);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, query.mode, query.time, query.goal, query.place, query.money]);

  // ✅ gate (1/day) - localStorageが死んでも「このタブでは出さない」保険付き
  useEffect(() => {
    const t = todayKey();
    const doneDay = safeGetAny(LS.gateDay);
    const seenSessionDay = safeGetAny(LS.gateSessionDay);

    // 既に今日クリア済み → 出さない
    if (doneDay === t) return;

    // localStorageが不安定でも「このタブで一回出したら今日は出さない」
    if (seenSessionDay === t) return;

    safeSetAny(LS.gateSessionDay, t);
    setGateOpen(true);
  }, []);

  const allActions = useMemo(() => filterActionsByMode(ACTIONS, mode), [ACTIONS, mode]);
  const narrowed = useMemo(() => filterActionsByConditions(allActions, cond), [allActions, cond]);

  const fitScore = useMemo(() => {
    const scored = narrowed.map((a) => calcFitScore(a, cond));
    return scored.length ? Math.max(...scored) : 0;
  }, [narrowed, cond]);

  const results = useMemo(() => {
    if (path !== "/result") return [];
    // regenTick が変わるたびに pickRandom が走る
    const scored = narrowed
      .map((a) => ({ ...a, fit: calcFitScore(a, cond) }))
      .sort((a, b) => b.fit - a.fit);

    const top = scored.slice(0, Math.min(15, scored.length));
    return pickRandom(top, 3);
  }, [path, narrowed, cond, regenTick]);

  const favKey = useMemo(() => makeCondKey(mode, cond), [mode, cond]);
  const isFav = useMemo(() => favs.some((f) => f.key === favKey), [favs, favKey]);

  const pushHistory = useCallback((currentCond) => {
    const now = Date.now();
    const item = {
      ...currentCond,
      mode: currentCond.mode,
      at: now,
      id: `${now}-${Math.random().toString(16).slice(2)}`,
    };

    const prev = historyRef.current || [];
    const head = prev[0];

    const headKey = head ? makeCondKey(head.mode || currentCond.mode, head) : "";
    const newKey = makeCondKey(currentCond.mode, currentCond);

    let next;
    if (head && headKey === newKey) {
      next = [{ ...head, at: now }, ...prev.slice(1)];
    } else {
      next = [item, ...prev].slice(0, 50);
    }

    setHistory(next);
    writeLS(LS.history, next);
  }, []);

  const handleGenerate = useCallback(() => {
    const q = { mode, time: cond.time, goal: cond.goal, place: cond.place, money: cond.money };
    pushHistory(q);
    navigateHash("/result", q);

    // ✅ 生成した瞬間に結果更新（hashchangeが来ない環境でも）
    setRegenTick((t) => t + 1);
  }, [mode, cond, pushHistory]);

  const handleReset = useCallback(() => {
    setCond({ time: DEFAULTS.time, goal: DEFAULTS.goal, place: DEFAULTS.place, money: DEFAULTS.money });
    setMode(DEFAULTS.mode);
    setTab("conditions");
    navigateHash("/", {
      mode: DEFAULTS.mode,
      time: DEFAULTS.time,
      goal: DEFAULTS.goal,
      place: DEFAULTS.place,
      money: DEFAULTS.money,
    });
  }, []);

  const handleGateDone = useCallback(() => {
    safeSetAny(LS.gateDay, todayKey());
    setGateOpen(false);
  }, []);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    writeLS(LS.history, []);
  }, []);

  const handlePickHistory = useCallback((h) => {
    const nextMode = h.mode || DEFAULTS.mode;
    const nextCond = {
      time: String(h.time || DEFAULTS.time),
      goal: String(h.goal || DEFAULTS.goal),
      place: String(h.place || DEFAULTS.place),
      money: String(h.money || DEFAULTS.money),
    };
    setMode(nextMode);
    setCond(nextCond);
    setTab("conditions");
    navigateHash("/", { mode: nextMode, ...nextCond });
  }, []);

  const handleAddFav = useCallback(() => {
    const key = favKey;
    const prev = favsRef.current || [];
    if (prev.some((f) => f.key === key)) return;

    const item = { key, mode, ...cond, at: Date.now() };
    const next = [item, ...prev].slice(0, 80);
    setFavs(next);
    writeLS(LS.favs, next);
  }, [favKey, mode, cond]);

  const handleRemoveFav = useCallback((index) => {
    const prev = favsRef.current || [];
    const next = prev.filter((_, i) => i !== index);
    setFavs(next);
    writeLS(LS.favs, next);
  }, []);

  const handleUseFav = useCallback((f) => {
    const nextMode = f.mode || DEFAULTS.mode;
    const nextCond = {
      time: String(f.time || DEFAULTS.time),
      goal: String(f.goal || DEFAULTS.goal),
      place: String(f.place || DEFAULTS.place),
      money: String(f.money || DEFAULTS.money),
    };
    setMode(nextMode);
    setCond(nextCond);
    setTab("conditions");
    navigateHash("/", { mode: nextMode, ...nextCond });
  }, []);

  const handleBack = useCallback(() => {
    navigateHash("/", { mode, time: cond.time, goal: cond.goal, place: cond.place, money: cond.money });
  }, [mode, cond]);

  const handleRegenerate = useCallback(() => {
    // ✅ URLが同じでも必ず結果が変わる
    setRegenTick((t) => t + 1);
  }, []);

  // ✅ Mode変更したらURLにも反映（結果ページでも維持）
  const changeMode = useCallback(
    (nextMode) => {
      setMode(nextMode);
      const q = { mode: nextMode, time: cond.time, goal: cond.goal, place: cond.place, money: cond.money };
      navigateHash(path === "/result" ? "/result" : "/", q);

      // ✅ mode切替でも結果が新しくなる（「押した感」保証）
      setRegenTick((t) => t + 1);
    },
    [path, cond]
  );

  return (
    <div className="appShell">
      <GateOverlay isOpen={gateOpen} onDone={handleGateDone} />

      <main className="mainCol">
        {path === "/result" ? (
          <ResultPage
            mode={mode}
            onChangeMode={changeMode}
            cond={cond}
            results={results}
            onBack={handleBack}
            onRegenerate={handleRegenerate}
            onAddFav={handleAddFav}
            isFav={isFav}
          />
        ) : (
          <SelectPage
            mode={mode}
            setMode={changeMode}
            cond={cond}
            setCond={setCond}
            tab={tab}
            setTab={setTab}
            fitScore={fitScore}
            history={history}
            favs={favs}
            onGenerate={handleGenerate}
            onReset={handleReset}
            onPickHistory={handlePickHistory}
            onClearHistory={handleClearHistory}
            onUseFav={handleUseFav}
            onRemoveFav={handleRemoveFav}
          />
        )}
      </main>

      {/* ✅ 右側（or 画面狭いと下） */}
      <SideGame />
    </div>
  );
}
