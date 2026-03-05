(function () {
  var vscode = acquireVsCodeApi();
  var dataEl = document.getElementById('map-data');
  var map = JSON.parse(dataEl.dataset.map);
  var tilesetImageUrls = JSON.parse(dataEl.dataset.images);
  var loadedImages = {};
  var layerVisibility = [];
  var showGrid = false;
  var zoom = 1;
  var panX = 0, panY = 0;
  var isDragging = false;
  var dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;

  var container = document.getElementById('canvas-container');
  var canvas = document.getElementById('map-canvas');
  var ctx = canvas.getContext('2d');
  var layerButtonsDiv = document.getElementById('layer-buttons');
  var btnGrid = document.getElementById('btn-grid');
  var btnFit = document.getElementById('btn-fit');
  var zoomLabel = document.getElementById('zoom-label');
  var infoSize = document.getElementById('info-size');
  var infoTile = document.getElementById('info-tile');
  var infoGid = document.getElementById('info-gid');

  var FALLBACK_COLORS = [
    '#4a6741', '#7a5230', '#5a7a9a', '#8a6a4a',
    '#6a8a5a', '#9a7a6a', '#5a6a7a', '#7a8a6a'
  ];

  function init() {
    layerVisibility = map.layers.map(function () { return true; });
    createLayerButtons();
    updateInfoBar();
    loadAllImages().then(function () {
      requestAnimationFrame(function () {
        fitToWindow();
        render();
      });
    });
    bindEvents();
  }

  function createLayerButtons() {
    layerButtonsDiv.innerHTML = '';
    map.layers.forEach(function (layer, i) {
      var btn = document.createElement('button');
      btn.textContent = layer.name;
      btn.className = 'active';
      btn.addEventListener('click', function () {
        layerVisibility[i] = !layerVisibility[i];
        btn.className = layerVisibility[i] ? 'active' : '';
        render();
      });
      layerButtonsDiv.appendChild(btn);
    });
  }

  function updateInfoBar() {
    infoSize.textContent = map.width + '\u00d7' + map.height + ' tiles (' +
      (map.width * map.tileWidth) + '\u00d7' + (map.height * map.tileHeight) + 'px)';
  }

  function loadAllImages() {
    var promises = [];
    for (var source in tilesetImageUrls) {
      promises.push(loadImage(source, tilesetImageUrls[source]));
    }
    return Promise.all(promises);
  }

  function loadImage(source, url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { loadedImages[source] = img; resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  function render() {
    var mapPixelW = map.width * map.tileWidth;
    var mapPixelH = map.height * map.tileHeight;
    var rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      requestAnimationFrame(render);
      return;
    }

    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    drawCheckerboard(mapPixelW, mapPixelH);

    map.layers.forEach(function (layer, i) {
      if (!layerVisibility[i]) return;
      ctx.globalAlpha = layer.opacity;
      drawLayer(layer);
    });
    ctx.globalAlpha = 1;

    if (showGrid) drawGrid(mapPixelW, mapPixelH);
    ctx.restore();
  }

  function drawCheckerboard(w, h) {
    var size = 8;
    for (var y = 0; y < h; y += size) {
      for (var x = 0; x < w; x += size) {
        ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#2a2a2a' : '#252525';
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  function drawLayer(layer) {
    var tw = map.tileWidth, th = map.tileHeight;
    for (var y = 0; y < layer.height; y++) {
      for (var x = 0; x < layer.width; x++) {
        var idx = y * layer.width + x;
        var rawGid = layer.data[idx];
        if (rawGid === 0) continue;

        var gid = rawGid & 0x1FFFFFFF;
        var flipH = (rawGid & 0x80000000) !== 0;
        var flipV = (rawGid & 0x40000000) !== 0;
        var flipD = (rawGid & 0x20000000) !== 0;

        var tileset = findTileset(gid);
        if (!tileset) continue;

        var img = loadedImages[tileset.imageSource];
        var localId = gid - tileset.firstGid;
        var srcX = (localId % tileset.columns) * tileset.tileWidth;
        var srcY = Math.floor(localId / tileset.columns) * tileset.tileHeight;
        var destX = x * tw, destY = y * th;

        if (!img) {
          ctx.fillStyle = FALLBACK_COLORS[(gid * 7 + localId * 3) % FALLBACK_COLORS.length];
          ctx.fillRect(destX, destY, tw, th);
          continue;
        }

        if (flipH || flipV || flipD) {
          ctx.save();
          ctx.translate(destX + tw / 2, destY + th / 2);
          if (flipD) {
            ctx.rotate(Math.PI / 2);
            ctx.scale(flipH ? 1 : -1, flipV ? -1 : 1);
          } else {
            ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
          }
          ctx.drawImage(img, srcX, srcY, tileset.tileWidth, tileset.tileHeight, -tw / 2, -th / 2, tw, th);
          ctx.restore();
        } else {
          ctx.drawImage(img, srcX, srcY, tileset.tileWidth, tileset.tileHeight, destX, destY, tw, th);
        }
      }
    }
  }

  function findTileset(gid) {
    var result = null;
    for (var i = 0; i < map.tilesets.length; i++) {
      if (map.tilesets[i].firstGid <= gid) result = map.tilesets[i];
      else break;
    }
    return result;
  }

  function drawGrid(w, h) {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (var x = 0; x <= w; x += map.tileWidth) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (var y = 0; y <= h; y += map.tileHeight) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  }

  function fitToWindow() {
    var rect = container.getBoundingClientRect();
    var mapW = map.width * map.tileWidth;
    var mapH = map.height * map.tileHeight;
    if (rect.width <= 0 || rect.height <= 0) return;

    zoom = Math.min((rect.width - 40) / mapW, (rect.height - 40) / mapH);
    zoom = Math.max(0.1, Math.min(zoom, 10));
    panX = (rect.width - mapW * zoom) / 2;
    panY = (rect.height - mapH * zoom) / 2;
    updateZoomLabel();
  }

  function updateZoomLabel() {
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }

  function bindEvents() {
    container.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = container.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var wx = (mx - panX) / zoom, wy = (my - panY) / zoom;
      var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoom = Math.max(0.05, Math.min(zoom * factor, 50));
      panX = mx - wx * zoom;
      panY = my - wy * zoom;
      updateZoomLabel();
      render();
    }, { passive: false });

    container.addEventListener('mousedown', function (e) {
      if (e.button === 0) {
        isDragging = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        panStartX = panX; panStartY = panY;
        container.classList.add('dragging');
      }
    });

    window.addEventListener('mousemove', function (e) {
      if (isDragging) {
        panX = panStartX + (e.clientX - dragStartX);
        panY = panStartY + (e.clientY - dragStartY);
        render();
      }
      var rect = container.getBoundingClientRect();
      var wx = (e.clientX - rect.left - panX) / zoom;
      var wy = (e.clientY - rect.top - panY) / zoom;
      var tx = Math.floor(wx / map.tileWidth);
      var ty = Math.floor(wy / map.tileHeight);

      if (tx >= 0 && tx < map.width && ty >= 0 && ty < map.height) {
        infoTile.textContent = 'Tile: ' + tx + ', ' + ty;
        var gids = [];
        map.layers.forEach(function (layer, i) {
          if (!layerVisibility[i]) return;
          var raw = layer.data[ty * layer.width + tx] || 0;
          var g = raw & 0x1FFFFFFF;
          if (g > 0) gids.push(layer.name + ':' + g);
        });
        infoGid.textContent = gids.length ? 'GID [' + gids.join(' | ') + ']' : '';
      } else {
        infoTile.textContent = '';
        infoGid.textContent = '';
      }
    });

    window.addEventListener('mouseup', function () {
      isDragging = false;
      container.classList.remove('dragging');
    });

    btnGrid.addEventListener('click', function () {
      showGrid = !showGrid;
      btnGrid.className = showGrid ? 'active' : '';
      render();
    });

    btnFit.addEventListener('click', function () { fitToWindow(); render(); });

    new ResizeObserver(function () { render(); }).observe(container);

    window.addEventListener('message', function (e) {
      if (e.data.type === 'update') {
        map = e.data.map;
        tilesetImageUrls = e.data.tilesetImages;
        layerVisibility = map.layers.map(function (_, i) {
          return i < layerVisibility.length ? layerVisibility[i] : true;
        });
        createLayerButtons();
        updateInfoBar();
        loadAllImages().then(function () { render(); });
      }
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'g' || e.key === 'G') {
        showGrid = !showGrid;
        btnGrid.className = showGrid ? 'active' : '';
        render();
      }
      if (e.key === '0') { fitToWindow(); render(); }
      if (e.key === '=' || e.key === '+') { zoom = Math.min(zoom * 1.2, 50); updateZoomLabel(); render(); }
      if (e.key === '-') { zoom = Math.max(zoom / 1.2, 0.05); updateZoomLabel(); render(); }
      var num = parseInt(e.key);
      if (num >= 1 && num <= map.layers.length) {
        layerVisibility[num - 1] = !layerVisibility[num - 1];
        var btns = layerButtonsDiv.querySelectorAll('button');
        if (btns[num - 1]) btns[num - 1].className = layerVisibility[num - 1] ? 'active' : '';
        render();
      }
    });
  }

  init();
})();
