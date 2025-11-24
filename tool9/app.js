// 簡単な状態管理
const Phase = {
  PLACING: "placing", // 穴を置くフェーズ
  FLYING: "flying",   // ボールが動いている
  FINISHED: "finished",
};

let gamePhase = Phase.PLACING;
let gridOverlay;
let gameArea;
let golferEl;
let resetButton;

let seShot;
let seCupin;

let gridCellSize = 0; // 1マスの一辺(px)
let holeList = [];    // { x, y, radius, element, order }
let maxHoles = 6;
let minHoles = 2;

let ball = null;      // { x, y, vx, vy, radius, el, startTime, mode }
let animationId = null;
// ボール速度と向き設定関数（直線移動・今までの約2倍速度）
const BALL_SPEED = 500; // px/sec（元の最大速度140の約2倍）

//事前の音読み込み
let audioWarmed = false;

// ゴルファー画像リスト
const GOLFER_IMAGES = [
  "tool9/golfer/01.png",
  "tool9/golfer//02.png",
  "tool9/golfer//03.png",
  "tool9/golfer//04.png",
  "tool9/golfer//05.png",
  "tool9/golfer//06.png",
  "tool9/golfer//07.png",
  "tool9/golfer//08.png",
];

function randomizeGolferImage() {
  const idx = Math.floor(Math.random() * GOLFER_IMAGES.length);
  golferEl.src = GOLFER_IMAGES[idx];
}


function warmupAudio() {
  if (audioWarmed) return;
  audioWarmed = true;

  // 全効果音のウォームアップ
  [seShot, seCupin].forEach(audio => {
    if (!audio) return;
    audio.volume = 0.0001; // ほぼ無音
    audio.play().catch(()=>{});
    setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1.0;
    }, 100);
  });
}



function setRandomDirection(ball, initialDownwards = false) {
  const speed = BALL_SPEED;
  let angle;

  if (initialDownwards) {
    // 最初だけは下方向（コース側）に飛びやすくする：45〜135度
    angle = randomInRange(Math.PI * 0.25, Math.PI * 0.75);
  } else {
    // 壁に当たった後は完全ランダム
    angle = randomInRange(0, Math.PI * 2);
  }

  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
}


const holeBorderColors = [
  "#ff5555",
  "#55aaff",
  "#55cc55",
  "#ffb347",
  "#aa66ff",
  "#00cccc",
];



// 初期化
document.addEventListener("DOMContentLoaded", () => {
  gameArea = document.getElementById("gameArea");
  gridOverlay = document.getElementById("gridOverlay");
  golferEl = document.getElementById("golfer");
  resetButton = document.getElementById("resetButton");
  seShot = document.getElementById("seShot");
  seCupin = document.getElementById("seCupin");

  // レイアウト計算＆グリッド生成
  layoutGrid();

  randomizeGolferImage();
  randomizeGolferPosition();

  //ページロード時にボールを表示
  createInitialBall();


  // 画面サイズが変わった時はグリッド再計算（穴の位置は割合で再計算するのが理想だが、
  // 趣味用途＆スマホメインなので、とりあえず「リセット」と同じ扱いにする）
  window.addEventListener("resize", () => {
    // スマホ回転などでは一旦リセット
    resetGame();
  });

  // 音の読み込み
  gameArea.addEventListener("touchstart", () => {
    warmupAudio();  // ★最初のタップで強制デコード
  }, { passive: true });

  // グリッドへのタップ（タップ位置に穴を置く）
  gameArea.addEventListener(
    "touchstart",
    (e) => {
      // グリッド部分にのみ反応させたいので、基本的にどこをタップしても「ゲームエリア内の座標」として扱う
      handleGridTapFromTouch(e);
    },
    { passive: false }
  );

  // PCでの確認用に click も一応サポート（スマホ専用でも問題はない）
  gameArea.addEventListener("click", (e) => {
    handleGridTapFromClick(e);
  });

  // ゴルファータップでショット開始
  golferEl.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      handleGolferTap();
    },
    { passive: false }
  );
  golferEl.addEventListener("click", (e) => {
    e.preventDefault();
    handleGolferTap();
  });

  // リセット
  resetButton.addEventListener("click", () => {
    resetGame();
  });
});

// グリッドの生成（画面サイズに合わせて行数を計算）
function layoutGrid() {
  gridOverlay.innerHTML = "";

  const rect = gameArea.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  // 一辺（正方形）を幅/5で決定
  gridCellSize = width / 5;
  // 高さ方向に何行入るか
  const rows = Math.floor(height / gridCellSize);

  // CSSグリッドの行を指定
  gridOverlay.style.gridTemplateRows = `repeat(${rows}, ${gridCellSize}px)`;

  const totalCells = rows * 5;
  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("div");
    cell.className = "grid-cell";
    gridOverlay.appendChild(cell);
  }
}

