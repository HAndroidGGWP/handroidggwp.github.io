// ====== SPRITE ASSETS (dimuat dari folder /Assets) ======
const SPRITE_PATHS = {
  dirt: 'assets/sprites/blocks/dirt.png',
  rock: 'assets/sprites/blocks/rock.png',
  wood: 'assets/sprites/blocks/wood.png',
  lava: 'assets/sprites/blocks/lava.png',
  base_body: 'assets/sprites/characters/base_body.png',
  walk_sheet: 'assets/sprites/characters/walk_spritesheet.png',
  punch_sheet: 'assets/sprites/characters/punch_spritesheet.png',
  jump_sheet: 'assets/sprites/characters/jump_spritesheet.png',
  slot: 'assets/sprites/ui/inventory_slot.png',
  button: 'assets/sprites/ui/button.png',
};
const spriteImgs = {};
Object.keys(SPRITE_PATHS).forEach(k => {
  const img = new Image();
  img.src = SPRITE_PATHS[k];
  spriteImgs[k] = img;
});

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const TILE = 32; // sesuai ukuran sprite asli 32x32
const COLS = 100; // lebar dunia dalam jumlah blok
const ROWS = 100; // tinggi dunia dalam jumlah blok

// Block types dipetakan ke sprite. main/shade = fallback warna kalau tidak punya sprite.
const BLOCKS = {
  0: { name:'Udara', solid:false },
  1: { name:'Rumput', sprite:'dirt', topColor:'#5fbf4e', hard:2 },
  2: { name:'Tanah', sprite:'dirt', hard:2 },
  3: { name:'Batu', sprite:'rock', hard:4 },
  4: { name:'Kayu', sprite:'wood', hard:3 },
  5: { name:'Daun', main:'#4caf50', shade:'#357a38', hard:1, soft:true },
  6: { name:'Pasir', main:'#e8d190', shade:'#c9ac63', hard:1 },
  7: { name:'Bata', main:'#b5533c', shade:'#8a3d2b', hard:5 },
  10: { name:'Lava', sprite:'lava', hard:999, solid:true, lava:true },
};

// World generation
let world = [];
function generateWorld() {
  world = [];
  const groundLevel = Math.floor(ROWS * 0.45);
  const lavaZone = ROWS - 5; // dekat dasar dunia = zona lava
  for (let y = 0; y < ROWS; y++) {
    world[y] = [];
    for (let x = 0; x < COLS; x++) {
      let val = 0;
      const hillNoise = Math.sin(x * 0.3) * 2 + Math.sin(x * 0.08) * 3;
      const surfaceY = groundLevel + Math.floor(hillNoise);
      if (y === surfaceY) {
        val = 1; // rumput
      } else if (y > surfaceY && y < surfaceY + 4) {
        val = 2; // tanah
      } else if (y >= surfaceY + 4) {
        if (y >= lavaZone) {
          const lavaNoise = Math.sin(x * 0.5 + y) * 0.5 + Math.random() * 0.5;
          val = lavaNoise > 0.55 ? 10 : 3;
        } else {
          val = Math.random() < 0.06 ? 6 : 3;
        }
      }
      world[y][x] = val;
    }
  }
}
function findSurface(x) {
  for (let y = 0; y < ROWS; y++) {
    if (world[y][x] === 1) return y;
  }
  return -1;
}
generateWorld();

let breakProgress = {};

const player = {
  x: Math.floor(COLS/2) * TILE,
  y: 0,
  w: TILE,
  h: TILE,
  vx: 0, vy: 0,
  speed: 2.8,
  jumpPower: 8.2,
  onGround: false,
  facing: 1,
  walkFrame: 0,
  walkTimer: 0,
  punching: false,
  punchFrame: 0,
  punchTimer: 0,
  jumpFrame: 0,
  airTime: 0, // jumlah frame sejak kaki lepas dari tanah, dipakai untuk pilih pose lompat
};
(function placePlayer(){
  const px = Math.floor(player.x / TILE);
  const sy = findSurface(px);
  player.y = (sy - 3) * TILE;
})();

