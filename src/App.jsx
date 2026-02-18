// src/App.jsx（このファイルを“まるごと”置き換えてコピペ）

import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import RAW_ACTIONS from "./actions.json";
import SideGame from "./SideGame.jsx"; // ある前提（無いならこの行とSideGame表示を消してOK）
import { supabase } from "./supabaseClient.js"; // 既存のやつを使う

/** =========================
 * 設定
 * ========================= */
const URL_ALLOWED_KEYS = new Set(["mode", "time", "goal", "place", "money"]);

const LIMITS = {
  titleMax: 80,
  stepMaxCount: 10,
  stepMaxLen: 120,
  noteMax: 220,
  actionsMax: 5000,
  historyMax: 10,
  rankingMax: 10,
};

const LS_KEYS = {
  history: "dr:v2:history",
  favs: "dr:v2:favs",
  gateLastDate: "dr:v2:gate:lastDate",
};

const SS_KEYS = {
  gateShownThisSession: "dr:v2:gate:shown",
};

const OPTIONS = {
  mode: [
    { value: "general", label: "一般" },
    { value: "student", label: "学生" },
  ],
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
    { value: "uni", label: "大学" },
    { value: "out", label: "外" },
    { value: "online", label: "オンライン" },
  ],
  money: [
    { value: "0", label: "0円" },
    { value: "500", label: "少し（〜500円）" },
    { value: "2000", label: "まあまあ（〜2000円）" },
    { value: "any", label: "気にしない" },
  ],
};

