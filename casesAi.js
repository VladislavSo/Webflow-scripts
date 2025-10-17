window.StackUI = window.StackUI || {};

(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  // Селекторы ключевых узлов DOM
  ns.selectors = {
    container: '.main-container__stack-wrap__wrapper__list',
    casesGrid: '.cases-grid',
    wrapper: '.main-container__stack-wrap__wrapper',
    cardItems: '.main-container__stack-wrap__wrapper__list__item',
    caseItems: '.cases-grid__item',
    casesContainer: '.main-container__cases-container'
  };

  // Узлы DOM (будут заполнены при инициализации)
  ns.dom = {
    container: null,
    casesGrid: null,
    wrapper: null,
    casesContainer: null
  };

  // Коллекции элементов
  ns.collections = {
    cards: [],
    caseItems: []
  };

  // Карты соответствий по префиксу (brand/ID)
  ns.maps = {
    cardPrefixMap: new Map(),
    casePrefixMap: new Map()
  };

  // Цвета (RGB)
  ns.colors = {
    color21: { r: 21, g: 21, b: 21 },
    color18: { r: 18, g: 18, b: 18 },
    color14: { r: 14, g: 14, b: 14 }
  };

  // Константы (в rem)
  ns.constants = {
    thresholdRem: 15.75,            // Порог смены z-index
    triggerOffsetRem: 33.75,        // Вертикаль активации элемента кейса
    containerItemHeightRem: 7.375,  // Вертикальный шаг карточек списка
    pageScrollOffsetRem: 6.5,       // Отступ при прокрутке окна к кейсу

    // Верхняя полоса влияния (управляет i-1 и i-2)
    effectStartRem: 10.125,
    effectEndRem: 2.75,
    topIndex1EndRem: -1.5,
    topIndex2StartRem: -1.5,
    topIndex2EndRem: -2.75,

    // Нижняя полоса влияния (управляет i+2 и i+3)
    bottomBandStartRem: 10.125,
    bottomBandEndRem: 18,
    bottomIndex2StartRem: -1.5,
    bottomIndex2EndRem: 0,
    bottomIndex3StartRem: -2.75,
    bottomIndex3EndRem: -1.5,

    // Анимация wrapper и высоты списка от скролла окна
    //wrapperMarginStartRem: 29.875,
    //wrapperMarginEndRem: 10.375,
    wrapperScrollEndRem: 19.5,
    listHeightStartRem: 36.5,
    listHeightEndRem: 44.375
  };

  // Метрики в пикселях (заполняются при пересчёте)
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

  // Состояние выполнения/интеракций
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

  // Вспомогательные кэши
  ns.cache = {
    cardChildren: []  // Дочерние элементы карточек для управления opacity
  };
})(window.StackUI);

// ===== metricRecalculation.js =====
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

