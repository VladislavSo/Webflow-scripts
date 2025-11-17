(function(ns) {
  'use strict';

  // Снять с карточек классы current и любые "*-card-style".
  function clearCardDecorations(ns) {
    console.log('[clearCardDecorations] Удаление класса current при скролле window');
    ns.collections.cards.forEach(card => {
      if (card.classList.contains('current')) {
        console.log('[clearCardDecorations] Удален current с карточки:', card);
      }
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
    console.log('[markCardByPrefix] Вызвана, удаляем current со всех карточек перед добавлением новой');
    const targetCard =
          ns.maps.cardPrefixMap.get(prefix) ||
          ns.collections.cards.find(c => {
            const brand = c.getAttribute('brand-data') || c.getAttribute('data-brand') || '';
            return brand === `${prefix}-mini-view`;
          });
    if (!targetCard) return;

    ns.collections.cards.forEach(c => {
      if (c.classList.contains('current')) {
        console.log('[markCardByPrefix] Удален current с карточки:', c);
      }
      c.classList.remove('current');
    });
    console.log('[markCardByPrefix] Добавляем current и', `${prefix}-card-style`, 'на карточку:', targetCard);
    setTimeout(() => {
      targetCard.classList.add('current', `${prefix}-card-style`);
    }, 0);
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

  // Установить активный кейс и синхронизировать карточку.
  function setActiveCase(ns, targetCase, { scrollContainer = true } = {}) {
    console.log('[setActiveCase] Вызвана, будет удален current через clearCardDecorations');
    if (!targetCase) return;
    ns.collections.caseItems.forEach(ci => ci.classList.remove('active'));
    targetCase.classList.add('active');


    const prefix = (targetCase.id || '').split('-')[0] || '';
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
    console.log('[updateCasesActiveByWindowScroll] Вызвана при скролле window');
    let active = null;
    const rects = meas ? meas.caseRects : ns.collections.caseItems.map(i => i.getBoundingClientRect());
    for (let k = 0; k < ns.collections.caseItems.length; k++) {
      const rect = rects[k];
      if (rect.top <= ns.metrics.triggerOffsetPx && rect.bottom >= ns.metrics.triggerOffsetPx) {
        active = ns.collections.caseItems[k];
        break;
      }
    }
    
    // Детальное логирование для диагностики
    console.log('[updateCasesActiveByWindowScroll] active:', active ? active.id || active : 'null');
    console.log('[updateCasesActiveByWindowScroll] lastActiveCase:', ns.state.lastActiveCase ? ns.state.lastActiveCase.id || ns.state.lastActiveCase : 'null');
    console.log('[updateCasesActiveByWindowScroll] active !== lastActiveCase:', active !== ns.state.lastActiveCase);
    
    if (active) {
      // Проверка: даже если active === lastActiveCase, нужно убедиться, что класс active действительно установлен
      // Это защита от race condition при быстром скролле
      const isLastActiveCase = active === ns.state.lastActiveCase;
      const hasActiveClass = active.classList.contains('active');
      
      console.log('[updateCasesActiveByWindowScroll] isLastActiveCase:', isLastActiveCase);
      console.log('[updateCasesActiveByWindowScroll] hasActiveClass:', hasActiveClass);
      
      // Устанавливаем активный кейс если:
      // 1. Это новый кейс (active !== lastActiveCase), ИЛИ
      // 2. Это тот же кейс, но класс active не установлен (защита от race condition)
      if (!isLastActiveCase || !hasActiveClass) {
        if (!isLastActiveCase) {
          console.log('[updateCasesActiveByWindowScroll] ✅ УСЛОВИЕ TRUE: Найден новый активный кейс, вызываем setActiveCase');
        } else {
          console.log('[updateCasesActiveByWindowScroll] ⚠️ УСЛОВИЕ TRUE (защита): active === lastActiveCase, но класс active отсутствует, вызываем setActiveCase');
        }
        setActiveCase(ns, active, { scrollContainer: true });
      } else {
        console.log('[updateCasesActiveByWindowScroll] ⚠️ active === lastActiveCase И класс active установлен, пропускаем');
      }
    } else {
      console.log('[updateCasesActiveByWindowScroll] ⚠️ active === null, активный кейс не найден');
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
          console.log('[createCasesObserver] IntersectionObserver: найден intersecting элемент, вызываем setActiveCase');
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
    markCardByPrefix,
    setActiveCase,
    setActiveCaseOnly,
    updateCasesActiveByWindowScroll,
    createCasesObserver
  };
})(window.StackUI);
