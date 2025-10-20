(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;
  function updateCasesContainerPaddingTop(ns) {
    const casesContainer = ns.dom.casesContainer;
    const listEl = ns.dom.container;
    const casesGrid = ns.dom.casesGrid;
    const wrapperEl = ns.dom.wrapper;
    if (!casesContainer || !listEl || !casesGrid) return;

    const addPx = 1 * ns.metrics.root;
    const titlePx = 11.25 * ns.metrics.root;
    const maxPaddingPx = 20 * ns.metrics.root;
    const minPaddingPx = 7.5 * ns.metrics.root;
    const stackEl = document.querySelector('.main-container__stack-wrap');
    let paddingTopPx = 0;
    let clampedPx = minPaddingPx;
    if (wrapperEl && stackEl) {
      const stackHeightPxForPadding = stackEl.getBoundingClientRect().height;
      const wrapperHeightPxForPadding = wrapperEl.getBoundingClientRect().height;
      paddingTopPx = stackHeightPxForPadding - wrapperHeightPxForPadding - titlePx - addPx;
      clampedPx = Math.min(maxPaddingPx, Math.max(minPaddingPx, Math.round(paddingTopPx)));
    }
    casesContainer.style.paddingTop = `${clampedPx}px`;

    if (wrapperEl && stackEl) {
      const stackHeightPx = stackEl.getBoundingClientRect().height;
      const wrapperHeightPx = wrapperEl.getBoundingClientRect().height;
      const marginBottomPx = Math.max(0, Math.round(stackHeightPx - clampedPx - wrapperHeightPx - titlePx + 4 - ns.metrics.root));
      wrapperEl.style.marginBottom = `${marginBottomPx}px`;
      if (!ns.state) ns.state = {};
      ns.state.baseMarginBottomPx = marginBottomPx;
    }

    const listHeightStartPx = ns.metrics.listHeightStartPx || (36 * ns.metrics.root);
    listEl.style.height = `${Math.round(listHeightStartPx)}px`;
  }

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

  let resizeTimeout;
  const onResize = function() { 
    updateCasesContainerPaddingTop(ns); 
    lastViewportWidth = window.innerWidth;
    lastViewportHeight = window.innerHeight;
    setTimeout(onScroll, 50);
  };
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(onResize, 100);
  });
  let lastViewportWidth = window.innerWidth;
  let lastViewportHeight = window.innerHeight;

  document.addEventListener('fullscreenchange', onResize);
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

  const getScrollProgress = createScrollProgress(ns);
  const onScroll = function() {
    const wrapperEl = ns.dom.wrapper;
    const listEl = ns.dom.container;
    const stackEl = document.querySelector('.main-container__stack-wrap');
    if (!wrapperEl || !stackEl || !listEl) return;
    const stackHeightPx = stackEl.getBoundingClientRect().height;
    const wrapperHeightPx = wrapperEl.getBoundingClientRect().height;
    const targetPx = Math.max(0, Math.round((stackHeightPx - wrapperHeightPx) / 2 - ns.metrics.root));
    const basePx = Number.isFinite(ns.state && ns.state.baseMarginBottomPx) ? ns.state.baseMarginBottomPx : (parseFloat(getComputedStyle(wrapperEl).marginBottom) || 0);
    const p = getScrollProgress();
    const currentPx = Math.round(basePx + (targetPx - basePx) * p);
    wrapperEl.style.marginBottom = `${currentPx}px`;
    
    const heightStartPx = ns.metrics.listHeightStartPx || (36 * ns.metrics.root);
    const heightEndPx = ns.metrics.listHeightEndPx || (43.875 * ns.metrics.root);
    const listHeightPx = Math.round(heightStartPx + (heightEndPx - heightStartPx) * p);
    listEl.style.height = `${listHeightPx}px`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  ns.layout = ns.layout || {};
  ns.layout.updateCasesContainerPaddingTop = updateCasesContainerPaddingTop;
})(window.StackUI);



