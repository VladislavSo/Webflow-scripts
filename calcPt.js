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
      wrapper.style.setProperty('margin-top', `calc(16.5rem + ${titlePx}px)`);
    }
  }
  
  window.addEventListener('resize', function() { updateCasesContainerPaddingTop(ns); });
  
  ns.layout = ns.layout || {};
  ns.layout.updateCasesContainerPaddingTop = updateCasesContainerPaddingTop;
  })(window.StackUI);

