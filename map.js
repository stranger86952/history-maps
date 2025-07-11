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
let lastPointer = { x: 0, y: 0 }; // マウスとシングルタッチの両方に対応

// --- ピンチズーム関連の追加変数 ---
let initialPinchDistance = -1; // ピンチ開始時の指間の距離
let initialPinchMidpoint = { x: 0, y: 0 }; // ピンチ開始時の指の中間点
// --- ここまで追加 ---

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
        mapCtx.setTransform(1, 0, 0, 1, 0, 0); // まずリセット
        mapCtx.scale(devicePixelRatio, devicePixelRatio); // その後でスケールを適用

        // ビューポートの初期位置はCSSピクセルで計算された値を維持
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

function getPointerCoordinates(e, index = 0) {
    if (e.touches && e.touches.length > index) {
        return { x: e.touches[index].clientX, y: e.touches[index].clientY };
    }
    // マウスイベントの場合
    return { x: e.clientX, y: e.clientY };
}

// 指の距離を計算するヘルパー関数
function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// 指の中間点を計算するヘルパー関数
function getMidpoint(p1, p2) {
    return {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
    };
}


function onPointerDown(e) {
    if (e.touches && e.touches.length === 2) {
        // 2本指の場合：ピンチズームの開始
        e.preventDefault(); // デフォルトのブラウザジェスチャーを防止
        isDragging = false; // パンを無効化
        const p1 = getPointerCoordinates(e, 0);
        const p2 = getPointerCoordinates(e, 1);
        initialPinchDistance = getDistance(p1, p2);
        initialPinchMidpoint = getMidpoint(p1, p2);
        // ピンチズーム開始時のビューポート位置も記録しておくと、より正確なズームが可能
        initialViewport = { ...viewport };
        initialZoomLevel = currentZoomLevel;

    } else if (e.touches && e.touches.length === 1) {
        // 1本指の場合：パンの開始
        e.preventDefault(); // デフォルトのブラウザジェスチャーを防止
        isDragging = true;
        initialPinchDistance = -1; // ピンチ状態をリセット
        const coords = getPointerCoordinates(e);
        lastPointer.x = coords.x;
        lastPointer.y = coords.y;
        mapCanvas.style.cursor = 'grabbing';
    } else if (e.button === 0) { // マウス左クリック
        isDragging = true;
        const coords = getPointerCoordinates(e);
        lastPointer.x = coords.x;
        lastPointer.y = coords.y;
        mapCanvas.style.cursor = 'grabbing';
    }
}

function onPointerUp(e) {
    isDragging = false;
    initialPinchDistance = -1; // ピンチ状態をリセット
    mapCanvas.style.cursor = 'grab';
}

