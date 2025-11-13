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
    casesContainer: '.main-container__cases-container',
    stackWrap: '.main-container__stack-wrap'
  };

  ns.dom = {
    container: null,
    casesGrid: null,
    wrapper: null,
    casesContainer: null,
    stackWrap: null
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
    isProgrammaticListScroll: false,
    baseMarginBottomPx: 0
  };

  ns.cache = {
    cardChildren: [],
    computedStyles: new Map(),
    rects: new Map()
  };

  function throttle(func, delay) {
    let timeoutId = null;
    let lastExecTime = 0;
    return function(...args) {
      const currentTime = Date.now();
      const timeSinceLastExec = currentTime - lastExecTime;
      
      if (timeSinceLastExec >= delay) {
        func.apply(this, args);
        lastExecTime = currentTime;
      } else {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          func.apply(this, args);
          lastExecTime = Date.now();
        }, delay - timeSinceLastExec);
      }
    };
  }

  function getCachedRect(el) {
    if (!ns.cache.rects.has(el)) {
      ns.cache.rects.set(el, el.getBoundingClientRect());
    }
    return ns.cache.rects.get(el);
  }

  function invalidateRectCache() {
    ns.cache.rects.clear();
  }

  function getCachedComputedStyle(el, prop) {
    const key = `${el}_${prop}`;
    if (!ns.cache.computedStyles.has(key)) {
      const style = getComputedStyle(el);
      ns.cache.computedStyles.set(key, style[prop] || style.getPropertyValue(prop));
    }
    return ns.cache.computedStyles.get(key);
  }

  function invalidateStyleCache() {
    ns.cache.computedStyles.clear();
  }

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
      const handler = e => {
        ns.state.prefersReducedMotion = !!e.matches;
      };
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

    m.wrapperMarginStartPx = toPx(c.wrapperMarginStartRem || 0);
    m.wrapperMarginEndPx = toPx(c.wrapperMarginEndRem || 0);
    m.wrapperScrollEndPx = toPx(c.wrapperScrollEndRem);
    m.listHeightStartPx = toPx(c.listHeightStartRem);
    m.listHeightEndPx = toPx(c.listHeightEndRem);

    ns.state.rowGapPx = ns.dom.container ? getRowGapPx(ns.dom.container) : 0;
    invalidateRectCache();
    invalidateStyleCache();
  }

  function queryDom(ns) {
    const s = ns.selectors;
    ns.dom.container = document.querySelector(s.container);
    ns.dom.casesGrid = document.querySelector(s.casesGrid);
    ns.dom.wrapper = document.querySelector(s.wrapper);
    ns.dom.casesContainer = document.querySelector(s.casesContainer);
    ns.dom.stackWrap = document.querySelector(s.stackWrap);

    if (!ns.dom.container || !ns.dom.casesGrid) {
      return false;
    }

    ns.collections.cards = Array.from(ns.dom.container.querySelectorAll(s.cardItems));
    ns.collections.caseItems = Array.from(ns.dom.casesGrid.querySelectorAll(s.caseItems));
    ns.state.total = ns.collections.cards.length;

    if (ns.state.total === 0 || ns.collections.caseItems.length === 0) {
      return false;
    }

    return true;
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
      if (prefix && !ns.maps.cardPrefixMap.has(prefix)) {
        ns.maps.cardPrefixMap.set(prefix, card);
      }
    });

    ns.collections.caseItems.forEach(ci => {
      const prefix = (ci.id || '').split('-')[0] || '';
      if (prefix && !ns.maps.casePrefixMap.has(prefix)) {
        ns.maps.casePrefixMap.set(prefix, ci);
      }
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

  function updateCasesContainerPaddingTop(ns) {
    const casesContainer = ns.dom.casesContainer;
    const listEl = ns.dom.container;
    const casesGrid = ns.dom.casesGrid;
    const wrapperEl = ns.dom.wrapper;
    const stackEl = ns.dom.stackWrap;
    
    if (!casesContainer || !listEl || !casesGrid || !stackEl) return;

    const addPx = 1 * ns.metrics.root;
    const titlePx = 11.25 * ns.metrics.root;
    const maxPaddingPx = 20 * ns.metrics.root;
    const minPaddingPx = 7.5 * ns.metrics.root;
    
    const stackRect = getCachedRect(stackEl);
    const wrapperRect = getCachedRect(wrapperEl);
    
    const stackHeightPxForPadding = stackRect.height;
    const wrapperHeightPxForPadding = wrapperRect.height;
    const paddingTopPx = stackHeightPxForPadding - wrapperHeightPxForPadding - titlePx - addPx;
    const clampedPx = Math.min(maxPaddingPx, Math.max(minPaddingPx, Math.round(paddingTopPx)));
    
    casesContainer.style.paddingTop = `${clampedPx}px`;

    const stackHeightPx = stackRect.height;
    const wrapperHeightPx = wrapperRect.height;
    const marginBottomPx = Math.max(0, Math.round(stackHeightPx - clampedPx - wrapperHeightPx - titlePx + 4 - ns.metrics.root));
    wrapperEl.style.marginBottom = `${marginBottomPx}px`;
    ns.state.baseMarginBottomPx = marginBottomPx;

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

  const getScrollProgress = createScrollProgress(ns);
  
  const onScroll = throttle(function() {
    const wrapperEl = ns.dom.wrapper;
    const listEl = ns.dom.container;
    const stackEl = ns.dom.stackWrap;
    
    if (!wrapperEl || !stackEl || !listEl) return;
    
    invalidateRectCache();
    const stackRect = getCachedRect(stackEl);
    const wrapperRect = getCachedRect(wrapperEl);
    
    const stackHeightPx = stackRect.height;
    const wrapperHeightPx = wrapperRect.height;
    const targetPx = Math.max(0, Math.round((stackHeightPx - wrapperHeightPx) / 2 - ns.metrics.root));
    const basePx = Number.isFinite(ns.state.baseMarginBottomPx) ? ns.state.baseMarginBottomPx : (parseFloat(getComputedStyle(wrapperEl).marginBottom) || 0);
    const p = getScrollProgress();
    const currentPx = Math.round(basePx + (targetPx - basePx) * p);
    wrapperEl.style.marginBottom = `${currentPx}px`;
    
    const heightStartPx = ns.metrics.listHeightStartPx || (36 * ns.metrics.root);
    const heightEndPx = ns.metrics.listHeightEndPx || (43.875 * ns.metrics.root);
    const listHeightPx = Math.round(heightStartPx + (heightEndPx - heightStartPx) * p);
    listEl.style.height = `${listHeightPx}px`;
  }, 16);

  function updateZIndexes(ns, meas) {
    const cards = ns.collections.cards;
    const total = ns.state.total;
    const m = ns.metrics;
    const containerTop = meas ? meas.containerRect.top : getCachedRect(ns.dom.container).top;
    const rects = meas ? meas.cardRects : cards.map(c => getCachedRect(c));

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

    const containerRect = meas ? meas.containerRect : getCachedRect(ns.dom.container);
    const cardRects = meas ? meas.cardRects : cards.map(c => getCachedRect(c));
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
          card.style.backgroundColor = `rgb(${color14.r}, ${color14.g}, ${color14.b})`;
          card.style.top = '0px';
          card.style.bottom = `${-m.bottomIndex3StartPx}px`;
          ns.cache.cardChildren[i].forEach(el => { el.style.opacity = '0'; });
        } else {
          card.style.transform = 'scale(1)';
          card.style.backgroundColor = `rgb(${color21.r}, ${color21.g}, ${color21.b})`;
          ns.cache.cardChildren[i].forEach(el => { el.style.opacity = '1'; });
        }
      }
    }

    const checkFromListScroll = ns.state.fromListScroll;
    const checkCurrentCard = !!currentCard;
    const checkCurrentIdx = currentIdx !== -1;
    const checkProgrammatic = ns.state.isProgrammaticListScroll;
    const conditionMet = checkFromListScroll && checkCurrentCard && checkCurrentIdx && checkProgrammatic;
    
    if (conditionMet) {
      const r = meas ? meas.cardRects[currentIdx] : getCachedRect(currentCard);
      const distTop = Math.round(r.top - containerRect.top);
      const distFromBottom = Math.round(containerRect.bottom - r.bottom);

      const isAboveEnd = distTop < ns.metrics.effectEndPx;
      const isBelowEnd = distFromBottom > ns.metrics.bottomBandEndPx;
      const isWithin = distTop >= ns.metrics.effectEndPx && distFromBottom <= ns.metrics.bottomBandEndPx;

      if (isAboveEnd || isBelowEnd) {
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
      invalidateRectCache();
      const containerRect = getCachedRect(ns.dom.container);
      const cardRects = ns.collections.cards.map(c => getCachedRect(c));
      const caseRects = ns.collections.caseItems.map(i => getCachedRect(i));
      const meas = { containerRect, cardRects, caseRects };

      updateZIndexes(ns, meas);
      updateListItemEffects(ns, meas);

      if (!ns.state.isProgrammaticWindowScroll) {
        updateCasesActiveByWindowScroll(ns, meas);
      }

      ns.state.fromListScroll = false;
      ns.state.tickingFrame = false;
    });
  }

  function clearCardDecorations(ns) {
    ns.collections.cards.forEach(card => {
      card.classList.remove('current');
      Array.from(card.classList).forEach(cls => {
        if (cls.endsWith('-card-style')) card.classList.remove(cls);
      });
    });
    ns.state.lastCurrentCard = null;
  }

  function markCardByPrefix(ns, prefix, { scrollContainer = true } = {}) {
    const targetCard =
          ns.maps.cardPrefixMap.get(prefix) ||
          ns.collections.cards.find(c => {
            const brand = c.getAttribute('brand-data') || c.getAttribute('data-brand') || '';
            return brand === `${prefix}-mini-view`;
          });
    if (!targetCard) {
      return;
    }

    ns.collections.cards.forEach(c => c.classList.remove('current'));
    targetCard.classList.add('current', `${prefix}-card-style`);
    ns.state.lastCurrentCard = targetCard;
    
    if (scrollContainer) {
      const index = ns.collections.cards.indexOf(targetCard);
      if (index !== -1) {
        const scrollTop = index * ns.metrics.containerItemHeightPx + index * ns.state.rowGapPx;
        ns.state.isProgrammaticListScroll = true;
        ns.state.fromListScroll = false;
        ns.dom.container.scrollTo({ top: scrollTop, behavior: smoothBehavior(ns) });
        waitForElementScrollEnd(ns.dom.container).then(() => {
          ns.state.isProgrammaticListScroll = false;
        });
      }
    }
  }

  function setActiveCase(ns, targetCase, { scrollContainer = true } = {}) {
    if (!targetCase) return;
    ns.collections.caseItems.forEach(ci => ci.classList.remove('active'));
    targetCase.classList.add('active');

    const prefix = (targetCase.id || '').split('-')[0] || '';
    clearCardDecorations(ns);
    if (prefix) markCardByPrefix(ns, prefix, { scrollContainer });
    ns.state.lastActiveCase = targetCase;
  }

  function setActiveCaseOnly(ns, targetCase) {
    if (!targetCase) return;
    ns.collections.caseItems.forEach(ci => ci.classList.remove('active'));
    targetCase.classList.add('active');
    ns.state.lastActiveCase = targetCase;
  }

  function updateCasesActiveByWindowScroll(ns, meas) {
    let active = null;
    const rects = meas ? meas.caseRects : ns.collections.caseItems.map(i => getCachedRect(i));
    for (let k = 0; k < ns.collections.caseItems.length; k++) {
      const rect = rects[k];
      if (rect.top <= ns.metrics.triggerOffsetPx && rect.bottom >= ns.metrics.triggerOffsetPx) {
        active = ns.collections.caseItems[k];
        break;
      }
    }
    if (active && active !== ns.state.lastActiveCase) {
      setActiveCase(ns, active, { scrollContainer: true });
    }
  }

  function createCasesObserver(ns) {
    if (!('IntersectionObserver' in window)) {
      return;
    }
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

  let lastViewportWidth = window.innerWidth;
  let lastViewportHeight = window.innerHeight;

  function refreshEffectsWithDelay() {
    setTimeout(() => {
      invalidateRectCache();
      updateZIndexes(ns);
      updateListItemEffects(ns);
      scheduleFrameUpdate(ns);
    }, 300);
  }

  const onCardsScroll = throttle(function() {
    if (ns.state.isProgrammaticListScroll) {
      ns.state.fromListScroll = false;
      return;
    }
    ns.state.fromListScroll = true;
    scheduleFrameUpdate(ns);
  }, 16);

  const onWindowScroll = throttle(function() {
    ns.state.fromListScroll = false;
    scheduleFrameUpdate(ns);
  }, 16);

  function bindCardClicks(ns) {
    ns.collections.cards.forEach((card) => {
      card.addEventListener('click', () => {
        const brand = card.getAttribute('brand-data') || card.getAttribute('data-brand') || '';
        const prefix = (brand.split('-')[0] || '').trim();
        if (!prefix) return;

        const targetCase = ns.maps.casePrefixMap.get(prefix) || ns.collections.caseItems.find(ci => (ci.id || '').startsWith(prefix));

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
          ns.state.fromListScroll = false;
          ns.dom.container.scrollTo({ top: scrollTop, behavior: smoothBehavior(ns) });
          waitForElementScrollEnd(ns.dom.container).then(() => {
            ns.state.isProgrammaticListScroll = false;
            ns.collections.cards.forEach(c => c.classList.remove('current'));
            card.classList.add('current');
            ns.state.lastCurrentCard = card;
            scheduleFrameUpdate(ns);
          });
        }

        if (targetCase) {
          ns.state.isProgrammaticWindowScroll = true;
          invalidateRectCache();
          const y = window.scrollY + getCachedRect(targetCase).top - ns.metrics.pageScrollOffsetPx;
          window.scrollTo({ top: y, behavior: smoothBehavior(ns) });
          waitForWindowScrollEnd().then(() => {
            setActiveCaseOnly(ns, targetCase);
            ns.state.isProgrammaticWindowScroll = false;
            scheduleFrameUpdate(ns);
          });
        }
      });
    });
  }

  function bindHoverHandlers(ns) {
    ns.dom.container.addEventListener('mouseleave', () => {
      const targetCard = ns.collections.cards.find(c => Array.from(c.classList).some(cls => cls.endsWith('-card-style')));
      if (!targetCard) return;

      const index = ns.collections.cards.indexOf(targetCard);
      if (index !== -1) {
        const scrollTop = index * ns.metrics.containerItemHeightPx + index * ns.state.rowGapPx;
        ns.state.isProgrammaticListScroll = true;
        ns.state.fromListScroll = false;
        ns.dom.container.scrollTo({ top: scrollTop, behavior: smoothBehavior(ns) });
      }

      waitForElementScrollEnd(ns.dom.container).then(() => {
        setTimeout(() => {
          ns.state.isProgrammaticListScroll = false;
          ns.collections.cards.forEach(c => c.classList.remove('current'));
          targetCard.classList.add('current');
          ns.state.lastCurrentCard = targetCard;
          scheduleFrameUpdate(ns);
        }, 0);
      });
    });
  }

  const onResize = throttle(function() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w !== lastViewportWidth || h !== lastViewportHeight) {
      lastViewportWidth = w;
      lastViewportHeight = h;
      recalcMetrics(ns);
      createCasesObserver(ns);
      scheduleFrameUpdate(ns);
      updateCasesContainerPaddingTop(ns);
      refreshEffectsWithDelay();
    }
  }, 100);

  function bindAllScrolls(ns) {
    ns.dom.container.addEventListener('scroll', onCardsScroll, { passive: true });
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => {
      refreshEffectsWithDelay();
    });
  }

  function bootstrap() {
    if (!window.matchMedia('(min-width: 480px)').matches) {
      return;
    }
    
    if (!queryDom(ns)) {
      return;
    }

    setupReducedMotion(ns);
    recalcMetrics(ns);
    updateCasesContainerPaddingTop(ns);

    buildPrefixMaps(ns);
    cacheCardChildren(ns);
    initCards(ns);

    const initiallyActive = ns.collections.caseItems.find(ci => ci.classList.contains('active'));
    if (initiallyActive) {
      setActiveCase(ns, initiallyActive, { scrollContainer: true });
    } else {
      updateCasesActiveByWindowScroll(ns);
    }

    createCasesObserver(ns);

    bindCardClicks(ns);
    bindHoverHandlers(ns);
    bindAllScrolls(ns);

    scheduleFrameUpdate(ns);

    const fullscreenEvents = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    fullscreenEvents.forEach(event => {
      document.addEventListener(event, () => {
        refreshEffectsWithDelay();
      });
    });

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w !== lastViewportWidth || h !== lastViewportHeight) {
          onResize();
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
  window.addEventListener('scroll', onScroll, { passive: true });

  ns.utils = {
    getRowGapPx,
    waitForElementScrollEnd,
    waitForWindowScrollEnd,
    setupReducedMotion,
    smoothBehavior,
    recalcMetrics,
    throttle,
    getCachedRect,
    invalidateRectCache
  };

  ns.domTools = {
    queryDom,
    getCardPrefix,
    buildPrefixMaps,
    cacheCardChildren,
    initCards
  };

  ns.layout = {
    updateCasesContainerPaddingTop
  };

  ns.effects = {
    updateZIndexes,
    updateListItemEffects,
    scheduleFrameUpdate
  };

  ns.sync = {
    clearCardDecorations,
    markCardByPrefix,
    setActiveCase,
    setActiveCaseOnly,
    updateCasesActiveByWindowScroll,
    createCasesObserver
  };
})(window.StackUI);
