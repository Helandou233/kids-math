/* ============================================================
   animations.js —— 知识点演示动画（SVG 程序化生成，无外部资源）
   6 个动画：add / sub / mul / div / rem / carry
   单题动画 800–1200ms 一档，总时长 2s 左右，全程可「跳过」。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  var NS = 'http://www.w3.org/2000/svg';
  var VB_W = 360;
  var VB_H = 210;

  /* ---------------- SVG 工具 ---------------- */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, String(attrs[k]));
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  function label(str, attrs, parent) {
    var t = el('text', attrs, parent);
    t.textContent = str;
    return t;
  }

  /* ---------------- 时间轴 ---------------- */
  /**
   * 简易时间轴：steps = [{at: 毫秒, fn: 函数}]
   */
  function Timeline(steps, duration) {
    this.steps = steps.slice().sort(function (a, b) { return a.at - b.at; });
    this.duration = duration || 0;
    this.timers = [];
    this.done = false;
  }

  Timeline.prototype.start = function () {
    var self = this;
    this.steps.forEach(function (s) {
      self.timers.push(setTimeout(function () { s.fn(); }, s.at));
    });
    this.timers.push(setTimeout(function () { self.done = true; }, this.duration));
    return this;
  };

  Timeline.prototype.skip = function () {
    for (var i = 0; i < this.timers.length; i++) clearTimeout(this.timers[i]);
    this.timers = [];
    for (var j = 0; j < this.steps.length; j++) {
      try { this.steps[j].fn(); } catch (err) { /* 跳过时不阻断其余步骤 */ }
    }
    this.done = true;
  };

  Timeline.prototype.stop = function () {
    for (var i = 0; i < this.timers.length; i++) clearTimeout(this.timers[i]);
    this.timers = [];
  };

  /* ---------------- 通用绘制 ---------------- */
  function ball(parent, x, y, r, fill) {
    var g = el('g', { class: 'km-ball' }, parent);
    el('circle', { cx: x, cy: y, r: r, fill: fill }, g);
    el('circle', { cx: x - r * 0.3, cy: y - r * 0.35, r: r * 0.28, fill: '#FFFFFF', opacity: 0.45 }, g);
    return g;
  }

  function apple(parent, x, y, r) {
    var g = el('g', { class: 'km-ball' }, parent);
    el('circle', { cx: x, cy: y, r: r, fill: '#FF6B9D' }, g);
    el('ellipse', { cx: x + r * 0.45, cy: y - r * 0.75, rx: r * 0.36, ry: r * 0.2, fill: '#7BD389', transform: 'rotate(-25 ' + (x + r * 0.45) + ' ' + (y - r * 0.75) + ')' }, g);
    el('rect', { x: x - 1, y: y - r - 5, width: 2, height: 6, fill: '#8A5A32' }, g);
    return g;
  }

  function moveTo(node, dx, dy) {
    if (!node) return;
    node.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }

  function createStage(container) {
    var wrap = document.createElement('div');
    wrap.className = 'km-stage';
    var svg = el('svg', { viewBox: '0 0 ' + VB_W + ' ' + VB_H, preserveAspectRatio: 'xMidYMid meet' }, wrap);
    return { wrap: wrap, svg: svg };
  }

  /* ============================================================
     1. 加法的意义：两组小球合起来
     ============================================================ */
  function buildAdd(svg, p) {
    var left = p.left;
    var right = p.right;
    var steps = [];
    var r = 15;
    var y = 120;

    var leftG = el('g', {}, svg);
    var rightG = el('g', {}, svg);

    var i;
    var leftBalls = [];
    for (i = 0; i < left; i++) {
      var lb = ball(leftG, 34 + i * 32, y, r, '#FF8A3D');
      lb.style.opacity = '0';
      leftBalls.push(lb);
    }
    var rightBalls = [];
    for (i = 0; i < right; i++) {
      var rb = ball(rightG, 34 + (left + 1) * 32 + 78 + i * 32, y, r, '#4CC9F0');
      rb.style.opacity = '0';
      rightBalls.push(rb);
    }

    var tLeft = label(String(left), { x: 34 + (left - 1) * 16, y: 60, 'font-size': 30, 'font-weight': 900, fill: '#F2701C', 'text-anchor': 'middle' }, svg);
    tLeft.style.opacity = '0';
    var tRight = label(String(right), { x: 34 + (left + 1) * 32 + 78 + (right - 1) * 16, y: 60, 'font-size': 30, 'font-weight': 900, fill: '#0B7FA8', 'text-anchor': 'middle' }, svg);
    tRight.style.opacity = '0';
    var plus = label('+', { x: 34 + left * 32 + 40, y: 130, 'font-size': 34, 'font-weight': 900, fill: '#7A6650', 'text-anchor': 'middle' }, svg);
    plus.style.opacity = '0';
    var eq = label(left + ' + ' + right + ' = ?', { x: VB_W / 2, y: 192, 'font-size': 30, 'font-weight': 900, fill: '#3D2C1E', 'text-anchor': 'middle' }, svg);

    leftBalls.forEach(function (b, idx) {
      steps.push({ at: 60 + idx * 110, fn: function () { b.style.opacity = '1'; } });
    });
    steps.push({ at: 200, fn: function () { tLeft.style.opacity = '1'; } });

    rightBalls.forEach(function (b, idx) {
      steps.push({ at: 620 + idx * 110, fn: function () { b.style.opacity = '1'; } });
    });
    steps.push({ at: 760, fn: function () { tRight.style.opacity = '1'; plus.style.opacity = '1'; } });

    steps.push({
      at: 1180,
      fn: function () {
        moveTo(rightG, -((left + 1) * 32 + 78 - left * 32 + 4), 0);
        tRight.style.opacity = '0';
        // 两组一合并，「+」就完成使命了：淡出，
        // 否则它会留在原地叠到左移过来的小球上。
        plus.style.opacity = '0';
      }
    });
    steps.push({
      at: 1850,
      fn: function () {
        tLeft.textContent = String(left + right);
        eq.textContent = left + ' + ' + right + ' = ' + (left + right);
      }
    });
    return new Timeline(steps, 2300);
  }

  /* ============================================================
     2. 减法的意义：从整体里去掉一部分
     ============================================================ */
  function buildSub(svg, p) {
    var total = p.total;
    var take = p.take;
    var steps = [];
    var r = 15;
    var y = 118;
    var startX = (VB_W - (total - 1) * 34) / 2;

    var balls = [];
    for (var i = 0; i < total; i++) {
      var b = ball(svg, startX + i * 34, y, r, '#FF8A3D');
      b.style.opacity = '0';
      balls.push(b);
    }
    var countText = label(String(total), { x: VB_W / 2, y: 62, 'font-size': 30, 'font-weight': 900, fill: '#F2701C', 'text-anchor': 'middle' }, svg);
    countText.style.opacity = '0';
    var eq = label(total + ' − ' + take + ' = ?', { x: VB_W / 2, y: 192, 'font-size': 30, 'font-weight': 900, fill: '#3D2C1E', 'text-anchor': 'middle' }, svg);

    balls.forEach(function (b, idx) {
      steps.push({ at: 60 + idx * 90, fn: function () { b.style.opacity = '1'; } });
    });
    steps.push({ at: 240, fn: function () { countText.style.opacity = '1'; } });

    for (var k = 0; k < take; k++) {
      (function (idx) {
        steps.push({
          at: 900 + idx * 160,
          fn: function () {
            var b = balls[total - 1 - idx];
            if (!b) return;
            var c = b.querySelector('circle');
            if (c) c.setAttribute('fill', '#D8D0C6');
            moveTo(b, 0, -52);
            b.style.opacity = '0.45';
            // 按序号直接计算，不读旧值累减：步骤被重复执行也不会算错
            countText.textContent = String(total - 1 - idx);
          }
        });
      })(k);
    }

    steps.push({
      at: 900 + take * 160 + 420,
      fn: function () {
        eq.textContent = total + ' − ' + take + ' = ' + (total - take);
      }
    });
    return new Timeline(steps, 900 + take * 160 + 900);
  }

  /* ============================================================
     3. 乘法的意义：几个几相加（点阵）
     ============================================================ */
  function buildMul(svg, p) {
    var rows = p.rows;
    var cols = p.cols;
    var steps = [];
    var gap = 40;
    var startX = (VB_W - (cols - 1) * gap) / 2;
    var startY = 58;
    var dots = [];

    for (var rIdx = 0; rIdx < rows; rIdx++) {
      var g = el('g', {}, svg);
      for (var cIdx = 0; cIdx < cols; cIdx++) {
        var d = el('circle', { cx: startX + cIdx * gap, cy: startY + rIdx * 34, r: 13, fill: '#4CC9F0' }, g);
        d.classList.add('km-ball');
        d.style.opacity = '0';
        dots.push(d);
      }
      (function (gr, ri) {
        steps.push({
          at: 150 + ri * 460,
          fn: function () {
            var cs = gr.querySelectorAll('circle');
            for (var m = 0; m < cs.length; m++) cs[m].style.opacity = '1';
          }
        });
        steps.push({
          at: 300 + ri * 460,
          fn: function () {
            sumText.textContent = buildSum(ri + 1);
          }
        });
      })(g, rIdx);
    }

    var sumText = label('', { x: VB_W / 2, y: 178, 'font-size': 24, 'font-weight': 900, fill: '#0B7FA8', 'text-anchor': 'middle' }, svg);
    var finalText = label('', { x: VB_W / 2, y: 202, 'font-size': 22, 'font-weight': 900, fill: '#3D2C1E', 'text-anchor': 'middle' }, svg);

    function buildSum(n) {
      var parts = [];
      for (var i = 0; i < n; i++) parts.push(String(cols));
      return parts.join(' + ') + ' = ' + (cols * n);
    }

    steps.push({
      at: 150 + rows * 460 + 200,
      fn: function () {
        finalText.textContent = rows + ' 个 ' + cols + ' → ' + rows + ' × ' + cols + ' = ' + (rows * cols);
      }
    });
    return new Timeline(steps, 150 + rows * 460 + 1200);
  }

  /* ============================================================
     4. 除法的意义：平均分（等分除）
     ============================================================ */
  function buildDiv(svg, p) {
    var total = p.total;
    var plates = p.plates;
    var steps = [];
    var r = 11;
    var plateY = 168;
    var gapX = VB_W / (plates + 1);

    var plateG = el('g', {}, svg);
    var plateLabels = [];
    for (var i = 0; i < plates; i++) {
      var cx = gapX * (i + 1);
      el('ellipse', { cx: cx, cy: plateY, rx: 34, ry: 9, fill: '#FFD166' }, plateG);
      el('path', { d: 'M' + (cx - 34) + ' ' + plateY + ' A34 16 0 0 0 ' + (cx + 34) + ' ' + plateY, fill: '#FFE9B0' }, plateG);
      var lb = label('0', { x: cx, y: plateY + 28, 'font-size': 20, 'font-weight': 900, fill: '#7A6650', 'text-anchor': 'middle' }, plateG);
      plateLabels.push(lb);
    }

    var apples = [];
    var counts = [];
    for (var k = 0; k < plates; k++) counts.push(0);

    for (var j = 0; j < total; j++) {
      var ax = 176 + (j % 6) * 12 - 30;
      var ay = 34 + Math.floor(j / 6) * 14;
      var a = apple(svg, ax, ay, r);
      apples.push({ node: a, x0: ax, y0: ay });
    }

    var eq = label(total + ' ÷ ' + plates + ' = ?', { x: VB_W / 2, y: 200, 'font-size': 26, 'font-weight': 900, fill: '#3D2C1E', 'text-anchor': 'middle' }, svg);

    for (var n = 0; n < total; n++) {
      (function (idx) {
        var target = idx % plates;
        var cxT = gapX * (target + 1);
        var level = Math.floor(idx / plates);
        steps.push({
          at: 420 + idx * 95,
          fn: function () {
            var item = apples[idx];
            if (!item) return;
            moveTo(item.node, cxT - item.x0 + (level % 3) * 12 - 12, plateY - 16 - level * 15 - item.y0);
            // 按序号直接赋值，不累加：重复执行结果不变
            counts[target] = level + 1;
            plateLabels[target].textContent = String(counts[target]);
          }
        });
      })(n);
    }

    steps.push({
      at: 420 + total * 95 + 320,
      fn: function () {
        eq.textContent = total + ' ÷ ' + plates + ' = ' + Math.floor(total / plates) + '（每份一样多）';
      }
    });

    return new Timeline(steps, 420 + total * 95 + 1000);
  }

  /* ============================================================
     5. 有余数的除法：分不完剩下的是余数（余数 < 除数）
     ============================================================ */
  function buildRem(svg, p) {
    var total = p.total;
    var plates = p.plates;
    var per = Math.floor(total / plates);
    var rest = total % plates;
    var used = per * plates;
    var steps = [];
    var r = 10;
    var plateY = 160;
    var gapX = VB_W / (plates + 1);

    var plateG = el('g', {}, svg);
    var plateLabels = [];
    for (var i = 0; i < plates; i++) {
      var cx = gapX * (i + 1);
      el('ellipse', { cx: cx, cy: plateY, rx: 30, ry: 8, fill: '#FFD166' }, plateG);
      el('path', { d: 'M' + (cx - 30) + ' ' + plateY + ' A30 14 0 0 0 ' + (cx + 30) + ' ' + plateY, fill: '#FFE9B0' }, plateG);
      var lb = label('0', { x: cx, y: plateY + 26, 'font-size': 18, 'font-weight': 900, fill: '#7A6650', 'text-anchor': 'middle' }, plateG);
      plateLabels.push(lb);
    }

    var apples = [];
    var counts = [];
    for (var k = 0; k < plates; k++) counts.push(0);
    for (var j = 0; j < total; j++) {
      var ax = 170 + (j % 7) * 12 - 34;
      var ay = 30 + Math.floor(j / 7) * 14;
      var a = apple(svg, ax, ay, r);
      apples.push({ node: a, x0: ax, y0: ay });
    }

    var eq = label(total + ' ÷ ' + plates + ' = ?', { x: VB_W / 2, y: 196, 'font-size': 26, 'font-weight': 900, fill: '#3D2C1E', 'text-anchor': 'middle' }, svg);
    var restTip = label('', { x: VB_W / 2, y: 92, 'font-size': 18, 'font-weight': 900, fill: '#FF6B9D', 'text-anchor': 'middle' }, svg);

    for (var n = 0; n < used; n++) {
      (function (idx) {
        var target = idx % plates;
        var cxT = gapX * (target + 1);
        var level = Math.floor(idx / plates);
        steps.push({
          at: 420 + idx * 90,
          fn: function () {
            var item = apples[idx];
            if (!item) return;
            moveTo(item.node, cxT - item.x0 + (level % 3) * 11 - 11, plateY - 14 - level * 14 - item.y0);
            // 按序号直接赋值，不累加：重复执行结果不变
            counts[target] = level + 1;
            plateLabels[target].textContent = String(counts[target]);
          }
        });
      })(n);
    }

    var afterUsed = 420 + used * 90 + 260;
    steps.push({
      at: afterUsed,
      fn: function () {
        restTip.textContent = '剩下 ' + rest + ' 个，不够再分一份 → 余数';
        for (var s = used; s < total; s++) {
          var item = apples[s];
          if (!item) continue;
          moveTo(item.node, 0, 26);
          var c = item.node.querySelector('circle');
          if (c) c.setAttribute('fill', '#FF6B9D');
          item.node.style.filter = 'drop-shadow(0 0 6px #FFD166)';
        }
      }
    });
    steps.push({
      at: afterUsed + 520,
      fn: function () {
        eq.textContent = total + ' ÷ ' + plates + ' = ' + per + ' …… ' + rest + '（余数 ' + rest + ' < 除数 ' + plates + '）';
      }
    });

    return new Timeline(steps, afterUsed + 1200);
  }

  /* ============================================================
     6. 凑十法：9 + 5 —— 分出 1 滚进 10 号房子
     ============================================================ */
  function buildCarry(svg, p) {
    var big = p.big;
    var small = p.small;
    var split = 10 - big;
    var rest = small - split;
    var steps = [];

    // 10 号房子
    var house = el('g', {}, svg);
    el('rect', { x: 18, y: 52, width: 132, height: 108, rx: 18, fill: '#FFF3E2', stroke: '#FF8A3D', 'stroke-width': 5 }, house);
    el('path', { d: 'M10 56 L84 20 L158 56', fill: '#FF8A3D', stroke: '#FF8A3D', 'stroke-width': 6, 'stroke-linejoin': 'round' }, house);
    label('10 号房子', { x: 84, y: 148, 'font-size': 16, 'font-weight': 900, fill: '#F2701C', 'text-anchor': 'middle' }, house);

    var slots = [];
    for (var i = 0; i < 10; i++) {
      var col = i % 5;
      var row = Math.floor(i / 5);
      var sx = 38 + col * 24;
      var sy = 76 + row * 30;
      var c = el('circle', { cx: sx, cy: sy, r: 9, fill: (i < big ? '#FF8A3D' : '#FFFFFF'), stroke: '#FF8A3D', 'stroke-width': 3 }, house);
      slots.push(c);
    }

    var outside = [];
    for (var k = 0; k < small; k++) {
      var g = ball(svg, 190 + k * 30, 74, 12, '#4CC9F0');
      outside.push(g);
    }

    var eqTop = label(big + ' + ' + small + ' = ?', { x: VB_W / 2, y: 190, 'font-size': 28, 'font-weight': 900, fill: '#3D2C1E', 'text-anchor': 'middle' }, svg);

    steps.push({ at: 120, fn: function () { /* 初始展示 */ } });

    steps.push({
      at: 700,
      fn: function () {
        var moving = outside[0];
        if (!moving) return;
        moveTo(moving, (38 + (big % 5) * 24) - (190), (76 + Math.floor(big / 5) * 30) - 74);
      }
    });

    steps.push({
      at: 1420,
      fn: function () {
        if (slots[big]) slots[big].setAttribute('fill', '#FF8A3D');
        if (outside[0]) outside[0].style.opacity = '0';
        for (var s = 1; s < outside.length; s++) {
          moveTo(outside[s], -30, 0);
        }
        eqTop.textContent = big + ' + ' + small + ' = 10 + ' + rest;
      }
    });

    steps.push({
      at: 1980,
      fn: function () {
        eqTop.textContent = big + ' + ' + small + ' = ' + (big + small);
      }
    });

    return new Timeline(steps, 2300);
  }

  /* ---------------- 注册表 ---------------- */
  var BUILDERS = {
    add: buildAdd,
    sub: buildSub,
    mul: buildMul,
    div: buildDiv,
    rem: buildRem,
    carry: buildCarry
  };

  /**
   * 把某个知识点的动画挂到容器上。
   * @param {HTMLElement} container 容器
   * @param {string} animKey 'add'|'sub'|'mul'|'div'|'rem'|'carry'
   * @param {Object} param 动画参数
   * @returns {{play:function, skip:function, destroy:function, root:HTMLElement}}
   */
  function mount(container, animKey, param) {
    container.innerHTML = '';
    var stage = createStage(container);
    var builder = BUILDERS[animKey] || buildAdd;
    var tl = builder(stage.svg, param || {});

    var row = document.createElement('div');
    row.className = 'km-stage__row';
    var btnPlay = document.createElement('button');
    btnPlay.className = 'km-btn km-btn--sky';
    btnPlay.style.minHeight = '56px';
    btnPlay.style.fontSize = '20px';
    btnPlay.textContent = '再看一遍';
    var btnSkip = document.createElement('button');
    btnSkip.className = 'km-btn km-btn--ghost';
    btnSkip.style.minHeight = '56px';
    btnSkip.style.fontSize = '20px';
    btnSkip.textContent = '跳过动画';
    row.appendChild(btnPlay);
    row.appendChild(btnSkip);
    stage.wrap.appendChild(row);
    container.appendChild(stage.wrap);

    var instance = {
      root: stage.wrap,
      play: function () {
        tl.stop();
        // 重建前必须清空上一轮生成的所有 SVG 元素：
        // 否则「再看一遍」会把新的一整套元素叠在旧的上面（数字叠印、小球变多）。
        // 只清空 stage.svg，不能动 stage.wrap 里的按钮行。
        while (stage.svg.firstChild) {
          stage.svg.removeChild(stage.svg.firstChild);
        }
        tl = builder(stage.svg, param || {});
        tl.start();
      },
      skip: function () {
        tl.stop();
        // 与 play() 同策略：先重建再执行，保证任意次「跳过」终态一致。
        // 否则步骤会在旧元素上重复执行，累加类步骤（计数/求和）会越跳越错。
        while (stage.svg.firstChild) {
          stage.svg.removeChild(stage.svg.firstChild);
        }
        tl = builder(stage.svg, param || {});
        tl.skip();
      },
      destroy: function () {
        tl.stop();
        container.innerHTML = '';
      }
    };

    btnPlay.addEventListener('click', function () { instance.play(); });
    btnSkip.addEventListener('click', function () { instance.skip(); });

    tl.start();
    return instance;
  }

  KM.Anim = {
    mount: mount,
    Timeline: Timeline,
    BUILDERS: BUILDERS
  };
})(typeof window !== 'undefined' ? window : globalThis);
