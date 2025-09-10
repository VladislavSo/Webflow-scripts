  // Глобальное пространство имён для модулей списка/кейсов.
  // Все остальные скрипты расширяют этот объект.
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
      effectEndRem: 2.25,
      topIndex1EndRem: -1.25,
      topIndex2StartRem: -1.25,
      topIndex2EndRem: -2.25,

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
      listHeightStartRem: 36,
      listHeightEndRem: 43.875
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
      fromListScroll: false,
      isProgrammaticListScroll: false
    };

    // Вспомогательные кэши
    ns.cache = {
      cardChildren: []  // Дочерние элементы карточек для управления opacity
    };
  })(window.StackUI);