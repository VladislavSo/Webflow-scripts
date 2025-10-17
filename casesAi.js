window.StackUI = window.StackUI || {};

(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  ns.selectors = {
    container: '.main-container__stack-wrap__wrapper__list',
    casesGrid: '.cases-grid',
    wrapper: '.main-container__stack-wrap__wrapper',
    cardItems: '.main-container__stack-wrap__wrapper__list__item',
    caseItems: '.cases-grid__item',
    casesContainer: '.main-container__cases-container'
  };

  ns.dom = {
    container: null,
    casesGrid: null,
    wrapper: null,
    casesContainer: null
  };

  ns.collections = {
    cards: [],
    caseItems: []
  };

  ns.maps = {
    cardPrefixMap: new Map(),
    casePrefixMap: new Map()
  };

  ns.colors = {
    color21: { r: 21, g: 21, b: 21 },
    color18: { r: 18, g: 18, b: 18 },
    color14: { r: 14, g: 14, b: 14 }
  };

  ns.constants = {
    thresholdRem: 15.75,
    triggerOffsetRem: 33.75,
    containerItemHeightRem: 7.375,
    pageScrollOffsetRem: 6.5,

    effectStartRem: 10.125,
    effectEndRem: 2.75,
    topIndex1EndRem: -1.5,
    topIndex2StartRem: -1.5,
    topIndex2EndRem: -2.75,

    bottomBandStartRem: 10.125,
    bottomBandEndRem: 18,
    bottomIndex2StartRem: -1.5,
    bottomIndex2EndRem: 0,
    bottomIndex3StartRem: -2.75,
    bottomIndex3EndRem: -1.5,

    wrapperScrollEndRem: 19.5,
    listHeightStartRem: 36.5,
    listHeightEndRem: 44.375
  };

  ns.metrics = {
    root: 16,
    thresholdPx: 0,
    triggerOffsetPx: 0,
    containerItemHeightPx: 0,
    pageScrollOffsetPx: 0,

    effectStartPx: 0,
    effectEndPx: 0,
    topIndex1EndPx: 0,
    topIndex2StartPx: 0,
    topIndex2EndPx: 0,

    bottomBandStartPx: 0,
    bottomBandEndPx: 0,
    bottomIndex2StartPx: 0,
    bottomIndex2EndPx: 0,
    bottomIndex3StartPx: 0,
    bottomIndex3EndPx: 0,

    wrapperMarginStartPx: 0,
    wrapperMarginEndPx: 0,
    wrapperScrollEndPx: 0,
    listHeightStartPx: 0,
    listHeightEndPx: 0
  };

  ns.state = {
    total: 0,
    rowGapPx: 0,
    prefersReducedMotion: false,
    isProgrammaticWindowScroll: false,
    tickingFrame: false,
    lastActiveCase: null,
    lastCurrentCard: null,
    removedCurrentCard: null,
    fromListScroll: false,
    isProgrammaticListScroll: false
  };

  ns.cache = {
    cardChildren: []
  };
})(window.StackUI);

(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  function getRowGapPx(el) {
    const cs = getComputedStyle(el);
    const raw = cs.rowGap || cs.gap || '0';
    const val = parseFloat(raw);
    return Number.isFinite(val) ? val : 0;
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
    recalcMetrics
  };
})(window.StackUI);

(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  function queryDom(ns) {
    const s = ns.selectors;
    ns.dom.container = document.querySelector(s.container);
    ns.dom.casesGrid = document.querySelector(s.casesGrid);
    ns.dom.wrapper = document.querySelector(s.wrapper);
    ns.dom.casesContainer = document.querySelector(ns.selectors.casesContainer);

    if (!ns.dom.container || !ns.dom.casesGrid) return false;

    ns.collections.cards = Array.from(ns.dom.container.querySelectorAll(s.cardItems));
    ns.collections.caseItems = Array.from(ns.dom.casesGrid.querySelectorAll(s.caseItems));
    ns.state.total = ns.collections.cards.length;

    return ns.state.total > 0 && ns.collections.caseItems.length > 0;
  }

  function getCardPrefix(card) {
    const brand = card.getAttribute('brand-data') || card.getAttribute('data-brand') || '';
    return (brand.split('-')[0] || '').trim();
  }

  function buildPrefixMaps(ns) {
    ns.maps.cardPrefixMap.clear();
    ns.maps.casePrefixMap.clear();

    ns.collections.cards.forEach(card => {
      const prefix = getCardPrefix(card);
      if (prefix && !ns.maps.cardPrefixMap.has(prefix)) ns.maps.cardPrefixMap.set(prefix, card);
    });

    ns.collections.caseItems.forEach(ci => {
      const prefix = (ci.id || '').split('-')[0] || '';
      if (prefix && !ns.maps.casePrefixMap.has(prefix)) ns.maps.casePrefixMap.set(prefix, ci);
    });
  }

  function cacheCardChildren(ns) {
    ns.cache.cardChildren = ns.collections.cards.map(card => Array.from(card.querySelectorAll('*')));
  }

  function initCards(ns) {
    const total = ns.state.total;
    const { color21 } = ns.colors;

    ns.collections.cards.forEach((card, index) => {
      const pos = getComputedStyle(card).position;
      if (pos === 'static') card.style.position = 'relative';

      card.style.zIndex = String(total + 1 - index);
      card.classList.add('rear');

      card.style.backgroundColor = `rgb(${color21.r}, ${color21.g}, ${color21.b})`;
      card.style.transform = 'scale(1)';
      card.style.top = '0px';
      card.style.bottom = '0px';
      ns.cache.cardChildren[index].forEach(el => { el.style.opacity = '1'; });
    });
  }

  ns.domTools = {
    queryDom,
    getCardPrefix,
    buildPrefixMaps,
    cacheCardChildren,
    initCards
  };
})(window.StackUI);

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
    const basePx = Number.isFinite(ns.state && ns.state.baseMarginBottomPx)
    ? ns.state.baseMarginBottomPx
    : (parseFloat(getComputedStyle(wrapperEl).marginBottom) || 0);
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

