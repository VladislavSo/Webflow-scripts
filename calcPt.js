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
    const titlePx = 12.75 * ns.metrics.root;
    const maxPaddingPx = 17.5 * ns.metrics.root;
    const listTopViewportPx = listEl.getBoundingClientRect().top;
    const paddingTopPx = (listTopViewportPx + addPx) - (titlePx + addPx);
    const clampedPx = Math.min(maxPaddingPx, Math.max(0, Math.round(paddingTopPx)));
    casesContainer.style.paddingTop = `${clampedPx}px`;
    console.log(paddingTopPx);

    // Начальное позиционирование wrapper: margin-bottom
    // Формула: высота .main-container__stack-wrap + 2rem - clampedPx - высота wrapper
    const stackEl = document.querySelector('.main-container__stack-wrap');
    if (wrapperEl && stackEl) {
      const stackHeightPx = stackEl.getBoundingClientRect().height;
      const wrapperHeightPx = wrapperEl.getBoundingClientRect().height;
      const twoRemPx = 2 * ns.metrics.root;
      const marginBottomPx = Math.max(0, Math.round(stackHeightPx + twoRemPx - clampedPx - wrapperHeightPx));
      wrapperEl.style.marginBottom = `${marginBottomPx}px`;
      console.log(marginBottomPx);
      console.log(stackHeightPx "+" twoRemPx "-" clampedPx "-" wrapperHeightPx);
      console.log(stackHeightPx);
      console.log(twoRemPx);
      console.log(clampedPx);
      console.log(wrapperHeightPx);
    }
  }
  
  const onResize = function() { updateCasesContainerPaddingTop(ns); };
  window.addEventListener('resize', onResize);
  
  ns.layout = ns.layout || {};
  ns.layout.updateCasesContainerPaddingTop = updateCasesContainerPaddingTop;
  })(window.StackUI);
