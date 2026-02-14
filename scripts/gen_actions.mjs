// scripts/gen_actions.mjs
// Generate 250 creative actions with balanced tags.
// Usage:
//   node scripts/gen_actions.mjs > src/actions.json

import crypto from "crypto";

const TIMES = ["10", "30", "60", "180"];
const GOALS = ["recover", "growth", "life", "fun"];
const PLACES = ["home", "campus", "outside", "online"];
const MONEYS = ["0", "low", "mid", "high"];

// --- seeded RNG (deterministic) ---
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const seed = parseInt(
  crypto.createHash("md5").update("boss-actions-v2").digest("hex").slice(0, 8),
  16
);
const rand = mulberry32(seed);

const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const uniq = (arr) => [...new Set(arr.map((x) => x.trim()))].filter(Boolean);

// --- creative parts ---
const constraints = [
  "スマホは伏せたまま",
  "音を出さない",
  "完璧禁止（60点で切り上げ）",
  "“1回だけ”縛り",
  "“3回だけ”縛り",
  "タイマーを使わず体感で",
  "椅子から立ってやる",
  "姿勢を一回リセットしてから",
];

const microGames = [
  "コインで決める（表=続行/裏=終了）",
  "A/B二択を作って直感で選ぶ",
  "“見つけたら勝ち”ルールを付ける",
  "禁止ワードを1つ決める（例:『でも』禁止）",
  "3つ集める（色/形/音/匂いなど）",
  "1分だけ“観察者モード”になる",
];

const endings = [
  "最後に一言だけメモして閉じる",
  "写真1枚で締める",
  "次の一手を1行で決めて終わる",
  "片づけて終了",
  "水を一口飲んで完了",
  "深呼吸して完了",
];

const verbs = {
  recover: ["ほどく", "戻す", "ゆるめる", "整える", "沈める", "冷やす", "温める"],
  growth: ["研ぐ", "分解する", "写す", "要約する", "検証する", "組む", "試す"],
  life: ["整列する", "補充する", "点検する", "片づける", "仕込む", "手続きする", "洗う"],
  fun: ["集める", "探す", "撮る", "作る", "混ぜる", "遊ぶ", "語る"],
};

function clampSteps(steps) {
  const s = uniq(steps);
  // 3〜5個に揃える
  return s.slice(0, Math.max(3, Math.min(5, s.length)));
}

function normalizeTitle(t) {
  // 「10分」「30分」「1時間」「半日」をタイトルに入れない
  return t.replace(/10分|30分|1時間|半日/g, "").replace(/\s+/g, " ").trim();
}

function makeRecover({ place, money, time }) {
  const v = pick(verbs.recover);
  const c = pick(constraints);
  const g = pick(microGames);

  const placeHook = {
    home: ["照明を変える", "窓を開ける", "布の感触を確かめる", "机の上だけ整える"],
    campus: ["静かな端に移動", "窓際に寄る", "踊り場で止まる", "図書館入口で呼吸"],
    outside: ["空を見る", "風向きを当てる", "人の少ない道へ", "足音を数える"],
    online: ["通知を切る", "音量ゼロ", "タブを3つ閉じる", "画面から距離を取る"],
  }[place];

  const byTime = {
    "10": ["呼吸を3回だけ数える", "肩を5回回す", "水を一口"],
    "30": ["遠近でピント切替", "軽ストレッチ1セット", "目を休める"],
    "60": ["15分×2 + 休憩で回復ブロック", "温める/冷やすを選ぶ", "疲れの正体を1行"],
    "180": ["回復メニューを3つ選ぶ", "やらないことを先に決める", "外部刺激を減らす設計"],
  }[time];

  const byMoney = {
    "0": ["追加購入禁止で工夫", "あるもので完結"],
    low: ["自販機/飲み物1つだけOK", "小さなお菓子1つだけOK"],
    mid: ["小さなご褒美を設計してOK", "場所課金してもOK"],
    high: ["快適さ最優先でOK", "最高の回復を買ってOK"],
  }[money];

  const titles = [
    `感覚を${v}儀式`,
    "脳の温度調整",
    "ノイズキャンセル",
    "回復のスイッチ",
    "疲れの正体を捕まえる",
    "静けさを取り戻す",
  ];

  return {
    title: normalizeTitle(pick(titles)),
    steps: clampSteps([
      `${pick(placeHook)}。${c}`,
      pick(byTime),
      g,
      pick(byMoney),
      pick(endings),
    ]),
  };
}

function makeGrowth({ place, money, time }) {
  const v = pick(verbs.growth);
  const c = pick(constraints);
  const g = pick(microGames);

  const byTime = {
    "10": ["定義/公式を1つ写経", "1問だけ解いて理由を書く", "1段落だけ読んで要点1行"],
    "30": ["例題→類題を1セット", "暗記カードを3枚だけ", "間違いの型を1つ特定"],
    "60": ["45分集中+15分復習", "要約→自分の言葉で再説明", "ミニテスト→弱点補強"],
    "180": ["テーマ1つを深掘り", "理解→演習→まとめの3ブロック", "弱点リスト作成"],
  }[time];

  const placeTool = {
    home: ["紙とペンで", "机の上だけで", "一枚にまとめる"],
    campus: ["図書館で", "空き教室で", "静かな席で"],
    outside: ["ベンチで", "歩きながら考えて", "カフェの端で"],
    online: ["1タブだけで", "検索は1回だけで", "通知OFFで"],
  }[place];

  const byMoney = {
    "0": ["無料で完結", "既存資料だけで勝つ"],
    low: ["コピー1回だけOK", "付箋/紙の小道具OK"],
    mid: ["参考書/印刷を使ってOK", "場所課金OK"],
    high: ["最短で伸びる手段を選んでOK", "良い道具で勝ってOK"],
  }[money];

  const titles = [
    `理解を${v}ミニ実験`,
    "弱点を1つ潰す",
    "説明できるに寄せる",
    "定義を武器にする",
    "問題の型を採集する",
    "一枚まとめ錬金術",
  ];

  return {
    title: normalizeTitle(pick(titles)),
    steps: clampSteps([
      `${pick(placeTool)}。${c}`,
      `${pick(byTime)}（${v}）`,
      g,
      pick(byMoney),
      pick(endings),
    ]),
  };
}

