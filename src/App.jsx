import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import SideGame from "./SideGame.jsx";
import ACTIONS from "./actions.json";

/* =========================
   設定
========================= */

const URL_ALLOWED_KEYS = new Set(["mode","time","goal","place","money"]);

const LIMITS = {
  titleMax: 80,
  stepMaxCount: 10,
  stepMaxLen: 120,
  noteMax: 220,
  actionsMax: 5000,
};

const LS_KEYS = {
  gate: "dr:gate_done_date",
  history: "dr:v1:history",
  favs: "dr:v1:favs",
};

/* =========================
   util
========================= */

const todayKey = () => new Date().toISOString().slice(0,10);

function safeText(v,max){
  if(typeof v !== "string") return "";
  return v.slice(0,max);
}

function normalizeActions(list){
  if(!Array.isArray(list)) return [];
  return list.slice(0,LIMITS.actionsMax).map(a=>({
    title: safeText(a?.title ?? "no title", LIMITS.titleMax),
    tags: a?.tags ?? {},
    steps: Array.isArray(a?.steps)
      ? a.steps.slice(0,LIMITS.stepMaxCount).map(s=>safeText(s,LIMITS.stepMaxLen))
      : [],
    note: safeText(a?.note ?? "", LIMITS.noteMax),
  }));
}

/* =========================
   Main
========================= */

export default function App(){

  const [mode,setMode] = useState("student");
  const [time,setTime] = useState("30");
  const [goal,setGoal] = useState("recover");
  const [place,setPlace] = useState("home");
  const [money,setMoney] = useState("0");

  const [result,setResult] = useState(null);

  const [showGate,setShowGate] = useState(false);

  const [history,setHistory] = useState(()=>{
    try{
      return JSON.parse(localStorage.getItem(LS_KEYS.history)) ?? [];
    }catch{
      return [];
    }
  });

  const [favs,setFavs] = useState(()=>{
    try{
      return JSON.parse(localStorage.getItem(LS_KEYS.favs)) ?? [];
    }catch{
      return [];
    }
  });

  const ACTION_LIST = useMemo(()=>normalizeActions(ACTIONS),[]);

  /* =========================
     Gate（URL開いた時のみ）
  ========================= */

  useEffect(()=>{
    const done = localStorage.getItem(LS_KEYS.gate);
    if(done !== todayKey()){
      setShowGate(true);
    }
  },[]);

  function completeGate(){
    localStorage.setItem(LS_KEYS.gate, todayKey());
    setShowGate(false);
  }

  /* =========================
     URL sync
  ========================= */

  useEffect(()=>{
    const url = new URL(window.location.href);
    const params = url.searchParams;

    const obj = {mode,time,goal,place,money};

    Object.entries(obj).forEach(([k,v])=>{
      if(URL_ALLOWED_KEYS.has(k)){
        params.set(k,v);
      }
    });

    const next = `${location.pathname}?${params.toString()}`;
    window.history.replaceState(null,"",next);

  },[mode,time,goal,place,money]);

  /* =========================
     生成
  ========================= */

  function generate(){

    const pool = ACTION_LIST.filter(a=>{
      if(mode==="student" && a?.modes && !a.modes.includes("student")) return false;
      return true;
    });

    if(pool.length===0) return;

    const pick = pool[Math.floor(Math.random()*pool.length)];
    setResult(pick);

    const nextHistory = [pick.title, ...history].slice(0,10);
    setHistory(nextHistory);
    localStorage.setItem(LS_KEYS.history, JSON.stringify(nextHistory));
  }

  function toggleFav(title){
    let next;
    if(favs.includes(title)){
      next = favs.filter(t=>t!==title);
    }else{
      next = [title,...favs];
    }
    setFavs(next);
    localStorage.setItem(LS_KEYS.favs, JSON.stringify(next));
  }

  /* =========================
     UI
  ========================= */

  return (
    <div className="appShell">

      {/* Header */}
      <div className="topbar">
        <div className="brand">Decision Router</div>
        <div className="badge">{mode}</div>
      </div>

      <div className="layout">

        {/* LEFT */}
        <div className="main">

          <div className="card">
            <div className="cardTitle">条件</div>

            <div className="section">
              <div className="sectionTitle">目的</div>
              <div className="pillRow">
                {["recover","growth","life","fun"].map(v=>(
                  <button
                    key={v}
                    className={`pill ${goal===v?"isActive":""}`}
                    onClick={()=>setGoal(v)}
                  >{v}</button>
                ))}
              </div>
            </div>

            <div className="rowBetween">
              <button className="btn" onClick={generate}>生成</button>
            </div>

          </div>

          {result && (
            <div className="card">
              <div className="resultTitle">{result.title}</div>

              {result.note && (
                <div className="resultNote">{result.note}</div>
              )}

              <ul className="steps">
                {result.steps.map((s,i)=>(<li key={i}>{s}</li>))}
              </ul>

              <div className="rowBetween">
                <button
                  className="btn ghost"
                  onClick={()=>toggleFav(result.title)}
                >
                  {favs.includes(result.title) ? "★解除" : "★お気に入り"}
                </button>
              </div>
            </div>
          )}

          <div className="grid2">

            <div className="card">
              <div className="cardTitle">履歴</div>
              <div className="list">
                {history.map((h,i)=>(
                  <div key={i} className="listItem">{h}</div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="cardTitle">お気に入り</div>
              <div className="list">
                {favs.map((f,i)=>(
                  <div key={i} className="listItem">{f}</div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* RIGHT */}
        <div className="aside">
          <div className="card">
            <div className="cardTitle">Side Game</div>
            <SideGame />
          </div>
        </div>

      </div>

      {/* Gate */}
      {showGate && (
        <div className="gateOverlay">
          <div className="gateCard">
            <div className="gateTitle">今日の行動</div>
            <div className="gateText">まずは10歩歩こう。</div>
            <div className="gateBtns">
              <button className="btn" onClick={completeGate}>できた</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