function onPointerMove(e) {
    if (e.touches && e.touches.length === 2) {
        // 2本指での移動：ピンチズーム
        e.preventDefault(); // デフォルトのブラウザジェスチャーを防止

        const p1 = getPointerCoordinates(e, 0);
        const p2 = getPointerCoordinates(e, 1);
        const currentPinchDistance = getDistance(p1, p2);
        const currentPinchMidpoint = getMidpoint(p1, p2);

        if (initialPinchDistance === -1) { // 初めてのmoveで初期値を設定 (まれにtouchstartが呼ばれないケース対策)
            initialPinchDistance = currentPinchDistance;
            initialPinchMidpoint = currentPinchMidpoint;
            initialViewport = { ...viewport };
            initialZoomLevel = currentZoomLevel;
            return;
        }

        const scaleChange = currentPinchDistance / initialPinchDistance;
        let newZoom = initialZoomLevel + Math.log2(scaleChange); // 対数スケールでズームを調整

        newZoom = Math.min(Math.max(newZoom, 1.0), maxZoomLevel + 0.99);

        if (newZoom !== currentZoomLevel) {
            // ズームの中心をピンチの中間点に合わせる
            const oldZoom = currentZoomLevel;
            currentZoomLevel = newZoom;

            const oldEffectiveLoadZoom = Math.floor(oldZoom);
            const newEffectiveLoadZoom = Math.floor(currentZoomLevel);

            const zoomLevelChangeFactor = Math.pow(2, newEffectiveLoadZoom - oldEffectiveLoadZoom);
            const oldRenderScaleFactor = Math.pow(2, oldZoom - oldEffectiveLoadZoom);
            const newRenderScaleFactor = Math.pow(2, currentZoomLevel - newEffectiveLoadZoom);

            // currentPinchMidpoint を使ってズーム後のビューポートを計算
            viewport.x = currentPinchMidpoint.x - (currentPinchMidpoint.x - viewport.x) * zoomLevelChangeFactor * (newRenderScaleFactor / oldRenderScaleFactor);
            viewport.y = currentPinchMidpoint.y - (currentPinchMidpoint.y - viewport.y) * zoomLevelChangeFactor * (newRenderScaleFactor / oldRenderScaleFactor);

            drawMap();
        }

        // ピンチズーム中のパンも考慮
        const dx = currentPinchMidpoint.x - initialPinchMidpoint.x;
        const dy = currentPinchMidpoint.y - initialPinchMidpoint.y;

        viewport.x += dx;
        viewport.y += dy;

        // 次のフレームのために中間点を更新（慣性を考慮しない場合）
        initialPinchMidpoint = currentPinchMidpoint;
        initialPinchDistance = currentPinchDistance; // 連続的なズームのために距離も更新

        applyViewportConstraints(); // ズーム後のパン制限を適用
        drawMap();

    } else if (isDragging) {
        // 1本指での移動、またはマウスでの移動：パン
        // タッチイベントの場合のみ preventDefault を呼ぶ
        if (e.touches) {
            e.preventDefault();
        }

        const coords = getPointerCoordinates(e);
        const dx = coords.x - lastPointer.x;
        const dy = coords.y - lastPointer.y;

        viewport.x += dx;
        viewport.y += dy;

        applyViewportConstraints(); // パン制限を適用

        lastPointer.x = coords.x;
        lastPointer.y = coords.y;
        drawMap(); // requestAnimationFrame経由で描画
    }
}

// ビューポートの制限を適用する新しい関数
function applyViewportConstraints() {
    const currentCanvasWidth = mapCanvas.width / (window.devicePixelRatio || 1);
    const currentCanvasHeight = mapCanvas.height / (window.devicePixelRatio || 1);

    const currentTileRenderSize = TILE_SIZE * Math.pow(2, currentZoomLevel - Math.floor(currentZoomLevel));
    const numTilesAtCurrentZoom = Math.pow(2, Math.floor(currentZoomLevel));
    const totalWorldRenderWidth = numTilesAtCurrentZoom * currentTileRenderSize;
    const totalWorldRenderHeight = numTilesAtCurrentZoom * currentTileRenderSize;

    // X軸のクランプ
    if (totalWorldRenderWidth > currentCanvasWidth) {
        const maxClampX = 0;
        const minClampX = currentCanvasWidth - totalWorldRenderWidth;
        viewport.x = Math.min(Math.max(viewport.x, minClampX), maxClampX);
    } else {
        viewport.x = (currentCanvasWidth - totalWorldRenderWidth) / 2;
    }

    // Y軸のクランプ
    if (totalWorldRenderHeight > currentCanvasHeight) {
        const maxClampY = 0;
        const minClampY = currentCanvasHeight - totalWorldRenderHeight;
        viewport.y = Math.min(Math.max(viewport.y, minClampY), maxClampY);
    } else {
        viewport.y = (currentCanvasHeight - totalWorldRenderHeight) / 2;
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
        const mouseX = e.clientX - mapCanvas.getBoundingClientRect().left;
        const mouseY = e.clientY - mapCanvas.getBoundingClientRect().top;

        const oldEffectiveLoadZoom = Math.floor(oldZoom);
        const newEffectiveLoadZoom = Math.floor(newZoom);

        const zoomLevelChangeFactor = Math.pow(2, newEffectiveLoadZoom - oldEffectiveLoadZoom);
        const oldRenderScaleFactor = Math.pow(2, oldZoom - oldEffectiveLoadZoom);
        const newRenderScaleFactor = Math.pow(2, newZoom - newEffectiveLoadZoom);

        viewport.x = mouseX - (mouseX - viewport.x) * zoomLevelChangeFactor * (newRenderScaleFactor / oldRenderScaleFactor);
        viewport.y = mouseY - (mouseY - viewport.y) * zoomLevelChangeFactor * (newRenderScaleFactor / oldRenderScaleFactor);

        currentZoomLevel = newZoom;
        applyViewportConstraints(); // ズーム後に制限を適用
        drawMap();
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