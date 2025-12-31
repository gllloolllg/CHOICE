// 定数
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3', '#33FFF3'];
const EMOJIS = [
    ['😀', '😂', '😎', '😍', '🤔', '😡'],
    ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊'],
    ['🍎', '🍌', '🍇', '🍉', '🍓', '🍑'],
    ['⛷️', '🏀', '🏈', '🚴‍♂️', '🎾', '🏐'],
    ['🚗', '🚕', '🚙', '🚌', '🚎', '🚑'],
    ['👻', '👽', '🤖', '💩', '💀', '🤡']
];

// ゲーム設定
const FPS = 60;
const PLAYER_SCALE = 0.044; // ステージ半径に対するプレイヤー半径の比率 (直径24px / ステージ半径270px)
const BASE_SPEED = 0.015; // 1フレームあたりの移動距離 (論理座標系)
const STAGE_RADIUS_LOGICAL = 1.0; // 論理上のステージ半径

// DOM要素
const stage = document.getElementById('stage');
const controlsLeft = document.getElementById('controls-left');
const controlsRight = document.getElementById('controls-right');
// popup要素は動的生成のため削除
const battleBtn = document.getElementById('battle-btn');
const winnerDisplay = document.createElement('div'); // 勝利者表示用
winnerDisplay.id = 'winner-display';
document.getElementById('game-container').appendChild(winnerDisplay);
const fireBtn = document.getElementById('fire-btn');

// 状態変数
let players = new Array(6).fill(null);
let playerEmojiSets = new Array(6).fill(null); // 各プレイヤーIDに対応する絵文字セット
let isPlaying = false;
let activePopups = new Array(6).fill(null); // 各プレイヤーのポップアップ要素を保持
let animationFrameId = null;
let fireCooldownTimer = null; // FIREボタンのタイマー
let npcs = []; // 拳NPCのリスト

// Audio (本来ならここで効果音などもロードしたいが今回は省略)

// --- 初期化 ---
function init() {
    assignEmojiSets();
    createEntryButtons();

    battleBtn.addEventListener('click', handleBattleBtnClick);
    fireBtn.addEventListener('click', handleFire);
    window.addEventListener('resize', updateRenderPositions);
}

// 絵文字セット割り当て (重複なし)
function assignEmojiSets() {
    // EMOJISのインデックスをシャッフル
    const indices = EMOJIS.map((_, i) => i);
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // 各プレイヤーに割り当て
    // プレイヤー数は6人、EMOJISも6セットなのでちょうど1つずつ
    for (let i = 0; i < 6; i++) {
        if (i < indices.length) {
            playerEmojiSets[i] = EMOJIS[indices[i]];
        } else {
            // 万が一EMOJISが足りない場合はランダム(重複あり)で埋める
            playerEmojiSets[i] = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
        }
    }
}

function handleBattleBtnClick() {
    if (battleBtn.textContent === 'RESET') {
        resetGame();
    } else {
        startBattle();
    }
}

// --- エントリーUI関連 ---

function createEntryButtons() {
    COLORS.forEach((color, index) => {
        const btn = document.createElement('button');
        btn.className = 'entry-btn';
        btn.style.backgroundColor = color;
        btn.dataset.index = index;
        btn.addEventListener('click', (e) => handleEntryClick(index, e));

        if (index < 3) controlsLeft.appendChild(btn);
        else controlsRight.appendChild(btn);
    });
}

function handleEntryClick(index, event) {
    if (isPlaying) return;

    if (players[index]) {
        unregisterPlayer(index);
        closePopup(index); // 念のため閉じる（通常は開いてないはずだが）
    } else {
        if (activePopups[index]) {
            closePopup(index);
        } else {
            openPopup(index, event.currentTarget);
        }
    }
}

function openPopup(index, btnElement) {
    // 既存があれば閉じる
    if (activePopups[index]) closePopup(index);

    // ポップアップ要素作成
    const popupEl = document.createElement('div');
    popupEl.className = 'emoji-popup';

    const gridEl = document.createElement('div');
    gridEl.className = 'emoji-grid';
    popupEl.appendChild(gridEl);

    // 事前に割り当てられたセットを使用
    const emojiSet = playerEmojiSets[index];

    emojiSet.forEach(emoji => {
        const span = document.createElement('div');
        span.className = 'emoji-option';
        span.textContent = emoji;
        span.addEventListener('click', () => registerPlayer(index, emoji));
        gridEl.appendChild(span);
    });

    document.getElementById('game-container').appendChild(popupEl);
    activePopups[index] = popupEl;

    // 位置調整
    const btnRect = btnElement.getBoundingClientRect();

    // 画面からはみ出ないように簡易調整
    let top = btnRect.top - 14;
    // 左側ボタン(0-2)なら右に出す、右側ボタン(3-5)なら左に出す
    let left = index < 3 ? btnRect.right + 10 : btnRect.left - 128;

    popupEl.style.top = `${top}px`;
    popupEl.style.left = `${left}px`;
}

