const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const PREVIEW_SIZE = 4;
const PREVIEW_CELL = 20;
const BASE_DROP_INTERVAL = 900;
const SPEED_UP_EVERY_PIECES = 4;
const SPEED_STEP = 0.35;

const COLORS = {
  I: "#35d0ff",
  O: "#ffd166",
  T: "#c77dff",
  S: "#66e08a",
  Z: "#ff6b6b",
  J: "#5b8cff",
  L: "#ff9f43",
  ghost: "rgba(255, 255, 255, 0.18)",
  grid: "rgba(255, 255, 255, 0.07)",
};

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const holdCanvas = document.getElementById("hold");
const holdCtx = holdCanvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");
const piecesEl = document.getElementById("pieces");
const linesEl = document.getElementById("lines");
const speedEl = document.getElementById("speed");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayMessage = document.getElementById("overlay-message");

holdCanvas.tabIndex = 0;
holdCanvas.setAttribute("role", "button");
holdCanvas.setAttribute("aria-label", "HOLD");

ctx.scale(BLOCK, BLOCK);

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function rotateMatrix(matrix, dir) {
  const result = matrix.map((_, index) => matrix.map((row) => row[index]));
  return dir > 0 ? result.map((row) => row.reverse()) : result.reverse();
}

function randomBag() {
  const bag = Object.keys(SHAPES);
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

const state = {
  board: createBoard(),
  bag: [],
  lines: 0,
  pieces: 0,
  dropCounter: 0,
  dropInterval: BASE_DROP_INTERVAL,
  lastTime: 0,
  speedMultiplier: 1,
  paused: false,
  gameOver: false,
  holdLocked: false,
  activeTouchId: null,
  touchStartX: 0,
  touchStartY: 0,
  touchLastX: 0,
  touchLastY: 0,
  touchStartPieceX: 0,
  touchMoved: false,
  player: null,
  hold: null,
  next: null,
};

function getNextType() {
  if (state.bag.length === 0) {
    state.bag = randomBag();
  }
  return state.bag.pop();
}

function createPiece(type) {
  const matrix = cloneMatrix(SHAPES[type]);
  return {
    type,
    matrix,
    pos: {
      x: Math.floor(COLS / 2) - Math.ceil(matrix[0].length / 2),
      y: -getTopPadding(matrix),
    },
  };
}

function getTopPadding(matrix) {
  let padding = 0;
  for (const row of matrix) {
    if (row.every((cell) => cell === 0)) {
      padding += 1;
    } else {
      break;
    }
  }
  return padding;
}

function spawnPiece() {
  state.player = state.next || createPiece(getNextType());
  state.player.pos.x = Math.floor(COLS / 2) - Math.ceil(state.player.matrix[0].length / 2);
  state.player.pos.y = -getTopPadding(state.player.matrix);
  state.next = createPiece(getNextType());
  state.holdLocked = false;

  if (collides(state.board, state.player)) {
    setGameOver();
  }
}

function registerPieceProgress() {
  state.pieces += 1;
  updateSpeedFromPieces();
  updateStats();
}

function collides(board, piece, offsetX = 0, offsetY = 0, matrix = piece.matrix) {
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[y].length; x += 1) {
      if (!matrix[y][x]) {
        continue;
      }

      const boardX = piece.pos.x + x + offsetX;
      const boardY = piece.pos.y + y + offsetY;

      if (boardX < 0 || boardX >= COLS) {
        return true;
      }

      if (boardY < 0) {
        continue;
      }

      if (boardY >= ROWS) {
        continue;
      }

      if (board[boardY][boardX]) {
        return true;
      }
    }
  }
  return false;
}

function merge(board, piece) {
  piece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      const boardY = piece.pos.y + y;
      if (boardY < 0 || boardY >= ROWS) {
        return;
      }
      board[boardY][piece.pos.x + x] = piece.type;
    });
  });
}

function isPieceFullyBelowBoard(piece) {
  return piece.matrix.every((row, y) => {
    if (row.every((cell) => cell === 0)) {
      return true;
    }
    return piece.pos.y + y >= ROWS;
  });
}

function skipCurrentPiece() {
  registerPieceProgress();
  spawnPiece();
}

