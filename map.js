let isMapInitialized = false;
let mapCanvas = null;
let mapCtx = null;

let currentZoomLevel = 1.0;
let maxZoomLevel = 3;
let currentMapYear = null;

let viewport = {
    x: 0,
    y: 0
};
let isDragging = false;
let lastPointer = { x: 0, y: 0 }; // マウスとタッチの両方に対応

const TILE_SIZE = 256;

const tileCache = new Map();
let tileYearData = {};

let animationFrameId = null; // requestAnimationFrameのIDを保持

async function loadTileYearData() {
    try {
        const response = await fetch('./tool/list.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        tileYearData = await response.json();
    } catch (error) {
        console.error('Failed to load list.json:', error);
    }
}

function generateTileUrl(year, actualZoom, tileY, tileX, layer) {
    const formattedYear = (actualZoom >= 1 && actualZoom <= 3) ? String(year).padStart(4, '0') : String(year);

    if (actualZoom >= 1 && actualZoom <= 3) {
        if (layer === 'back') {
            return `./img/back/Z${actualZoom}_${tileY}_${tileX}.png`;
        } else if (layer === 'front') {
            return `./img/${formattedYear}/Z${actualZoom}_${tileY}_${tileX}.png`;
        }
    } else if (actualZoom >= 4 && actualZoom <= 6) {
        if (layer === 'back') {
            return `https://geacron.b-cdn.net/plain_Z${actualZoom}_${tileY}_${tileX}.png`;
        } else if (layer === 'front') {
            return `https://geacron.b-cdn.net/tiles/area_${formattedYear}_Z${actualZoom}_${tileY}_${tileX}.png`;
        }
    }
    return '';
}

async function getTileImage(year, actualZoom, tileY, tileX, layer) {
    let effectiveYear = year;

    if (layer === 'front') {
        let tileName;
        if (actualZoom >= 1 && actualZoom <= 3) {
            tileName = `Z${actualZoom}_${tileY}_${tileX}.png`;
        } else if (actualZoom >= 4 && actualZoom <= 6) {
            const z3_tileY = Math.floor(tileY / Math.pow(2, actualZoom - 3));
            const z3_tileX = Math.floor(tileX / Math.pow(2, actualZoom - 3));
            tileName = `Z3_${z3_tileY}_${z3_tileX}.png`;
        }

        const availableYears = tileYearData[tileName];
        if (availableYears && availableYears.length > 0) {
            const sortedYears = [...availableYears].sort((a, b) => b - a); // 降順にソート
            let bestYear = sortedYears.find(y => y <= year);

            if (bestYear) {
                effectiveYear = bestYear;
            } else {
                return Promise.resolve(null); // 適切な年が見つからない場合は表示しない
            }
        } else {
            return Promise.resolve(null); // list.jsonに情報がない場合は表示しない
        }
    }

    const cacheKey = `${effectiveYear}-${actualZoom}-${tileY}-${tileX}-${layer}`;
    if (tileCache.has(cacheKey)) {
        return tileCache.get(cacheKey);
    }

    const url = generateTileUrl(effectiveYear, actualZoom, tileY, tileX, layer);
    if (!url) return Promise.resolve(null);

    const promise = new Promise(async (resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
            tileCache.delete(cacheKey); // ロード失敗時はキャッシュから削除
            resolve(null); // ロード失敗時も表示しない
        };
        img.src = url;
    });

    tileCache.set(cacheKey, promise);
    return promise;
}