const GRAVITY = 0.4;
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key >= '1' && e.key <= '6') selectSlot(parseInt(e.key) - 1);
  if ([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function bindHold(el, keyName) {
  const press = (e) => { e.preventDefault(); keys[keyName] = true; el.classList.add('active'); };
  const release = (e) => { e.preventDefault(); keys[keyName] = false; el.classList.remove('active'); };
  el.addEventListener('touchstart', press, {passive:false});
  el.addEventListener('touchend', release, {passive:false});
  el.addEventListener('touchcancel', release, {passive:false});
  el.addEventListener('mousedown', press);
  el.addEventListener('mouseup', release);
  el.addEventListener('mouseleave', release);
}
bindHold(document.getElementById('btnLeft'), 'a');
bindHold(document.getElementById('btnRight'), 'd');
bindHold(document.getElementById('btnJump'), ' ');

// ====== ZOOM ======
let zoom = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.15;
function setZoom(z) {
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}
document.getElementById('btnZoomIn').addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
document.getElementById('btnZoomOut').addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
document.getElementById('btnZoomIn').addEventListener('touchstart', e => { e.preventDefault(); setZoom(zoom + ZOOM_STEP); }, {passive:false});
document.getElementById('btnZoomOut').addEventListener('touchstart', e => { e.preventDefault(); setZoom(zoom - ZOOM_STEP); }, {passive:false});

// zoom pakai scroll wheel mouse (desktop)
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  setZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
}, {passive:false});

// zoom pakai pinch dua jari (mobile/touch)
let pinchStartDist = null;
let pinchStartZoom = 1;
canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchStartDist = Math.hypot(dx, dy);
    pinchStartZoom = zoom;
  }
}, {passive:true});
canvas.addEventListener('touchmove', e => {
  if (e.touches.length === 2 && pinchStartDist) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    setZoom(pinchStartZoom * (dist / pinchStartDist));
  }
}, {passive:false});
canvas.addEventListener('touchend', e => {
  if (e.touches.length < 2) pinchStartDist = null;
}, {passive:true});

// ====== FULLSCREEN LANDSCAPE ======
const gameContainer = document.getElementById('gameContainer');
const btnFullscreen = document.getElementById('btnFullscreen');

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

async function enterFullscreen() {
  const el = gameContainer;
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch (err) {
    showMsg('Fullscreen tidak didukung');
    return;
  }
  // coba kunci orientasi ke landscape (hanya berfungsi di sebagian browser mobile)
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (err) {
    // diabaikan - beberapa browser (mis. iOS Safari) tidak mendukung orientation lock
  }
}

function exitFullscreen() {
  if (document.exitFullscreen) document.exitFullscreen();
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
}

function toggleFullscreen() {
  if (isFullscreen()) exitFullscreen();
  else enterFullscreen();
}

btnFullscreen.addEventListener('click', toggleFullscreen);
btnFullscreen.addEventListener('touchstart', e => { e.preventDefault(); toggleFullscreen(); }, {passive:false});

function onFullscreenChange() {
  btnFullscreen.textContent = isFullscreen() ? '⤢' : '⛶';
  if (!isFullscreen() && screen.orientation && screen.orientation.unlock) {
    try { screen.orientation.unlock(); } catch (err) {}
  }
}
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

// Tombol pukul (touch) - menggali blok di depan karakter
let touchPunchActive = false;
const btnPunch = document.getElementById('btnPunch');
function punchPress(e) { e.preventDefault(); touchPunchActive = true; btnPunch.classList.add('active'); }
function punchRelease(e) { e.preventDefault(); touchPunchActive = false; btnPunch.classList.remove('active'); }
btnPunch.addEventListener('touchstart', punchPress, {passive:false});
btnPunch.addEventListener('touchend', punchRelease, {passive:false});
btnPunch.addEventListener('touchcancel', punchRelease, {passive:false});
btnPunch.addEventListener('mousedown', punchPress);
btnPunch.addEventListener('mouseup', punchRelease);
btnPunch.addEventListener('mouseleave', punchRelease);