(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  function updateZIndexes(ns, meas) {
    const cards = ns.collections.cards;
    const total = ns.state.total;
    const m = ns.metrics;
    const containerTop = meas ? meas.containerRect.top : ns.dom.container.getBoundingClientRect().top;
    const rects = meas ? meas.cardRects : cards.map(c => c.getBoundingClientRect());

    rects.forEach((rect, index) => {
      const distanceToTop = rect.top - containerTop;
      const isHigh = distanceToTop >= m.thresholdPx;
      const card = cards[index];
      card.style.zIndex = String(isHigh ? (total + 1 - index) : (index + 1));
      if (isHigh) card.classList.add('rear'); else card.classList.remove('rear');
    });
  }

  function updateListItemEffects(ns, meas) {
    const { color21, color18, color14 } = ns.colors;
    const m = ns.metrics;
    const cards = ns.collections.cards;

    const currentCard = ns.state.lastCurrentCard || cards.find(c => c.classList.contains('current'));
    const currentIdx = currentCard ? cards.indexOf(currentCard) : -1;
    let currentAffected = false;

    if (ns.state.prefersReducedMotion) {
      cards.forEach((card, idx) => {
        card.style.transform = 'scale(1)';
        card.style.top = '0px';
        card.style.bottom = '0px';
        card.style.backgroundColor = `rgb(${color21.r}, ${color21.g}, ${color21.b})`;
        ns.cache.cardChildren[idx].forEach(el => { el.style.opacity = '1'; });
      });
      return;
    }

    cards.forEach((card, idx) => {
      card.style.transform = 'scale(1)';
      card.style.top = '0px';
      card.style.bottom = '0px';
      card.style.backgroundColor = `rgb(${color21.r}, ${color21.g}, ${color21.b})`;
      ns.cache.cardChildren[idx].forEach(el => { el.style.opacity = '1'; });
    });

    const containerRect = meas ? meas.containerRect : ns.dom.container.getBoundingClientRect();
    const cardRects = meas ? meas.cardRects : cards.map(c => c.getBoundingClientRect());

    const topRange = Math.max(1, m.effectStartPx - m.effectEndPx);
    const bottomRange = Math.max(1, m.bottomBandEndPx - m.bottomBandStartPx);

    const idx1Prog = new Array(cards.length).fill(-1);
    const idx2Prog = new Array(cards.length).fill(-1);
    const inc2Prog = new Array(cards.length).fill(-1);
    const inc3Prog = new Array(cards.length).fill(-1);

    for (let j = 1; j < cards.length; j++) {
      const distTop = cardRects[j].top - containerRect.top;
      if (distTop > m.effectStartPx) continue;
      const p = Math.min(1, Math.max(0, (m.effectStartPx - distTop) / topRange));
      if (p <= 0) continue;
      const t1 = j - 1;
      const t2 = j - 2;
      if (t1 >= 0) idx1Prog[t1] = Math.max(idx1Prog[t1], p);
      if (t2 >= 0) idx2Prog[t2] = Math.max(idx2Prog[t2], p);
    }

    for (let j = 0; j < cards.length; j++) {
      const distFromBottom = containerRect.bottom - cardRects[j].bottom;
      if (distFromBottom < m.bottomBandStartPx || distFromBottom > m.bottomBandEndPx) continue;
      const p = Math.min(1, Math.max(0, (distFromBottom - m.bottomBandStartPx) / bottomRange));
      if (p <= 0) continue;
      const t2 = j + 2;
      const t3 = j + 3;
      if (t2 < cards.length) inc2Prog[t2] = Math.max(inc2Prog[t2], p);
      if (t3 < cards.length) inc3Prog[t3] = Math.max(inc3Prog[t3], p);
    }

    let furthestBottomIdx = -1;
    for (let i = 0; i < cards.length; i++) {
      if (inc2Prog[i] >= 0 || inc3Prog[i] >= 0) furthestBottomIdx = Math.max(furthestBottomIdx, i);
    }
    const hasBottomTargets = furthestBottomIdx >= 0;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];

      let topKind = null, topP = -1;
      if (idx2Prog[i] >= 0) { topKind = 'idx2'; topP = idx2Prog[i]; }
      else if (idx1Prog[i] >= 0) { topKind = 'idx1'; topP = idx1Prog[i]; }

      let botKind = null, botP = -1;
      if (inc3Prog[i] >= 0) { botKind = 'inc3'; botP = inc3Prog[i]; }
      else if (inc2Prog[i] >= 0) { botKind = 'inc2'; botP = inc2Prog[i]; }

      if (topKind === 'idx2') {
        const t = -m.topIndex2StartPx - (m.topIndex2EndPx - m.topIndex2StartPx) * topP;
        card.style.top = `${t}px`;
        card.style.bottom = '0px';
      } else if (topKind === 'idx1') {
        const t = -m.topIndex1EndPx * topP;
        card.style.top = `${t}px`;
        card.style.bottom = '0px';
      } else if (botKind) {
        card.style.top = '0px';
        if (botKind === 'inc3') {
          const b = -m.bottomIndex3StartPx + (m.bottomIndex3StartPx - m.bottomIndex3EndPx) * botP;
          card.style.bottom = `${b}px`;
        } else {
          const b = -m.bottomIndex2StartPx + m.bottomIndex2StartPx * botP;
          card.style.bottom = `${b}px`;
        }
      } else {
        card.style.top = '0px';
        card.style.bottom = '0px';
      }

      const weight = (kind, p) => {
        if (!kind) return -1;
        const base = kind.endsWith('3') ? 3 : (kind.endsWith('2') ? 2 : 1);
        return base * p;
      };
      const topW = weight(topKind, topP);
      const botW = weight(botKind, botP);
      const useKind = botW > topW ? botKind : topKind;
      const useP = botW > topW ? botP : topP;

      if (useKind === 'idx2') {
        const s = 0.92 - 0.13 * useP;
        const o = 0;
        const r = Math.round(color18.r + (color14.r - color18.r) * useP);
        const g = Math.round(color18.g + (color14.g - color18.g) * useP);
        const b = Math.round(color18.b + (color14.b - color18.b) * useP);
        card.style.transform = `scale(${s})`;
        card.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        ns.cache.cardChildren[i].forEach(el => { el.style.opacity = String(o); });
      } else if (useKind === 'idx1') {
        const s = 1 - 0.08 * useP;
        const o = 1 - useP;
        const r = Math.round(color21.r + (color18.r - color21.r) * useP);
        const g = Math.round(color21.g + (color18.g - color21.g) * useP);
        const b = Math.round(color21.b + (color18.b - color21.b) * useP);
        card.style.transform = `scale(${s})`;
        card.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        ns.cache.cardChildren[i].forEach(el => { el.style.opacity = String(o); });
      } else if (useKind === 'inc3') {
        const s = 0.79 + 0.13 * useP;
        const o = 0;
        const r = Math.round(color14.r + (color18.r - color14.r) * useP);
        const g = Math.round(color14.g + (color18.g - color14.g) * useP);
        const b = Math.round(color14.b + (color18.b - color14.b) * useP);
        card.style.transform = `scale(${s})`;
        card.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        ns.cache.cardChildren[i].forEach(el => { el.style.opacity = String(o); });
      } else if (useKind === 'inc2') {
        const s = 0.92 + 0.08 * useP;
        const o = useP;
        const r = Math.round(color18.r + (color21.r - color18.r) * useP);
        const g = Math.round(color18.g + (color21.g - color18.g) * useP);
        const b = Math.round(color18.b + (color21.b - color18.b) * useP);
        card.style.transform = `scale(${s})`;
        card.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        ns.cache.cardChildren[i].forEach(el => { el.style.opacity = String(o); });
      } else {
        if (hasBottomTargets && i > furthestBottomIdx) {
          card.style.transform = 'scale(0.79)';
          card.style.backgroundColor = `rgb(${ns.colors.color14.r}, ${ns.colors.color14.g}, ${ns.colors.color14.b})`;
          card.style.top = '0px';
          card.style.bottom = `${-m.bottomIndex3StartPx}px`;
          ns.cache.cardChildren[i].forEach(el => { el.style.opacity = '0'; });
        } else {
          card.style.transform = 'scale(1)';
          card.style.backgroundColor = `rgb(${ns.colors.color21.r}, ${ns.colors.color21.g}, ${ns.colors.color21.b})`;
          ns.cache.cardChildren[i].forEach(el => { el.style.opacity = '1'; });
        }
      }

    }


    if (ns.state.fromListScroll && currentCard && currentIdx !== -1) {
      const r = meas ? meas.cardRects[currentIdx] : currentCard.getBoundingClientRect();
      const distTop = r.top - containerRect.top - 1;
      const distFromBottom = containerRect.bottom - r.bottom - 1;

      const isAboveEnd = distTop < ns.metrics.effectEndPx;
      const isBelowStart = distFromBottom > ns.metrics.bottomBandStartPx;
      const isWithin = distTop >= ns.metrics.effectEndPx && distFromBottom <= ns.metrics.bottomBandStartPx;

      if (isAboveEnd || isBelowStart) {
        if (currentCard.classList.contains('current')) {
          currentCard.classList.remove('current');
          ns.state.removedCurrentCard = currentCard;
          ns.state.lastCurrentCard = null;
        }
      } else if (isWithin) {
        if (!currentCard.classList.contains('current') && ns.state.removedCurrentCard === currentCard) {
          currentCard.classList.add('current');
          ns.state.lastCurrentCard = currentCard;
          ns.state.removedCurrentCard = null;
        }
      }
    }
  }

  

  function scheduleFrameUpdate(ns) {
    if (ns.state.tickingFrame) return;
    ns.state.tickingFrame = true;
    requestAnimationFrame(() => {
      const containerRect = ns.dom.container.getBoundingClientRect();
      const cardRects = ns.collections.cards.map(c => c.getBoundingClientRect());
      const caseRects = ns.collections.caseItems.map(i => i.getBoundingClientRect());
      const meas = { containerRect, cardRects, caseRects };

      ns.effects.updateZIndexes(ns, meas);
      ns.effects.updateListItemEffects(ns, meas);

      if (!ns.state.isProgrammaticWindowScroll) {
        ns.sync.updateCasesActiveByWindowScroll(ns, meas);
        ns.sync.checkAndDeactivateCases(ns);
      }

      ns.state.fromListScroll = false;
      ns.state.tickingFrame = false;
    });
  }

  function pauseAllVideosInCase(caseItem) {
    if (!caseItem) return;
    const videos = caseItem.querySelectorAll('video');
    videos.forEach(video => {
      try {
        if (video && typeof video.pause === 'function') {
          video.pause();
        }
      } catch (e) {
      }
    });
  }

  function playVideosInCase(caseItem) {
    if (!caseItem) return;
    const videos = caseItem.querySelectorAll('video');
    videos.forEach(video => {
      try {
        if (video && typeof video.play === 'function') {
          const playPromise = video.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch(() => {
            });
          }
        }
      } catch (e) {
      }
    });
  }

  function pauseAndResetVideosInCase(caseItem) {
    if (!caseItem) return;
    const videos = caseItem.querySelectorAll('video');
    videos.forEach(video => {
      try {
        if (video && typeof video.pause === 'function') {
          video.pause();
        }
        const isTalkingHead = video.closest('.cases-grid__item__container__wrap__talking-head__video');
        if (!isTalkingHead && typeof video.currentTime === 'number') {
          video.currentTime = 0;
        }
      } catch (e) {
      }
    });
  }

  ns.effects = {
    updateZIndexes,
    updateListItemEffects,
    scheduleFrameUpdate,
    pauseAllVideosInCase,
    playVideosInCase,
    pauseAndResetVideosInCase
  };
})(window.StackUI);

