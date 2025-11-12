(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  function getRowGapPx(el) {
    const cs = getComputedStyle(el);
    const raw = cs.rowGap || cs.gap || '0';
    const val = parseFloat(raw);
    return Number.isFinite(val) ? val : 0;
  }

  function describeCardForLog(ns, card) {
    if (!card) return '<нет карточки>';
    const parts = [];
    if (card.tagName) parts.push(card.tagName.toLowerCase());
    if (card.id) parts.push(`#${card.id}`);
    if (card.getAttribute) {
      const brand = card.getAttribute('brand-data') || card.getAttribute('data-brand');
      if (brand) parts.push(`[brand=${brand}]`);
    }
    if (ns && ns.collections && Array.isArray(ns.collections.cards)) {
      const idx = ns.collections.cards.indexOf(card);
      if (idx !== -1) parts.push(`index=${idx}`);
    }
    return parts.join(' ') || '<карточка>';
  }

  function logCurrentChange(ns, card, { action, reason, meta } = {}) {
    if (typeof console !== 'object' || typeof console.log !== 'function') return;
    const verb = action === 'add' ? 'Добавляем' : (action === 'remove' ? 'Удаляем' : 'Изменяем');
    const label = describeCardForLog(ns, card);
    const messageReason = reason || 'причина не указана';
    const payload = {
      card,
      action: action || 'unknown',
      reason: messageReason
    };
    if (meta && typeof meta === 'object') payload.meta = meta;
    console.log(`[StackUI][current] ${verb} current для ${label}. Причина: ${messageReason}.`, payload);
  }

  function waitForElementScrollEnd(el, idleMs = 80, maxMs = 1000) {
    return new Promise(resolve => {
      let idleTimer = null;
      const onScrollTemp = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(done, idleMs);
      };
      const done = () => {
        el.removeEventListener('scroll', onScrollTemp);
        clearTimeout(idleTimer);
        clearTimeout(hardStop);
        resolve();
      };
      const hardStop = setTimeout(done, maxMs);
      idleTimer = setTimeout(done, idleMs);
      el.addEventListener('scroll', onScrollTemp, { passive: true });
    });
  }

  function waitForWindowScrollEnd(idleMs = 120, maxMs = 2000) {
    return new Promise(resolve => {
      let idleTimer = null;
      const onScrollTemp = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(done, idleMs);
      };
      const done = () => {
        window.removeEventListener('scroll', onScrollTemp);
        clearTimeout(idleTimer);
        clearTimeout(hardStop);
        resolve();
      };
      const hardStop = setTimeout(done, maxMs);
      idleTimer = setTimeout(done, idleMs);
      window.addEventListener('scroll', onScrollTemp, { passive: true });
    });
  }

  function setupReducedMotion(ns) {
    try {
      const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
      ns.state.prefersReducedMotion = !!(mq && mq.matches);
      const handler = e => { ns.state.prefersReducedMotion = !!e.matches; };
      if (mq && typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', handler);
      } else if (mq && typeof mq.addListener === 'function') {
        mq.addListener(handler);
      }
    } catch (_) {}
  }

  function smoothBehavior(ns) {
    return ns.state.prefersReducedMotion ? 'auto' : 'smooth';
  }

  function recalcMetrics(ns) {
    const c = ns.constants;
    const m = ns.metrics;

    m.root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const toPx = v => v * m.root;

    m.thresholdPx = toPx(c.thresholdRem);
    m.triggerOffsetPx = toPx(c.triggerOffsetRem);
    m.containerItemHeightPx = toPx(c.containerItemHeightRem);
    m.pageScrollOffsetPx = toPx(c.pageScrollOffsetRem);

    m.effectStartPx = toPx(c.effectStartRem);
    m.effectEndPx = toPx(c.effectEndRem);
    m.topIndex1EndPx = toPx(Math.abs(c.topIndex1EndRem));
    m.topIndex2StartPx = toPx(Math.abs(c.topIndex2StartRem));
    m.topIndex2EndPx = toPx(Math.abs(c.topIndex2EndRem));

    m.bottomBandStartPx = toPx(c.bottomBandStartRem);
    m.bottomBandEndPx = toPx(c.bottomBandEndRem);
    m.bottomIndex2StartPx = toPx(Math.abs(c.bottomIndex2StartRem));
    m.bottomIndex2EndPx = toPx(Math.abs(c.bottomIndex2EndRem));
    m.bottomIndex3StartPx = toPx(Math.abs(c.bottomIndex3StartRem));
    m.bottomIndex3EndPx = toPx(Math.abs(c.bottomIndex3EndRem));

    m.wrapperMarginStartPx = toPx(c.wrapperMarginStartRem);
    m.wrapperMarginEndPx = toPx(c.wrapperMarginEndRem);
    m.wrapperScrollEndPx = toPx(c.wrapperScrollEndRem);
    m.listHeightStartPx = toPx(c.listHeightStartRem);
    m.listHeightEndPx = toPx(c.listHeightEndRem);

    ns.state.rowGapPx = ns.dom.container ? getRowGapPx(ns.dom.container) : 0;
  }

  ns.utils = {
    getRowGapPx,
    waitForElementScrollEnd,
    waitForWindowScrollEnd,
    setupReducedMotion,
    smoothBehavior,
    recalcMetrics,
    logCurrentChange
  };
})(window.StackUI);
