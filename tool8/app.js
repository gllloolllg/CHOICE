// ===== 基本設定 =====
const NUM_CARDS = 8; // 周囲8マスにカード
const BINGO_SIZE = 5; // 5x5
const MAX_NUMBER = 75;
const DRAW_INTERVAL_MS = 250; // 抽選速度（ミリ秒）

// DOM 要素
const cardsContainer = document.getElementById("cardsContainer");
const startButton = document.getElementById("startButton");
const currentNumberSpan = document.getElementById("currentNumber");
const currentNumberArea = document.getElementById("currentNumberArea");
const winnerMessage = document.getElementById("winnerMessage");

// 状態管理
let cards = []; // 各カードの状態を持つ
let drawIntervalId = null;
let remainingNumbers = [];
let gameRunning = false;

// スタートボタンは初期は無効
startButton.disabled = true;

// ===== ビンゴカード生成ロジック =====

// 配列をシャッフル（Fisher–Yates）
function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 範囲配列
function range(start, endInclusive) {
  const out = [];
  for (let i = start; i <= endInclusive; i++) out.push(i);
  return out;
}

// ビンゴカード1枚分のデータを作成
function generateCardData() {
  const numbers = Array.from({ length: BINGO_SIZE }, () =>
    Array(BINGO_SIZE).fill(null)
  );
  const marks = Array.from({ length: BINGO_SIZE }, () =>
    Array(BINGO_SIZE).fill(false)
  );

  // 列ごとの範囲
  for (let col = 0; col < BINGO_SIZE; col++) {
    const start = col * 15 + 1;
    const end = (col + 1) * 15;
    const columnNumbers = shuffle(range(start, end)).slice(0, BINGO_SIZE);

    for (let row = 0; row < BINGO_SIZE; row++) {
      numbers[row][col] = columnNumbers[row];
    }
  }

  // 中央マスは FREE
  const center = Math.floor(BINGO_SIZE / 2);
  marks[center][center] = true;
  numbers[center][center] = null;

  return { numbers, marks };
}

// カードDOMを生成
function createCardElement(cardIndex, numbers, marks) {
  const card = document.createElement("div");
  card.className = `bingo-card inactive player-${cardIndex + 1}`;
  card.setAttribute("data-card-index", String(cardIndex));
  card.setAttribute("tabindex", "0");

  const header = document.createElement("div");
  header.className = "bingo-card-header";

  const title = document.createElement("div");

  const status = document.createElement("div");
  status.className = "bingo-card-status";

  header.appendChild(title);
  header.appendChild(status);

  const grid = document.createElement("div");
  grid.className = "bingo-grid";

  // B I N G O ヘッダー
  const headers = ["B", "I", "N", "G", "O"];
  for (let i = 0; i < BINGO_SIZE; i++) {
    const cell = document.createElement("div");
    cell.className = "bingo-cell header";
    cell.textContent = headers[i];
    grid.appendChild(cell);
  }

  // 5x5 セル
  for (let row = 0; row < BINGO_SIZE; row++) {
    for (let col = 0; col < BINGO_SIZE; col++) {
      const cell = document.createElement("div");
      cell.className = "bingo-cell";
      const value = numbers[row][col];

      if (row === Math.floor(BINGO_SIZE / 2) && col === Math.floor(BINGO_SIZE / 2)) {
        cell.classList.add("free");
        cell.textContent = "";
        cell.setAttribute("data-number", "");
        if (marks[row][col]) {
          cell.classList.add("marked");
        }
      } else {
        cell.textContent = String(value);
        cell.setAttribute("data-number", String(value));
      }

      cell.setAttribute("data-row", String(row));
      cell.setAttribute("data-col", String(col));
      grid.appendChild(cell);
    }
  }

  card.appendChild(header);
  card.appendChild(grid);

  // クリックで参加/不参加トグル（ゲーム中は不可）
  card.addEventListener("click", () => {
    if (gameRunning) return;
    toggleCardActive(cardIndex);
  });

  // Enter/Space キーでもトグル
  card.addEventListener("keydown", (e) => {
    if (gameRunning) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCardActive(cardIndex);
    }
  });

  return card;
}

// カードの参加状態トグル
function toggleCardActive(cardIndex) {
  const cardState = cards[cardIndex];
  cardState.active = !cardState.active;

  const cardEl = cardState.element;
  // const statusEl = cardEl.querySelector(".bingo-card-status");

  if (cardState.active) {
    cardEl.classList.remove("inactive");
    cardEl.classList.add("active");
  } else {
    cardEl.classList.remove("active");
    cardEl.classList.add("inactive");
  }

  updateStartButtonState();
}