// ===== domScan.js =====
(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  // Прочитать ссылку на DOM-узлы и коллекции элементов.
  // Возвращает true при успехе, иначе false (если чего-то нет).
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

  // Извлечь префикс карточки (brand-data или data-brand).
  function getCardPrefix(card) {
    const brand = card.getAttribute('brand-data') || card.getAttribute('data-brand') || '';
    return (brand.split('-')[0] || '').trim();
  }

  // Построить карты соответствий префиксов → элементы (карточки и кейсы).
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

  // Закэшировать дочерние элементы карточек для массового управления прозрачностью.
  function cacheCardChildren(ns) {
    ns.cache.cardChildren = ns.collections.cards.map(card => Array.from(card.querySelectorAll('*')));
  }

  // Начальная подготовка карточек: позиционирование, z-index, базовые стили.
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

// ===== calcPt.js =====
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

    const addPx = 1 * ns.metrics.root;
    const titlePx = 11.25 * ns.metrics.root;
    const maxPaddingPx = 20 * ns.metrics.root;
    const minPaddingPx = 7.5 * ns.metrics.root; // минимальный padding-top = 7.5rem
    // Новый расчёт padding-top: высота stack - высота wrapper - titlePx - addPx
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

    // Начальное позиционирование wrapper: margin-bottom
    // Формула: высота .main-container__stack-wrap - clampedPx - высота wrapper - titlePx
    if (wrapperEl && stackEl) {
      const stackHeightPx = stackEl.getBoundingClientRect().height;
      const wrapperHeightPx = wrapperEl.getBoundingClientRect().height;
      const marginBottomPx = Math.max(0, Math.round(stackHeightPx - clampedPx - wrapperHeightPx - titlePx + 4 - ns.metrics.root));
      wrapperEl.style.marginBottom = `${marginBottomPx}px`;
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

// ===== effects.js =====
(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  // Обновить z-index карточек и класс rear по расстоянию до верха контейнера.
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

  // Обновить визуальные эффекты карточек (позиция/масштаб/прозрачность/фон).
  // Управление: учитывает ns.state.prefersReducedMotion — в этом режиме эффекты упрощаются.
  function updateListItemEffects(ns, meas) {
    const { color21, color18, color14 } = ns.colors;
    const m = ns.metrics;
    const cards = ns.collections.cards;

    // найти текущую карточку (если есть)
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
      // в режиме reduced motion не трогаем current
      return;
    }

    // сброс
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

    // верхнее влияние
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

    // нижнее влияние
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

      // позиция
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

      // доминирующий канал → визуальные свойства
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
        // сверху (index-2): scale 0.92→0.79, opacity всегда 0, bg 18→14
        const s = 0.92 - 0.13 * useP;
        const o = 0;
        const r = Math.round(color18.r + (color14.r - color18.r) * useP);
        const g = Math.round(color18.g + (color14.g - color18.g) * useP);
        const b = Math.round(color18.b + (color14.b - color18.b) * useP);
        card.style.transform = `scale(${s})`;
        card.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        ns.cache.cardChildren[i].forEach(el => { el.style.opacity = String(o); });
      } else if (useKind === 'idx1') {
        // сверху (index-1): scale 1→0.92, opacity 1→0, bg 21→18
        const s = 1 - 0.08 * useP;
        const o = 1 - useP;
        const r = Math.round(color21.r + (color18.r - color21.r) * useP);
        const g = Math.round(color21.g + (color18.g - color21.g) * useP);
        const b = Math.round(color21.b + (color18.b - color21.b) * useP);
        card.style.transform = `scale(${s})`;
        card.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        ns.cache.cardChildren[i].forEach(el => { el.style.opacity = String(o); });
      } else if (useKind === 'inc3') {
        // снизу (index+3): scale 0.79→0.92, opacity 0→1, bg 14→18
        const s = 0.79 + 0.13 * useP;
        const o = 0;
        const r = Math.round(color14.r + (color18.r - color14.r) * useP);
        const g = Math.round(color14.g + (color18.g - color14.g) * useP);
        const b = Math.round(color14.b + (color18.b - color14.b) * useP);
        card.style.transform = `scale(${s})`;
        card.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        ns.cache.cardChildren[i].forEach(el => { el.style.opacity = String(o); });
      } else if (useKind === 'inc2') {
        // снизу (index+2): scale 0.92→1, opacity 0→1, bg 18→21
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

      /* Removed: отключено отмечание current-карточки как затронутой эффектом на кадре скролла списка
      // если именно current-карточка получила эффект в кадре скролла списка — отметим
      if (ns.state.fromListScroll && i === currentIdx) {
        if (useKind) currentAffected = true;
      }
      */
    }

    /* Removed: отключено снятие класса current после применения эффектов
    // после применения ко всем — снять current, если нужно
    if (ns.state.fromListScroll && currentAffected && currentCard) {
      currentCard.classList.remove('current');
      ns.state.lastCurrentCard = null;
    }
    */

    // Логика снятия/восстановления current на основе выхода за рамки
    if (ns.state.fromListScroll && currentCard && currentIdx !== -1) {
      const r = meas ? meas.cardRects[currentIdx] : currentCard.getBoundingClientRect();
      const distTop = r.top - containerRect.top - 1;                   // расстояние до верха контейнера (минус 1px)
      const distFromBottom = containerRect.bottom - r.bottom - 1;      // расстояние от низа контейнера до низа карточки

      const isAboveEnd = distTop < ns.metrics.effectEndPx;        // строго меньше нижней границы верхней полосы
      const isBelowStart = distFromBottom > ns.metrics.bottomBandStartPx; // строго больше начала нижней полосы
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

  

  // Единый rAF-цикл: один кадр — один набор замеров и применений.
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

      ns.state.fromListScroll = false; // сброс источника кадра
      ns.state.tickingFrame = false;
    });
  }

  // Функции для управления видео в кейсах
  function pauseAllVideosInCase(caseItem) {
    if (!caseItem) return;
    const videos = caseItem.querySelectorAll('video');
    videos.forEach(video => {
      try {
        if (video && typeof video.pause === 'function') {
          video.pause();
        }
      } catch (e) {
        console.warn('Error pausing video:', e);
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
              // Игнорируем ошибки автовоспроизведения
            });
          }
        }
      } catch (e) {
        console.warn('Error playing video:', e);
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
        // Для talking-head видео не сбрасываем время, только пауза
        const isTalkingHead = video.closest('.cases-grid__item__container__wrap__talking-head__video');
        if (!isTalkingHead && typeof video.currentTime === 'number') {
          video.currentTime = 0;
        }
      } catch (e) {
        console.warn('Error pausing/resetting video:', e);
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

// ===== syncOfElem.js =====
(function(ns) {
  'use strict';

  // Снять с карточек классы current и любые "*-card-style".
  function clearCardDecorations(ns) {
    ns.collections.cards.forEach(card => {
      card.classList.remove('current');
      Array.from(card.classList).forEach(cls => {
        if (cls.endsWith('-card-style')) card.classList.remove(cls);
      });
    });
    ns.state.lastCurrentCard = null;
  }

  // Деактивировать все кейсы и остановить видео
  function deactivateAllCases(ns) {
    ns.collections.caseItems.forEach(caseItem => {
      caseItem.classList.remove('active');
      // Останавливаем все видео в деактивированном кейсе
      ns.effects.pauseAndResetVideosInCase(caseItem);
    });
    clearCardDecorations(ns);
    ns.state.lastActiveCase = null;
  }

  // Пометить карточку по префиксу: добавить current и "<prefix>-card-style".
  // Управление: scrollContainer — прокрутить контейнер списка до карточки.
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
    /*
    if (scrollContainer) {
      const index = ns.collections.cards.indexOf(targetCard);
      if (index !== -1) {
        const scrollTop = index * ns.metrics.containerItemHeightPx + index * ns.state.rowGapPx;
        ns.dom.container.scrollTo({ top: scrollTop, behavior: ns.utils.smoothBehavior(ns) });
      }
    }
    */
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

  // Установить активный кейс и синхронизировать карточку.
  function setActiveCase(ns, targetCase, { scrollContainer = true } = {}) {
    if (!targetCase) return;
    
    // Деактивируем все кейсы и останавливаем их видео
    ns.collections.caseItems.forEach(ci => {
      ci.classList.remove('active');
      if (ci !== targetCase) {
        ns.effects.pauseAndResetVideosInCase(ci);
      }
    });
    
    // Активируем целевой кейс
    targetCase.classList.add('active');
    
    // Запускаем видео в активированном кейсе
    ns.effects.playVideosInCase(targetCase);

    const prefix = (targetCase.id || '').split('-')[0] || '';
    clearCardDecorations(ns);
    if (prefix) markCardByPrefix(ns, prefix, { scrollContainer });
    ns.state.lastActiveCase = targetCase;
  }

  // Установить активным только кейс (без вмешательства в карточки/скролл списка).
  function setActiveCaseOnly(ns, targetCase) {
    if (!targetCase) return;
    
    // Деактивируем все кейсы и останавливаем их видео
    ns.collections.caseItems.forEach(ci => {
      ci.classList.remove('active');
      if (ci !== targetCase) {
        ns.effects.pauseAndResetVideosInCase(ci);
      }
    });
    
    // Активируем целевой кейс
    targetCase.classList.add('active');
    
    // Запускаем видео в активированном кейсе
    ns.effects.playVideosInCase(targetCase);
    
    ns.state.lastActiveCase = targetCase;
  }

  // Обновить активный кейс по текущему положению "линии" активации.
  // Не вызывается во время программной прокрутки окна.
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
      // Если нет активного кейса, но был активный - деактивируем все
      deactivateAllCases(ns);
    }
  }

  // Проверить и деактивировать все кейсы если ни один не пересекает линию активации
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
      // Если нет пересекающих элементов, но был активный - деактивируем все
      deactivateAllCases(ns);
    }
  }

  // Создать/пересоздать IntersectionObserver для выбора активного кейса по "линии" активации.
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

