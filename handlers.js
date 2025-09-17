(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  // Отложенное обновление визуальных эффектов и z-index карточек
  let lastViewportWidth = window.innerWidth;
  let lastViewportHeight = window.innerHeight;
  function refreshEffectsWithDelay(delayMs = 50) {
    setTimeout(() => {
      ns.effects.updateZIndexes(ns);
      ns.effects.updateListItemEffects(ns);
      ns.effects.scheduleFrameUpdate(ns);
    }, delayMs);
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
    });
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

    const initiallyActive = ns.collections.caseItems.find(ci => ci.classList.contains('active'));
    if (initiallyActive) ns.sync.setActiveCase(ns, initiallyActive, { scrollContainer: true });
    else ns.sync.updateCasesActiveByWindowScroll(ns);

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

    // При возврате вкладки в видимое состояние — триггерим обновление,
    // только если реально изменились размеры
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w !== lastViewportWidth || h !== lastViewportHeight) {
          lastViewportWidth = w;
          lastViewportHeight = h;
          refreshEffectsWithDelay();
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', bootstrap);

})(window.StackUI);
