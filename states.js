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
    isProgrammaticListScroll: false,
    settingActiveCase: null
  };

  ns.cache = {
    cardChildren: []
  };
})(window.StackUI);
