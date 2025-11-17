Vladislav Sobolkov, [17.11.2025 10:45]
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

  // Пометить карточку по префиксу: добавить current и "<prefix>-card-style".
  // Управление: scrollContainer — прокрутить контейнер списка до карточки.
  function markCardByPrefix(ns, prefix, { scrollContainer = true } = {}) {
    const targetCard =
          ns.maps.cardPrefixMap.get(prefix) ||
          ns.collections.cards.find(c => {
            const brand = c.getAttribute('brand-data')  c.getAttribute('data-brand')  '';
            return brand === ${prefix}-mini-view;
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
    ns.collections.caseItems.forEach(ci => ci.classList.remove('active'));
    targetCase.classList.add('active');


    const prefix = (targetCase.id  '').split('-')[0]  '';
    clearCardDecorations(ns);
    if (prefix) markCardByPrefix(ns, prefix, { scrollContainer });
    ns.state.lastActiveCase = targetCase;
  }

  // Установить активным только кейс (без вмешательства в карточки/скролл списка).
  function setActiveCaseOnly(ns, targetCase) {
    if (!targetCase) return;
    ns.collections.caseItems.forEach(ci => ci.classList.remove('active'));
    targetCase.classList.add('active');
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
    }
  }

Vladislav Sobolkov, [17.11.2025 10:45]
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
      rootMargin: ${topMargin}px 0px ${bottomMargin}px 0px,
      threshold: 0
    });
    ns.collections.caseItems.forEach(ci => ns.observer.cases.observe(ci));
  }

  ns.sync = {
    clearCardDecorations,
    markCardByPrefix,
    setActiveCase,
    setActiveCaseOnly,
    updateCasesActiveByWindowScroll,
    createCasesObserver
  };
})(window.StackUI);
