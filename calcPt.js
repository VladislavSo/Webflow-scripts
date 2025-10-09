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
    const wrapperEl = ns.dom.wrapper;
    if (!casesContainer || !listEl || !casesGrid) return;

    const addPx = 2.25 * ns.metrics.root;
    const titlePx = 11.25 * ns.metrics.root;
    const maxPaddingPx = 17.5 * ns.metrics.root;
    const minPaddingPx = 7.5 * ns.metrics.root; // минимальный padding-top = 7.5rem
    // Новый расчёт padding-top: высота stack - высота wrapper - titlePx - addPx
    const stackEl = document.querySelector('.main-container__stack-wrap');
    let paddingTopPx = 0;
    let clampedPx = minPaddingPx;
    if (wrapperEl && stackEl) {
      const stackHeightPxForPadding = stackEl.getBoundingClientRect().height;
      const wrapperHeightPxForPadding = wrapperEl.getBoundingClientRect().height;
      paddingTopPx = stackHeightPxForPadding - wrapperHeightPxForPadding - titlePx - addPx;
      console.log(stackHeightPxForPadding, wrapperHeightPxForPadding, titlePx, addPx);
      console.log(paddingTopPx);
      clampedPx = Math.min(maxPaddingPx, Math.max(minPaddingPx, Math.round(paddingTopPx)));
      console.log(clampedPx);
    }
    casesContainer.style.paddingTop = `${clampedPx}px`;

    // Начальное позиционирование wrapper: margin-bottom
    // Формула: высота .main-container__stack-wrap - clampedPx - высота wrapper - titlePx
    if (wrapperEl && stackEl) {
      const stackHeightPx = stackEl.getBoundingClientRect().height;
      const wrapperHeightPx = wrapperEl.getBoundingClientRect().height;
      const marginBottomPx = Math.max(0, Math.round(stackHeightPx - clampedPx - wrapperHeightPx - titlePx - addPx - ns.metrics.root - (ns.metrics.root * 2.75)));
      console.log(stackHeightPx, clampedPx, wrapperHeightPx, titlePx, addPx, ns.metrics.root);
      wrapperEl.style.marginBottom = `${marginBottomPx}px`;
      console.log(marginBottomPx);
      // Сохраняем базовое значение для последующей интерполяции по скроллу
      if (!ns.state) ns.state = {};
      ns.state.baseMarginBottomPx = marginBottomPx;
    }

    // Начальная высота списка по прогрессу (p=0 → 36rem)
    const listHeightStartPx = ns.metrics.listHeightStartPx || (36 * ns.metrics.root);
    listEl.style.height = `${Math.round(listHeightStartPx)}px`;
  }

  // Создаёт функцию прогресса скролла от 0 до 1 на отрезке 17.5rem
  function createScrollProgress(ns) {
    const distancePx = 17.5 * ns.metrics.root;
    let startScrollY = window.scrollY || window.pageYOffset || 0;
    return function getProgress() {
      const currentScrollY = window.scrollY || window.pageYOffset || 0;
      const delta = currentScrollY - startScrollY;
      if (distancePx <= 0) return 1;
      const p = delta / distancePx;
      return Math.max(0, Math.min(1, p));
    };
  }

  // Вызываем onResize после завершения resize (debounce)
  let resizeTimeout;
  const onResize = function() { 
    updateCasesContainerPaddingTop(ns); 
    // Обновляем последние известные размеры вьюпорта
    lastViewportWidth = window.innerWidth;
    lastViewportHeight = window.innerHeight;
    setTimeout(onScroll, 50); // с задержкой 50ms вызовем onScroll
  };
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(onResize, 100); // вызываем onResize после завершения resize
  });
  // Трек текущих размеров вьюпорта, чтобы не вызывать onResize при простом переключении вкладок
  let lastViewportWidth = window.innerWidth;
  let lastViewportHeight = window.innerHeight;

  // Вызываем перерасчёт при входе/выходе из полноэкранного режима
  document.addEventListener('fullscreenchange', onResize);
  // При смене видимости вызываем onResize только если реально изменились размеры
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w !== lastViewportWidth || h !== lastViewportHeight) {
        onResize();
      }
    }
  });
  document.addEventListener('webkitfullscreenchange', onResize);
  document.addEventListener('mozfullscreenchange', onResize);
  document.addEventListener('MSFullscreenChange', onResize);

  // Привязка margin-bottom wrapper к прогрессу скролла на 17.5rem
  const getScrollProgress = createScrollProgress(ns);
  const onScroll = function() {
    const wrapperEl = ns.dom.wrapper;
    const listEl = ns.dom.container;
    const stackEl = document.querySelector('.main-container__stack-wrap');
    if (!wrapperEl || !stackEl || !listEl) return;
    const stackHeightPx = stackEl.getBoundingClientRect().height;
    const wrapperHeightPx = wrapperEl.getBoundingClientRect().height;
    const targetPx = Math.max(0, Math.round((stackHeightPx - wrapperHeightPx) / 2 - ns.metrics.root));
    const basePx = Number.isFinite(ns.state && ns.state.baseMarginBottomPx)
    ? ns.state.baseMarginBottomPx
    : (parseFloat(getComputedStyle(wrapperEl).marginBottom) || 0);
    const p = getScrollProgress();
    const currentPx = Math.round(basePx + (targetPx - basePx) * p);
    wrapperEl.style.marginBottom = `${currentPx}px`;

    // Интерполяция высоты списка: 36rem → 43.875rem по progress
    const heightStartPx = ns.metrics.listHeightStartPx || (36 * ns.metrics.root);
    const heightEndPx = ns.metrics.listHeightEndPx || (43.875 * ns.metrics.root);
    const listHeightPx = Math.round(heightStartPx + (heightEndPx - heightStartPx) * p);
    listEl.style.height = `${listHeightPx}px`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  ns.layout = ns.layout || {};
  ns.layout.updateCasesContainerPaddingTop = updateCasesContainerPaddingTop;
})(window.StackUI);