/** =========================
 * Utils
 * ========================= */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampStr(s, max) {
  if (typeof s !== "string") return "";
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function safeArr(v) {
  return Array.isArray(v) ? v : [];
}

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function getHashRoute() {
  // #/result?time=... みたいなのを読む
  const h = window.location.hash || "#/";
  if (h.startsWith("#/result")) return "result";
  return "home";
}

function getHashQuery() {
  const h = window.location.hash || "";
  const qIndex = h.indexOf("?");
  if (qIndex === -1) return {};
  const query = h.slice(qIndex + 1);
  const sp = new URLSearchParams(query);
  const obj = {};
  for (const [k, v] of sp.entries()) obj[k] = v;
  return obj;
}

function buildResultHash(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (!URL_ALLOWED_KEYS.has(k)) return;
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  return `#/result?${sp.toString()}`;
}

function navigateHash(hash) {
  window.location.hash = hash;
}

function pickRandom(list) {
  if (!list.length) return null;
  const i = Math.floor(Math.random() * list.length);
  return list[i];
}

function normalizeActions(raw) {
  const arr = safeArr(raw).slice(0, LIMITS.actionsMax);
  const out = [];

  for (let i = 0; i < arr.length; i++) {
    const a = arr[i] || {};
    const title = clampStr(a.title ?? "", LIMITS.titleMax);
    if (!title) continue;

    const id = a.id ? String(a.id) : `t:${title}`; // id無いactions.jsonでも落ちない
    const tags = typeof a.tags === "object" && a.tags ? a.tags : {};

    // tagsの欠損耐性
    const modes = safeArr(a.modes).map(String); // ["student","general"] とか
    const modeTag = modes.length ? modes : ["general", "student"]; // 未指定は両対応

    const time = tags.time ? String(tags.time) : "";
    const goal = tags.goal ? String(tags.goal) : "";
    const place = tags.place ? String(tags.place) : "";
    const money = tags.money ? String(tags.money) : "";

    const steps = safeArr(a.steps)
      .slice(0, LIMITS.stepMaxCount)
      .map((s) => clampStr(String(s ?? ""), LIMITS.stepMaxLen))
      .filter(Boolean);

    const note = clampStr(a.note ? String(a.note) : "", LIMITS.noteMax);

    out.push({
      id,
      title,
      tags: { time, goal, place, money },
      modes: modeTag,
      steps,
      note,
    });
  }

  return out;
}

function matchAction(a, cond) {
  // mode
  if (!a.modes.includes(cond.mode)) return false;

  // tags (空なら不問)
  const t = a.tags || {};
  if (t.time && t.time !== cond.time) return false;
  if (t.goal && t.goal !== cond.goal) return false;
  if (t.place && t.place !== cond.place) return false;
  if (t.money && t.money !== cond.money) return false;

  return true;
}

/** =========================
 * UI bits
 * ========================= */
function Pill({ active, children, onClick }) {
  return (
    <button
      className={`pill ${active ? "isActive" : ""}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div className="section">
      <div className="sectionTitle">{title}</div>
      {children}
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => getHashRoute());
  const [cond, setCond] = useState(() => {
    const q = getHashQuery();
    return {
      mode: q.mode && (q.mode === "student" || q.mode === "general") ? q.mode : "general",
      time: q.time && ["10", "30", "60", "180"].includes(q.time) ? q.time : "30",
      goal: q.goal && ["recover", "growth", "life", "fun"].includes(q.goal) ? q.goal : "recover",
      place: q.place && ["home", "uni", "out", "online"].includes(q.place) ? q.place : "home",
      money: q.money && ["0", "500", "2000", "any"].includes(q.money) ? q.money : "0",
    };
  });

  const [result, setResult] = useState(null);

  const [history, setHistory] = useState(() => {
    const raw = localStorage.getItem(LS_KEYS.history);
    return safeArr(safeJsonParse(raw, [])).slice(0, LIMITS.historyMax);
  });

  const [favs, setFavs] = useState(() => {
    const raw = localStorage.getItem(LS_KEYS.favs);
    const arr = safeArr(safeJsonParse(raw, []));
    return new Set(arr.map(String));
  });

  const [gateOpen, setGateOpen] = useState(false);

  // Ranking
  const [ranking, setRanking] = useState([]);
  const [rankingErr, setRankingErr] = useState("");

  // ✅ SideGame を安全に止められるスイッチ（青画面止める用）
  const [sideGameEnabled, setSideGameEnabled] = useState(true);

  const ACTIONS = useMemo(() => normalizeActions(RAW_ACTIONS), []);
  const filtered = useMemo(() => ACTIONS.filter((a) => matchAction(a, cond)), [ACTIONS, cond]);

  /** hash routing 監視 */
  useEffect(() => {
    const onHashChange = () => setRoute(getHashRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  /** resultページ入ったらURLから条件復元 + 生成 */
  useEffect(() => {
    if (route !== "result") return;

    const q = getHashQuery();
    const next = { ...cond };
    for (const k of Object.keys(q)) {
      if (!URL_ALLOWED_KEYS.has(k)) continue;
      next[k] = q[k];
    }

    const fixed = {
      mode: next.mode === "student" ? "student" : "general",
      time: ["10", "30", "60", "180"].includes(String(next.time)) ? String(next.time) : "30",
      goal: ["recover", "growth", "life", "fun"].includes(String(next.goal)) ? String(next.goal) : "recover",
      place: ["home", "uni", "out", "online"].includes(String(next.place)) ? String(next.place) : "home",
      money: ["0", "500", "2000", "any"].includes(String(next.money)) ? String(next.money) : "0",
    };

    setCond(fixed);

    const top = history?.[0];
    const same =
      top &&
      top.cond &&
      top.cond.mode === fixed.mode &&
      top.cond.time === fixed.time &&
      top.cond.goal === fixed.goal &&
      top.cond.place === fixed.place &&
      top.cond.money === fixed.money;

    if (same && top.item) {
      setResult(top.item);
      return;
    }

    const list = ACTIONS.filter((a) => matchAction(a, fixed));
    setResult(pickRandom(list));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  /** Gate判定（URL開いた時だけ + 1日1回） */
  useEffect(() => {
    if (sessionStorage.getItem(SS_KEYS.gateShownThisSession) === "1") return;

    const last = localStorage.getItem(LS_KEYS.gateLastDate) || "";
    const today = todayKey();
    if (last === today) return;

    setGateOpen(true);
    sessionStorage.setItem(SS_KEYS.gateShownThisSession, "1");
  }, []);

  /** localStorage 同期 */
  useEffect(() => {
    localStorage.setItem(LS_KEYS.history, JSON.stringify(history.slice(0, LIMITS.historyMax)));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.favs, JSON.stringify(Array.from(favs)));
  }, [favs]);

  /** ✅ Ranking 読み込み（Supabase nullでも落ちない） */
  useEffect(() => {
    let alive = true;

    async function loadRanking() {
      setRankingErr("");

      // ✅ supabase が無いなら落とさずに空表示
      if (!supabase) {
        setRanking([]);
        setRankingErr("Supabase未接続（.env未設定 or キー未読み込み）");
        return;
      }

      try {
        const { data, error } = await supabase
          .from("best_scores")
          .select("user_id, mode, best_score, updated_at")
          .eq("mode", cond.mode)
          .order("best_score", { ascending: false })
          .limit(LIMITS.rankingMax);

        if (!alive) return;

        if (error) {
          setRankingErr(error.message || "ランキング取得エラー");
          setRanking([]);
          return;
        }
        setRanking(safeArr(data));
      } catch {
        if (!alive) return;
        setRankingErr("ランキング取得で例外が出ました");
        setRanking([]);
      }
    }

    loadRanking();
    return () => {
      alive = false;
    };
  }, [cond.mode]);

  /** actions生成 */
  function handleGenerate() {
    const item = pickRandom(filtered);
    setResult(item);

    navigateHash(
      buildResultHash({
        mode: cond.mode,
        time: cond.time,
        goal: cond.goal,
        place: cond.place,
        money: cond.money,
      })
    );

    if (item) {
      const entry = {
        at: Date.now(),
        cond: { ...cond },
        item: { id: item.id, title: item.title, note: item.note, steps: item.steps },
      };
      setHistory((prev) => [entry, ...safeArr(prev)].slice(0, LIMITS.historyMax));
    }
  }

  function toggleFav(id) {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetCond() {
    setCond({ mode: "general", time: "30", goal: "recover", place: "home", money: "0" });
  }

  function completeGate() {
    localStorage.setItem(LS_KEYS.gateLastDate, todayKey());
    setGateOpen(false);
  }

  function rerollOnResult() {
    const list = ACTIONS.filter((a) => matchAction(a, cond));
    const item = pickRandom(list);
    setResult(item);

    if (item) {
      const entry = {
        at: Date.now(),
        cond: { ...cond },
        item: { id: item.id, title: item.title, note: item.note, steps: item.steps },
      };
      setHistory((prev) => [entry, ...safeArr(prev)].slice(0, LIMITS.historyMax));
    }
  }

  const favList = useMemo(() => {
    const set = favs;
    const list = ACTIONS.filter((a) => set.has(a.id));
    return list;
  }, [ACTIONS, favs]);

  return (
    <div className="appShell">
      {gateOpen && (
        <div className="gateOverlay">
          <div className="gateCard">
            <div className="gateTitle">🧩 今の行動（1日1回）</div>
            <div className="gateText">
              10歩歩く。もしくは、画面の前で肩を1回まわす。
              <br />
              <span className="muted">できたら「完了」で先へ。</span>
            </div>
            <div className="gateBtns">
              <button className="btn" onClick={completeGate} type="button">
                ✅ 完了
              </button>
              <button className="btn ghost" onClick={() => setGateOpen(false)} type="button">
                あとで
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="topbar">
        <div className="brand" onClick={() => navigateHash("#/")} role="button" tabIndex={0}>
          Decision Router
          <span className="badge">{cond.mode === "student" ? "student" : "general"}</span>
        </div>

        <div className="topActions">
          {route === "result" ? (
            <button className="btn ghost" onClick={() => navigateHash("#/")} type="button">
              条件を選ぶ
            </button>
          ) : (
            <button className="btn ghost" onClick={() => setGateOpen(true)} type="button">
              Gate
            </button>
          )}
        </div>
      </header>

      <div className="layout">
        <main className="main">
          {route === "home" && (
            <div className="card">
              <div className="cardTitle">条件を選ぶ</div>

              <Section title="モード">
                <div className="pillRow">
                  {OPTIONS.mode.map((o) => (
                    <Pill
                      key={o.value}
                      active={cond.mode === o.value}
                      onClick={() => setCond((p) => ({ ...p, mode: o.value }))}
                    >
                      {o.label}
                    </Pill>
                  ))}
                </div>
              </Section>

              <Section title="所要時間">
                <div className="pillRow">
                  {OPTIONS.time.map((o) => (
                    <Pill
                      key={o.value}
                      active={cond.time === o.value}
                      onClick={() => setCond((p) => ({ ...p, time: o.value }))}
                    >
                      ⏱️ {o.label}
                    </Pill>
                  ))}
                </div>
              </Section>

              <Section title="場所">
                <div className="pillRow">
                  {OPTIONS.place.map((o) => (
                    <Pill
                      key={o.value}
                      active={cond.place === o.value}
                      onClick={() => setCond((p) => ({ ...p, place: o.value }))}
                    >
                      📍 {o.label}
                    </Pill>
                  ))}
                </div>
              </Section>

              <Section title="お金">
                <div className="pillRow">
                  {OPTIONS.money.map((o) => (
                    <Pill
                      key={o.value}
                      active={cond.money === o.value}
                      onClick={() => setCond((p) => ({ ...p, money: o.value }))}
                    >
                      💸 {o.label}
                    </Pill>
                  ))}
                </div>
              </Section>

              <Section title="目的">
                <div className="pillRow">
                  {OPTIONS.goal.map((o) => (
                    <Pill
                      key={o.value}
                      active={cond.goal === o.value}
                      onClick={() => setCond((p) => ({ ...p, goal: o.value }))}
                    >
                      🎯 {o.label}
                    </Pill>
                  ))}
                </div>
              </Section>

              <div className="rowBetween">
                <button className="btn ghost" onClick={resetCond} type="button">
                  リセット
                </button>

                <button className="btn" onClick={handleGenerate} type="button">
                  生成（結果へ） →
                </button>
              </div>

              <div className="smallNote">
                適合: <b>{filtered.length}</b>
                <br />
                生成を押すと <code>#/result</code> に移動し、そのURLは共有できます。
              </div>
            </div>
          )}

          {route === "result" && (
            <div className="card">
              <div className="rowBetween">
                <div className="cardTitle">結果</div>
                <button className="btn ghost" onClick={rerollOnResult} type="button">
                  もう1回
                </button>
              </div>

              {!result ? (
                <div className="empty">
                  条件に合う行動が見つからない。
                  <br />
                  <span className="muted">actions.jsonのtags/modesを見直してね。</span>
                </div>
              ) : (
                <>
                  <div className="resultTitle">{result.title}</div>

                  {result.note && <div className="resultNote">{result.note}</div>}

                  {safeArr(result.steps).length > 0 && (
                    <ol className="steps">
                      {result.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}

                  <div className="rowBetween">
                    <button
                      className={`btn ${favs.has(result.id) ? "" : "ghost"}`}
                      onClick={() => toggleFav(result.id)}
                      type="button"
                    >
                      {favs.has(result.id) ? "★ お気に入り" : "☆ お気に入りに入れる"}
                    </button>

                    <button className="btn ghost" onClick={() => navigateHash("#/")} type="button">
                      条件を変える
                    </button>
                  </div>

                  <div className="shareBox">
                    <div className="muted">この結果URLをそのまま共有OK：</div>
                    <code className="shareUrl">{window.location.href}</code>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="grid2">
            <div className="card">
              <div className="rowBetween">
                <div className="cardTitle">履歴（直近{LIMITS.historyMax}）</div>
                <button className="btn ghost" onClick={() => setHistory([])} type="button">
                  クリア
                </button>
              </div>

              {history.length === 0 ? (
                <div className="muted">まだ履歴がないよ。</div>
              ) : (
                <div className="list">
                  {history.map((h) => (
                    <button
                      key={h.at}
                      className="listItem"
                      type="button"
                      onClick={() => {
                        const item = h.item;
                        if (!item) return;
                        setCond(h.cond);
                        setResult(item);
                        navigateHash(
                          buildResultHash({
                            mode: h.cond.mode,
                            time: h.cond.time,
                            goal: h.cond.goal,
                            place: h.cond.place,
                            money: h.cond.money,
                          })
                        );
                      }}
                    >
                      <div className="liTitle">{h.item?.title ?? "?"}</div>
                      <div className="liMeta">
                        {h.cond?.time}分 / {h.cond?.goal} / {h.cond?.place} / {h.cond?.money}円 /{" "}
                        {h.cond?.mode}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="cardTitle">お気に入り</div>
              {favList.length === 0 ? (
                <div className="muted">まだお気に入りがないよ。</div>
              ) : (
                <div className="list">
                  {favList.map((a) => (
                    <div key={a.id} className="favRow">
                      <button
                        className="listItem"
                        type="button"
                        onClick={() => {
                          setResult(a);
                          navigateHash(
                            buildResultHash({
                              mode: cond.mode,
                              time: cond.time,
                              goal: cond.goal,
                              place: cond.place,
                              money: cond.money,
                            })
                          );
                        }}
                      >
                        <div className="liTitle">{a.title}</div>
                        <div className="liMeta">{a.note ? a.note : " "}</div>
                      </button>

                      <button className="btn ghost" onClick={() => toggleFav(a.id)} type="button">
                        解除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className="aside">
          <div className="card">
            <div className="rowBetween">
              <div className="cardTitle">🎮 SideGame</div>
              <button
                className="btn ghost"
                type="button"
                onClick={() => setSideGameEnabled((v) => !v)}
              >
                {sideGameEnabled ? "停止" : "再開"}
              </button>
            </div>

            <div className="muted smallNote">
              青画面の切り分け用。SideGameが怪しい時は「停止」で安全に回避。
            </div>

            <div className="sideGameWrap">
              {sideGameEnabled ? (
                // ✅ SideGame が壊れててもアプリ全体を落とさないために try-catch は使えない（JSXでは不可）
                // なので “一旦停止できるスイッチ” を付けた
                <SideGame />
              ) : (
                <div className="muted">SideGame paused</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="rowBetween">
              <div className="cardTitle">🏆 ランキング（{cond.mode}）</div>
              <button
                className="btn ghost"
                onClick={() => {
                  // 見た目更新用（同modeでも再描画）
                  setRanking((p) => [...p]);
                }}
                type="button"
              >
                更新
              </button>
            </div>

            {rankingErr ? (
              <div className="muted">取得失敗: {rankingErr}</div>
            ) : ranking.length === 0 ? (
              <div className="muted">まだデータがないよ。</div>
            ) : (
              <div className="rankList">
                {ranking.map((r, i) => (
                  <div className="rankRow" key={r.user_id + ":" + i}>
                    <div className="rankNum">{i + 1}</div>
                    <div className="rankMain">
                      <div className="rankScore">{r.best_score}</div>
                      <div className="rankMeta">
                        {r.updated_at ? new Date(r.updated_at).toLocaleString() : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="smallNote muted">
              ※ Supabase未接続ならランキングは表示されない（落ちない）。
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
