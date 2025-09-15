(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;
  
  // Что делает:
  //   Выставляет padding-top контейнеру кейсов так, чтобы верх списка карточек
  //   оказался ровно под заголовком кейсов.
  // Как управлять:
  //   Вызывайте при загрузке страницы и на resize.
  //   Формула: (top списка от окна + 2.25rem) - (высота title-block + 2.25rem)
  //   Примечание: 2.25rem взаимно сокращаются; оставлено для наглядности.
  function updateCasesContainerPaddingTop(ns) {
    const casesContainer = ns.dom.casesContainer;
    const listEl = ns.dom.container;
    const casesGrid = ns.dom.casesGrid;
    if (!casesContainer || !listEl || !casesGrid) return;
  
    const addPx = 2.25 * ns.metrics.root;
    const titlePx = 12.75 * ns.metrics.root;
    const maxPaddingPx = 17.5 * ns.metrics.root;
    const stackWrap = listEl.closest('.main-container__stack-wrap');
    const wrapper = listEl.closest('.main-container__stack-wrap__wrapper');
    const listTopRelativePx = stackWrap
      ? (listEl.getBoundingClientRect().top - stackWrap.getBoundingClientRect().top)
      : listEl.getBoundingClientRect().top;
    const paddingTopPx = (listTopRelativePx + addPx) - (titlePx + addPx);
    const clampedPx = Math.min(maxPaddingPx, Math.max(0, Math.round(paddingTopPx)));
    casesContainer.style.paddingTop = `${clampedPx}px`;
    if (stackWrap && wrapper) {
      const wrapHeightPx = stackWrap.clientHeight || 0;
      const wrapperHeightPx = wrapper.clientHeight || 0;
      const availablePx = Math.max(0, wrapHeightPx - wrapperHeightPx);
      const usedPaddingPx = Math.max(0, Math.round(paddingTopPx));
      const marginBottomPx = Math.max(0, Math.min(availablePx, availablePx - usedPaddingPx));
      wrapper.style.setProperty('margin-bottom', `${marginBottomPx}px`, 'important');
    }
  }
  
  // Плавная интерполяция margin-top для wrapper при скролле окна
  function interpolateWrapperMarginOnScroll(ns) {
    const listEl = ns.dom.container;
    const stackWrap = listEl && listEl.closest('.main-container__stack-wrap');
    const wrapper = listEl && listEl.closest('.main-container__stack-wrap__wrapper');
    if (!stackWrap || !wrapper) return;

    const addPx = 2.25 * ns.metrics.root;
    const titlePx = 12.75 * ns.metrics.root;
    const maxPaddingPx = 17.5 * ns.metrics.root;

    const listTopRelativePx = listEl
      ? (listEl.getBoundingClientRect().top - stackWrap.getBoundingClientRect().top)
      : 0;
    const paddingTopPx = (listTopRelativePx + addPx) - (titlePx + addPx);
    const clampedPx = Math.min(maxPaddingPx, Math.max(0, Math.round(paddingTopPx)));

    // Инициализируем точку старта на первом скролле, без привязки к порогу casesContainer
    if (ns.state && ns.state.wrapperAnimStartScrollY == null) {
      const sy0 = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      ns.state.wrapperAnimStartScrollY = sy0;
    }
    if (!ns.state) return;

    const startMarginPx = (16.5 * ns.metrics.root) + titlePx;
    const endMarginPx = Math.max(0, (stackWrap.clientHeight - wrapper.clientHeight) / 2);

    const sy = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const rawDeltaPx = sy - ns.state.wrapperAnimStartScrollY;
    const deltaPx = Math.max(0, Math.min(maxPaddingPx, rawDeltaPx));
    const t = deltaPx / maxPaddingPx; // 0..1

    const currentMarginPx = startMarginPx + (endMarginPx - startMarginPx) * t;
    wrapper.style.setProperty('margin-bottom', `${currentMarginPx}px`, 'important');

    // Диагностика
    // eslint-disable-next-line no-console
    console.log('[StackUI][interp]', {
      startScrollY: ns.state.wrapperAnimStartScrollY,
      scrollY: sy,
      rawDeltaPx,
      deltaPx,
      startMarginPx,
      endMarginPx,
      currentMarginPx,
      t
    });
  }
  
  window.addEventListener('resize', function() { updateCasesContainerPaddingTop(ns); });
  
  // Обработчик скролла с rAF-гардингом через ns.state.tickingFrame
  window.addEventListener('scroll', function() {
    if (ns.state && ns.state.tickingFrame) return;
    if (ns.state) ns.state.tickingFrame = true;
    requestAnimationFrame(function() {
      if (ns.state) ns.state.tickingFrame = false;
      interpolateWrapperMarginOnScroll(ns);
    });
  }, { passive: true });
  
  ns.layout = ns.layout || {};
  ns.layout.updateCasesContainerPaddingTop = updateCasesContainerPaddingTop;
  ns.layout.interpolateWrapperMarginOnScroll = interpolateWrapperMarginOnScroll;
  })(window.StackUI);