const hotbarBlocks = [1,2,3,4,5,7];
let selectedSlot = 0;
let inventory = {1:0,2:0,3:0,4:0,5:0,6:0,7:0};

function buildHotbar() {
  const bar = document.getElementById('hotbar');
  bar.innerHTML = '';
  hotbarBlocks.forEach((bid, i) => {
    const b = BLOCKS[bid];
    const div = document.createElement('div');
    div.className = 'slot' + (i === selectedSlot ? ' selected' : '');
    div.style.backgroundImage = `url(${SPRITE_PATHS.slot})`;
    div.style.backgroundSize = 'cover';
    div.title = b.name;
    div.onclick = () => selectSlot(i);
    if (b.sprite) {
      const icon = document.createElement('img');
      icon.className = 'icon';
      icon.src = SPRITE_PATHS[b.sprite];
      div.appendChild(icon);
    } else {
      const swatch = document.createElement('div');
      swatch.style.cssText = `width:24px;height:24px;background:${b.main};border-radius:3px;`;
      div.appendChild(swatch);
    }
    const span = document.createElement('span');
    span.textContent = inventory[bid] || 0;
    div.appendChild(span);
    bar.appendChild(div);
  });
}
function selectSlot(i) {
  if (i < 0 || i >= hotbarBlocks.length) return;
  selectedSlot = i;
  buildHotbar();
}
buildHotbar();

function showMsg(text) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.style.opacity = 1;
  clearTimeout(showMsg._t);
  showMsg._t = setTimeout(() => el.style.opacity = 0, 900);
}

function isSolid(col, row) {
  if (row < 0) return false;
  if (row >= ROWS || col < 0 || col >= COLS) return true;
  const b = BLOCKS[world[row][col]];
  return b && b.solid !== false && !b.soft;
}

function updatePlayer() {
  player.vx = 0;
  let moving = false;
  player.punching = mouse.down || touchPunchActive;
  if (keys['a'] || keys['arrowleft']) { player.vx = -player.speed; player.facing = -1; moving = true; }
  if (keys['d'] || keys['arrowright']) { player.vx = player.speed; player.facing = 1; moving = true; }

  if ((keys[' '] || keys['w'] || keys['arrowup']) && player.onGround) {
    player.vy = -player.jumpPower;
    player.onGround = false;
  }

  player.vy += GRAVITY;
  if (player.vy > 11) player.vy = 11;

  let newX = player.x + player.vx;
  if (!collideAt(newX, player.y)) player.x = newX;

  let newY = player.y + player.vy;
  if (!collideAt(player.x, newY)) {
    player.y = newY;
    player.onGround = false;
  } else {
    if (player.vy > 0) player.onGround = true;
    player.vy = 0;
  }

  player.x = Math.max(0, Math.min(player.x, COLS*TILE - player.w));
  if (player.y > ROWS*TILE) { player.y = 0; player.vy = 0; }

  if (moving && player.onGround) {
    player.walkTimer++;
    if (player.walkTimer > 6) { player.walkTimer = 0; player.walkFrame = (player.walkFrame + 1) % 4; }
  } else {
    player.walkFrame = 0; player.walkTimer = 0;
  }

  if (player.punching) {
    player.punchTimer++;
    if (player.punchTimer > 4) { player.punchTimer = 0; player.punchFrame = (player.punchFrame + 1) % 3; }
  } else {
    player.punchFrame = 0;
  }

  // Animasi lompat: 4 frame di jump_spritesheet.png = [jongkok tolakan, naik, melayang, jatuh]
  if (!player.onGround) {
    player.airTime++;
    if (player.airTime < 6) player.jumpFrame = 0;          // baru lepas landas - pose jongkok/tolak
    else if (player.vy < -1) player.jumpFrame = 1;          // masih naik kencang
    else if (player.vy < 2) player.jumpFrame = 2;           // dekat puncak / melayang
    else player.jumpFrame = 3;                              // sedang jatuh
  } else {
    player.airTime = 0;
    player.jumpFrame = 0;
  }

  document.getElementById('posInfo').textContent =
    `Posisi: (${Math.floor(player.x/TILE)}, ${Math.floor(player.y/TILE)})`;
}

