// ====== SPRITE ASSETS (dimuat dari folder /Assets) ======
const SPRITE_PATHS = {
  dirt: 'assets/sprites/blocks/dirt.png',
  rock: 'assets/sprites/blocks/rock.png',
  wood: 'assets/sprites/blocks/wood.png',
  lava: 'assets/sprites/blocks/lava.png',
  cavebg: 'assets/sprites/backgrounds/cavewall.png',
  base_body: 'assets/sprites/characters/base_body.png',
  walk_sheet: 'assets/sprites/characters/walk_spritesheet.png',
  punch_sheet: 'assets/sprites/characters/punch_spritesheet.png',
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

// Wallpaper latar belakang gua yang terlihat setelah cavewall dihancurkan
// (dibuat secara prosedural agar tidak bergantung pada file sprite tambahan)
const deepBgCanvas = document.createElement('canvas');
deepBgCanvas.width = TILE * 4;
deepBgCanvas.height = TILE * 4;
(function buildDeepBgPattern() {
  const c = deepBgCanvas.getContext('2d');
  const grad = c.createLinearGradient(0, 0, 0, deepBgCanvas.height);
  grad.addColorStop(0, '#0a1a3a');
  grad.addColorStop(1, '#12295c');
  c.fillStyle = grad;
  c.fillRect(0, 0, deepBgCanvas.width, deepBgCanvas.height);
  // bintik-bintik lembut mirip batu/kristal di kejauhan
  const rand = (seed => () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  })(42);
  for (let i = 0; i < 90; i++) {
    const x = rand() * deepBgCanvas.width;
    const y = rand() * deepBgCanvas.height;
    const r = rand() * 1.6 + 0.4;
    c.fillStyle = `rgba(255,255,255,${0.03 + rand()*0.05})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI*2);
    c.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = rand() * deepBgCanvas.width;
    const y = rand() * deepBgCanvas.height;
    const r = rand() * 3 + 1.5;
    c.fillStyle = `rgba(70,140,255,${0.08 + rand()*0.08})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI*2);
    c.fill();
  }
})();
let deepBgPattern = null;

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
let bgWorld = []; // layer dinding gua (cavewall) di belakang ruang kosong bawah tanah
const CAVEWALL_HARD = 2; // tingkat kekerasan dinding gua (relatif terhadap blok lain)
function generateWorld() {
  world = [];
  bgWorld = [];
  const groundLevel = Math.floor(ROWS * 0.45);
  const lavaZone = ROWS - 5; // dekat dasar dunia = zona lava
  const undergroundStart = groundLevel + 1;
  for (let y = 0; y < ROWS; y++) {
    world[y] = [];
    bgWorld[y] = [];
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
      // dinding gua ada di setiap ruang kosong (udara) di bawah tanah
      bgWorld[y][x] = (val === 0 && y >= undergroundStart) ? 1 : 0;
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
  camX = player.x - canvas.width/2;
  camY = player.y - canvas.height/2;
  camX = Math.max(0, Math.min(camX, COLS*TILE - canvas.width));
  camY = Math.max(0, Math.min(camY, ROWS*TILE - canvas.height));
}

let mouse = { x: 0, y: 0, down: false };
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
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
  const t = e.touches[0]; const rect = canvas.getBoundingClientRect();
  mouse.x = t.clientX - rect.left; mouse.y = t.clientY - rect.top;
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
  const wx = mouse.x + camX;
  const wy = mouse.y + camY;
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

const undergroundStart = Math.floor(ROWS * 0.45) + 1;
function updateDigging() {
  const digging = mouse.down || touchPunchActive;
  if (!digging) { breakProgress = {}; return; }
  const t = getTargetTile();
  if (!t) { breakProgress = {}; return; }
  const { col, row } = t;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  const bid = world[row][col];

  if (bid === 0) {
    // Tidak ada blok solid di sini - coba gali dinding gua di belakangnya
    if (row >= undergroundStart && bgWorld[row][col] === 1) {
      const key = 'bg:' + col + ',' + row;
      breakProgress[key] = (breakProgress[key] || 0) + 1;
      const neededFrames = CAVEWALL_HARD * 12;
      if (breakProgress[key] >= neededFrames) {
        bgWorld[row][col] = 0;
        delete breakProgress[key];
      }
    }
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
  ctx.fillStyle = '#cdeeff';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  const startCol = Math.floor(camX / TILE);
  const endCol = startCol + Math.ceil(canvas.width / TILE) + 1;
  const startRow = Math.floor(camY / TILE);
  const endRow = startRow + Math.ceil(canvas.height / TILE) + 1;
  const undergroundStart = Math.floor(ROWS * 0.45) + 1;

  for (let row = startRow; row <= endRow; row++) {
    if (row < undergroundStart || row >= ROWS) continue;
    for (let col = startCol; col <= endCol; col++) {
      if (col < 0 || col >= COLS) continue;
      if (world[row][col] !== 0) continue;
      const sx = col*TILE - camX;
      const sy = row*TILE - camY;
      if (bgWorld[row][col] === 1) {
        if (spriteImgs.cavebg && spriteImgs.cavebg.complete) {
          ctx.drawImage(spriteImgs.cavebg, sx, sy, TILE, TILE);
        } else {
          ctx.fillStyle = '#1c1a1e';
          ctx.fillRect(sx, sy, TILE, TILE);
        }
        const key = 'bg:' + col + ',' + row;
        if (breakProgress[key]) {
          const progress = breakProgress[key] / (CAVEWALL_HARD*12);
          ctx.fillStyle = `rgba(0,0,0,${0.55*progress})`;
          ctx.fillRect(sx, sy, TILE, TILE);
        }
      } else {
        // dinding gua sudah digali - tampilkan wallpaper latar gua, bukan hitam polos
        if (!deepBgPattern) deepBgPattern = ctx.createPattern(deepBgCanvas, 'repeat');
        ctx.fillStyle = deepBgPattern || '#12295c';
        ctx.fillRect(sx, sy, TILE, TILE);
      }
    }
  }

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
}

function drawPlayer() {
  const px = player.x - camX;
  const py = player.y - camY;
  ctx.save();

  let sheet, frameIndex;
  if (player.punching) {
    sheet = spriteImgs.punch_sheet; frameIndex = player.punchFrame;
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
