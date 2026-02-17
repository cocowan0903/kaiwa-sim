import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import RAW_ACTIONS from "./actions.json";

/* =========================
   設定
========================= */

const LIMITS = {
  titleMax: 80,
  stepMaxCount: 10,
  stepMaxLen: 120,
  noteMax: 160,
  actionsMax: 5000,
};

const KEYS = ["time", "goal", "place", "money"];

/* =========================
   utils
========================= */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeStr(x, maxLen = 120) {
  const s = typeof x === "string" ? x : x == null ? "" : String(x);
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen - 1) + "…" : trimmed;
}

function normalizeForCompare(s) {
  return safeStr(s).replace(/\s+/g, "").toLowerCase();
}

/* =========================
   ⭐ 重複除去（完全版）
========================= */

function dedupeStepsWithTitle(title, steps) {
  const t0 = normalizeForCompare(title);
  const arr = Array.isArray(steps) ? steps : [];
  if (!arr.length) return [];
  return arr.filter((st) => normalizeForCompare(st) !== t0);
}

/* =========================
   Action 正規化
========================= */

function normalizeAction(raw, fallbackId) {
  const id = safeStr(raw?.id ?? fallbackId, 60);
  const title = safeStr(raw?.title ?? "（無題）", LIMITS.titleMax);

  // ✅ stepsは空なら空のまま（title補完しない）
  const rawSteps = Array.isArray(raw?.steps) ? raw.steps : [];

  const steps = rawSteps
    .map((s) => safeStr(s, LIMITS.stepMaxLen))
    .filter((s) => s.length > 0)
    .slice(0, LIMITS.stepMaxCount);

  const note = raw?.note ? safeStr(raw.note, LIMITS.noteMax) : "";

  const tags = raw?.tags && typeof raw.tags === "object" ? raw.tags : {};
  const safeTags = {};
  for (const k of KEYS) {
    safeTags[k] = Array.isArray(tags?.[k]) ? tags[k] : [];
  }

  const modes = Array.isArray(raw?.modes) ? raw.modes : [];

  return { ...raw, id, title, steps, note, tags: safeTags, modes };
}

/* =========================
   仮のUI（結果だけ必要部分）
========================= */

function ResultPage({ actions }) {
  return (
    <div className="wrap">
      <div className="card">
        <h1>結果</h1>

        {actions.map((a, idx) => {
          const steps = dedupeStepsWithTitle(a.title, a.steps);

          return (
            <div key={a.id} className="resultCard">
              <p className="routeTitle">
                {idx === 0
                  ? "行動A（おすすめ）"
                  : idx === 1
                  ? "行動B"
                  : "行動C"}{" "}
                · {a.title}
              </p>

              {steps.length > 0 ? (
                <ol className="routeSteps">
                  {steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              ) : null}

              <div className="smallNote">一致: 厳密 / スコア 13</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================
   App
========================= */

export default function App() {
  const ACTIONS = useMemo(() => {
    const arr = Array.isArray(RAW_ACTIONS) ? RAW_ACTIONS : [];
    const sliced = arr.slice(0, LIMITS.actionsMax);
    return sliced.map((a, i) => normalizeAction(a, `a_${i}`));
  }, []);

  // ⭐ サンプルとして先頭3つ表示（あなたの既存ロジックはそのまま使ってOK）
  const actions = ACTIONS.slice(0, 3);

  return <ResultPage actions={actions} />;
}