(function(ns) {
  'use strict';

  function clearCardDecorations(ns) {
    ns.collections.cards.forEach(card => {
      card.classList.remove('current');
      Array.from(card.classList).forEach(cls => {
        if (cls.endsWith('-card-style')) card.classList.remove(cls);
      });
    });
    ns.state.lastCurrentCard = null;
  }

  function deactivateAllCases(ns) {
    ns.collections.caseItems.forEach(caseItem => {
      caseItem.classList.remove('active');
      ns.effects.pauseAndResetVideosInCase(caseItem);
    });
    clearCardDecorations(ns);
    ns.state.lastActiveCase = null;
  }

  function markCardByPrefix(ns, prefix, { scrollContainer = true } = {}) {
    const targetCard =
          ns.maps.cardPrefixMap.get(prefix) ||
          ns.collections.cards.find(c => {
            const brand = c.getAttribute('brand-data') || c.getAttribute('data-brand') || '';
            return brand === `${prefix}-mini-view`;
          });
    if (!targetCard) return;

    ns.collections.cards.forEach(c => c.classList.remove('current'));
    targetCard.classList.add('current', `${prefix}-card-style`);
    ns.state.lastCurrentCard = targetCard;
    if (scrollContainer) {
      const index = ns.collections.cards.indexOf(targetCard);
      if (index !== -1) {
        const scrollTop = index * ns.metrics.containerItemHeightPx + index * ns.state.rowGapPx;
        ns.state.isProgrammaticListScroll = true;
        ns.dom.container.scrollTo({ top: scrollTop, behavior: ns.utils.smoothBehavior(ns) });
        ns.utils.waitForElementScrollEnd(ns.dom.container).then(() => {
          ns.state.isProgrammaticListScroll = false;
        });
      }
    }
  }

  function setActiveCase(ns, targetCase, { scrollContainer = true } = {}) {
    if (!targetCase) return;
    
    ns.collections.caseItems.forEach(ci => {
      ci.classList.remove('active');
      if (ci !== targetCase) {
        ns.effects.pauseAndResetVideosInCase(ci);
      }
    });
    
    targetCase.classList.add('active');
    
    ns.effects.playVideosInCase(targetCase);

    const prefix = (targetCase.id || '').split('-')[0] || '';
    clearCardDecorations(ns);
    if (prefix) markCardByPrefix(ns, prefix, { scrollContainer });
    ns.state.lastActiveCase = targetCase;
  }

  function setActiveCaseOnly(ns, targetCase) {
    if (!targetCase) return;
    
    ns.collections.caseItems.forEach(ci => {
      ci.classList.remove('active');
      if (ci !== targetCase) {
        ns.effects.pauseAndResetVideosInCase(ci);
      }
    });
    
    targetCase.classList.add('active');
    
    ns.effects.playVideosInCase(targetCase);
    
    ns.state.lastActiveCase = targetCase;
  }

  function updateCasesActiveByWindowScroll(ns, meas) {
    let active = null;
    const rects = meas ? meas.caseRects : ns.collections.caseItems.map(i => i.getBoundingClientRect());
    for (let k = 0; k < ns.collections.caseItems.length; k++) {
      const rect = rects[k];
      if (rect.top <= ns.metrics.triggerOffsetPx && rect.bottom >= ns.metrics.triggerOffsetPx) {
        active = ns.collections.caseItems[k];
        break;
      }
    }
    if (active && active !== ns.state.lastActiveCase) {
      setActiveCase(ns, active, { scrollContainer: true });
    } else if (!active && ns.state.lastActiveCase) {
      deactivateAllCases(ns);
    }
  }

  function checkAndDeactivateCases(ns) {
    if (ns.state.isProgrammaticWindowScroll) return;
    
    let hasIntersecting = false;
    const rects = ns.collections.caseItems.map(i => i.getBoundingClientRect());
    
    for (let k = 0; k < ns.collections.caseItems.length; k++) {
      const rect = rects[k];
      if (rect.top <= ns.metrics.triggerOffsetPx && rect.bottom >= ns.metrics.triggerOffsetPx) {
        hasIntersecting = true;
        break;
      }
    }
    
    if (!hasIntersecting && ns.state.lastActiveCase) {
      deactivateAllCases(ns);
    }
  }

  function createCasesObserver(ns) {
    if (!('IntersectionObserver' in window)) return;
    if (ns.observer && ns.observer.cases) {
      ns.observer.cases.disconnect();
      ns.observer.cases = null;
    }
    const topMargin = -ns.metrics.triggerOffsetPx;
    const bottomMargin = -(window.innerHeight - ns.metrics.triggerOffsetPx - 1);
    ns.observer = ns.observer || {};
    ns.observer.cases = new IntersectionObserver((entries) => {
      if (ns.state.isProgrammaticWindowScroll) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveCase(ns, entry.target, { scrollContainer: true });
          break;
        }
      }
    }, {
      root: null,
      rootMargin: `${topMargin}px 0px ${bottomMargin}px 0px`,
      threshold: 0
    });
    ns.collections.caseItems.forEach(ci => ns.observer.cases.observe(ci));
  }

  ns.sync = {
    clearCardDecorations,
    deactivateAllCases,
    markCardByPrefix,
    setActiveCase,
    setActiveCaseOnly,
    updateCasesActiveByWindowScroll,
    checkAndDeactivateCases,
    createCasesObserver
  };
})(window.StackUI);