function closePopup(index) {
    const popupEl = activePopups[index];
    if (popupEl) {
        popupEl.remove();
        activePopups[index] = null;
    }
}

function updateEntryButtonState(index, emoji) {
    const btn = document.querySelector(`.entry-btn[data-index="${index}"]`);
    if (emoji) {
        btn.textContent = emoji;
        btn.classList.add('active');
    } else {
        btn.textContent = '';
        btn.classList.remove('active');
    }
}

// --- プレイヤーロジック ---

function registerPlayer(index, emoji) {
    // プレイヤーオブジェクト作成
    // 論理座標(x,y)は中心(0,0)、半径1.0の円内とする
    // 初期配置: 半径0.5の位置、60度ごと
    const angle = index * (Math.PI / 3);
    const startDist = 0.8;

    players[index] = {
        id: index,
        color: COLORS[index],
        emoji: emoji,
        x: Math.cos(angle) * startDist,
        y: Math.sin(angle) * startDist,
        vx: 0,
        vy: 0,
        radius: PLAYER_SCALE, // 論理サイズ
        state: 'ready', // ready, active, knockback, out

        // 行動AI用
        timer: 0,       // 行動残り時間(秒)
        moveDir: 0,     // 移動方向(ラジアン)

        // Element
        element: createPlayerElement(index, COLORS[index], emoji)
    };

    updateEntryButtonState(index, emoji);
    stage.appendChild(players[index].element);
    updateRenderPositions(); // 即座に描画反映
    closePopup(index);
    checkBattleReady();
}

function unregisterPlayer(index) {
    if (players[index]) {
        players[index].element.remove();
        players[index] = null;
    }
    updateEntryButtonState(index, null);
    checkBattleReady();
}

function createPlayerElement(index, color, emoji) {
    const el = document.createElement('div');
    el.className = 'player';
    el.id = `player-${index}`;
    // el.style.backgroundColor = color; // 背景色削除
    el.textContent = emoji;
    return el;
}

function checkBattleReady() {
    const count = players.filter(p => p).length;
    if (count >= 2) battleBtn.classList.remove('hidden');
    else battleBtn.classList.add('hidden');
}

// --- ゲームループ ---

function startBattle() {
    if (isPlaying) return;
    isPlaying = true;
    battleBtn.classList.add('hidden');
    winnerDisplay.textContent = '';

    // ポップアップを全て閉じる
    activePopups.forEach((popup, index) => {
        if (popup) closePopup(index);
    });

    // 全プレイヤーをactiveに
    players.forEach(p => {
        if (p) {
            p.state = 'active';
            // 最初の行動セット: 中央へ向かう
            setInitialMove(p);
        }
    });

    lastTime = performance.now();
    animationFrameId = requestAnimationFrame(gameLoop);

    // 3秒後にFIREボタン表示
    setTimeout(() => {
        if (isPlaying) {
            fireBtn.classList.remove('hidden');
            fireBtn.disabled = false;
        }
    }, 3000);
}

function handleFire() {
    if (!isPlaying) return;

    // NPC生成
    spawnNPC();

    // クールダウン (3秒)
    fireBtn.classList.add('hidden'); // 非表示にする
    // 「その後も3秒ごとにFIREが可能」: 自動連射ではなく、ボタンが3秒後にまた押せるようになると解釈
    // もし自動で3秒ごとに出現させたいなら setTimeoutで再帰的にspawnNPCを呼ぶが、
    // 「FIREボタンが表示され、押すと配置」なので手動トリガー + クールダウンとする
    setTimeout(() => {
        if (isPlaying) {
            fireBtn.classList.remove('hidden'); // 再表示
        }
    }, 3000);
}

function spawnNPC() {
    // 画面外から中心へ向かう
    // 角度ランダム (0 ~ 2PI)
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = 2.0; // ステージ半径の2倍（画面外）

    // 出現位置
    const x = Math.cos(angle) * spawnDist;
    const y = Math.sin(angle) * spawnDist;

    // 中心(0,0)へ向かう速度ベクトル
    const speed = BASE_SPEED * 2.0; // プレイヤーより少し速くしてみる
    const vx = -Math.cos(angle) * speed;
    const vy = -Math.sin(angle) * speed;

    // 要素作成
    const el = document.createElement('div');
    el.className = 'npc';
    el.textContent = '🤛';
    stage.appendChild(el);

    // 回転: 進行方向を向く
    // 進行方向の角度 = angle + PI (中心に向かうので出現角度の逆)
    // 絵文字🤛は左向き(180度)がデフォルト。
    // 進行方向が Left(PI) なら、回転0度でOK (Left = Left)
    // 進行方向が Right(0) なら、回転180度 (Left -> Right)
    // moveAngle = angle + PI
    // rotation = moveAngle - PI (絵文字の向き補正) = angle
    // 確認: 
    //   angle=0 (右から出現), move=Left(PI). Leftに向くには回転0. cssRot = 0deg. OK.
    //   angle=PI (左から出現), move=Right(0). Rightに向くには回転180. cssRot = 180deg = PI. OK.
    // つまり rotation = angle (rad) -> deg
    const deg = angle * (180 / Math.PI);
    el.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;

    npcs.push({
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        radius: 0.11, // 直径60px相当 (半径30px / ステージ半径270px = 0.111...)
        element: el
    });
}

