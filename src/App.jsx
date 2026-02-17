// src/App.jsx（このファイルを“まるごと”置き換えてコピペ）
//
// ✅ Gate（開くたびに必ず表示）
// ✅ hash routing（#/ / #/result?...）
// ✅ URL共有（mode/time/goal/place/moneyのみ）
// ✅ actions.json 耐性（型チェック/欠損耐性/上限）
// ✅ フリーズ耐性（steps/title上限）
// ✅ steps内の title 重複除去（表示用）
// ✅ 履歴（直近10件） localStorage
// ✅ お気に入り（localStorage）
// ✅ お気に入り欄から解除（★ボタン）

import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import RAW_ACTIONS from "./actions.json";

/** =========================
 * 設定
 * ========================= */
const __DEV__ =
  typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.DEV : false;

const URL_ALLOWED_KEYS = new Set(["mode", "time", "goal", "place", "money"]);

const LIMITS = {
  titleMax: 80,
  stepMaxCount: 10,
  stepMaxLen: 120,
  noteMax: 220,
  actionsMax: 5000,
};

const LS_KEYS = {
  favs: "dr:v1:favs",
  history: "dr:v1:history",
};

const HISTORY_MAX = 10;
const FAVS_MAX = 200;

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

/** =========================
 * utils
 * ========================= */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeStr(x, maxLen = 120) {
  const s = typeof x === "string" ? x : x == null ? "" : String(x);
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen - 1) + "…" : trimmed;
}

function safeArray(x, maxCount = 50) {
  if (!Array.isArray(x)) return [];
  return x.slice(0, maxCount);
}

function normalizeForCompare(s) {
  return safeStr(s, 500).replace(/\s+/g, "").toLowerCase();
}

function validOption(options, key, value) {
  const list = options?.[key];
  if (!Array.isArray(list)) return false;
  return list.some((o) => o.value === value);
}

function labelFor(options, key, value) {
  const list = options?.[key];
  if (!Array.isArray(list)) return value;
  return list.find((o) => o.value === value)?.label ?? value;
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

/** =========================
 * localStorage（安全読み書き）
 * ========================= */
function lsReadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function lsWriteJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / private mode etc.
  }
}

/** =========================
 * Hash router
 * ========================= */
function getHashString() {
  return window.location.hash || "#/";
}

function parseHashString(hashString) {
  const raw = hashString || "#/";
  const withoutHash = raw.startsWith("#") ? raw.slice(1) : raw;
  const [pathPart, queryPart = ""] = withoutHash.split("?");
  const path = pathPart || "/";
  const sp = new URLSearchParams(queryPart);

  for (const key of Array.from(sp.keys())) {
    if (!URL_ALLOWED_KEYS.has(key)) sp.delete(key);
  }
  return { path, sp };
}

function normalizePlaceFromUrl(place, mode) {
  if (place === "campus") return mode === "student" ? "school" : "outside";
  return place;
}

function readModeFromSP(sp) {
  const m = sp.get("mode");
  return m === "general" ? "general" : "student";
}