window.initializeMap = async function() {
    if (isMapInitialized) {
        return;
    }

    await loadTileYearData();

    mapCanvas = document.getElementById('class');
    if (!mapCanvas) {
        console.error('Map canvas element not found!');
        return;
    }
    mapCtx = mapCanvas.getContext('2d');

    const resizeCanvas = () => {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const cssWidth = mapCanvas.parentElement.clientWidth;
        const cssHeight = mapCanvas.parentElement.clientHeight;

        // Canvasの内部解像度をデバイスピクセルに合わせる
        mapCanvas.width = cssWidth * devicePixelRatio;
        mapCanvas.height = cssHeight * devicePixelRatio;
        // CSSで表示サイズを設定し、スケールを管理する
        mapCanvas.style.width = `${cssWidth}px`;
        mapCanvas.style.height = `${cssHeight}px`;

        // ここでコンテキストのリセットとスケール設定を行う
        // 以前の setTransform は引数が不足しており問題を引き起こす可能性があった
        mapCtx.setTransform(1, 0, 0, 1, 0, 0); // まずリセット
        mapCtx.scale(devicePixelRatio, devicePixelRatio); // その後でスケールを適用

        // ビューポートの初期位置はCSSピクセルで計算された値を維持
        // Z0 (ズームレベル1.0) の世界全体が1枚のタイルに相当すると仮定
        // そのタイルがCanvasの中央に来るように初期位置を設定
        // ここでの initialMapWidth/Height は Z1.0 での Z0 のタイルを基準にしているため、TILE_SIZE * 2
        const initialMapWidth = TILE_SIZE * 2;
        const initialMapHeight = TILE_SIZE * 2;
        viewport.x = (cssWidth / 2) - (initialMapWidth / 2);
        viewport.y = (cssHeight / 2) - (initialMapHeight / 2);

        drawMap();
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // PCマウスイベント
    mapCanvas.addEventListener('mousedown', onPointerDown);
    mapCanvas.addEventListener('mouseup', onPointerUp);
    mapCanvas.addEventListener('mousemove', onPointerMove);
    mapCanvas.addEventListener('mouseleave', onPointerUp);
    mapCanvas.addEventListener('wheel', onWheel, { passive: false });

    // スマートフォンタッチイベント
    mapCanvas.addEventListener('touchstart', onPointerDown, { passive: false });
    mapCanvas.addEventListener('touchend', onPointerUp, { passive: false });
    mapCanvas.addEventListener('touchmove', onPointerMove, { passive: false });
    mapCanvas.addEventListener('touchcancel', onPointerUp, { passive: false }); // タッチが中断された場合

    const zoomLevelCheckbox = document.getElementById('zoomLevel');
    if (zoomLevelCheckbox) {
        setZoomLevelConstraint(zoomLevelCheckbox.checked);
        zoomLevelCheckbox.addEventListener('change', (event) => {
            setZoomLevelConstraint(event.target.checked);
        });
    }

    isMapInitialized = true;
};

window.loadMapForYear = function(year) {
    if (!isMapInitialized) {
        window.initializeMap();
    }
    currentMapYear = year;
    drawMap(); // requestAnimationFrame経由で描画
};

window.getCurrentMapYear = function() {
    return currentMapYear || MAP_MIN_YEAR;
};

// requestAnimationFrameでラップされた実際の描画処理
async function performDrawMap() {
    animationFrameId = null; // スケジュールをリセット

    if (!mapCtx || !currentMapYear) return;

    // Canvas全体をクリアして背景色で塗りつぶす (1pxの隙間対策)
    // ここでの width/height は CSSピクセルベースの座標系で考える
    mapCtx.clearRect(0, 0, mapCanvas.width / (window.devicePixelRatio || 1), mapCanvas.height / (window.devicePixelRatio || 1));
    mapCtx.fillStyle = '#ADD8E6'; // 背景色
    mapCtx.fillRect(0, 0, mapCanvas.width / (window.devicePixelRatio || 1), mapCanvas.height / (window.devicePixelRatio || 1));

    const displayZoom = currentZoomLevel;
    const effectiveLoadZoom = Math.floor(displayZoom);
    const clampedEffectiveLoadZoom = Math.min(Math.max(effectiveLoadZoom, 1), maxZoomLevel);
    const scaleFactorForDisplay = Math.pow(2, displayZoom - clampedEffectiveLoadZoom);

    const canvasWidth = mapCanvas.width / (window.devicePixelRatio || 1); // CSSピクセルでの幅
    const canvasHeight = mapCanvas.height / (window.devicePixelRatio || 1); // CSSピクセルでの高さ

    const startTileXFloat = (-viewport.x / (TILE_SIZE * scaleFactorForDisplay));
    const startTileYFloat = (-viewport.y / (TILE_SIZE * scaleFactorForDisplay));

    const endTileXFloat = (canvasWidth - viewport.x) / (TILE_SIZE * scaleFactorForDisplay);
    const endTileYFloat = (canvasHeight - viewport.y) / (TILE_SIZE * scaleFactorForDisplay);

    const startTileX = Math.floor(startTileXFloat);
    const startTileY = Math.floor(startTileYFloat);
    const endTileX = Math.ceil(endTileXFloat);
    const endTileY = Math.ceil(endTileYFloat);

    const numTilesAtZoom = Math.pow(2, clampedEffectiveLoadZoom); // 現在のズームレベルでの世界のタイル数（X, Y方向）

    // タイルロードと描画を待機しない非同期処理
    for (let tileY = startTileY; tileY < endTileY; tileY++) {
        for (let tileX = startTileX; tileX < endTileX; tileX++) {
            // 描画位置とサイズを丸めることで1pxのズレを軽減
            const drawX = Math.round(viewport.x + (tileX * TILE_SIZE * scaleFactorForDisplay));
            const drawY = Math.round(viewport.y + (tileY * TILE_SIZE * scaleFactorForDisplay));
            const drawSize = Math.round(TILE_SIZE * scaleFactorForDisplay);

            getTileImage(currentMapYear, clampedEffectiveLoadZoom, tileY, tileX, 'back').then(img => {
                if (img && mapCtx) {
                    mapCtx.drawImage(img, drawX, drawY, drawSize, drawSize);
                }
            });

            getTileImage(currentMapYear, clampedEffectiveLoadZoom, tileY, tileX, 'front').then(img => {
                if (img && mapCtx) {
                    mapCtx.drawImage(img, drawX, drawY, drawSize, drawSize);
                }
            });
        }
    }
}

// drawMapを直接呼び出すのではなく、requestAnimationFrame経由でスケジュールする関数
function drawMap() {
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(performDrawMap);
    }
}

