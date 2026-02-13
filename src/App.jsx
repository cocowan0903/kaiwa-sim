import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

/**
 * ✅ 条件:
 *  - 所要時間 time
 *  - 場所 place
 *  - 体力 energy
 *  - 目的 goal
 *  - お金 money
 *
 * ✅ 仕様:
 *  - 条件を設定 → 「条件に合うルート」からランダムで1本生成
 *  - もし厳密一致が0件なら、近い（スコア上位）候補帯からランダム抽選
 *  - URLクエリに条件を反映（共有可能）
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
  energy: [
    { value: "low", label: "低" },
    { value: "mid", label: "普通" },
    { value: "high", label: "高" },
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
  energy: "low",
  money: "0",
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function labelFor(key, value) {
  return OPTIONS[key].find((o) => o.value === value)?.label ?? value;
}

function readQuery() {
  const sp = new URLSearchParams(window.location.search);
  const time = sp.get("time") ?? DEFAULTS.time;
  const goal = sp.get("goal") ?? DEFAULTS.goal;
  const place = sp.get("place") ?? DEFAULTS.place;
  const energy = sp.get("energy") ?? DEFAULTS.energy;
  const money = sp.get("money") ?? DEFAULTS.money;

  const valid = (key, value) => OPTIONS[key].some((o) => o.value === value);

  return {
    time: valid("time", time) ? time : DEFAULTS.time,
    goal: valid("goal", goal) ? goal : DEFAULTS.goal,
    place: valid("place", place) ? place : DEFAULTS.place,
    energy: valid("energy", energy) ? energy : DEFAULTS.energy,
    money: valid("money", money) ? money : DEFAULTS.money,
  };
}

function writeQuery(state) {
  const sp = new URLSearchParams();
  sp.set("time", state.time);
  sp.set("goal", state.goal);
  sp.set("place", state.place);
  sp.set("energy", state.energy);
  sp.set("money", state.money);
  const next = `${window.location.pathname}?${sp.toString()}`;
  window.history.replaceState({}, "", next);
}

// ルート定義（必要なら増やしてOK）
const ROUTES = [
  {
    id: "reset-desk",
    title: "机の上だけ整えるルート",
    steps: [
      "机の上を“1区画だけ”片付ける（5分）",
      "水を飲む・窓を開ける（2分）",
      "小タスクを1つだけ終わらせる（10〜20分）",
    ],
    tags: {
      time: ["10", "30"],
      goal: ["life", "recover"],
      place: ["home", "campus"],
      energy: ["low", "mid"],
      money: ["0", "low", "mid", "high"],
    },
    reason: "開始の摩擦を削って、体力が低い日でも勝てる。",
  },
  {
    id: "micro-walk",
    title: "外気リセットルート",
    steps: [
      "外の空気を吸う（3分）",
      "ゆっくり歩く（7〜15分）",
      "戻ったら“次の一手”だけ決める（2分）",
    ],
    tags: {
      time: ["10", "30", "60"],
      goal: ["recover", "life"],
      place: ["outside"],
      energy: ["low", "mid"],
      money: ["0", "low", "mid", "high"],
    },
    reason: "頭を殴るより環境を変える方が早い日がある。",
  },
  {
    id: "deep-focus",
    title: "一点突破ルート",
    steps: [
      "今日やることを“3つ”に削る（3分）",
      "一番重いのを10分だけ着手（10分）",
      "やめどきにメモ（2分）",
    ],
    tags: {
      time: ["30", "60"],
      goal: ["growth"],
      place: ["home", "campus", "online"],
      energy: ["mid", "high"],
      money: ["0", "low", "mid", "high"],
    },
    reason: "完遂じゃなく着火。火種ができれば勝ち。",
  },
  {
    id: "admin-life",
    title: "生活メンテルート",
    steps: [
      "洗濯/ゴミ/支払い等を1つだけ片付ける（10分）",
      "明日の障害を1つ消す（5分）",
      "軽いご褒美（5分）",
    ],
    tags: {
      time: ["10", "30", "60"],
      goal: ["life"],
      place: ["home"],
      energy: ["low", "mid"],
      money: ["0", "low", "mid", "high"],
    },
    reason: "未来の自分の足元を固めると気持ちが静かになる。",
  },
  {
    id: "campus-boost",
    title: "大学ブーストルート",
    steps: [
      "席を確保して机上環境を作る（3分）",
      "教材を開いて“例題1つ”だけ（15〜25分）",
      "次回の開始点を付箋/メモ（2分）",
    ],
    tags: {
      time: ["30", "60"],
      goal: ["growth", "life"],
      place: ["campus"],
      energy: ["mid", "high"],
      money: ["0", "low", "mid", "high"],
    },
    reason: "場所の力で集中コストを下げる。",
  },
  {
    id: "online-clean",
    title: "デジタル掃除ルート",
    steps: [
      "タブを10個閉じる（3分）",
      "フォルダ/メモを1つだけ整理（7分）",
      "次に見るものを1つだけ残す（1分）",
    ],
    tags: {
      time: ["10", "30"],
      goal: ["life", "recover"],
      place: ["online", "home"],
      energy: ["low", "mid"],
      money: ["0", "low", "mid", "high"],
    },
    reason: "視界が散ってる日は、画面を掃くと脳も静かになる。",
  },
  {
    id: "fun-snack",
    title: "軽い遊びルート",
    steps: [
      "短い動画/音楽を1本だけ（5分）",
      "小さな創作を1つ（10〜20分）",
      "共有/保存して終わる（2分）",
    ],
    tags: {
      time: ["10", "30", "60"],
      goal: ["fun", "recover"],
      place: ["home", "online"],
      energy: ["low", "mid"],
      money: ["0", "low", "mid", "high"],
    },
    reason: "ダラダラじゃなく“区切りのある遊び”にする。",
  },
  {
    id: "halfday-quest",
    title: "半日クエストルート",
    steps: [
      "外に出る準備（10分）",
      "用事＋寄り道を1セット（90〜150分）",
      "帰って“成果”を1行記録（3分）",
    ],
    tags: {
      time: ["180"],
      goal: ["fun", "life", "recover"],
      place: ["outside"],
      energy: ["mid", "high"],
      money: ["low", "mid", "high"], // 0円は除外（必要なら入れてOK）
    },
    reason: "半日ある日は、世界を少しだけ動かす。",
  },
];

// ✅ 厳密一致（条件が全部一致する候補だけ）
function matchesAll(route, sel) {
  const keys = ["time", "goal", "place", "energy", "money"];
  return keys.every((k) => route.tags[k]?.includes(sel[k]));
}

// ✅ 近さスコア（厳密一致が0のとき救済で使う）
function scoreRoute(route, sel) {
  let s = 0;
  const hit = (key) => route.tags[key]?.includes(sel[key]);

  if (hit("time")) s += 3;
  if (hit("goal")) s += 4;
  if (hit("place")) s += 3;
  if (hit("energy")) s += 4;
  if (hit("money")) s += 3;

  return s;
}

function maxScoreForRoute(route) {
  let m = 0;
  if (route.tags.time?.length) m += 3;
  if (route.tags.goal?.length) m += 4;
  if (route.tags.place?.length) m += 3;
  if (route.tags.energy?.length) m += 4;
  if (route.tags.money?.length) m += 3;
  return m;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ✅ 1本生成: 厳密一致→ランダム / 0件なら近い候補帯→ランダム
function pickOneRoute(sel) {
  const strict = ROUTES.filter((r) => matchesAll(r, sel));
  if (strict.length > 0) return { ...pickRandom(strict), _mode: "strict" };

  const scored = ROUTES
    .map((r) => ({ ...r, _score: scoreRoute(r, sel) }))
    .sort((a, b) => b._score - a._score);

  const topScore = scored[0]?._score ?? 0;
  const band = scored.filter((r) => r._score >= topScore - 2); // 上位帯（±2点）から抽選
  return { ...pickRandom(band.length ? band : scored), _mode: "fallback" };
}

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

  // ✅ 生成結果（ルート本体をstateに保持して固定表示）
  const [generatedRoute, setGeneratedRoute] = useState(() =>
    pickOneRoute(readQuery())
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
      energy: labelFor("energy", sel.energy),
      money: labelFor("money", sel.money),
    };
  }, [sel]);

  const setKey = (key, value) => {
    setSel((prev) => ({ ...prev, [key]: value }));
    // ステッパーは軽く雰囲気だけ
    setStep((s) => (key === "goal" ? Math.max(s, 2) : 1));
  };

  const onGenerate = () => {
    setGeneratedSel(sel);
    setGeneratedRoute(pickOneRoute(sel));
    setStep(3);
  };

  const onReset = () => {
    setSel(DEFAULTS);
    setGeneratedSel(DEFAULTS);
    setGeneratedRoute(pickOneRoute(DEFAULTS));
    setStep(1);
  };

  const fitScore = useMemo(() => {
    const r = generatedRoute;
    const raw = scoreRoute(r, generatedSel);
    const max = maxScoreForRoute(r);
    return clamp(Math.round((raw / max) * 100), 0, 100);
  }, [generatedRoute, generatedSel]);

  return (
    <div className="wrap">
      <div className="card">
        <div className="header">
          <div className="hgroup">
            <h1 className="title">Decision Router</h1>
            <p className="subtitle">
              所要時間・目的・場所・体力・お金を選ぶだけ。条件に合う行動パターンをランダム生成。
            </p>
          </div>

          <div className="pills">
            <div className="pill">⏱️ <b>{pills.time}</b></div>
            <div className="pill">🎯 <b>{pills.goal}</b></div>
            <div className="pill">📍 <b>{pills.place}</b></div>
            <div className="pill">🔋 <b>{pills.energy}</b></div>
            <div className="pill">💸 <b>{pills.money}</b></div>
            <div className="pill">適合 <b>{fitScore}</b></div>
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

            <p className="kicker">🔋 体力</p>
            <div className="chipRow">
              {OPTIONS.energy.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={sel.energy === o.value}
                  onClick={() => setKey("energy", o.value)}
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
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.4,
                textAlign: "center",
              }}
            >
              ※ URLに条件が反映されます（共有可能）。
              <br />
              <span style={{ opacity: 0.9 }}>
                ?time=30&amp;goal=recover&amp;place=home&amp;energy=low&amp;money=0
              </span>
            </p>
          </div>

          <div className="panel resultsPanel">
            <h2 className="panelTitle">生成された行動パターン（ランダム1本）</h2>

            <div className="resultCard">
              <p className="routeTitle">
                ルート
                {" "}
                <span style={{ opacity: 0.8, fontWeight: 400 }}>
                  · {generatedRoute.title}
                </span>
              </p>

              <ol className="routeSteps">
                {generatedRoute.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>

              <div className="smallNote">
                理由: {generatedRoute.reason}
                {" "}
                <span style={{ opacity: 0.75 }}>
                  （一致: {generatedRoute._mode === "strict" ? "厳密" : "近い候補から救済"} / スコア {scoreRoute(generatedRoute, generatedSel)}）
                </span>
              </div>
            </div>

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