let lastTime = 0;
function gameLoop(timestamp) {
    if (!isPlaying) return;

    const dt = (timestamp - lastTime) / 1000; // 秒単位の経過時間
    lastTime = timestamp;

    update(dt);
    render();

    animationFrameId = requestAnimationFrame(gameLoop);
}

function update(dt) {
    // 生存確認
    const activePlayers = players.filter(p => p && (p.state === 'active' || p.state === 'knockback'));

    // 勝利判定
    if (activePlayers.length <= 1) {
        handleWin(activePlayers[0]);
        return;
    }

    players.forEach(p => {
        if (!p || p.state === 'out') return;

        // 状態別更新
        if (p.state === 'active') {
            updatePlayerAI(p, dt);
        } else if (p.state === 'knockback') {
            updateKnockback(p, dt);
        }

        // 位置更新
        p.x += p.vx;
        p.y += p.vy;

        // 衝突判定 (自分以外の生存者と)
        activePlayers.forEach(other => {
            if (p !== other) {
                checkCollision(p, other);
            }
        });

        // 落下判定
        checkFall(p);
    });

    // NPC更新
    updateNPCs(dt, activePlayers);
}

function updateNPCs(dt, activePlayers) {
    for (let i = npcs.length - 1; i >= 0; i--) {
        const npc = npcs[i];

        // 移動 (直進のみ)
        npc.x += npc.vx;
        npc.y += npc.vy;

        // プレイヤーとの衝突判定
        activePlayers.forEach(p => {
            // プレイヤー -> NPC 衝突
            // NPCは影響受けない、プレイヤーだけ弾かれる
            const dx = p.x - npc.x;
            const dy = p.y - npc.y;
            const distSq = dx * dx + dy * dy;
            const minDist = p.radius + npc.radius;

            if (distSq < minDist * minDist) {
                // 衝突！ プレイヤーを弾く

                if (p.state !== 'knockback') {
                    p.savedDir = p.moveDir;
                }
                p.state = 'knockback';
                p.timer = 0.25;

                // 弾く方向: NPCの進行方向(vx, vy)と同じ向き
                const punchDir = Math.atan2(npc.vy, npc.vx);

                // 速度3倍で吹き飛ぶ
                p.vx = Math.cos(punchDir) * (BASE_SPEED * 3);
                p.vy = Math.sin(punchDir) * (BASE_SPEED * 3);
            }
        });

        // 画面外判定 (消滅)
        const dist = Math.sqrt(npc.x * npc.x + npc.y * npc.y);
        if (dist > 3.0) { // 十分遠く
            npc.element.remove();
            npcs.splice(i, 1);
        }
    }
}

function setInitialMove(p) {
    // 中央(0,0)への角度
    const angleToCenter = Math.atan2(-p.y, -p.x);
    // 0.4~1.0秒
    const duration = 0.4 + Math.random() * 0.6;

    p.moveDir = angleToCenter;
    p.timer = duration;

    // 速度設定
    updateVelocity(p);
}

function updatePlayerAI(p, dt) {
    p.timer -= dt;

    if (p.timer <= 0) {
        // 次の行動決定
        // 秒数: 0.2~0.8
        const duration = 0.2 + Math.random() * 0.6;

        // 向き変更: ステージ中央方向を中心に左右90度(=PI/2)以内
        const angleToCenter = Math.atan2(-p.y, -p.x);
        const turn = (Math.random() - 0.5) * Math.PI; // -PI/2 ~ +PI/2

        p.moveDir = angleToCenter + turn;
        p.timer = duration;

        updateVelocity(p);
    }
}

function updateVelocity(p) {
    p.vx = Math.cos(p.moveDir) * BASE_SPEED;
    p.vy = Math.sin(p.moveDir) * BASE_SPEED;
}

function updateKnockback(p, dt) {
    p.timer -= dt;
    if (p.timer <= 0) {
        // ノックバック終了 -> 通常AI再開
        p.state = 'active';
        // 元の進行方向に戻す
        if (p.savedDir !== undefined) {
            p.moveDir = p.savedDir;
            p.savedDir = undefined; // 保存した方向はクリア
        }
        p.timer = 0; // AI思考ですぐに新しい方向(元の方向+微調整)を決めるように
        updateVelocity(p);
    }
}

