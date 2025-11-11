(function(ns) {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

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

  function updateListItemEffects(ns, meas) {
    const { color21, color18, color14 } = ns.colors;
    const m = ns.metrics;
    const cards = ns.collections.cards;

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
      return;
    }

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
        const s = 0.92 - 0.13 * useP;
        const o = 0;
        const r = Math.round(color18.r + (color14.r - color18.r) * useP);
        const g = Math.round(color18.g + (color14.g - color18.g) * useP);
        const b = Math.round(color18.b + (color14.b - color18.b) * useP);
        card.style.transform = `scale(${s})`;
        card.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        ns.cache.cardChildren[i].forEach(el => { el.style.opacity = String(o); });
      } else if (useKind === 'idx1') {
        const s = 1 - 0.08 * useP;
        const o = 1 - useP;
        const r = Math.round(color21.r + (color18.r - color21.r) * useP);
        const g = Math.round(color21.g + (color18.g - color21.g) * useP);
        const b = Math.round(color21.b + (color18.b - color21.b) * useP);
        card.style.transform = `scale(${s})`;
        card.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        ns.cache.cardChildren[i].forEach(el => { el.style.opacity = String(o); });
      } else if (useKind === 'inc3') {
        const s = 0.79 + 0.13 * useP;
        const o = 0;
        const r = Math.round(color14.r + (color18.r - color14.r) * useP);
        const g = Math.round(color14.g + (color18.g - color14.g) * useP);
        const b = Math.round(color14.b + (color18.b - color14.b) * useP);
        card.style.transform = `scale(${s})`;
        card.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        ns.cache.cardChildren[i].forEach(el => { el.style.opacity = String(o); });
      } else if (useKind === 'inc2') {
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
    }

    if (ns.state.fromListScroll && currentCard && currentIdx !== -1) {
      const r = meas ? meas.cardRects[currentIdx] : currentCard.getBoundingClientRect();
      const distTop = r.top - containerRect.top - 1;                   // расстояние до верха контейнера (минус 1px)
      const distFromBottom = containerRect.bottom - r.bottom - 1;      // расстояние от низа контейнера до низа карточки

      const isAboveEnd = distTop < ns.metrics.effectEndPx;        // строго меньше нижней границы верхней полосы
      const isBelowStart = distFromBottom > ns.metrics.bottomBandStartPx; // строго больше начала нижней полосы
      const isWithin = distTop >= ns.metrics.effectEndPx && distFromBottom <= ns.metrics.bottomBandStartPx;

      const skipRemoval = ns.state.isProgrammaticListScroll || ns.state.isProgrammaticWindowScroll;

      if (!skipRemoval && (isAboveEnd || isBelowStart)) {
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

  function findCardByPrefix(ns, prefix) {
    if (!prefix) return null;
    if (ns.maps && ns.maps.cardPrefixMap && ns.maps.cardPrefixMap.has(prefix)) {
      return ns.maps.cardPrefixMap.get(prefix);
    }
    return ns.collections.cards.find(c => {
      const brand = c.getAttribute('brand-data') || c.getAttribute('data-brand') || '';
      return brand === `${prefix}-mini-view`;
    }) || null;
  }

  function ensureCurrentMatchesActive(ns) {
    if (!ns.sync || typeof ns.sync.markCardByPrefix !== 'function') return;
    const activeCase = ns.state.lastActiveCase || ns.collections.caseItems.find(ci => ci.classList.contains('active'));
    if (!activeCase) return;
    const prefix = (activeCase.id || '').split('-')[0] || '';
    if (!prefix) return;
    const expectedCard = findCardByPrefix(ns, prefix);
    if (!expectedCard || expectedCard.classList.contains('current')) return;
    ns.sync.markCardByPrefix(ns, prefix, { scrollContainer: false });
  }

  function scheduleFromListScrollReset(ns) {
    if (!ns.state.fromListScroll) {
      if (ns.state.fromListScrollResetId) {
        clearTimeout(ns.state.fromListScrollResetId);
        ns.state.fromListScrollResetId = null;
      }
      return;
    }
    if (ns.state.fromListScrollResetId) {
      clearTimeout(ns.state.fromListScrollResetId);
    }
    ns.state.fromListScrollResetId = setTimeout(() => {
      ns.state.fromListScroll = false;
      ns.state.fromListScrollResetId = null;
    }, 120);
  }

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

      if (!ns.state.isProgrammaticWindowScroll) ns.sync.updateCasesActiveByWindowScroll(ns, meas);

      ensureCurrentMatchesActive(ns);
      scheduleFromListScrollReset(ns);
      ns.state.tickingFrame = false;
    });
  }

  ns.effects = {
    updateZIndexes,
    updateListItemEffects,
    scheduleFrameUpdate
  };
})(window.StackUI);