// ===== handlers.js =====
(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  // Отложенное обновление визуальных эффектов и z-index карточек
  let lastViewportWidth = window.innerWidth;
  let lastViewportHeight = window.innerHeight;
  function refreshEffectsWithDelay() {
    setTimeout(() => {
      ns.effects.updateZIndexes(ns);
      ns.effects.updateListItemEffects(ns);
      ns.effects.scheduleFrameUpdate(ns);
    }, 300);
  }

  // Обработчик скролла списка карточек: перерисовать эффекты (через rAF).
  function onCardsScroll() {
    ns.effects.scheduleFrameUpdate(ns);
    if (ns.state.isProgrammaticListScroll) return; // игнорируем программный скролл
    ns.state.fromListScroll = true;                // помечаем кадр как «от скролла списка»
    ns.effects.scheduleFrameUpdate(ns);
  }

  // Обработчик скролла окна: перерисовать эффекты (через rAF).
  function onWindowScroll() {
    ns.effects.scheduleFrameUpdate(ns);
  }

  // Механика клика по карточке:
  // 1) Снять у всех карточек любые "*-card-style"
  // 2) Добавить "<prefix>-card-style" и "current" к кликнутой карточке
  // 3) Прокрутить окно к соответствующему кейсу БЕЗ промежуточной активации других кейсов
  function bindCardClicks(ns) {
    ns.collections.cards.forEach((card) => {
      card.addEventListener('click', () => {
        const brand = card.getAttribute('brand-data') || card.getAttribute('data-brand') || '';
        const prefix = (brand.split('-')[0] || '').trim();
        if (!prefix) return;

        const targetCase =
              ns.maps.casePrefixMap.get(prefix) ||
              ns.collections.caseItems.find(ci => (ci.id || '').startsWith(prefix));

        // 1) снять все "*-card-style", очистить current
        ns.collections.cards.forEach(c => {
          c.classList.remove('current');
          Array.from(c.classList).forEach(cls => {
            if (cls.endsWith('-card-style')) c.classList.remove(cls);
          });
        });

        // 2) повесить "<prefix>-card-style" на кликнутую карточку
        card.classList.add(`${prefix}-card-style`);

        // 3) ПРОКРУТИТЬ КАРТОЧКУ В СПИСКЕ (как при mouseleave): сначала скролл, затем current
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

        // 4) ПРОКРУТИТЬ ОКНО К КЕЙСУ без промежуточной активации
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

  // Hover-логика списка:
  // mouseenter: снять только "current" у всех карточек
  // mouseleave: найти карточку с "*-card-style", сперва прокрутить к ней контейнер,
  //             затем назначить ей "current"
  function bindHoverHandlers(ns) {
    /*ns.dom.container.addEventListener('mouseenter', () => {
      ns.collections.cards.forEach(c => c.classList.remove('current'));
    });*/

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

  // Привязать обработчики скролла и resize. На resize — пересчёт метрик и пересоздание observer.
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
    // На смену ориентации — также обновляем эффекты
    window.addEventListener('orientationchange', () => { refreshEffectsWithDelay(); });
  }

  // Bootstrap: инициализация после DOMContentLoaded
  function bootstrap() {
    if (!window.matchMedia('(min-width: 480px)').matches) return;
    if (!ns.domTools.queryDom(ns)) return;

    ns.utils.setupReducedMotion(ns);
    ns.utils.recalcMetrics(ns);
    ns.layout.updateCasesContainerPaddingTop(ns);

    ns.domTools.buildPrefixMaps(ns);
    ns.domTools.cacheCardChildren(ns);
    ns.domTools.initCards(ns);

    // Убираем автоматическое присвоение класса active при инициализации
    // Класс active должен присваиваться только при пересечении центра экрана
    // const initiallyActive = ns.collections.caseItems.find(ci => ci.classList.contains('active'));
    // if (initiallyActive) ns.sync.setActiveCase(ns, initiallyActive, { scrollContainer: true });
    // else ns.sync.updateCasesActiveByWindowScroll(ns);

    ns.sync.createCasesObserver(ns);

    bindCardClicks(ns);
    bindHoverHandlers(ns);
    bindAllScrolls(ns);

    ns.effects.scheduleFrameUpdate(ns);

    // Обновление эффектов при переходе в/из полноэкранного режима
    document.addEventListener('fullscreenchange', () => { refreshEffectsWithDelay(); });
    document.addEventListener('webkitfullscreenchange', () => { refreshEffectsWithDelay(); });
    document.addEventListener('mozfullscreenchange', () => { refreshEffectsWithDelay(); });
    document.addEventListener('MSFullscreenChange', () => { refreshEffectsWithDelay(); });

    // visibilitychange больше не используется, т.к. нужен триггер только при реальном изменении окна
  }

  document.addEventListener('DOMContentLoaded', bootstrap);

})(window.StackUI);

// ===== hoverEffect.js =====
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

// ===== muteBtn.js =====
(function(){
  'use strict';
  if (window.CasesAudio && window.CasesAudio.initMuteHandlers) return;
  window.CasesAudio = window.CasesAudio || {};
  window.CasesAudio.soundOn = !!window.CasesAudio.soundOn; // глобальный флаг: был клик и снят muted
  window.CasesAudio.initMuteHandlers = true;
  // При клике по mute/unmute, если в кейсе есть talking-head видео,
  // сбрасываем currentTime только для этих видео (одноразово)
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

  // Внутри кнопки два икон-элемента. По индексу 0 — mute, по индексу 1 — unmute
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
    // звук доступен только когда слайд активен
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

    // переключаем глобальный флаг
    window.CasesAudio.soundOn = !window.CasesAudio.soundOn;

    // синхронизируем все кнопки
    setButtonIconsStateForAll(window.CasesAudio.soundOn);

    // применяем к ближайшему кейсу (если активен) и ко всем активным
    // Если в кейсе есть talking-head видео — сбросить currentTime только им (одноразово)
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
    // Очистить одноразовый список после применения ко всем активным
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
          // Слайд стал активным: если глобально включен звук, запускаем с начала; иначе оставляем muted
          applySoundStateToCase(item);
        } else if (wasActive && !isActive){
          // Слайд потерял active: вернуть muted для всех видео в кейсе
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

// ===== videoLazy.js =====
(function(){
  'use strict';
  
  // Определяем тип устройства
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 479px)').matches;
  const isDesktop = window.matchMedia && window.matchMedia('(min-width: 480px)').matches;
  
  // Функция для получения селекторов видео в зависимости от устройства
  function getVideoSelectors() {
    const selectors = [];
    
    if (isMobile) {
      // Для мобильных устройств: slide-inner__video-block video
      selectors.push('.slide-inner__video-block video');
    }
    
    if (isDesktop) {
      // Для десктопа: cases-grid__item__container__video-block video
      selectors.push('.cases-grid__item__container__video-block video');
    }
    
    // Общие для обоих устройств: talking-head видео
    selectors.push('.cases-grid__item__container__wrap__talking-head__video video');
    
    return selectors;
  }
  
  // Функция для получения правильного атрибута src в зависимости от устройства и типа видео
  function getSrcAttribute(video) {
    // Проверяем, является ли это talking-head видео
    const isTalkingHead = video.closest('.cases-grid__item__container__wrap__talking-head__video');
    
    if (isTalkingHead) {
      // Talking-head видео: mob-data-src для мобилы, data-src для десктопа
      if (isMobile) {
        return video.getAttribute('mob-data-src');
      } else {
        return video.getAttribute('data-src');
      }
    } else {
      // Обычные видео: data-src для обоих устройств
      return video.getAttribute('data-src');
    }
  }
  
  // Функция для ленивой загрузки видео
  function lazyLoadVideo(video) {
    try {
      const src = getSrcAttribute(video);
      const isTalkingHead = video.closest('.cases-grid__item__container__wrap__talking-head__video');
      
      if (!src) {
        console.warn('Video lazy load: no src attribute found for device type', {
          isMobile,
          isDesktop,
          isTalkingHead: !!isTalkingHead,
          hasMobDataSrc: !!video.getAttribute('mob-data-src'),
          hasDataSrc: !!video.getAttribute('data-src')
        });
        return false;
      }
      
      // Устанавливаем src и загружаем видео
      video.src = src;
      video.load();
      
      console.log('Video lazy loaded successfully:', {
        src: src,
        deviceType: isMobile ? 'mobile' : 'desktop',
        videoType: isTalkingHead ? 'talking-head' : 'regular',
        selector: isTalkingHead ? '.talking-head' : (isMobile ? '.slide-inner__video-block' : '.cases-grid__item__container__video-block')
      });
      
      return true;
    } catch (error) {
      console.error('Error lazy loading video:', error);
      return false;
    }
  }
  
  // Функция для инициализации ленивой загрузки всех видео
  function initVideoLazyLoad() {
    const selectors = getVideoSelectors();
    const allVideos = [];
    
    // Собираем все видео по селекторам
    selectors.forEach(selector => {
      try {
        const videos = document.querySelectorAll(selector);
        allVideos.push(...Array.from(videos));
      } catch (error) {
        console.error('Error querying videos with selector:', selector, error);
      }
    });
    
    console.log('Found videos for lazy loading:', {
      count: allVideos.length,
      selectors: selectors,
      deviceType: isMobile ? 'mobile' : 'desktop'
    });
    
    // Загружаем все видео
    let loadedCount = 0;
    allVideos.forEach(video => {
      if (lazyLoadVideo(video)) {
            loadedCount++;
      }
    });
    
    console.log(`Video lazy loading completed: ${loadedCount}/${allVideos.length} videos loaded`);
  }
  
  // Инициализируем ленивую загрузку после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVideoLazyLoad);
      } else {
    initVideoLazyLoad();
  }
  
  // Экспортируем функции для внешнего использования
  window.VideoLazyLoad = {
    initVideoLazyLoad,
    lazyLoadVideo,
    getVideoSelectors,
    getSrcAttribute
  };
})();