function makeLife({ place, money, time }) {
  const c = pick(constraints);
  const g = pick(microGames);

  const byTime = {
    "10": ["捨てるものを5個見つける", "持ち物を3点だけ整列", "洗面台を1分だけ磨く"],
    "30": ["洗濯の1工程だけ進める", "床の一角だけ掃除", "明日の準備を3点だけ"],
    "60": ["生活の詰まりを1つ解消", "収納を1エリア点検", "片づけ→掃除→補充を1セット"],
    "180": ["生活の負債をまとめて返す", "部屋をゾーンで攻略", "家事を完成まで"],
  }[time];

  const placeHook = {
    home: ["床面積を取り戻す", "部屋の地形を変える", "補充で未来を助ける"],
    campus: ["提出/印刷を片付ける", "予定と持ち物を整える", "移動を最適化する"],
    outside: ["用事を2つまでに制限", "寄り道を封印", "必要なものだけ買う"],
    online: ["タブ整理", "ファイル整理", "予定の棚卸し"],
  }[place];

  const byMoney = {
    "0": ["買わずに工夫", "あるもので回す"],
    low: ["消耗品の補充を1つだけOK", "コピー/自販機1回OK"],
    mid: ["便利で短縮してOK", "未来が楽になる買い物OK"],
    high: ["時間を買ってOK", "快適性最優先でOK"],
  }[money];

  const titles = [
    "生活の詰まりを抜く",
    "片づけをゲーム化",
    "未来の自分を救助",
    "持ち物の最適化",
    "面倒の根を切る",
    "部屋を再配置する",
  ];

  return {
    title: normalizeTitle(pick(titles)),
    steps: clampSteps([
      `${pick(placeHook)}。${c}`,
      pick(byTime),
      g,
      pick(byMoney),
      pick(endings),
    ]),
  };
}

function makeFun({ place, money, time }) {
  const v = pick(verbs.fun);
  const c = pick(constraints);
  const g = pick(microGames);

  const byTime = {
    "10": ["写真を1枚だけ“テーマ付き”で撮る", "ランダム単語3つでミニ創作", "1曲で“1動作”作る"],
    "30": ["3つ集める散歩（色/形/音）", "短いレビューを1本書く", "ミニ作品を1つ作る"],
    "60": ["撮る→選ぶ→整えるまで完了", "ミニ企画（テーマ制）をやる", "趣味を1時間だけ本気"],
    "180": ["作品を1つ完成させる", "小旅行レベルで場所を変える", "インプット→アウトプット1セット"],
  }[time];

  const placeHook = {
    home: ["部屋の中で", "机の上で", "音を小さくして"],
    campus: ["キャンパスで", "掲示板の周りで", "図書館近くで"],
    outside: ["街で", "川/公園で", "人の少ない道で"],
    online: ["オンラインで", "1タブだけで", "通知OFFで"],
  }[place];

  const byMoney = {
    "0": ["無料縛りで工夫", "道具は手元のものだけ"],
    low: ["小道具1つOK", "お菓子1つOK"],
    mid: ["素材/場所に少し使ってOK", "カフェ/文具OK"],
    high: ["面白さ最優先でOK", "体験を買ってOK"],
  }[money];

  const titles = [
    `遊びを${v}実験`,
    "観察のコレクション",
    "即席クリエイト",
    "小さな冒険",
    "面白いの採集",
    "ルールを作って遊ぶ",
  ];

  return {
    title: normalizeTitle(pick(titles)),
    steps: clampSteps([
      `${pick(placeHook)}${pick(byTime)}`,
      `${c}`,
      g,
      pick(byMoney),
      pick(endings),
    ]),
  };
}

// --- build 250 (balanced) from 256 combos ---
function buildCombos() {
  const combos = [];
  for (const time of TIMES)
    for (const goal of GOALS)
      for (const place of PLACES)
        for (const money of MONEYS)
          combos.push({ time, goal, place, money });
  return shuffle(combos).slice(0, 250);
}

function makeFor(tags) {
  if (tags.goal === "recover") return makeRecover(tags);
  if (tags.goal === "growth") return makeGrowth(tags);
  if (tags.goal === "life") return makeLife(tags);
  return makeFun(tags);
}

function hashKey(title, steps) {
  return `${title}||${steps.join("||")}`;
}

const combos = buildCombos();
const used = new Set();

const actions = combos.map((tags, i) => {
  let payload;
  // 重複っぽいのを避けるための再抽選
  for (let attempt = 0; attempt < 40; attempt++) {
    payload = makeFor(tags);
    const key = hashKey(payload.title, payload.steps);
    if (!used.has(key) && payload.steps.length >= 3) {
      used.add(key);
      break;
    }
  }

  return {
    id: `a${String(i + 1).padStart(3, "0")}`,
    title: payload.title,
    steps: payload.steps,
    tags: {
      time: [tags.time],
      goal: [tags.goal],
      place: [tags.place],
      money: [tags.money],
    },
  };
});

process.stdout.write(JSON.stringify(actions, null, 2));