function collideAt(x, y) {
  const left = Math.floor(x / TILE);
  const right = Math.floor((x + player.w - 1) / TILE);
  const top = Math.floor(y / TILE);
  const bottom = Math.floor((y + player.h - 1) / TILE);
  for (let c = left; c <= right; c++) {
    for (let r = top; r <= bottom; r++) {
      if (isSolid(c, r)) return true;
    }
  }
  return false;
}

let camX = 0, camY = 0;
function updateCamera() {
  const viewW = canvas.width / zoom;
  const viewH = canvas.height / zoom;
  camX = player.x + player.w/2 - viewW/2;
  camY = player.y + player.h/2 - viewH/2;
  camX = Math.max(0, Math.min(camX, Math.max(0, COLS*TILE - viewW)));
  camY = Math.max(0, Math.min(camY, Math.max(0, ROWS*TILE - viewH)));
}

let mouse = { x: 0, y: 0, down: false };
// Konversi koordinat layar (CSS px) ke koordinat internal canvas (800x480),
// perlu karena canvas bisa di-stretch via CSS saat fullscreen.
function toCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}
canvas.addEventListener('mousemove', e => {
  const p = toCanvasCoords(e.clientX, e.clientY);
  mouse.x = p.x; mouse.y = p.y;
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { mouse.down = true; player.punching = true; }
  if (e.button === 2) { tryPlace(); }
});
canvas.addEventListener('mouseup', e => {
  if (e.button === 0) { mouse.down = false; player.punching = false; }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  const p = toCanvasCoords(t.clientX, t.clientY);
  mouse.x = p.x; mouse.y = p.y;
  mouse.down = true; player.punching = true;
}, {passive:true});
canvas.addEventListener('touchend', () => { mouse.down = false; player.punching = false; }, {passive:true});

function getTargetTile() {
  if (touchPunchActive) {
    const pcx = player.x + player.w/2, pcy = player.y + player.h/2;
    const targetWX = pcx + player.facing * TILE;
    const col = Math.floor(targetWX / TILE);
    const row = Math.floor(pcy / TILE);
    return { col, row };
  }
  if (!mouse.down) return null; // hanya tampilkan highlight selagi benar-benar menekan/menahan untuk menggali, bukan dari tap terakhir yang sudah dilepas
  const wx = mouse.x / zoom + camX;
  const wy = mouse.y / zoom + camY;
  const col = Math.floor(wx / TILE);
  const row = Math.floor(wy / TILE);
  const pcx = player.x + player.w/2, pcy = player.y + player.h/2;
  const dist = Math.hypot((col*TILE+TILE/2) - pcx, (row*TILE+TILE/2) - pcy);
  if (dist > TILE * 5.5) return null;
  return { col, row };
}

function tryPlace() {
  const t = getTargetTile();
  if (!t) return;
  const { col, row } = t;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  if (world[row][col] !== 0) return;
  const bid = hotbarBlocks[selectedSlot];
  if (inventory[bid] > 0) {
    const tempCollide = (col*TILE < player.x+player.w) && (col*TILE+TILE > player.x) &&
                         (row*TILE < player.y+player.h) && (row*TILE+TILE > player.y);
    if (tempCollide) return;
    world[row][col] = bid;
    inventory[bid]--;
    buildHotbar();
  } else {
    showMsg('Blok habis!');
  }
}