function clearLines() {
  let cleared = 0;
  outer: for (let y = ROWS - 1; y >= 0; y -= 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!state.board[y][x]) {
        continue outer;
      }
    }

    const row = state.board.splice(y, 1)[0].fill(0);
    state.board.unshift(row);
    cleared += 1;
    y += 1;
  }

  if (cleared > 0) {
    state.lines += cleared;
    updateStats();
  }
}

function updateSpeedFromPieces() {
  const speedLevel = Math.floor(state.pieces / SPEED_UP_EVERY_PIECES);
  state.speedMultiplier = 1 + speedLevel * SPEED_STEP;
  state.dropInterval = BASE_DROP_INTERVAL / state.speedMultiplier;
}

function updateStats() {
  piecesEl.textContent = String(state.pieces);
  linesEl.textContent = String(state.lines);
  speedEl.textContent = `${(BASE_DROP_INTERVAL / state.dropInterval).toFixed(2)}x`;
}

function resetPiecePosition(piece) {
  piece.pos.x = Math.floor(COLS / 2) - Math.ceil(piece.matrix[0].length / 2);
  piece.pos.y = -getTopPadding(piece.matrix);
}

function holdPiece() {
  if (state.gameOver || state.paused || state.holdLocked) {
    return;
  }

  const currentType = state.player.type;

  if (state.hold) {
    const swapType = state.hold;
    state.hold = currentType;
    state.player = createPiece(swapType);
    resetPiecePosition(state.player);
    if (collides(state.board, state.player)) {
      setGameOver();
      return;
    }
  } else {
    state.hold = currentType;
    state.player = state.next;
    resetPiecePosition(state.player);
    state.next = createPiece(getNextType());
    if (collides(state.board, state.player)) {
      setGameOver();
      return;
    }
  }

  state.holdLocked = true;
}

function hardDrop() {
  if (state.gameOver || state.paused) {
    return;
  }

  while (!collides(state.board, state.player, 0, 1)) {
    state.player.pos.y += 1;
    if (isPieceFullyBelowBoard(state.player)) {
      skipCurrentPiece();
      return;
    }
  }
  lockPiece();
}

function playerMove(dir) {
  if (state.gameOver || state.paused) {
    return;
  }
  state.player.pos.x += dir;
  if (collides(state.board, state.player)) {
    state.player.pos.x -= dir;
  }
}

function playerRotate(dir) {
  if (state.gameOver || state.paused) {
    return;
  }
  const rotated = rotateMatrix(state.player.matrix, dir);
  const kicks = [0, -1, 1, -2, 2];
  for (const offset of kicks) {
    if (!collides(state.board, state.player, offset, 0, rotated)) {
      state.player.pos.x += offset;
      state.player.matrix = rotated;
      return;
    }
  }
}

function softDrop() {
  if (state.gameOver || state.paused) {
    return;
  }
  playerDrop();
}

function playerDrop() {
  if (state.gameOver || state.paused) {
    return;
  }

  if (!collides(state.board, state.player, 0, 1)) {
    state.player.pos.y += 1;
    if (isPieceFullyBelowBoard(state.player)) {
      skipCurrentPiece();
    }
    return;
  }

  lockPiece();
}

function lockPiece() {
  merge(state.board, state.player);
  clearLines();
  registerPieceProgress();
  spawnPiece();
}

function getGhostY() {
  const ghost = {
    matrix: state.player.matrix,
    pos: { ...state.player.pos },
  };

  while (!collides(state.board, ghost, 0, 1)) {
    ghost.pos.y += 1;
    if (isPieceFullyBelowBoard(ghost)) {
      break;
    }
  }

  return ghost.pos.y;
}

function drawCell(context, x, y, color) {
  context.fillStyle = color;
  context.fillRect(x, y, 1, 1);
  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.lineWidth = 0.08;
  context.strokeRect(x, y, 1, 1);
}

function drawPreviewCell(context, x, y, color) {
  context.fillStyle = color;
  context.fillRect(x * PREVIEW_CELL, y * PREVIEW_CELL, PREVIEW_CELL, PREVIEW_CELL);
  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.lineWidth = 1;
  context.strokeRect(x * PREVIEW_CELL, y * PREVIEW_CELL, PREVIEW_CELL, PREVIEW_CELL);
}