// 参加カード数に応じて START ボタンの有効/無効を切り替え
function updateStartButtonState() {
  const activeCount = cards.filter((c) => c.active).length;
  startButton.disabled = activeCount < 2;
}

// ===== ビンゴ判定 =====

function checkBingo(cardState) {
  const { marks } = cardState;

  // 行
  for (let row = 0; row < BINGO_SIZE; row++) {
    let ok = true;
    for (let col = 0; col < BINGO_SIZE; col++) {
      if (!marks[row][col]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }

  // 列
  for (let col = 0; col < BINGO_SIZE; col++) {
    let ok = true;
    for (let row = 0; row < BINGO_SIZE; row++) {
      if (!marks[row][col]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }

  // 斜め（左上→右下）
  let diag1 = true;
  for (let i = 0; i < BINGO_SIZE; i++) {
    if (!marks[i][i]) {
      diag1 = false;
      break;
    }
  }
  if (diag1) return true;

  // 斜め（右上→左下）
  let diag2 = true;
  for (let i = 0; i < BINGO_SIZE; i++) {
    if (!marks[i][BINGO_SIZE - 1 - i]) {
      diag2 = false;
      break;
    }
  }
  if (diag2) return true;

  return false;
}

// ===== 抽選ロジック =====

// 抽選開始
function startGame() {
  if (gameRunning) return;

  const activeCards = cards.filter((c) => c.active);
  if (activeCards.length < 2) {
    alert("少なくとも2枚のカードを参加状態にしてください。");
    return;
  }

  gameRunning = true;
  // winnerMessage.textContent = "";
  currentNumberSpan.textContent = "";

  // ボタン状態
  startButton.style.display = "none";

  // 不参加カードは非表示
  cards.forEach((cardState) => {
    if (!cardState.active) {
      cardState.element.classList.add("hidden");
    }
  });

  // 抽選用番号リスト
  remainingNumbers = range(1, MAX_NUMBER);

  // 抽選番号表示エリア表示
  currentNumberArea.style.display = "flex";

  // 一定間隔で番号を引く
  drawIntervalId = setInterval(drawNextNumber, DRAW_INTERVAL_MS);
}

// 番号を1つ抽選
function drawNextNumber() {
  if (remainingNumbers.length === 0) {
    stopGame();
    winnerMessage.textContent = "全ての番号が出ましたが、ビンゴはありませんでした。";
    return;
  }

  const idx = Math.floor(Math.random() * remainingNumbers.length);
  const num = remainingNumbers.splice(idx, 1)[0];

  // 表示更新
  currentNumberSpan.textContent = String(num);

  // 各カードに対してマーク
  let winnerFound = false;
  cards.forEach((cardState) => {
    if (!cardState.active) return;

    const { numbers, marks, element } = cardState;

    for (let row = 0; row < BINGO_SIZE; row++) {
      for (let col = 0; col < BINGO_SIZE; col++) {
        if (numbers[row][col] === num) {
          marks[row][col] = true;
          const selector = `.bingo-cell[data-row="${row}"][data-col="${col}"]`;
          const cell = element.querySelector(selector);
          if (cell) {
            cell.classList.add("marked");
          }
        }
      }
    }

    if (checkBingo(cardState)) {
      winnerFound = true;
    }
  });

  if (winnerFound) {
    endWithWinners();
  }
}

// 勝者ありで終了
function endWithWinners() {
  stopGame();

  const winners = cards.filter((c) => c.active && checkBingo(c));
  winners.forEach((cardState) => {
    cardState.element.classList.add("winner");
  });

  if (winners.length === 1) {
    const idx = winners[0].index;
    winnerMessage.textContent = `PLAYER ${idx + 1} WIN!`;
  } else {
    const winnerNames = winners
      .map((w) => `PLAYER ${w.index + 1}`)
      .join(", ");
    winnerMessage.textContent = `${winnerNames} WIN!`;
  }
}

// ゲームの停止（共通処理）
function stopGame() {
  if (drawIntervalId !== null) {
    clearInterval(drawIntervalId);
    drawIntervalId = null;
  }
  gameRunning = false;
}



// ===== 初期化 =====

function initCards() {
  for (let i = 0; i < NUM_CARDS; i++) {
    const { numbers, marks } = generateCardData();
    const cardElement = createCardElement(i, numbers, marks);

    const slot = document.getElementById(`slot-${i}`);
    if (slot) {
      slot.appendChild(cardElement);
    }

    cards.push({
      index: i,
      numbers,
      marks,
      active: false,
      element: cardElement
    });
  }

  updateStartButtonState();
}

// イベント設定
startButton.addEventListener("click", startGame);

// ページ読み込み時にカードを作成
initCards();