function readSelFromSP(sp, mode) {
  const options = OPTIONS_BY_MODE[mode] ?? OPTIONS_BY_MODE.student;
  const defaults = DEFAULTS_BY_MODE[mode] ?? DEFAULTS_BY_MODE.student;

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

function buildHashString(path, mode, sel) {
  const sp = new URLSearchParams();
  sp.set("mode", mode);
  if (sel) {
    sp.set("time", sel.time);
    sp.set("goal", sel.goal);
    sp.set("place", sel.place);
    sp.set("money", sel.money);
  }
  for (const k of Array.from(sp.keys())) {
    if (!URL_ALLOWED_KEYS.has(k)) sp.delete(k);
  }
  const q = sp.toString();
  return q ? `#${path}?${q}` : `#${path}`;
}

/** =========================
 * Action normalization & matching
 * ========================= */
function normalizePlaceForMatch(value, mode) {
  if (value === "campus") return mode === "student" ? "school" : "outside";
  return value;
}

function inMode(action, mode) {
  const modes = safeArray(action?.modes, 10).map((m) => safeStr(m, 20));
  if (modes.length === 0) return true;
  return modes.includes(mode);
}

function dedupeStepsWithTitle(title, steps) {
  const t0 = normalizeForCompare(title);
  const arr = Array.isArray(steps) ? steps : [];
  if (!arr.length) return [];
  return arr.filter((st) => normalizeForCompare(st) !== t0);
}

function normalizeAction(raw, fallbackId) {
  const id = safeStr(raw?.id ?? fallbackId, 60);
  const title = safeStr(raw?.title ?? "（無題）", LIMITS.titleMax);

  const rawSteps = Array.isArray(raw?.steps) ? raw.steps : [];
  const steps = rawSteps
    .map((s) => safeStr(s, LIMITS.stepMaxLen))
    .filter((s) => s.length > 0)
    .slice(0, LIMITS.stepMaxCount);

  const note = raw?.note ? safeStr(raw.note, LIMITS.noteMax) : "";

  const tags = raw?.tags && typeof raw.tags === "object" ? raw.tags : {};
  const safeTags = {};
  for (const k of KEYS) {
    safeTags[k] = safeArray(tags?.[k], 20).map((t) => safeStr(t, 30));
  }

  const modes = safeArray(raw?.modes, 10).map((m) => safeStr(m, 20));
  return { ...raw, id, title, steps, note, tags: safeTags, modes };
}

function actionHasTag(action, key, value, mode) {
  const tags = action?.tags?.[key] ?? [];
  if (!Array.isArray(tags)) return false;

  if (key !== "place") return tags.includes(value);

  const normalizedTags = tags.map((t) => normalizePlaceForMatch(t, mode));
  const normalizedValue = normalizePlaceForMatch(value, mode);
  return normalizedTags.includes(normalizedValue);
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
  if (action?.tags?.time?.length) m += 3;
  if (action?.tags?.goal?.length) m += 4;
  if (action?.tags?.place?.length) m += 3;
  if (action?.tags?.money?.length) m += 3;
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

/** =========================
 * インデックス
 * ========================= */
function buildIndex(actions, mode) {
  const idx = {
    byKey: {
      time: new Map(),
      goal: new Map(),
      place: new Map(),
      money: new Map(),
    },
    list: [],
  };

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (!inMode(a, mode)) continue;
    idx.list.push(a);

    for (const k of KEYS) {
      const values = a?.tags?.[k] ?? [];
      for (const v0 of values) {
        const v = k === "place" ? normalizePlaceForMatch(v0, mode) : v0;
        if (!idx.byKey[k].has(v)) idx.byKey[k].set(v, new Set());
        idx.byKey[k].get(v).add(a.id);
      }
    }
  }
  return idx;
}

function intersectSets(sets) {
  const filtered = sets.filter(Boolean).sort((a, b) => a.size - b.size);
  if (filtered.length === 0) return new Set();
  let res = new Set(filtered[0]);
  for (let i = 1; i < filtered.length; i++) {
    const next = filtered[i];
    res = new Set([...res].filter((x) => next.has(x)));
    if (res.size === 0) break;
  }
  return res;
}

function pick3ActionsIndexed(actionsById, index, sel, mode) {
  const strictSet = intersectSets([
    index.byKey.time.get(sel.time),
    index.byKey.goal.get(sel.goal),
    index.byKey.place.get(normalizePlaceForMatch(sel.place, mode)),
    index.byKey.money.get(sel.money),
  ]);

  const strictActions = [...strictSet]
    .map((id) => actionsById.get(id))
    .filter(Boolean);

  const pickedStrict = pickNRandomUnique(strictActions, 3).map((a) => ({
    ...a,
    _mode: "strict",
    _score: scoreAction(a, sel, mode),
  }));

  if (pickedStrict.length === 3) return pickedStrict;

  const union = new Set();
  const pushAll = (s) => s && [...s].forEach((x) => union.add(x));
  pushAll(index.byKey.time.get(sel.time));
  pushAll(index.byKey.goal.get(sel.goal));
  pushAll(index.byKey.place.get(normalizePlaceForMatch(sel.place, mode)));
  pushAll(index.byKey.money.get(sel.money));

  const poolIds = union.size ? [...union] : index.list.map((a) => a.id);

  const scored = poolIds
    .map((id) => actionsById.get(id))
    .filter(Boolean)
    .filter((a) => !pickedStrict.some((p) => p.id === a.id))
    .map((a) => ({ ...a, _score: scoreAction(a, sel, mode) }))
    .sort((a, b) => b._score - a._score);

  const top = scored[0]?._score ?? 0;
  const band = scored.filter((a) => a._score >= top - 2);
  const pool = band.length ? band : scored;

  const fill = pickNRandomUnique(pool, 3 - pickedStrict.length).map((a) => ({
    ...a,
    _mode: "fallback",
    _score: a._score ?? scoreAction(a, sel, mode),
  }));

  return [...pickedStrict, ...fill];
}

function maxPossiblePercentFast(index, actionsById, sel, mode) {
  const strictSet = intersectSets([
    index.byKey.time.get(sel.time),
    index.byKey.goal.get(sel.goal),
    index.byKey.place.get(normalizePlaceForMatch(sel.place, mode)),
    index.byKey.money.get(sel.money),
  ]);
  if (strictSet.size > 0) return 100;

  const union = new Set();
  const pushAll = (s) => s && [...s].forEach((x) => union.add(x));
  pushAll(index.byKey.time.get(sel.time));
  pushAll(index.byKey.goal.get(sel.goal));
  pushAll(index.byKey.place.get(normalizePlaceForMatch(sel.place, mode)));
  pushAll(index.byKey.money.get(sel.money));

  const poolIds = union.size ? [...union] : index.list.map((a) => a.id);

  let best = 0;
  for (const id of poolIds) {
    const a = actionsById.get(id);
    if (!a) continue;
    const raw = scoreAction(a, sel, mode);
    const max = maxScoreForAction(a);
    const pct = Math.round((raw / max) * 100);
    if (pct > best) best = pct;
    if (best === 100) break;
  }
  return clamp(best, 0, 100);
}

/** =========================
 * favs / history
 * ========================= */
function loadFavs() {
  const data = lsReadJSON(LS_KEYS.favs, []);
  if (!Array.isArray(data)) return [];
  return data.filter((x) => x && typeof x.id === "string").slice(0, FAVS_MAX);
}

function saveFavs(favs) {
  lsWriteJSON(LS_KEYS.favs, favs.slice(0, FAVS_MAX));
}

function loadHistory() {
  const data = lsReadJSON(LS_KEYS.history, []);
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (x) =>
        x &&
        typeof x.id === "string" &&
        typeof x.mode === "string" &&
        x.sel &&
        Array.isArray(x.actionIds)
    )
    .slice(0, HISTORY_MAX);
}

