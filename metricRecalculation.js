(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  // Получить реальный row-gap контейнера в пикселях.
  // Использование: ns.utils.getRowGapPx(ns.dom.container)
  function getRowGapPx(el) {
    const cs = getComputedStyle(el);
    const raw = cs.rowGap || cs.gap || '0';
    const val = parseFloat(raw);
    return Number.isFinite(val) ? val : 0;
  }

  // Дождаться окончания прокрутки конкретного элемента (контейнера списка).
  // Управление: idleMs — период "тишины", maxMs — принудительная отсечка.
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

  // Дождаться окончания прокрутки окна.
  // Управление: idleMs — период "тишины", maxMs — принудительная отсечка.
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

  // Учёт системной настройки «уменьшение анимации» и отслеживание её изменений.
  // Возвращает функцию smoothBehavior() для scrollTo.
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

  // Поведение прокрутки с учётом prefers-reduced-motion.
  function smoothBehavior(ns) {
    return ns.state.prefersReducedMotion ? 'auto' : 'smooth';
  }

  // Пересчёт всех rem→px метрик и row-gap.
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

    // Обратная совместимость: поддержка как новой схемы (bottomIndex1/bottomIndex2),
    // так и старой (bottomIndex2/bottomIndex3)
    const b1StartRem = (typeof c.bottomIndex1StartRem === 'number') ? c.bottomIndex1StartRem : c.bottomIndex2StartRem;
    const b1EndRem   = (typeof c.bottomIndex1EndRem === 'number')   ? c.bottomIndex1EndRem   : c.bottomIndex2EndRem;
    const b2StartRem = (typeof c.bottomIndex2StartRem === 'number') ? c.bottomIndex2StartRem : c.bottomIndex3StartRem;
    const b2EndRem   = (typeof c.bottomIndex2EndRem === 'number')   ? c.bottomIndex2EndRem   : c.bottomIndex3EndRem;

    // Новые метрики (используются нижними эффектами index+1 и index+2)
    m.bottomIndex1StartPx = toPx(Math.abs(b1StartRem));
    m.bottomIndex1EndPx = toPx(Math.abs(b1EndRem));
    m.bottomIndex2StartPx = toPx(Math.abs(b2StartRem));
    m.bottomIndex2EndPx = toPx(Math.abs(b2EndRem));

    // Старые поля сохраняем для модулей, которые могли их использовать ранее
    if (typeof c.bottomIndex2StartRem === 'number' && typeof c.bottomIndex2EndRem === 'number') {
      m.bottomIndex2StartPx = toPx(Math.abs(c.bottomIndex2StartRem));
      m.bottomIndex2EndPx = toPx(Math.abs(c.bottomIndex2EndRem));
    }
    if (typeof c.bottomIndex3StartRem === 'number' && typeof c.bottomIndex3EndRem === 'number') {
      m.bottomIndex3StartPx = toPx(Math.abs(c.bottomIndex3StartRem));
      m.bottomIndex3EndPx = toPx(Math.abs(c.bottomIndex3EndRem));
    }

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
    recalcMetrics
  };
})(window.StackUI);
