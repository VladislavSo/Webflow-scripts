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
  
  function observeActiveCaseChanges(ns) {
    if (!('MutationObserver' in window)) return;
    
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          const hadActive = mutation.oldValue && mutation.oldValue.includes('active');
          const hasActive = target.classList.contains('active');
          
          if (hadActive !== hasActive) {
            ns.effects.scheduleFrameUpdate(ns);
            break;
          }
        }
      }
    });
    
    ns.collections.caseItems.forEach(caseItem => {
      observer.observe(caseItem, {
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true
      });
    });
    
    ns.observer = ns.observer || {};
    ns.observer.activeCaseChanges = observer;
  }
  
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
  
      console.log('[bindCardClicks] ⚠️ ПРОБЛЕМА: Добавляем', `${prefix}-card-style`, 'БЕЗ current на карточку:', card);
      card.classList.add(`${prefix}-card-style`);
  
       const index = ns.collections.cards.indexOf(card);
       if (index !== -1) {
         const scrollTop = index * ns.metrics.containerItemHeightPx + index * ns.state.rowGapPx;
         ns.state.isProgrammaticListScroll = true;
         ns.dom.container.scrollTo({ top: scrollTop, behavior: ns.utils.smoothBehavior(ns) });
        ns.utils.waitForElementScrollEnd(ns.dom.container).then(() => {
          ns.state.isProgrammaticListScroll = false;
          ns.collections.cards.forEach(c => c.classList.remove('current'));
          console.log('[bindCardClicks] Добавляем current на карточку ПОСЛЕ скролла контейнера:', card, 'Уже есть', `${prefix}-card-style`);
          card.classList.add('current');
          ns.state.lastCurrentCard = card;
          ns.effects.scheduleFrameUpdate(ns);
        });
       } else {
         console.log('[bindCardClicks] ⚠️ КРИТИЧЕСКАЯ ПРОБЛЕМА: index === -1, current НЕ будет добавлен, но', `${prefix}-card-style`, 'уже добавлен на карточку:', card);
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
     const targetCard = ns.collections.cards.find(c => Array.from(c.classList).some(cls => cls.endsWith('-card-style')));
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
  
   const initiallyActive = ns.collections.caseItems.find(ci => ci.classList.contains('active'));
   if (initiallyActive) ns.sync.setActiveCase(ns, initiallyActive, { scrollContainer: true });
   else ns.sync.updateCasesActiveByWindowScroll(ns);
  
   ns.sync.createCasesObserver(ns);
   observeActiveCaseChanges(ns);
  
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