function saveHistory(history) {
  lsWriteJSON(LS_KEYS.history, history.slice(0, HISTORY_MAX));
}

function makeHistoryEntry(mode, sel, actions) {
  const actionIds = actions.map((a) => a.id).filter(Boolean);
  const createdAt = nowIso();
  const id = `h_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
  return { id, mode, sel, actionIds, createdAt };
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

function SubTabs({ tab, setTab }) {
  return (
    <div className="subTabs">
      <button
        type="button"
        className={`subTab ${tab === "main" ? "active" : ""}`}
        onClick={() => setTab("main")}
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
        className={`subTab ${tab === "favs" ? "active" : ""}`}
        onClick={() => setTab("favs")}
      >
        お気に入り
      </button>
    </div>
  );
}

// Gate固定行動：10歩歩く
const FIXED_GATE_ACTION = {
  id: "gate_fixed_10steps",
  title: "10歩歩く",
  steps: ["立つ", "部屋の中で10歩だけ歩く", "席に戻る"],
  note: "行動あるのみ！！",
};

function Gate({ action, checked, onToggle, onProceed }) {
  return (
    <div className="gateOverlay">
      <div className="gateCard">
        <div className="gateHeader">
          <div className="hgroup">
            <h1 className="title" style={{ marginBottom: 6 }}>
              まずはやってみよう ✅
            </h1>
            <p className="subtitle" style={{ margin: 0 }}>
              終わったらチェックして次へ👇
            </p>
          </div>
        </div>

        <div className="divider" />

        <div className="gateBody">
          <p style={{ marginTop: 0 }}>
            <b>{action?.title ?? "（行動が見つからない）"}</b>
          </p>

          <ol className="routeSteps" style={{ marginTop: 8 }}>
            {(action?.steps?.length ? action.steps : []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>

          {action?.note ? <p className="gateNote">メモ: {action.note}</p> : null}

          <div className="divider" style={{ margin: "16px 0" }} />

          <div className="gateHint">
            <b>安心ポイント</b>
            <div style={{ marginTop: 6 }}>
              このアプリは入力フォームやアカウント機能がなく、外部への送信を前提にしていません。
              URL共有も条件のみを扱う設計です。
            </div>
          </div>

          <div className="divider" style={{ margin: "16px 0" }} />

          <label className="gateCheckRow">
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

          <p className="gateFootnote">※ URLを開き直すたびに表示</p>
        </div>
      </div>
    </div>
  );
}

/** =========================
 * Pages
 * ========================= */
function SelectPage({
  mode,
  setMode,
  options,
  sel,
  setKey,
  onReset,
  onGenerate,
  pills,
  fitScore,
  tab,
  setTab,
  history,
  favActions,
  onOpenHistory,
  onUnfavFromList,
}) {
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
        </div>

        <div className="divider" />

        {tab === "main" ? (
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
              <p
                className="muted"
                style={{ margin: 0, fontSize: 12, lineHeight: 1.4, textAlign: "center" }}
              >
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
        ) : tab === "history" ? (
          <div className="panel resultsPanel">
            <h2 className="panelTitle">履歴（直近{HISTORY_MAX}件）</h2>
            {history.length === 0 ? (
              <p style={{ opacity: 0.75, marginTop: 0 }}>まだ履歴がありません。</p>
            ) : (
              <div className="historyList">
                {history.map((h) => (
                  <div key={h.id} className="historyCard">
                    <div className="historyTop">
                      <div style={{ fontWeight: 800 }}>
                        {h.createdAt ? h.createdAt.replace("T", " ").slice(0, 16) : "—"}
                      </div>
                      <button className="btn" type="button" onClick={() => onOpenHistory(h)}>
                        開く →
                      </button>
                    </div>
                    <div style={{ opacity: 0.8, fontSize: 13 }}>
                      mode: <b>{h.mode}</b> / time:<b>{h.sel?.time}</b> goal:<b>{h.sel?.goal}</b>{" "}
                      place:<b>{h.sel?.place}</b> money:<b>{h.sel?.money}</b>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="panel resultsPanel">
            <h2 className="panelTitle">お気に入り（{favActions.length}件）</h2>
            {favActions.length === 0 ? (
              <p style={{ opacity: 0.75, marginTop: 0 }}>まだお気に入りがありません。</p>
            ) : (
              <div className="favList">
                {favActions.map((a) => (
                  <div key={a.id} className="resultCard">
                    <div className="resultTopRow">
                      <p className="routeTitle" style={{ margin: 0 }}>
                        ⭐ <span style={{ opacity: 0.9 }}>{a.title}</span>
                      </p>

                      <button
                        type="button"
                        className="starBtn on"
                        onClick={() => onUnfavFromList(a.id)}
                        title="お気に入り解除"
                      >
                        ★
                      </button>
                    </div>

                    {a.steps?.length ? (
                      <ol className="routeSteps">
                        {dedupeStepsWithTitle(a.title, a.steps).map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultPage({
  mode,
  setMode,
  options,
  sel,
  actions,
  onBack,
  onReroll,
  isFav,
  toggleFav,
}) {
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
            <div className="pill">
              ⏱️ <b>{labelFor(options, "time", sel.time)}</b>
            </div>
            <div className="pill">
              🎯 <b>{labelFor(options, "goal", sel.goal)}</b>
            </div>
            <div className="pill">
              📍 <b>{labelFor(options, "place", sel.place)}</b>
            </div>
            <div className="pill">
              💸 <b>{labelFor(options, "money", sel.money)}</b>
            </div>
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
          {actions.map((a, idx) => {
            const steps = dedupeStepsWithTitle(a.title, a.steps);
            const fav = isFav(a.id);

            return (
              <React.Fragment key={a.id}>
                <div className="resultCard">
                  <div className="resultTopRow">
                    <p className="routeTitle" style={{ margin: 0 }}>
                      {idx === 0 ? "行動A（おすすめ）" : idx === 1 ? "行動B" : "行動C"}{" "}
                      <span style={{ opacity: 0.8, fontWeight: 400 }}>· {a.title}</span>
                    </p>

                    <button
                      type="button"
                      className={`starBtn ${fav ? "on" : ""}`}
                      onClick={() => toggleFav(a.id)}
                      title={fav ? "お気に入り解除" : "お気に入り"}
                    >
                      {fav ? "★" : "☆"}
                    </button>
                  </div>

                  {steps.length > 0 ? (
                    <ol className="routeSteps">
                      {steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  ) : null}

                  <div className="smallNote">
                    <span style={{ opacity: 0.75 }}>
                      一致: {a._mode === "strict" ? "厳密" : a._mode === "history" ? "履歴" : "近い候補から救済"} /
                      スコア {a._score ?? 0}
                    </span>
                  </div>
                </div>

                {idx < actions.length - 1 ? <div className="divider" /> : null}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** =========================
 * App
 * ========================= */
export default function App() {
  // actions を安全化
  const ACTIONS = useMemo(() => {
    const arr = Array.isArray(RAW_ACTIONS) ? RAW_ACTIONS : [];
    const sliced = arr.slice(0, LIMITS.actionsMax);
    return sliced.map((a, i) => normalizeAction(a, `a_${i}`));
  }, []);

  const actionsById = useMemo(() => {
    const m = new Map();
    for (const a of ACTIONS) m.set(a.id, a);
    return m;
  }, [ACTIONS]);

  // hash router
  const [hashStr, setHashStr] = useState(() => getHashString());

  useEffect(() => {
    const onHash = () => {
      const next = getHashString();
      setHashStr((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const route = useMemo(() => parseHashString(hashStr), [hashStr]);
  const path = route.path;
  const sp = route.sp;

  // mode + selection
  const [mode, setMode] = useState(() => readModeFromSP(sp));
  const options = useMemo(() => OPTIONS_BY_MODE[mode] ?? OPTIONS_BY_MODE.student, [mode]);
  const [sel, setSel] = useState(() => readSelFromSP(sp, mode));

  // URL→state 追従
  useEffect(() => {
    const nextMode = readModeFromSP(sp);
    const nextSel = readSelFromSP(sp, nextMode);
    setMode(nextMode);
    setSel(nextSel);
  }, [path, sp.toString()]);

  // index
  const index = useMemo(() => buildIndex(ACTIONS, mode), [ACTIONS, mode]);

  // 生成結果
  const [generatedActions, setGeneratedActions] = useState(() =>
    pick3ActionsIndexed(actionsById, index, sel, mode)
  );

  // 履歴 / お気に入り
  const [history, setHistory] = useState(() => loadHistory());
  const [favs, setFavs] = useState(() => loadFavs()); // [{id, createdAt}]

  const favIdSet = useMemo(() => new Set(favs.map((f) => f.id)), [favs]);
  const isFav = (id) => favIdSet.has(id);

  const toggleFav = (id) => {
    setFavs((prev) => {
      const exists = prev.some((f) => f.id === id);
      const next = exists
        ? prev.filter((f) => f.id !== id)
        : [{ id, createdAt: nowIso() }, ...prev];

      const clipped = next.slice(0, FAVS_MAX);
      saveFavs(clipped);
      return clipped;
    });
  };

  const onUnfavFromList = (id) => toggleFav(id);

  const favActions = useMemo(() => {
    return favs.map((f) => actionsById.get(f.id)).filter(Boolean);
  }, [favs, actionsById]);

  // ✅ Gate（開き直しで必ず出す）
  const [gateOpen, setGateOpen] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);

  useEffect(() => {
    const openGate = () => {
      setGateOpen(true);
      setGateChecked(false);
    };

    openGate();

    const onPageShow = () => openGate();
    const onVisibility = () => {
      if (document.visibilityState === "visible") openGate();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const proceedGate = () => {
    setGateOpen(false);
    setGateChecked(false);
  };

  // 開発ログ
  useEffect(() => {
    if (!__DEV__) return;
    console.log("✅ App loaded");
    console.log("ACTIONS length =", ACTIONS.length);
  }, [ACTIONS.length]);

  // Select側タブ
  const [tab, setTab] = useState("main"); // main | history | favs

  const pills = useMemo(
    () => ({
      time: labelFor(options, "time", sel.time),
      goal: labelFor(options, "goal", sel.goal),
      place: labelFor(options, "place", sel.place),
      money: labelFor(options, "money", sel.money),
    }),
    [options, sel]
  );

  const fitScore = useMemo(
    () => maxPossiblePercentFast(index, actionsById, sel, mode),
    [index, actionsById, sel, mode]
  );

  // 遷移
  const go = (nextPath, nextMode, nextSel) => {
    const nextHash = buildHashString(nextPath, nextMode, nextSel);
    if (getHashString() === nextHash) return;
    window.location.hash = nextHash;
    setHashStr((prev) => (prev === nextHash ? prev : nextHash));
  };

  // モード切替
  const changeMode = (nextMode) => {
    const nextOptions = OPTIONS_BY_MODE[nextMode] ?? OPTIONS_BY_MODE.student;
    const nextDefaults = DEFAULTS_BY_MODE[nextMode] ?? DEFAULTS_BY_MODE.student;

    const nextSel = {
      ...sel,
      place: validOption(nextOptions, "place", sel.place)
        ? sel.place
        : nextDefaults.place,
    };

    setMode(nextMode);
    setSel(nextSel);
    go(path || "/", nextMode, nextSel);

    if ((path || "/") === "/result") {
      const nextIndex = buildIndex(ACTIONS, nextMode);
      setGeneratedActions(
        pick3ActionsIndexed(actionsById, nextIndex, nextSel, nextMode)
      );
    }
  };

  // チップ更新
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

  // 生成（履歴保存）
  const onGenerate = () => {
    const picked = pick3ActionsIndexed(actionsById, index, sel, mode);
    setGeneratedActions(picked);

    setHistory((prev) => {
      const entry = makeHistoryEntry(mode, sel, picked);
      const next = [entry, ...prev].slice(0, HISTORY_MAX);
      saveHistory(next);
      return next;
    });

    go("/result", mode, sel);
  };

  const onBack = () => go("/", mode, sel);

  const onReroll = () => {
    const picked = pick3ActionsIndexed(actionsById, index, sel, mode);
    setGeneratedActions(picked);

    setHistory((prev) => {
      const entry = makeHistoryEntry(mode, sel, picked);
      const next = [entry, ...prev].slice(0, HISTORY_MAX);
      saveHistory(next);
      return next;
    });
  };

  const isResult = (path || "/") === "/result";

  const onOpenHistory = (h) => {
    const nextMode = h.mode === "general" ? "general" : "student";
    const nextSel =
      h.sel && typeof h.sel === "object" ? h.sel : DEFAULTS_BY_MODE[nextMode];

    setMode(nextMode);
    setSel(nextSel);

    const restored = (h.actionIds || [])
      .map((id) => actionsById.get(id))
      .filter(Boolean)
      .slice(0, 3)
      .map((a) => ({ ...a, _mode: "history", _score: scoreAction(a, nextSel, nextMode) }));

    const nextIndex = buildIndex(ACTIONS, nextMode);
    const fill =
      restored.length === 3
        ? restored
        : [
            ...restored,
            ...pick3ActionsIndexed(actionsById, nextIndex, nextSel, nextMode).filter(
              (a) => !restored.some((r) => r.id === a.id)
            ),
          ].slice(0, 3);

    setGeneratedActions(fill);
    setTab("main");
    go("/result", nextMode, nextSel);
  };

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
          isFav={isFav}
          toggleFav={toggleFav}
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
          tab={tab}
          setTab={setTab}
          history={history}
          favActions={favActions}
          onOpenHistory={onOpenHistory}
          onUnfavFromList={onUnfavFromList}
        />
      )}
    </>
  );
}