function updateDigging() {
  const digging = mouse.down || touchPunchActive;
  if (!digging) { breakProgress = {}; return; }
  const t = getTargetTile();
  if (!t) { breakProgress = {}; return; }
  const { col, row } = t;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  const bid = world[row][col];

  if (bid === 0) {
    // ruang kosong, tidak ada yang bisa digali di sini
    return;
  }

  const block = BLOCKS[bid];
  const key = col + ',' + row;
  breakProgress[key] = (breakProgress[key] || 0) + 1;
  const neededFrames = block.hard * 12;
  if (breakProgress[key] >= neededFrames) {
    world[row][col] = 0;
    inventory[bid] = (inventory[bid] || 0) + 1;
    delete breakProgress[key];
    buildHotbar();
    updateInvInfo();
  }
}
function updateInvInfo() {
  const total = Object.values(inventory).reduce((a,b)=>a+b, 0);
  document.getElementById('invInfo').textContent = `Item terkumpul: ${total}`;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(zoom, zoom);
  const viewW = canvas.width / zoom;
  const viewH = canvas.height / zoom;
  ctx.fillStyle = '#cdeeff';
  ctx.fillRect(0,0,viewW,viewH);

  const startCol = Math.floor(camX / TILE);
  const endCol = startCol + Math.ceil(viewW / TILE) + 1;
  const startRow = Math.floor(camY / TILE);
  const endRow = startRow + Math.ceil(viewH / TILE) + 1;

  for (let row = startRow; row <= endRow; row++) {
    if (row < 0 || row >= ROWS) continue;
    for (let col = startCol; col <= endCol; col++) {
      if (col < 0 || col >= COLS) continue;
      const bid = world[row][col];
      if (bid === 0) continue;
      const b = BLOCKS[bid];
      const sx = col*TILE - camX;
      const sy = row*TILE - camY;

      if (b.sprite && spriteImgs[b.sprite] && spriteImgs[b.sprite].complete) {
        ctx.drawImage(spriteImgs[b.sprite], sx, sy, TILE, TILE);
        if (b.topColor) {
          ctx.fillStyle = b.topColor;
          ctx.fillRect(sx, sy, TILE, 5);
        }
      } else {
        ctx.fillStyle = b.main || '#999';
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = b.shade || '#666';
        ctx.fillRect(sx, sy+TILE-4, TILE, 4);
      }

      const key = col+','+row;
      if (breakProgress[key]) {
        const progress = breakProgress[key] / (b.hard*12);
        ctx.fillStyle = `rgba(0,0,0,${0.55*progress})`;
        ctx.fillRect(sx, sy, TILE, TILE);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.strokeRect(sx, sy, TILE, TILE);
    }
  }

  const t = getTargetTile();
  if (t && t.col>=0 && t.col<COLS && t.row>=0 && t.row<ROWS) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(t.col*TILE-camX, t.row*TILE-camY, TILE, TILE);
  }

  drawPlayer();
  ctx.restore();
}

function drawPlayer() {
  const px = player.x - camX;
  const py = player.y - camY;
  ctx.save();

  let sheet, frameIndex;
  if (player.punching) {
    sheet = spriteImgs.punch_sheet; frameIndex = player.punchFrame;
  } else if (!player.onGround) {
    sheet = spriteImgs.jump_sheet; frameIndex = player.jumpFrame;
  } else if (player.walkFrame > 0 || (keys['a']||keys['d']||keys['arrowleft']||keys['arrowright'])) {
    sheet = spriteImgs.walk_sheet; frameIndex = player.walkFrame;
  } else {
    sheet = null;
  }

  const drawH = player.h;
  const drawW = TILE;
  const drawX = px - (drawW - player.w)/2;

  if (player.facing < 0) {
    ctx.translate(drawX + drawW, py);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(drawX, py);
  }

  if (sheet && sheet.complete) {
    ctx.drawImage(sheet, frameIndex*TILE, 0, TILE, TILE, 0, 0, drawW, drawH);
  } else if (spriteImgs.base_body && spriteImgs.base_body.complete) {
    ctx.drawImage(spriteImgs.base_body, 0, 0, TILE, TILE, 0, 0, drawW, drawH);
  } else {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, drawW, drawH);
  }
  ctx.restore();
}

function loop() {
  updatePlayer();
  updateCamera();
  updateDigging();
  draw();
  requestAnimationFrame(loop);
}
loop();
