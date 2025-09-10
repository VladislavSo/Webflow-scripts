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