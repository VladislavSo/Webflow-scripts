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
    if (clampedPx >= (maxPaddingPx - 0.5) && wrapper) {
      wrapper.style.setProperty('margin-top', `calc(16.5rem + ${titlePx}px)`, 'important');
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

    // Начинаем анимацию только когда достигнут лимит padding-top у casesContainer
    if (clampedPx < (maxPaddingPx - 0.5)) return;

    const startMarginPx = (16.5 * ns.metrics.root) + titlePx;
    const endMarginPx = Math.max(0, (stackWrap.clientHeight - wrapper.clientHeight) / 2);

    // Переполнение относительно лимита (сколько «проскроллили» сверх 17.5rem)
    const overflowPx = Math.max(0, Math.round(paddingTopPx) - maxPaddingPx);
    // Пинг-понг от 0 до 1 и обратно, период 2*maxPaddingPx
    const periodPx = 2 * maxPaddingPx;
    const cycle = (overflowPx % periodPx) / maxPaddingPx; // 0..2
    const t = cycle <= 1 ? cycle : 2 - cycle;              // 0..1..0

    const currentMarginPx = startMarginPx + (endMarginPx - startMarginPx) * t;
    wrapper.style.setProperty('margin-top', `${currentMarginPx}px`, 'important');

    // Диагностика
    // eslint-disable-next-line no-console
    console.log('[StackUI][interp]', {
      listTopRelativePx,
      paddingTopPx,
      clampedPx,
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
