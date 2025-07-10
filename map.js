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
let lastPointer = { x: 0, y: 0 };

const TILE_SIZE = 256;

const tileCache = new Map();

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
    console.warn(`Invalid zoom level or layer for tile URL: Z${actualZoom}_${tileY}_${tileX}, Layer: ${layer}`);
    return '';
}

async function getTileImage(year, actualZoom, tileY, tileX, layer, retryYear = year) {
    const cacheKey = `${retryYear}-${actualZoom}-${tileY}-${tileX}-${layer}`;
    if (tileCache.has(cacheKey)) {
        return tileCache.get(cacheKey);
    }

    const url = generateTileUrl(retryYear, actualZoom, tileY, tileX, layer);
    if (!url) return Promise.resolve(null);

    const promise = new Promise(async (resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = async () => {
            if (layer === 'front' && actualZoom >= 4 && actualZoom <= 6 && retryYear > MAP_MIN_YEAR) {
                console.warn(`404 for ${url}. Retrying with year ${retryYear - 1} for tile Z${actualZoom}_${tileY}_${tileX}.`);
                const retryPromise = getTileImage(year, actualZoom, tileY, tileX, layer, retryYear - 1);
                tileCache.set(cacheKey, retryPromise);
                resolve(await retryPromise);
            } else {
                console.error(`Failed to load tile: ${url}`);
                tileCache.delete(cacheKey);
                resolve(null);
            }
        };
        img.src = url;
    });

    tileCache.set(cacheKey, promise);
    return promise;
}

window.initializeMap = function() {
    if (isMapInitialized) {
        console.warn('Map already initialized.');
        return;
    }

    mapCanvas = document.getElementById('class');
    if (!mapCanvas) {
        console.error('Map canvas element with ID "class" not found.');
        return;
    }
    mapCtx = mapCanvas.getContext('2d');

    const resizeCanvas = () => {
        mapCanvas.width = mapCanvas.parentElement.clientWidth;
        mapCanvas.height = mapCanvas.parentElement.clientHeight;

        viewport.x = (mapCanvas.width / 2) - (TILE_SIZE * Math.pow(2, 0));
        viewport.y = (mapCanvas.height / 2) - (TILE_SIZE * Math.pow(2, 0));

        drawMap();
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    mapCanvas.addEventListener('mousedown', onPointerDown);
    mapCanvas.addEventListener('mouseup', onPointerUp);
    mapCanvas.addEventListener('mousemove', onPointerMove);
    mapCanvas.addEventListener('mouseleave', onPointerUp);
    mapCanvas.addEventListener('wheel', onWheel, { passive: false });

    const zoomLevelCheckbox = document.getElementById('zoomLevel');
    if (zoomLevelCheckbox) {
        setZoomLevelConstraint(zoomLevelCheckbox.checked);
        zoomLevelCheckbox.addEventListener('change', (event) => {
            setZoomLevelConstraint(event.target.checked);
        });
    } else {
        console.warn('Zoom level checkbox with ID "zoomLevel" not found. Max zoom will default to 3.');
    }

    isMapInitialized = true;
    console.log('Map initialized.');
};

window.loadMapForYear = function(year) {
    if (!isMapInitialized) {
        window.initializeMap();
    }

    currentMapYear = year;
    drawMap();
};

window.getCurrentMapYear = function() {
    return currentMapYear || MAP_MIN_YEAR;
};

async function drawMap() {
    if (!mapCtx || !currentMapYear) return;

    mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapCtx.fillStyle = '#ADD8E6';
    mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

    const displayZoom = currentZoomLevel;
    const effectiveLoadZoom = Math.floor(displayZoom);

    const clampedEffectiveLoadZoom = Math.min(Math.max(effectiveLoadZoom, 1), maxZoomLevel);

    const scaleFactorForDisplay = Math.pow(2, displayZoom - clampedEffectiveLoadZoom);

    const canvasWidth = mapCanvas.width;
    const canvasHeight = mapCanvas.height;

    const startTileXFloat = (-viewport.x / (TILE_SIZE * scaleFactorForDisplay));
    const startTileYFloat = (-viewport.y / (TILE_SIZE * scaleFactorForDisplay));

    const endTileXFloat = (canvasWidth - viewport.x) / (TILE_SIZE * scaleFactorForDisplay);
    const endTileYFloat = (canvasHeight - viewport.y) / (TILE_SIZE * scaleFactorForDisplay);

    const startTileX = Math.floor(startTileXFloat);
    const startTileY = Math.floor(startTileYFloat);
    const endTileX = Math.ceil(endTileXFloat);
    const endTileY = Math.ceil(endTileYFloat);

    const tilePromises = [];

    for (let tileY = startTileY; tileY < endTileY; tileY++) {
        for (let tileX = startTileX; tileX < endTileX; tileX++) {
            const drawX = viewport.x + (tileX * TILE_SIZE * scaleFactorForDisplay);
            const drawY = viewport.y + (tileY * TILE_SIZE * scaleFactorForDisplay);
            const drawSize = TILE_SIZE * scaleFactorForDisplay;

            tilePromises.push(getTileImage(currentMapYear, clampedEffectiveLoadZoom, tileY, tileX, 'back').then(img => {
                if (img) mapCtx.drawImage(img, drawX, drawY, drawSize, drawSize);
            }));

            tilePromises.push(getTileImage(currentMapYear, clampedEffectiveLoadZoom, tileY, tileX, 'front').then(img => {
                if (img) mapCtx.drawImage(img, drawX, drawY, drawSize, drawSize);
            }));
        }
    }
}

function onPointerDown(e) {
    isDragging = true;
    lastPointer.x = e.clientX;
    lastPointer.y = e.clientY;
    mapCanvas.style.cursor = 'grabbing';
}

function onPointerUp() {
    isDragging = false;
    mapCanvas.style.cursor = 'grab';
}

function onPointerMove(e) {
    if (isDragging) {
        const dx = e.clientX - lastPointer.x;
        const dy = e.clientY - lastPointer.y;

        viewport.x += dx;
        viewport.y += dy;

        lastPointer.x = e.clientX;
        lastPointer.y = e.clientY;
        drawMap();
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
        drawMap();
        console.log(`Zoom changed to: ${currentZoomLevel.toFixed(2)}`);
    }
}

function setZoomLevelConstraint(isChecked) {
    maxZoomLevel = isChecked ? 6 : 3;
    if (currentZoomLevel > maxZoomLevel + 0.99) {
        currentZoomLevel = parseFloat(maxZoomLevel.toFixed(2));
    }
    console.log(`Max zoom level set to: ${maxZoomLevel}`);
    drawMap();
}

document.addEventListener('DOMContentLoaded', () => {
    window.initializeMap();
});