(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  let lastViewportWidth = window.innerWidth;
  let lastViewportHeight = window.innerHeight;
  function refreshEffectsWithDelay() {
    setTimeout(() => {
      ns.effects.updateZIndexes(ns);
      ns.effects.updateListItemEffects(ns);
      ns.effects.scheduleFrameUpdate(ns);
    }, 300);
  }

  function onCardsScroll() {
    ns.effects.scheduleFrameUpdate(ns);
    if (ns.state.isProgrammaticListScroll) return;
    ns.state.fromListScroll = true;
    ns.effects.scheduleFrameUpdate(ns);
  }

  function onWindowScroll() {
    ns.effects.scheduleFrameUpdate(ns);
  }

  function bindCardClicks(ns) {
    ns.collections.cards.forEach((card) => {
      card.addEventListener('click', () => {
        const brand = card.getAttribute('brand-data') || card.getAttribute('data-brand') || '';
        const prefix = (brand.split('-')[0] || '').trim();
        if (!prefix) return;

        const targetCase =
              ns.maps.casePrefixMap.get(prefix) ||
              ns.collections.caseItems.find(ci => (ci.id || '').startsWith(prefix));

        ns.collections.cards.forEach(c => {
          c.classList.remove('current');
          Array.from(c.classList).forEach(cls => {
            if (cls.endsWith('-card-style')) c.classList.remove(cls);
          });
        });

        card.classList.add(`${prefix}-card-style`);

        const index = ns.collections.cards.indexOf(card);
        if (index !== -1) {
          const scrollTop = index * ns.metrics.containerItemHeightPx + index * ns.state.rowGapPx;
          ns.state.isProgrammaticListScroll = true;
          ns.dom.container.scrollTo({ top: scrollTop, behavior: ns.utils.smoothBehavior(ns) });
          ns.utils.waitForElementScrollEnd(ns.dom.container).then(() => {
            ns.state.isProgrammaticListScroll = false;
            ns.collections.cards.forEach(c => c.classList.remove('current'));
            card.classList.add('current');
            ns.state.lastCurrentCard = card;
            ns.effects.scheduleFrameUpdate(ns);
          });
        }

        if (targetCase) {
          ns.state.isProgrammaticWindowScroll = true;
          const y = window.scrollY + targetCase.getBoundingClientRect().top - ns.metrics.pageScrollOffsetPx;
          window.scrollTo({ top: y, behavior: ns.utils.smoothBehavior(ns) });
          ns.utils.waitForWindowScrollEnd().then(() => {
            ns.sync.setActiveCaseOnly(ns, targetCase);
            ns.state.isProgrammaticWindowScroll = false;
            ns.effects.scheduleFrameUpdate(ns);
          });
        }
      });
    });
  }

  function bindHoverHandlers(ns) {

    ns.dom.container.addEventListener('mouseleave', () => {
      const targetCard = ns.collections.cards.find(c =>
                                                   Array.from(c.classList).some(cls => cls.endsWith('-card-style'))
                                                  );
      if (!targetCard) return;

      const index = ns.collections.cards.indexOf(targetCard);
      if (index !== -1) {
        const scrollTop = index * ns.metrics.containerItemHeightPx + index * ns.state.rowGapPx;
        ns.state.isProgrammaticListScroll = true;
        ns.dom.container.scrollTo({ top: scrollTop, behavior: ns.utils.smoothBehavior(ns) });
      }

      ns.utils.waitForElementScrollEnd(ns.dom.container).then(() => {
        setTimeout(() => {
          ns.state.isProgrammaticListScroll = false;
          ns.collections.cards.forEach(c => c.classList.remove('current'));
          targetCard.classList.add('current');
          ns.state.lastCurrentCard = targetCard;
          ns.effects.scheduleFrameUpdate(ns);
        }, 0);
      });
    });
  }

  function bindAllScrolls(ns) {
    ns.dom.container.addEventListener('scroll', onCardsScroll, { passive: true });
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    window.addEventListener('resize', () => {
      ns.utils.recalcMetrics(ns);
      ns.sync.createCasesObserver(ns);
      ns.effects.scheduleFrameUpdate(ns);
      ns.layout.updateCasesContainerPaddingTop(ns);
      refreshEffectsWithDelay();
    });
    window.addEventListener('orientationchange', () => { refreshEffectsWithDelay(); });
  }

  function bootstrap() {
    if (!window.matchMedia('(min-width: 480px)').matches) return;
    if (!ns.domTools.queryDom(ns)) return;

    ns.utils.setupReducedMotion(ns);
    ns.utils.recalcMetrics(ns);
    ns.layout.updateCasesContainerPaddingTop(ns);

    ns.domTools.buildPrefixMaps(ns);
    ns.domTools.cacheCardChildren(ns);
    ns.domTools.initCards(ns);


    ns.sync.createCasesObserver(ns);

    bindCardClicks(ns);
    bindHoverHandlers(ns);
    bindAllScrolls(ns);

    ns.effects.scheduleFrameUpdate(ns);

    document.addEventListener('fullscreenchange', () => { refreshEffectsWithDelay(); });
    document.addEventListener('webkitfullscreenchange', () => { refreshEffectsWithDelay(); });
    document.addEventListener('mozfullscreenchange', () => { refreshEffectsWithDelay(); });
    document.addEventListener('MSFullscreenChange', () => { refreshEffectsWithDelay(); });

  }

  document.addEventListener('DOMContentLoaded', bootstrap);

})(window.StackUI);

