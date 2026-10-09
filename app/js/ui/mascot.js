/* ============================================================
   mascot.js —— 吉祥物「数数」（小熊猫）内联 SVG
   圆脸 + 黑眼圈 + 戴数字眼镜。全部用代码画，不使用 emoji 或外部图片。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  /** 各表情对应的嘴形 / 眼形 SVG 片段 */
  var MOODS = {
    happy: {
      eyes: '',
      mouth: '<path d="M84 136 Q100 152 116 136" fill="none" stroke="#3D2C1E" stroke-width="5" stroke-linecap="round"/>'
    },
    think: {
      eyes: '',
      mouth: '<path d="M88 140 Q100 134 112 141" fill="none" stroke="#3D2C1E" stroke-width="5" stroke-linecap="round"/>' +
             '<text x="150" y="70" font-size="28" font-weight="900" fill="#FF8A3D">?</text>'
    },
    cheer: {
      eyes: '',
      mouth: '<ellipse cx="100" cy="142" rx="15" ry="11" fill="#7A3B2E"/>' +
             '<ellipse cx="100" cy="149" rx="9" ry="5" fill="#FF6B9D"/>'
    },
    sleep: {
      eyes: '<path d="M64 106 Q74 97 84 106" fill="none" stroke="#3D2C1E" stroke-width="4" stroke-linecap="round"/>' +
            '<path d="M116 106 Q126 97 136 106" fill="none" stroke="#3D2C1E" stroke-width="4" stroke-linecap="round"/>',
      mouth: '<circle cx="100" cy="142" r="5" fill="#3D2C1E"/>' +
             '<text x="150" y="66" font-size="22" font-weight="900" fill="#4CC9F0">z</text>'
    }
  };

  /**
   * 生成小熊猫 SVG 字符串。
   * @param {Object} opts {mood, size, leftDigit, rightDigit}
   * @returns {string} SVG 代码
   */
  function svg(opts) {
    opts = opts || {};
    var mood = MOODS[opts.mood] ? opts.mood : 'happy';
    var m = MOODS[mood];
    var size = opts.size || 160;
    var ld = (opts.leftDigit === undefined || opts.leftDigit === null) ? '1' : String(opts.leftDigit);
    var rd = (opts.rightDigit === undefined || opts.rightDigit === null) ? '2' : String(opts.rightDigit);

    var openEyes =
      '<circle cx="74" cy="104" r="9" fill="#FFFFFF"/>' +
      '<circle cx="126" cy="104" r="9" fill="#FFFFFF"/>' +
      '<circle cx="75" cy="105" r="5" fill="#3D2C1E"/>' +
      '<circle cx="127" cy="105" r="5" fill="#3D2C1E"/>' +
      '<circle cx="77" cy="102" r="2" fill="#FFFFFF"/>' +
      '<circle cx="129" cy="102" r="2" fill="#FFFFFF"/>';

    return '' +
      '<svg class="km-mascot" width="' + size + '" height="' + size + '" viewBox="0 0 200 200" ' +
      'xmlns="http://www.w3.org/2000/svg" role="img" aria-label="小熊猫数数">' +
      // 身体
      '<ellipse cx="100" cy="188" rx="58" ry="30" fill="#E8A06A"/>' +
      '<ellipse cx="100" cy="192" rx="38" ry="20" fill="#FFF3E2"/>' +
      // 耳朵
      '<circle cx="46" cy="56" r="27" fill="#E8A06A"/>' +
      '<circle cx="154" cy="56" r="27" fill="#E8A06A"/>' +
      '<circle cx="46" cy="56" r="14" fill="#F7D9BE"/>' +
      '<circle cx="154" cy="56" r="14" fill="#F7D9BE"/>' +
      // 脸
      '<circle cx="100" cy="104" r="70" fill="#FFE3CB"/>' +
      // 黑眼圈
      '<ellipse cx="74" cy="104" rx="21" ry="25" fill="#4A2E1E" transform="rotate(-18 74 104)"/>' +
      '<ellipse cx="126" cy="104" rx="21" ry="25" fill="#4A2E1E" transform="rotate(18 126 104)"/>' +
      // 眼睛（sleep 表情用闭眼弧线替代）
      (m.eyes ? m.eyes : openEyes) +
      // 数字眼镜
      '<path d="M92 104 H108" stroke="#FF8A3D" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M56 92 H40" stroke="#FF8A3D" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M144 92 H160" stroke="#FF8A3D" stroke-width="5" stroke-linecap="round"/>' +
      '<rect x="56" y="86" width="38" height="32" rx="12" fill="rgba(255,255,255,0.45)" ' +
      'stroke="#FF8A3D" stroke-width="5"/>' +
      '<rect x="106" y="86" width="38" height="32" rx="12" fill="rgba(255,255,255,0.45)" ' +
      'stroke="#FF8A3D" stroke-width="5"/>' +
      '<text x="60" y="116" font-size="15" font-weight="900" fill="#F2701C">' + ld + '</text>' +
      '<text x="138" y="116" font-size="15" font-weight="900" fill="#F2701C">' + rd + '</text>' +
      // 腮红
      '<ellipse cx="50" cy="130" rx="13" ry="8" fill="#FFB3C6" opacity="0.65"/>' +
      '<ellipse cx="150" cy="130" rx="13" ry="8" fill="#FFB3C6" opacity="0.65"/>' +
      // 鼻子
      '<ellipse cx="100" cy="128" rx="8" ry="6" fill="#3D2C1E"/>' +
      // 嘴
      m.mouth +
      '</svg>';
  }

  /**
   * 把吉祥物渲染进容器。
   * @param {HTMLElement} container 容器
   * @param {Object} opts 同 svg()
   * @returns {HTMLElement} 容器本身
   */
  function renderInto(container, opts) {
    if (!container) return container;
    container.innerHTML = svg(opts);
    return container;
  }

  KM.Mascot = {
    svg: svg,
    renderInto: renderInto,
    MOODS: MOODS
  };
})(typeof window !== 'undefined' ? window : globalThis);
