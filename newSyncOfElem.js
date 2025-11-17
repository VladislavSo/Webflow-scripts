(function(ns) {
  'use strict';

  // Снять с карточек классы current и любые "*-card-style".
  // exceptCard - карточка, которую нужно пропустить (чтобы избежать race condition)
  function clearCardDecorations(ns, exceptCard = null) {
    console.log('[clearCardDecorations] Удаление класса current при скролле window', exceptCard ? '(исключая целевую карточку)' : '');
    ns.collections.cards.forEach(card => {
      // Пропускаем целевую карточку, если она указана (чтобы избежать удаления сразу после добавления)
      if (exceptCard && card === exceptCard) {
        console.log('[clearCardDecorations] Пропускаем целевую карточку:', card);
        return;
      }
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

    // Удаляем current со всех карточек, КРОМЕ целевой (чтобы избежать race condition)
    ns.collections.cards.forEach(c => {
      if (c !== targetCard && c.classList.contains('current')) {
        console.log('[markCardByPrefix] Удален current с карточки:', c);
        c.classList.remove('current');
      }
    });
    
    // Добавляем классы синхронно (без setTimeout) для избежания race condition
    console.log('[markCardByPrefix] Добавляем current и', `${prefix}-card-style`, 'на карточку:', targetCard);
    targetCard.classList.add('current', `${prefix}-card-style`);
    
    // Проверка после добавления (защита от race condition)
    requestAnimationFrame(() => {
      const hasCurrent = targetCard.classList.contains('current');
      const hasCardStyle = targetCard.classList.contains(`${prefix}-card-style`);
      if (!hasCurrent || !hasCardStyle) {
        console.error('[markCardByPrefix] ⚠️ КРИТИЧЕСКАЯ ПРОБЛЕМА: классы не добавлены! hasCurrent:', hasCurrent, 'hasCardStyle:', hasCardStyle);
        // Попытка исправить
        if (!hasCurrent) {
          console.log('[markCardByPrefix] Исправление: добавляем current');
          targetCard.classList.add('current');
        }
        if (!hasCardStyle) {
          console.log('[markCardByPrefix] Исправление: добавляем', `${prefix}-card-style`);
          targetCard.classList.add(`${prefix}-card-style`);
        }
      } else {
        console.log('[markCardByPrefix] ✅ Классы успешно добавлены: current и', `${prefix}-card-style`);
      }
    });
    
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
    
    // Находим целевую карточку ДО clearCardDecorations, чтобы передать её как исключение
    let targetCard = null;
    if (prefix) {
      targetCard = ns.maps.cardPrefixMap.get(prefix) ||
        ns.collections.cards.find(c => {
          const brand = c.getAttribute('brand-data') || c.getAttribute('data-brand') || '';
          return brand === `${prefix}-mini-view`;
        });
    }
    
    // Очищаем декорации, но пропускаем целевую карточку (чтобы избежать race condition)
    clearCardDecorations(ns, targetCard);
    
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
    
    // ВАЖНО: Всегда используем актуальные измерения, а не переданные meas
    // Это критично при быстром скролле, когда измерения могут быть устаревшими
    const rects = ns.collections.caseItems.map(i => i.getBoundingClientRect());
    
    let active = null;
    for (let k = 0; k < ns.collections.caseItems.length; k++) {
      const rect = rects[k];
      if (rect.top <= ns.metrics.triggerOffsetPx && rect.bottom >= ns.metrics.triggerOffsetPx) {
        active = ns.collections.caseItems[k];
        break;
      }
    }
    
    // Детальное логирование только если есть изменения или проблемы
    const willLog = !active || active !== ns.state.lastActiveCase || !active.classList.contains('active');
    
    if (willLog) {
      console.log('[updateCasesActiveByWindowScroll] active:', active ? (active.id || active.textContent?.substring(0, 20) || active) : 'null');
      console.log('[updateCasesActiveByWindowScroll] lastActiveCase:', ns.state.lastActiveCase ? (ns.state.lastActiveCase.id || ns.state.lastActiveCase.textContent?.substring(0, 20) || ns.state.lastActiveCase) : 'null');
      console.log('[updateCasesActiveByWindowScroll] active !== lastActiveCase:', active !== ns.state.lastActiveCase);
      
      if (active) {
        const activeRect = active.getBoundingClientRect();
        console.log('[updateCasesActiveByWindowScroll] active позиция:', {
          top: activeRect.top,
          bottom: activeRect.bottom,
          triggerOffset: ns.metrics.triggerOffsetPx,
          intersects: activeRect.top <= ns.metrics.triggerOffsetPx && activeRect.bottom >= ns.metrics.triggerOffsetPx
        });
      }
    }
    
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
        // active === lastActiveCase И класс active установлен
        // Это нормально, если IntersectionObserver уже установил правильный кейс
        // Но проверяем, действительно ли это правильный кейс для текущей позиции
        const activeRect = active.getBoundingClientRect();
        const shouldBeActive = activeRect.top <= ns.metrics.triggerOffsetPx && activeRect.bottom >= ns.metrics.triggerOffsetPx;
        
        if (shouldBeActive) {
          // Все правильно: IntersectionObserver уже установил правильный кейс
          // updateCasesActiveByWindowScroll не нужен в этом случае
          // Убираем лишние логи, чтобы не засорять консоль
        } else {
          // ПРОБЛЕМА: кейс установлен, но больше не пересекает линию активации
          console.warn('[updateCasesActiveByWindowScroll] ⚠️ ПРОБЛЕМА: active === lastActiveCase, но кейс больше не пересекает линию активации!');
          console.warn('[updateCasesActiveByWindowScroll] Исправление: устанавливаем правильный кейс');
          // Находим правильный кейс и устанавливаем его
          setActiveCase(ns, active, { scrollContainer: true });
        }
      }
    } else {
      console.log('[updateCasesActiveByWindowScroll] ⚠️ active === null, активный кейс не найден');
      
      // Если active === null, но lastActiveCase установлен, возможно нужно его сбросить?
      if (ns.state.lastActiveCase) {
        const lastRect = ns.state.lastActiveCase.getBoundingClientRect();
        const shouldBeActive = lastRect.top <= ns.metrics.triggerOffsetPx && lastRect.bottom >= ns.metrics.triggerOffsetPx;
        if (!shouldBeActive) {
          console.warn('[updateCasesActiveByWindowScroll] ⚠️ lastActiveCase установлен, но не пересекает линию активации');
        }
      }
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