// グリッド上のタップ（touch）
function handleGridTapFromTouch(e) {
  e.preventDefault();
  if (gamePhase !== Phase.PLACING) return;

  const touch = e.changedTouches[0];
  if (!touch) return;
  const x = touch.clientX;
  const y = touch.clientY;

  placeHoleAtClientCoords(x, y);
}

// グリッド上のタップ（click）
function handleGridTapFromClick(e) {
  if (gamePhase !== Phase.PLACING) return;
  const x = e.clientX;
  const y = e.clientY;

  placeHoleAtClientCoords(x, y);
}

// 画面上のタップ座標から、グリッドの最も近いセル中心に穴を置く
function placeHoleAtClientCoords(clientX, clientY) {
  if (holeList.length >= maxHoles) {
    return;
  }

  const rect = gameArea.getBoundingClientRect();
  // ゲームエリア外なら無視
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return;
  }

  const localX = clientX - rect.left;
  const localY = clientY - rect.top;

  // 列、行
  const col = clamp(Math.floor(localX / gridCellSize), 0, 4); // 0〜4
  const row = Math.floor(localY / gridCellSize);              // 0〜rows-1

  // 同じセルにすでに穴がある場合は何もしない
  const exists = holeList.some(h => h.col === col && h.row === row);
  if (exists) {
    return;
  }

  // セル中心座標
  const centerX = (col + 0.5) * gridCellSize;
  const centerY = (row + 0.5) * gridCellSize;

  // 穴生成（セル情報も渡す）
  createHole(centerX, centerY, col, row);
}


// 穴の生成
function createHole(x, y, col, row) {
  const holeEl = document.createElement("div");
  holeEl.className = "hole";

  const order = holeList.length; // 0〜
  const borderColor = holeBorderColors[order % holeBorderColors.length];
  holeEl.style.borderColor = borderColor;

  // CSSで中心合わせ transform(-50%, -50%) を使うので、left/topは中心座標
  holeEl.style.left = `${x}px`;
  holeEl.style.top = `${y}px`;

  gameArea.appendChild(holeEl);

  const radius = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--hole-radius"
    )
  );

  holeList.push({
    x,
    y,
    radius,
    element: holeEl,
    order: order + 1,
    col,  // ★どのセルかを保存
    row,  // ★どのセルかを保存
  });
}


// ゴルファーの左右位置をランダムに決定
function randomizeGolferPosition() {
  const rect = gameArea.getBoundingClientRect();
  const width = rect.width;
  const golferWidth = golferEl.getBoundingClientRect().width || 80;

  const margin = 10;
  const minX = margin + golferWidth / 2;
  const maxX = width - margin - golferWidth / 2;

  const randX = minX + Math.random() * (maxX - minX);
  golferEl.style.left = `${randX}px`;
}


// ★ページロード時に、ゴルファーの左側に静止ボールを置いておく
function createInitialBall() {
  const ballAirRadius = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--ball-air-radius"
    )
  );
  const ballGroundRadius = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--ball-ground-radius"
    )
  );

  // gameArea / golfer の位置情報
  const areaRect = gameArea.getBoundingClientRect();
  const golferRect = golferEl.getBoundingClientRect();

  // ゴルファーの「中央x」、足元のyを算出（ゲームエリア基準に変換）
  const golferCenterX = golferRect.left - areaRect.left + golferRect.width / 2;
  const golferFootY = golferRect.bottom - areaRect.top;

  // ★ボールをゴルファーの左側に少しずらして配置
  const offsetX = -50; // 左方向にずらす量（お好みで調整）
  const offsetY = 0;   // 縦位置は足元に合わせる（必要なら±で調整）
  let x = golferCenterX + offsetX;
  let y = golferFootY + offsetY;

  // 画面外に出ないように軽くクランプ
  const margin = ballGroundRadius + 4;
  x = clamp(x, margin, areaRect.width - margin);
  y = clamp(y, margin, areaRect.height - margin);

  // すでにボールがある場合はいったん消す（リセット時用の保険）
  if (ball) {
    if (ball.el && ball.el.parentNode) {
      ball.el.parentNode.removeChild(ball.el);
    }
    if (ball.shadowEl && ball.shadowEl.parentNode) {
      ball.shadowEl.parentNode.removeChild(ball.shadowEl);
    }
  }

  // ボール本体
  const ballEl = document.createElement("div");
  ballEl.className = "ball ball-ground"; // 小さいサイズで表示
  gameArea.appendChild(ballEl);

  // 影（上空ではないので非表示のまま）
  const shadowEl = document.createElement("div");
  shadowEl.className = "ball-shadow";
  shadowEl.style.display = "none";
  gameArea.appendChild(shadowEl);

  ball = {
    x,
    y,
    vx: 0,
    vy: 0,
    radiusAir: ballAirRadius,
    radiusGround: ballGroundRadius,
    el: ballEl,
    shadowEl: shadowEl,
    startTime: 0,
    mode: "ground",
  };

  updateBallElement();
}




