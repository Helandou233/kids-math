/* ============================================================
   dom.js —— 通用 DOM 与图标工具（内联 SVG，不引用外部资源）
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};
  var doc = root.document;

  /**
   * 创建元素。
   * @param {string} tag 标签名
   * @param {string} className class
   * @param {string} html innerHTML（可选）
   * @returns {HTMLElement}
   */
  function el(tag, className, html) {
    var e = doc.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined && html !== null) e.innerHTML = html;
    return e;
  }

  /** 清空容器 */
  function clear(node) {
    if (node) node.innerHTML = '';
    return node;
  }

  /** HTML 转义 */
  function esc(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 绑定事件 */
  function on(node, evt, fn) {
    if (node) node.addEventListener(evt, fn, false);
    return node;
  }

  /* ---------------- 内联 SVG 图标 ---------------- */
  var ICONS = {
    check: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#7BD389"/>' +
      '<path d="M7 12.6 L10.4 16 L17 8.8" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    question: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#FF9F68"/>' +
      '<path d="M9.4 9.2a2.7 2.7 0 1 1 3.3 2.6c-.5.1-.7.5-.7 1v.8" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>' +
      '<circle cx="12" cy="16.8" r="1.4" fill="#FFFFFF"/></svg>',
    cross: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#FF9F68"/>' +
      '<path d="M8.6 8.6 L15.4 15.4 M15.4 8.6 L8.6 15.4" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2.6l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.8l1.2-6.6L2.5 9.6l6.6-.9z" fill="#FFD166" stroke="#F2A93B" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    starOff: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2.6l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.8l1.2-6.6L2.5 9.6l6.6-.9z" fill="#FFF3E2" stroke="#E4D3BC" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none"><path d="M15 5 L8 12 L15 19" stroke="#3D2C1E" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6 L18 18 M18 6 L6 18" stroke="#3D2C1E" stroke-width="2.8" stroke-linecap="round"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="#FF8A3D"/>' +
      '<path d="M15.5 9a4.2 4.2 0 0 1 0 6" stroke="#FF8A3D" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M18 6.8a7.4 7.4 0 0 1 0 10.4" stroke="#FF8A3D" stroke-width="2.2" stroke-linecap="round"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="#A9947C"/>' +
      '<path d="M16 10 L21 15 M21 10 L16 15" stroke="#A9947C" stroke-width="2.4" stroke-linecap="round"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2 2 0 0 1 6 3.5h13v14H6a2 2 0 0 0-2 2z" fill="#4CC9F0"/>' +
      '<path d="M4 19.5a2 2 0 0 0 2 2h13v-7H6a2 2 0 0 0-2 2z" fill="#8FDCF7"/>' +
      '<path d="M8.5 8h7M8.5 11.5h5" stroke="#FFFFFF" stroke-width="1.7" stroke-linecap="round"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill="#8FDCF7"/>' +
      '<circle cx="12" cy="12" r="5.4" fill="#4CC9F0"/><circle cx="12" cy="12" r="2.2" fill="#FFFFFF"/></svg>',
    tree: '<svg viewBox="0 0 24 24" fill="none"><rect x="10.6" y="13" width="2.8" height="8" rx="1.2" fill="#B07A45"/>' +
      '<circle cx="12" cy="9" r="6.4" fill="#7BD389"/><circle cx="8.4" cy="11.6" r="3" fill="#55BC67"/>' +
      '<circle cx="15.6" cy="11.2" r="2.6" fill="#55BC67"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="9" width="17" height="11" rx="2" fill="#FF6B9D"/>' +
      '<rect x="2.5" y="6" width="19" height="4" rx="1.6" fill="#FFD166"/>' +
      '<path d="M12 6v14" stroke="#FFFFFF" stroke-width="1.8"/>' +
      '<path d="M12 6c-1.6-2.6-5-2.6-5-.4 0 1.4 2.2 1.6 5 .4zm0 0c1.6-2.6 5-2.6 5-.4 0 1.4-2.2 1.6-5 .4z" fill="#FFD166"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10.5" width="15" height="10" rx="2.6" fill="#FFD166"/>' +
      '<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="#F2A93B" stroke-width="2.2" stroke-linecap="round"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.6" fill="#4CC9F0"/>' +
      '<path d="M4.5 19.5c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" stroke="#4CC9F0" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 18.5h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 8.6 4.6 4.6 0 0 0 7 18.5z" fill="#7BD389"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3a6 6 0 0 0-3.4 10.9c.6.4.9 1 .9 1.7v.9h5v-.9c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3z" fill="#FFD166"/>' +
      '<rect x="9" y="17.5" width="6" height="2.2" rx="1.1" fill="#A9947C"/>' +
      '<rect x="10" y="20" width="4" height="1.8" rx="0.9" fill="#FF8A3D"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 5 L16 12 L9 19" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" fill="#FF6B9D"/>' +
      '<path d="M7 9.5h10M7 13h6" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 17.5 L6 7 l4 4 2-6 2 6 4-4 2 10.5z" fill="#FFD166" stroke="#F2A93B" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<rect x="4" y="18" width="16" height="2.6" rx="1.3" fill="#F2A93B"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3v18" stroke="#7A6650" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M6 4.5h12l-2.4 4 2.4 4H6z" fill="#4CC9F0"/></svg>',
    coin: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill="#FFD166" stroke="#F2A93B" stroke-width="1.6"/>' +
      '<path d="M12 7v10M9.6 9.4h4.8M9.6 14.6h4.8" stroke="#F2A93B" stroke-width="1.8" stroke-linecap="round"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15" rx="3" fill="#4CC9F0"/>' +
      '<path d="M3.5 10h17" stroke="#FFFFFF" stroke-width="1.8"/>' +
      '<path d="M8 3v4M16 3v4" stroke="#7A6650" stroke-width="2" stroke-linecap="round"/></svg>',
    combo: '<svg viewBox="0 0 24 24" fill="none"><path d="M13 2 L5 13.5h6L11 22l8-11.5h-6z" fill="#FFD166" stroke="#F2A93B" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  };

  /**
   * 取图标 SVG 字符串。
   * @param {string} name 图标名
   * @param {number} size 尺寸（px，可选）
   * @returns {string}
   */
  function icon(name, size) {
    var s = ICONS[name] || ICONS.check;
    if (size) {
      s = s.replace('<svg ', '<svg width="' + size + '" height="' + size + '" ');
    }
    return s;
  }

  /**
   * 顶部栏：返回按钮 + 标题 + 右侧插槽（默认静音开关）。
   * @param {Object} opts {title, onBack, right: 'sound'|'none'}
   * @returns {HTMLElement}
   */
  function topbar(opts) {
    opts = opts || {};
    var bar = el('div', 'km-topbar');
    if (opts.onBack) {
      var back = el('button', 'km-iconbtn');
      back.setAttribute('aria-label', '返回');
      back.innerHTML = icon('back');
      on(back, 'click', opts.onBack);
      bar.appendChild(back);
    }
    var title = el('div', 'km-topbar__title', esc(opts.title || ''));
    bar.appendChild(title);
    if (opts.right === 'sound') {
      bar.appendChild(soundButton());
    }
    return bar;
  }

  /** 静音开关按钮 */
  function soundButton() {
    var btn = el('button', 'km-iconbtn');
    btn.setAttribute('aria-label', '声音开关');
    function paint() {
      btn.innerHTML = KM.Audio.isMuted() ? icon('soundOff') : icon('soundOn');
    }
    paint();
    on(btn, 'click', function () {
      KM.Audio.toggleMuted();
      paint();
      if (!KM.Audio.isMuted()) KM.Audio.playTap();
    });
    return btn;
  }

  /** 星星组 */
  function stars(count, total, big) {
    var wrap = el('div', 'km-stars' + (big ? ' km-stars--big' : ''));
    var n = total || count;
    for (var i = 0; i < n; i++) {
      var s = el('span', 'km-star-pop', icon(i < count ? 'star' : 'starOff'));
      s.style.animationDelay = (i * 120) + 'ms';
      wrap.appendChild(s);
    }
    return wrap;
  }

  /** 飘字提示（例如 +1） */
  function toast(text) {
    var layer = doc.getElementById('km-toast');
    if (!layer) return;
    var item = el('div', 'km-toast-item', esc(text));
    item.style.top = (38 + Math.random() * 12) + '%';
    layer.appendChild(item);
    setTimeout(function () {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 1200);
  }

  /** Combo 特效 */
  function combo(text) {
    var layer = doc.getElementById('km-toast');
    if (!layer) return;
    var item = el('div', 'km-combo', esc(text));
    layer.appendChild(item);
    setTimeout(function () {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 1000);
  }

  KM.Dom = {
    el: el,
    clear: clear,
    esc: esc,
    on: on,
    icon: icon,
    ICONS: ICONS,
    topbar: topbar,
    soundButton: soundButton,
    stars: stars,
    toast: toast,
    combo: combo
  };
})(typeof window !== 'undefined' ? window : globalThis);