function getPointerCoordinates(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    // マウスイベントの場合
    return { x: e.clientX, y: e.clientY };
}

function onPointerDown(e) {
    // タッチイベントの場合のみ preventDefault を呼ぶ
    if (e.touches) {
        e.preventDefault();
    }
    isDragging = true;
    const coords = getPointerCoordinates(e);
    lastPointer.x = coords.x;
    lastPointer.y = coords.y;
    mapCanvas.style.cursor = 'grabbing';
}

function onPointerUp(e) {
    isDragging = false;
    mapCanvas.style.cursor = 'grab';
}

function onPointerMove(e) {
    if (isDragging) {
        // タッチイベントの場合のみ preventDefault を呼ぶ
        if (e.touches) {
            e.preventDefault();
        }

        const coords = getPointerCoordinates(e);
        const dx = coords.x - lastPointer.x;
        const dy = coords.y - lastPointer.y;

        viewport.x += dx;
        viewport.y += dy;

        // --- 上下左右の制限 ---
        const currentCanvasWidth = mapCanvas.width / (window.devicePixelRatio || 1);
        const currentCanvasHeight = mapCanvas.height / (window.devicePixelRatio || 1);

        // 現在のズームレベルにおける世界の合計表示幅/高さ
        const currentTileRenderSize = TILE_SIZE * Math.pow(2, currentZoomLevel - Math.floor(currentZoomLevel));
        const numTilesAtCurrentZoom = Math.pow(2, Math.floor(currentZoomLevel));
        const totalWorldRenderWidth = numTilesAtCurrentZoom * currentTileRenderSize;
        const totalWorldRenderHeight = numTilesAtCurrentZoom * currentTileRenderSize;

        // 地図が画面より大きい場合にのみスクロール制限をかける
        // そうでない場合は中央に固定

        // X軸のクランプ
        if (totalWorldRenderWidth > currentCanvasWidth) {
            const maxClampX = 0; // 地図の左端が画面左端に合うとき (viewport.x が 0)
            const minClampX = currentCanvasWidth - totalWorldRenderWidth; // 地図の右端が画面右端に合うとき
            viewport.x = Math.min(Math.max(viewport.x, minClampX), maxClampX);
        } else {
            viewport.x = (currentCanvasWidth - totalWorldRenderWidth) / 2; // 中央に固定
        }

        // Y軸のクランプ
        if (totalWorldRenderHeight > currentCanvasHeight) {
            const maxClampY = 0; // 地図の上端が画面上端に合うとき (viewport.y が 0)
            const minClampY = currentCanvasHeight - totalWorldRenderHeight; // 地図の下端が画面下端に合うとき
            viewport.y = Math.min(Math.max(viewport.y, minClampY), maxClampY);
        } else {
            viewport.y = (currentCanvasHeight - totalWorldRenderHeight) / 2; // 中央に固定
        }

        lastPointer.x = coords.x;
        lastPointer.y = coords.y;
        drawMap(); // requestAnimationFrame経由で描画
    }
}

const ZOOM_SPEED = 0.1;

function onWheel(e) {
    e.preventDefault();

    const oldZoom = currentZoomLevel;
    let newZoom = currentZoomLevel;

    if (e.deltaY < 0) {
        newZoom += ZOOM_SPEED;
    } else {
        newZoom -= ZOOM_SPEED;
    }

    newZoom = Math.min(Math.max(newZoom, 1.0), maxZoomLevel + 0.99);

    if (oldZoom !== newZoom) {
        // マウスカーソル位置をCanvas内でのCSSピクセル座標に変換
        const mouseX = e.clientX - mapCanvas.getBoundingClientRect().left;
        const mouseY = e.clientY - mapCanvas.getBoundingClientRect().top;

        const oldEffectiveLoadZoom = Math.floor(oldZoom);
        const newEffectiveLoadZoom = Math.floor(newZoom);

        const zoomLevelChangeFactor = Math.pow(2, newEffectiveLoadZoom - oldEffectiveLoadZoom);

        const oldRenderScaleFactor = Math.pow(2, oldZoom - oldEffectiveLoadZoom);
        const newRenderScaleFactor = Math.pow(2, newZoom - newEffectiveLoadZoom); // ここを修正

        // ズーム中心をマウスカーソルに合わせる
        viewport.x = mouseX - (mouseX - viewport.x) * zoomLevelChangeFactor * (newRenderScaleFactor / oldRenderScaleFactor);
        viewport.y = mouseY - (mouseY - viewport.y) * zoomLevelChangeFactor * (newRenderScaleFactor / oldRenderScaleFactor);

        currentZoomLevel = newZoom;
        drawMap(); // requestAnimationFrame経由で描画
    }
}

function setZoomLevelConstraint(isChecked) {
    maxZoomLevel = isChecked ? 6 : 3;
    if (currentZoomLevel > maxZoomLevel + 0.99) {
        currentZoomLevel = parseFloat(maxZoomLevel.toFixed(2));
    }
    drawMap(); // requestAnimationFrame経由で描画
}

document.addEventListener('DOMContentLoaded', () => {
    window.initializeMap();
});