// ゴルファータップ → ショット開始
function handleGolferTap() {
  if (gamePhase !== Phase.PLACING) {
    // 既にショット後
    return;
  }
  if (holeList.length < minHoles) {
    return;
  }

  startShot();
}



// ショット開始
function startShot() {

  // ★ショット音
  if (seShot) {
    seShot.currentTime = 0;
    seShot.play().catch(err => {
      console.error("seShot play error:", err);
    });
  }
// ここまでログ

  gamePhase = Phase.FLYING;
  if (seShot) {
    seShot.currentTime = 0;
    seShot.play().catch(()=>{});
  }


  const rect = gameArea.getBoundingClientRect();
  const areaWidth = rect.width;
  const areaHeight = rect.height;

  const golferRect = golferEl.getBoundingClientRect();
  const startX = golferRect.left - rect.left + golferRect.width / 2;
  const startY = golferRect.bottom - rect.top; // ゴルファー画像の下端付近

  // ボール初期状態
  const ballAirRadius = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--ball-air-radius"
    )
  );
  const ballGroundRadius = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--ball-ground-radius"
    )
  );

    // ★追加：地上ボールのスケールをCSS変数に反映
  const groundScale = ballGroundRadius / ballAirRadius;
  document.documentElement.style.setProperty(
    "--ball-ground-scale",
    groundScale
  );

  // ★既存のボールを使用してパラメータだけ更新
ball.startTime = performance.now();
ball.mode = "air";


   // ★打ち上がり演出：
  // 1) 開始直後（50ms後）に「小 → 大」へ 2秒かけて拡大
  setTimeout(() => {
    if (!ball || !ball.el) return;
    if (ball.mode !== "air") return; // すでに終わっていたら何もしない
    ball.el.classList.remove("ball-ground");
    ball.el.classList.add("ball-air");
  }, 50);

  // 2) その2秒後（合計約2秒経過時）に「大 → 小」へ 2秒かけて縮小
  setTimeout(() => {
    if (!ball || !ball.el) return;
    if (ball.mode !== "air") return; // まだ上空モードのときだけ
    ball.el.classList.remove("ball-air");
    ball.el.classList.add("ball-ground");
  }, 2050); // 50ms + 2000ms ≒ 2秒後に縮小開始


  setRandomDirection(ball, true);

  // 描画位置を反映
  updateBallElement();

  // アニメーション開始
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }
  animationLoop();
}

// ランダムな範囲の数値
function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

// clamp
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ボールDOM更新
function updateBallElement() {
  if (!ball) return;

  // ボール本体の位置
  if (ball.el) {
    ball.el.style.left = `${ball.x}px`;
    ball.el.style.top = `${ball.y}px`;
  }

  // ★影の位置（上空モードの間だけ動かす）
  if (ball.shadowEl) {
    if (ball.mode === "air") {
      ball.shadowEl.style.display = "block";

      // 経過時間（秒）
      const now = performance.now();
      const elapsed = (now - ball.startTime) / 1000;

      // 0〜2秒: ボールと同じ位置 → 徐々に下へ
      // 2〜4秒: 徐々に上がっていき、ボールと同じ位置に戻る
      let progress = 0; // 0〜1
      if (elapsed <= 2) {
        // 下へ
        progress = elapsed / 2; // 0 → 1
      } else if (elapsed <= 4) {
        // 上へ戻る
        progress = 1 - (elapsed - 2) / 2; // 1 → 0
      } else {
        progress = 0;
      }
      progress = clamp(progress, 0, 1);

      const offsetYMax = 80; // ★影が下にずれる最大距離（お好みで調整可）
      const offsetY = offsetYMax * progress;

      // 横位置はボールと同じ、縦だけ下へ
      ball.shadowEl.style.left = `${ball.x}px`;
      ball.shadowEl.style.top = `${ball.y + offsetY}px`;
    } else {
      // 地上モードになったら影は非表示
      ball.shadowEl.style.display = "none";
    }
  }
}