function drawBoard() {
  ctx.fillStyle = "#09101f";
  ctx.fillRect(0, 0, COLS, ROWS);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 0.05;
      ctx.strokeRect(x, y, 1, 1);
      const cell = state.board[y][x];
      if (cell) {
        drawCell(ctx, x, y, COLORS[cell]);
      }
    }
  }
}

function drawMatrix(matrix, pos, colorMap, options = {}) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      const drawX = pos.x + x;
      const sourceY = pos.y + y;
      const drawY = options.wrap ? sourceY : sourceY;
      if (drawY < 0 || drawY >= ROWS) {
        return;
      }
      drawCell(ctx, drawX, drawY, colorMap);
    });
  });
}

function drawPlayer() {
  const ghostY = getGhostY();
  drawMatrix(state.player.matrix, { x: state.player.pos.x, y: ghostY }, COLORS.ghost, { wrap: true });

  state.player.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      const drawY = state.player.pos.y + y;
      if (drawY < 0 || drawY >= ROWS) {
        return;
      }
      drawCell(ctx, state.player.pos.x + x, drawY, COLORS[state.player.type]);
    });
  });
}

function drawNext() {
  drawPreview(nextCtx, state.next);
}

function drawHold() {
  drawPreview(holdCtx, state.hold ? createPiece(state.hold) : null);
}

function getPreviewBounds(matrix) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
  });

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function drawPreview(context, piece) {
  const previewPixelSize = PREVIEW_SIZE * PREVIEW_CELL;
  context.clearRect(0, 0, previewPixelSize, previewPixelSize);
  context.fillStyle = "#09101f";
  context.fillRect(0, 0, previewPixelSize, previewPixelSize);

  if (!piece) {
    return;
  }

  const { matrix, type } = piece;
  const bounds = getPreviewBounds(matrix);
  const offsetX = (PREVIEW_SIZE - bounds.width) / 2 - bounds.minX;
  const offsetY = (PREVIEW_SIZE - bounds.height) / 2 - bounds.minY;
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }
      drawPreviewCell(context, offsetX + x, offsetY + y, COLORS[type]);
    });
  });
}

function draw() {
  drawBoard();
  drawPlayer();
  drawHold();
  drawNext();
}

function setOverlay(title, message, visible) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  overlay.classList.toggle("hidden", !visible);
}

function setGameOver() {
  state.gameOver = true;
  setOverlay("Game Over", "画面を再読み込みして再開");
}

function togglePause() {
  if (state.gameOver) {
    return;
  }
  state.paused = !state.paused;
  setOverlay(state.paused ? "Paused" : "", state.paused ? "Pでもどる" : "", state.paused);
}

function resetGame() {
  state.board = createBoard();
  state.bag = [];
  state.lines = 0;
  state.pieces = 0;
  state.dropCounter = 0;
  state.dropInterval = BASE_DROP_INTERVAL;
  state.lastTime = 0;
  state.speedMultiplier = 1;
  state.paused = false;
  state.gameOver = false;
  state.holdLocked = false;
  state.player = null;
  state.hold = null;
  state.next = createPiece(getNextType());
  updateStats();
  setOverlay("", "", false);
  spawnPiece();
  draw();
}

function update(time = 0) {
  const deltaTime = time - state.lastTime;
  state.lastTime = time;

  if (!state.paused && !state.gameOver) {
    state.dropCounter += deltaTime;
    while (state.dropCounter > state.dropInterval && !state.paused && !state.gameOver) {
      playerDrop();
      state.dropCounter -= state.dropInterval;
    }
  }

  draw();
  requestAnimationFrame(update);
}

window.addEventListener("keydown", (event) => {
  switch (event.code) {
    case "ArrowLeft":
      event.preventDefault();
      playerMove(-1);
      break;
    case "ArrowRight":
      event.preventDefault();
      playerMove(1);
      break;
    case "ArrowDown":
      event.preventDefault();
      softDrop();
      break;
    case "ArrowUp":
    case "KeyX":
      event.preventDefault();
      playerRotate(1);
      break;
    case "KeyZ":
      event.preventDefault();
      playerRotate(-1);
      break;
    case "Space":
      event.preventDefault();
      hardDrop();
      break;
    case "KeyC":
      event.preventDefault();
      holdPiece();
      break;
    case "KeyP":
      togglePause();
      break;
    default:
      break;
  }
});

