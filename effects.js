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
        const o = useP;
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

      // если именно current-карточка получила эффект в кадре скролла списка — отметим
      if (ns.state.fromListScroll && i === currentIdx) {
        if (useKind) currentAffected = true;
      }
    }

    // после применения ко всем — снять current, если нужно
    if (ns.state.fromListScroll && currentAffected && currentCard) {
      currentCard.classList.remove('current');
      ns.state.lastCurrentCard = null;
    }
  }

  function updateWrapperMarginByWindowScroll(ns) {
    const m = ns.metrics;
    const y = Math.max(0, window.scrollY || window.pageYOffset || 0);
    const progress = m.wrapperScrollEndPx > 0
    ? Math.min(1, Math.max(0, y / m.wrapperScrollEndPx))
    : 0;

    const listHeightPx = m.listHeightStartPx +
          (m.listHeightEndPx - m.listHeightStartPx) * progress;
    ns.dom.container.style.height = `${listHeightPx}px`;

    // Назначать margin-top только после завершения прогресса (progress === 1)
    if (progress >= 1) {
      try {
        const stackWrapEl = document.querySelector('.main-container__stack-wrap');
        const wrapperEl = ns.dom.wrapper || document.querySelector('.main-container__stack-wrap__wrapper');
        if (stackWrapEl && wrapperEl) {
          const stackWrapHeight = stackWrapEl.getBoundingClientRect().height || 0;
          const wrapperHeight = wrapperEl.getBoundingClientRect().height || 0;
          const marginTopPx = Math.max(0, (stackWrapHeight - wrapperHeight) / 2);
          wrapperEl.style.marginTop = `${marginTopPx}px`;
        }
      } catch (_) {}
    } else {
      try {
        const wrapperEl = ns.dom.wrapper || document.querySelector('.main-container__stack-wrap__wrapper');
        if (wrapperEl) {
          wrapperEl.style.marginTop = '0px';
        }
      } catch (_) {}
    }
  }

  // Единый rAF-цикл: один кадр — один набор замеров и применений.
  function scheduleFrameUpdate(ns) {
    if (ns.state.tickingFrame) return;
    ns.state.tickingFrame = true;
    requestAnimationFrame(() => {
      ns.effects.updateWrapperMarginByWindowScroll(ns);

      const containerRect = ns.dom.container.getBoundingClientRect();
      const cardRects = ns.collections.cards.map(c => c.getBoundingClientRect());
      const caseRects = ns.collections.caseItems.map(i => i.getBoundingClientRect());
      const meas = { containerRect, cardRects, caseRects };

      ns.effects.updateZIndexes(ns, meas);
      ns.effects.updateListItemEffects(ns, meas);

      if (!ns.state.isProgrammaticWindowScroll) ns.sync.updateCasesActiveByWindowScroll(ns, meas);

      ns.state.fromListScroll = false; // сброс источника кадра
      ns.state.tickingFrame = false;
    });
  }

  ns.effects = {
    updateZIndexes,
    updateListItemEffects,
    updateWrapperMarginByWindowScroll,
    scheduleFrameUpdate
  };
})(window.StackUI);