document.addEventListener("DOMContentLoaded", () => {
  if (!window.matchMedia('(min-width: 480px)').matches) return;

  const items = document.querySelectorAll(".main-container__stack-wrap__wrapper__list__item");

  items.forEach(item => {
    if (!item.classList.contains("card-style")) {
      item.addEventListener("mouseenter", () => {
        item.style.backgroundColor = "#1d1d1d";
      });

      item.addEventListener("mouseleave", () => {
        item.style.backgroundColor = "";
      });
    }
  });
});

(function(){
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;
  if (window.CasesAudio && window.CasesAudio.initMuteHandlers) return;
  window.CasesAudio = window.CasesAudio || {};
  window.CasesAudio.soundOn = !!window.CasesAudio.soundOn;
  window.CasesAudio.initMuteHandlers = true;
  window.CasesAudio.resetOnlyTheseOnce = null;

  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

  function getCaseItem(el){
    try { return el.closest('.cases-grid__item') || null; } catch(_) { return null; }
  }

  function findCaseVideos(caseEl){
    if (!caseEl) return [];
    try {
      var list = caseEl.querySelectorAll('.cases-grid__item__container video, .cases-grid__item__container__wrap__talking-head__video video, .story-track-wrapper video');
      return Array.prototype.slice.call(list);
    } catch(_) { return []; }
  }

  function setButtonIconsState(btn, soundOn){
    try{
      var icons = btn.querySelectorAll('.action-bar__mute-btn__icon, .cases-grid__item__container__wrap__talking-head__btn__icon');
      if (!icons || icons.length < 2) return;
      icons = Array.prototype.slice.call(icons);
      icons.forEach(function(icon){ icon.classList.remove('active'); });
      var index = soundOn ? 1 : 0;
      if (icons[index]) icons[index].classList.add('active');
    }catch(_){ }
  }

  function setButtonIconsStateForAll(soundOn){
    var buttons = $all('.action-bar__mute-btn, .cases-grid__item__container__wrap__talking-head__mute-btn');
    buttons.forEach(function(btn){ setButtonIconsState(btn, soundOn); });
  }

  function applySoundStateToCase(caseEl){
    var videos = findCaseVideos(caseEl);
    if (!videos || !videos.length) return;
    if (!caseEl.classList.contains('active')){
      videos.forEach(function(v){ try { v.muted = true; } catch(_){ } });
      return;
    }
    if (window.CasesAudio.soundOn){
      var listToReset = window.CasesAudio.resetOnlyTheseOnce;
      videos.forEach(function(v){
        try { v.muted = false; } catch(_){ }
        if (listToReset){
          if (listToReset.indexOf(v) !== -1){
            try { v.currentTime = 0; } catch(_){ }
          }
        } else {
          try { v.currentTime = 0; } catch(_){ }
        }
        try { v.volume = 1; } catch(_){ }
        try { if (v.paused) v.play().catch(function(){}); } catch(_){ }
      });
    } else {
      videos.forEach(function(v){ try { v.muted = true; } catch(_){ } });
    }
  }

  function applySoundStateToActiveCases(){
    var activeCases = $all('.cases-grid__item.active');
    activeCases.forEach(applySoundStateToCase);
  }

  function onMuteButtonClick(ev){
    try{ ev.preventDefault(); ev.stopPropagation(); }catch(_){ }
    var btn = ev.currentTarget;
    var caseEl = getCaseItem(btn);

    window.CasesAudio.soundOn = !window.CasesAudio.soundOn;

    setButtonIconsStateForAll(window.CasesAudio.soundOn);

    if (caseEl){
      try{
        var thVideos = caseEl.querySelectorAll('.cases-grid__item__container__wrap__talking-head__video video');
        thVideos = Array.prototype.slice.call(thVideos || []);
        if (thVideos.length){
          window.CasesAudio.resetOnlyTheseOnce = thVideos;
        }
      }catch(_){ }
    }
    if (caseEl) applySoundStateToCase(caseEl);
    applySoundStateToActiveCases();
    window.CasesAudio.resetOnlyTheseOnce = null;
  }

  function initButtons(){
    var buttons = $all('.action-bar__mute-btn, .cases-grid__item__container__wrap__talking-head__mute-btn');
    buttons.forEach(function(btn){
      btn.removeEventListener('click', onMuteButtonClick, false);
      btn.addEventListener('click', onMuteButtonClick, false);
      setButtonIconsState(btn, !!window.CasesAudio.soundOn);
    });
  }

  function initMutationForCases(){
    var items = $all('.cases-grid__item');
    var obs = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        var item = m.target;
        var wasActive = (m.oldValue || '').split(/\s+/).indexOf('active') !== -1;
        var isActive = item.classList.contains('active');
        if (!wasActive && isActive){
          applySoundStateToCase(item);
        } else if (wasActive && !isActive){
          var videos = findCaseVideos(item);
          videos.forEach(function(v){ try { v.muted = true; } catch(_){ } });
        }
      });
    });
    items.forEach(function(item){
      obs.observe(item, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      initButtons();
      setButtonIconsStateForAll(!!window.CasesAudio.soundOn);
      initMutationForCases();
    });
  } else {
    initButtons();
    setButtonIconsStateForAll(!!window.CasesAudio.soundOn);
    initMutationForCases();
  }
})();