function handleTouchStart(clientX, clientY, touchId = null) {
  state.activeTouchId = touchId;
  state.touchStartX = clientX;
  state.touchStartY = clientY;
  state.touchLastX = clientX;
  state.touchLastY = clientY;
  state.touchStartPieceX = state.player ? state.player.pos.x : 0;
  state.touchMoved = false;
}

function handleTouchMove(clientX, clientY, touchId = null) {
  if (state.activeTouchId !== null && touchId !== null && state.activeTouchId !== touchId) {
    return;
  }

  if (!state.player || state.gameOver || state.paused) {
    return;
  }

  const dx = clientX - state.touchStartX;
  const dy = clientY - state.touchStartY;
  const dragThreshold = 10;
  const horizontalStep = BLOCK;

  state.touchLastX = clientX;
  state.touchLastY = clientY;

  if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) {
    state.touchMoved = true;
  }

  if (Math.abs(dx) <= dragThreshold || Math.abs(dx) <= Math.abs(dy)) {
    return;
  }

  const targetOffset = Math.trunc(dx / horizontalStep);
  const targetX = state.touchStartPieceX + targetOffset;

  while (state.player.pos.x < targetX) {
    const previousX = state.player.pos.x;
    playerMove(1);
    if (state.player.pos.x === previousX) {
      break;
    }
  }

  while (state.player.pos.x > targetX) {
    const previousX = state.player.pos.x;
    playerMove(-1);
    if (state.player.pos.x === previousX) {
      break;
    }
  }
}

function handleTouchEnd(clientX, clientY, touchId = null) {
  if (state.activeTouchId !== null && touchId !== null && state.activeTouchId !== touchId) {
    return;
  }

  const dx = clientX - state.touchStartX;
  const dy = clientY - state.touchStartY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const swipeThreshold = 24;

  state.activeTouchId = null;

  if (absX < swipeThreshold && absY < swipeThreshold) {
    playerRotate(1);
    return;
  }

  if (dy > swipeThreshold && absY > absX) {
    hardDrop();
  }
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch") {
    return;
  }

  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  handleTouchStart(event.clientX, event.clientY, event.pointerId);
});

canvas.addEventListener("pointerup", (event) => {
  if (event.pointerType !== "touch") {
    return;
  }

  event.preventDefault();
  handleTouchEnd(event.clientX, event.clientY, event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "touch") {
    return;
  }

  event.preventDefault();
  handleTouchMove(event.clientX, event.clientY, event.pointerId);
});

canvas.addEventListener("pointercancel", (event) => {
  if (event.pointerType !== "touch") {
    return;
  }

  event.preventDefault();
  state.activeTouchId = null;
});

canvas.addEventListener(
  "touchstart",
  (event) => {
    event.preventDefault();

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    handleTouchStart(touch.clientX, touch.clientY, touch.identifier);
  },
  { passive: false }
);

canvas.addEventListener(
  "touchend",
  (event) => {
    event.preventDefault();

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    handleTouchEnd(touch.clientX, touch.clientY, touch.identifier);
  },
  { passive: false }
);

canvas.addEventListener(
  "touchmove",
  (event) => {
    event.preventDefault();

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    handleTouchMove(touch.clientX, touch.clientY, touch.identifier);
  },
  { passive: false }
);

canvas.addEventListener(
  "touchcancel",
  (event) => {
    event.preventDefault();
    state.activeTouchId = null;
  },
  { passive: false }
);

function triggerHoldInput(event) {
  event.preventDefault();
  event.stopPropagation();
  holdPiece();
}

holdCanvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
});

holdCanvas.addEventListener("pointerup", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  if (event.pointerType === "touch" || event.pointerType === "pen") {
    return;
  }

  triggerHoldInput(event);
});

holdCanvas.addEventListener(
  "touchend",
  (event) => {
    triggerHoldInput(event);
  },
  { passive: false }
);

holdCanvas.addEventListener("click", (event) => {
  triggerHoldInput(event);
});

holdCanvas.addEventListener("keydown", (event) => {
  if (event.code !== "Enter" && event.code !== "Space") {
    return;
  }

  triggerHoldInput(event);
});

resetGame();
update();