function checkCollision(p1, p2) {
    // 距離の2乗
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const distSq = dx * dx + dy * dy;
    const minDist = p1.radius + p2.radius;

    if (distSq < minDist * minDist) {
        // 衝突！
        // ルール: 進行方向と逆方向に0.5秒進む

        // 単純に反転
        startKnockback(p1);
        startKnockback(p2);

        // めり込み解消 (互いに離す)
        const angle = Math.atan2(dy, dx);
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;

        if (overlap > 0) {
            const moveX = Math.cos(angle) * overlap * 0.5;
            const moveY = Math.sin(angle) * overlap * 0.5;
            p1.x += moveX;
            p1.y += moveY;
            p2.x -= moveX;
            p2.y -= moveY;
        }
    }
}

function startKnockback(p) {
    // まだノックバックしていないなら、現在の本来の進行方向を保存
    if (p.state !== 'knockback') {
        p.savedDir = p.moveDir;
    }

    p.state = 'knockback';
    p.timer = 0.25; // 時間を半分に (0.5 -> 0.25)

    // 逆方向へ
    const knockbackDir = p.moveDir + Math.PI;

    // 速度を3倍に設定
    p.vx = Math.cos(knockbackDir) * (BASE_SPEED * 3);
    p.vy = Math.sin(knockbackDir) * (BASE_SPEED * 3);
}

function checkFall(p) {
    // 中心からの距離
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    // 完全に外れたら => radius + playerRadius
    const threshold = 1.0 + 0.05;

    if (dist > threshold) {
        p.state = 'out';
        // アニメーション
        const el = p.element;
        el.style.transition = 'transform 0.5s, opacity 0.5s';
        el.style.transform = 'translate(-50%, -50%) scale(0.1)';
        el.style.opacity = '0';

        setTimeout(() => {
            if (p.element) p.element.style.display = 'none';
        }, 500);
    }
}

function handleWin(winner) {
    isPlaying = false;
    cancelAnimationFrame(animationFrameId);

    if (winner) {
        winnerDisplay.textContent = `${winner.emoji} WIN!`;
        winnerDisplay.style.color = winner.color;
    } else {
        // 引き分け等（同時に落ちた場合）
        winnerDisplay.textContent = "DRAW";
        winnerDisplay.style.color = '#fff';
    }

    // 数秒後にリセット可能に?
    setTimeout(() => {
        battleBtn.textContent = "RESET";
        battleBtn.classList.remove('hidden');
        // battleBtn.onclick は init で設定済み
    }, 2000);
}

function resetGame() {
    // 既存プレイヤーをエントリー解除
    players.forEach((p, i) => {
        if (p) unregisterPlayer(i);
    });

    winnerDisplay.textContent = '';
    battleBtn.textContent = 'BATTLE!';
    // 一旦隠す（エントリー待ちのため）
    battleBtn.classList.add('hidden');
    isPlaying = false;

    // 次回のセット割り当て
    // 次回のセット割り当て
    assignEmojiSets();

    // NPCリセット
    npcs.forEach(n => n.element.remove());
    npcs = [];
    fireBtn.classList.add('hidden');
    fireBtn.disabled = false;
}

// 描画更新 (スタイル適用)
function render() {
    // ステージサイズ取得
    // getBoundingClientRectはborderを含むが、絶対配置の基準(offsetParent)はborderの内側(paddingBox)
    // そのため、width/2 を中心とすると border分だけ右下にズレる。
    // clientWidth/clientHeight (borderを含まない) を使用することで正しい中心を得る。
    const r = stage.clientWidth / 2;
    const cx = r;
    const cy = r;

    players.forEach(p => {
        if (!p) return;

        // 論理座標 -> ピクセル座標
        // y軸反転は不要（画面座標系: 下が+yで論理座標と同じに扱えばOK）
        // ただし通常数学座標は上が+yなので sin/cos の向きに注意。
        // ここでは画面座標系(右+x, 下+y)のまま角度計算しているのでそのままマッピング。

        const px = cx + p.x * r;
        const py = cy + p.y * r;

        p.element.style.left = `${px}px`;
        p.element.style.top = `${py}px`;

        // プレイヤーサイズも更新したほうがレスポンシブ
        // CSSで 5% 指定してるので基本OKだが、微調整したいならここで
    });

    // NPC描画
    npcs.forEach(npc => {
        const rect = stage.getBoundingClientRect();
        const r = rect.width / 2;
        const cx = r;
        const cy = r;

        const px = cx + npc.x * r;
        const py = cy + npc.y * r;
        npc.element.style.left = `${px}px`;
        npc.element.style.top = `${py}px`;
    });
}

function updateRenderPositions() {
    render();
}

// 実行
init();