(function(){
  'use strict';
  
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 479px)').matches;
  const isDesktop = window.matchMedia && window.matchMedia('(min-width: 480px)').matches;
  
  function getVideoSelectors() {
    const selectors = [];
    
    if (isMobile) {
      selectors.push('.slide-inner__video-block video');
    }
    
    if (isDesktop) {
      selectors.push('.cases-grid__item__container__video-block video');
    }
    
    selectors.push('.cases-grid__item__container__wrap__talking-head__video video');
    
    return selectors;
  }
  
  function getSrcAttribute(video) {
    const isTalkingHead = video.closest('.cases-grid__item__container__wrap__talking-head__video');
    
    if (isTalkingHead) {
      if (isMobile) {
        return video.getAttribute('mob-data-src');
      } else {
        return video.getAttribute('data-src');
      }
    } else {
      return video.getAttribute('data-src');
    }
  }
  
  function lazyLoadVideo(video) {
    try {
      const src = getSrcAttribute(video);
      const isTalkingHead = video.closest('.cases-grid__item__container__wrap__talking-head__video');
      
      if (!src) {
        return false;
      }
      
      video.src = src;
      video.load();
      
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  function loadHeroAndInterfaceVideos() {
    return new Promise((resolve) => {
      const heroVideos = document.querySelectorAll('.hero-wrapper__video-block__video-block video');
      const interfaceVideos = document.querySelectorAll('.interface-wrapper__video-block__video video');
      
      const allPriorityVideos = [...heroVideos, ...interfaceVideos];
      
      if (allPriorityVideos.length === 0) {
        resolve();
        return;
      }
      
      let loadedCount = 0;
      const totalVideos = allPriorityVideos.length;
      
      
      allPriorityVideos.forEach(video => {
        try {
          const src = video.getAttribute('data-src') || video.getAttribute('mob-data-src');
          if (src) {
            video.src = src;
            video.load();
            
            const onLoadedMetadata = () => {
              loadedCount++;
              
              if (loadedCount === totalVideos) {
                resolve();
              }
            };
            
            const onError = () => {
              loadedCount++;
              
              if (loadedCount === totalVideos) {
                resolve();
              }
            };
            
            video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
            video.addEventListener('error', onError, { once: true });
          } else {
            loadedCount++;
            
            if (loadedCount === totalVideos) {
              resolve();
            }
          }
        } catch (error) {
          loadedCount++;
          
          if (loadedCount === totalVideos) {
            resolve();
          }
        }
      });
    });
  }

  function loadCasesVideosSequentially() {
    const caseItems = document.querySelectorAll('.cases-grid__item');
    
    if (caseItems.length === 0) {
      return;
    }
    
    
    let currentIndex = 0;
    
    function loadNextCase() {
      if (currentIndex >= caseItems.length) {
        return;
      }
      
      const caseItem = caseItems[currentIndex];
      const videos = caseItem.querySelectorAll('video');
      
      if (videos.length === 0) {
        currentIndex++;
        setTimeout(loadNextCase, 100);
        return;
      }
      
      
      let loadedInCase = 0;
      const totalInCase = videos.length;
      
      videos.forEach(video => {
        try {
          const src = getSrcAttribute(video);
          if (src) {
            video.src = src;
            video.load();
            
            const onLoadedMetadata = () => {
              loadedInCase++;
              
              if (loadedInCase === totalInCase) {
                currentIndex++;
                setTimeout(loadNextCase, 200);
              }
            };
            
            const onError = () => {
              loadedInCase++;
              
              if (loadedInCase === totalInCase) {
                currentIndex++;
                setTimeout(loadNextCase, 200);
              }
            };
            
            video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
            video.addEventListener('error', onError, { once: true });
          } else {
            loadedInCase++;
            
            if (loadedInCase === totalInCase) {
              currentIndex++;
              setTimeout(loadNextCase, 200);
            }
          }
        } catch (error) {
          loadedInCase++;
          
          if (loadedInCase === totalInCase) {
            currentIndex++;
            setTimeout(loadNextCase, 200);
          }
        }
      });
    }
    
    loadNextCase();
  }

  function initVideoLazyLoad() {
    
    loadHeroAndInterfaceVideos().then(() => {
      loadCasesVideosSequentially();
    }).catch(error => {
      
      loadCasesVideosSequentially();
    });
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVideoLazyLoad);
      } else {
    initVideoLazyLoad();
  }
  
  window.VideoLazyLoad = {
    initVideoLazyLoad,
    lazyLoadVideo,
    getVideoSelectors,
    getSrcAttribute,
    loadHeroAndInterfaceVideos,
    loadCasesVideosSequentially
  };
})();