// アニメーションループ
function animationLoop() {
  const now = performance.now();

  if (!ball) return;

  const elapsed = (now - ball.startTime) / 1000; // 秒
  const dt = 1 / 60; // ざっくり固定フレームで計算（60fps想定）

  const rect = gameArea.getBoundingClientRect();
  const areaWidth = rect.width;
  const areaHeight = rect.height;

  // 状態に応じて半径をセット
  const currentRadius =
    ball.mode === "air" ? ball.radiusAir : ball.radiusGround;

   // ランダムウォーク（一定時間ごとに方向変化）
  if (now - ball.lastChangeTime > 250) {
    ball.vx += randomInRange(-40, 40);
    ball.vy += randomInRange(-40, 40);

    // 速度が速くなりすぎないようにクランプ
    const maxSpeed = 140;
    ball.vx = clamp(ball.vx, -maxSpeed, maxSpeed);
    ball.vy = clamp(ball.vy, -maxSpeed, maxSpeed);

    ball.lastChangeTime = now;
  }


  // 位置更新
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // エリア内で反射
  // 左右
   // エリア内で反射 → ★壁に当たったら向きをランダム抽選
  // 左右
  if (ball.x - currentRadius < 0) {
    ball.x = currentRadius;
    setRandomDirection(ball); // ★向きをランダムに再抽選
  } else if (ball.x + currentRadius > areaWidth) {
    ball.x = areaWidth - currentRadius;
    setRandomDirection(ball); // ★向きをランダムに再抽選
  }

  // 上下
  if (ball.y - currentRadius < 0) {
    ball.y = currentRadius;
    setRandomDirection(ball); // ★向きをランダムに再抽選
  } else if (ball.y + currentRadius > areaHeight) {
    ball.y = areaHeight - currentRadius;
    setRandomDirection(ball); // ★向きをランダムに再抽選
  }


    // 4秒経過後に地上モードへ
  if (ball.mode === "air" && elapsed >= 4) {
    ball.mode = "ground";
    ball.el.classList.remove("ball-air");
    ball.el.classList.add("ball-ground");

    // ★地上に落ちたら影を消す（updateBallElementでも非表示にするが念のため）
    if (ball.shadowEl) {
      ball.shadowEl.style.display = "none";
    }

  }


  updateBallElement();

  // 地上モード中のみ穴との当たり判定
  if (ball.mode === "ground") {
    const hitHole = checkBallHoleCollision(ball);
    if (hitHole) {
      // ヒットした地点で停止
      endShot(hitHole);
      return;
    }
  }

  animationId = requestAnimationFrame(animationLoop);
}

// ボールと穴の当たり判定
function checkBallHoleCollision(ball) {
  const currentRadius =
    ball.mode === "air" ? ball.radiusAir : ball.radiusGround;
  const br = currentRadius;

  for (const hole of holeList) {
    const dx = ball.x - hole.x;
    const dy = ball.y - hole.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < hole.radius + br) {
      return hole;
    }
  }
  return null;
}


// ショット終了（穴に落ちた）
function endShot(hitHole) {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
    // カップイン音
  if (seCupin) {
    seCupin.currentTime = 0;
    seCupin.play().catch(()=>{});
  }

  gamePhase = Phase.FINISHED;

  if (ball && hitHole) {
    // ボールを「そのグリッド（穴）の中心」にスナップ
    ball.x = hitHole.x;
    ball.y = hitHole.y;
  }

  if (ball && ball.el) {
    // 最終位置に固定
    updateBallElement();
  }

  // 軽く演出（穴を少し光らせ点滅）
if (hitHole && hitHole.element) {
  let visible = false;
  const holeEl = hitHole.element;

  // クラスが残ると次のゲームに影響するので初期化
  holeEl.style.boxShadow = "none";

  // 0.5秒ごとにオン/オフを切り替え
  hitHole.blinkInterval = setInterval(() => {
    visible = !visible;
    holeEl.style.boxShadow = visible
      ? "0 0 20px rgba(255, 0, 0, 1)"
      : "none";
  }, 500);
}

   if (resetButton) {
    resetButton.style.display = "block";
  }

}


// ゲームリセット
function resetGame() {
    resetButton.style.display = "none";
  // アニメーション停止
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // 穴削除
  for (const hole of holeList) {
    if (hole.element && hole.element.parentNode) {
      hole.element.parentNode.removeChild(hole.element);
    }
  }
  holeList = [];

  // ボール削除
  if (ball && ball.el && ball.el.parentNode) {
    ball.el.parentNode.removeChild(ball.el);
  }
  ball = null;

  gamePhase = Phase.PLACING;

  // グリッド再生成
  layoutGrid();

  // ゴルファー位置ランダム
  randomizeGolferImage();
  randomizeGolferPosition();
  createInitialBall();

}
