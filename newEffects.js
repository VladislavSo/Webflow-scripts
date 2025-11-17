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

    if (!ns.cache.cardStyles || ns.cache.cardStyles.length !== cards.length) {
      ns.cache.cardStyles = new Array(cards.length).fill(null).map(() => ({
        transform: '',
        top: '',
        bottom: '',
        backgroundColor: '',
        childrenOpacity: []
      }));
    }

    const setStyleIfChanged = (el, prop, value, cache) => {
      if (cache[prop] !== value) {
        el.style[prop] = value;
        cache[prop] = value;
      }
    };

    if (ns.state.prefersReducedMotion) {
      cards.forEach((card, idx) => {
        const cache = ns.cache.cardStyles[idx];
        setStyleIfChanged(card, 'transform', 'scale(1)', cache);
        setStyleIfChanged(card, 'top', '0px', cache);
        setStyleIfChanged(card, 'bottom', '0px', cache);
        const bgColor = `rgb(${color21.r}, ${color21.g}, ${color21.b})`;
        setStyleIfChanged(card, 'backgroundColor', bgColor, cache);
        const children = ns.cache.cardChildren[idx];
        children.forEach((el, childIdx) => {
          if (!cache.childrenOpacity[childIdx] || cache.childrenOpacity[childIdx] !== '1') {
            el.style.opacity = '1';
            cache.childrenOpacity[childIdx] = '1';
          }
        });
      });
      return;
    }

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
      const cache = ns.cache.cardStyles[i];

      let topKind = null, topP = -1;
      if (idx2Prog[i] >= 0) { topKind = 'idx2'; topP = idx2Prog[i]; }
      else if (idx1Prog[i] >= 0) { topKind = 'idx1'; topP = idx1Prog[i]; }

      let botKind = null, botP = -1;
      if (inc3Prog[i] >= 0) { botKind = 'inc3'; botP = inc3Prog[i]; }
      else if (inc2Prog[i] >= 0) { botKind = 'inc2'; botP = inc2Prog[i]; }

      if (topKind === 'idx2') {
        const t = -m.topIndex2StartPx - (m.topIndex2EndPx - m.topIndex2StartPx) * topP;
        setStyleIfChanged(card, 'top', `${t}px`, cache);
        setStyleIfChanged(card, 'bottom', '0px', cache);
      } else if (topKind === 'idx1') {
        const t = -m.topIndex1EndPx * topP;
        setStyleIfChanged(card, 'top', `${t}px`, cache);
        setStyleIfChanged(card, 'bottom', '0px', cache);
      } else if (botKind) {
        setStyleIfChanged(card, 'top', '0px', cache);
        if (botKind === 'inc3') {
          const b = -m.bottomIndex3StartPx + (m.bottomIndex3StartPx - m.bottomIndex3EndPx) * botP;
          setStyleIfChanged(card, 'bottom', `${b}px`, cache);
        } else {
          const b = -m.bottomIndex2StartPx + m.bottomIndex2StartPx * botP;
          setStyleIfChanged(card, 'bottom', `${b}px`, cache);
        }
      } else {
        setStyleIfChanged(card, 'top', '0px', cache);
        setStyleIfChanged(card, 'bottom', '0px', cache);
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

      const children = ns.cache.cardChildren[i];
      if (!cache.childrenOpacity || cache.childrenOpacity.length !== children.length) {
        cache.childrenOpacity = new Array(children.length);
      }

      if (useKind === 'idx2') {
        const s = 0.92 - 0.13 * useP;
        const o = 0;
        const r = Math.round(color18.r + (color14.r - color18.r) * useP);
        const g = Math.round(color18.g + (color14.g - color18.g) * useP);
        const b = Math.round(color18.b + (color14.b - color18.b) * useP);
        setStyleIfChanged(card, 'transform', `scale(${s})`, cache);
        setStyleIfChanged(card, 'backgroundColor', `rgb(${r}, ${g}, ${b})`, cache);
        children.forEach((el, childIdx) => {
          if (cache.childrenOpacity[childIdx] !== '0') {
            el.style.opacity = '0';
            cache.childrenOpacity[childIdx] = '0';
          }
        });
      } else if (useKind === 'idx1') {
        const s = 1 - 0.08 * useP;
        const o = 1 - useP;
        const r = Math.round(color21.r + (color18.r - color21.r) * useP);
        const g = Math.round(color21.g + (color18.g - color21.g) * useP);
        const b = Math.round(color21.b + (color18.b - color21.b) * useP);
        setStyleIfChanged(card, 'transform', `scale(${s})`, cache);
        setStyleIfChanged(card, 'backgroundColor', `rgb(${r}, ${g}, ${b})`, cache);
        const oStr = String(o);
        children.forEach((el, childIdx) => {
          if (cache.childrenOpacity[childIdx] !== oStr) {
            el.style.opacity = oStr;
            cache.childrenOpacity[childIdx] = oStr;
          }
        });
      } else if (useKind === 'inc3') {
        const s = 0.79 + 0.13 * useP;
        const o = 0;
        const r = Math.round(color14.r + (color18.r - color14.r) * useP);
        const g = Math.round(color14.g + (color18.g - color14.g) * useP);
        const b = Math.round(color14.b + (color18.b - color14.b) * useP);
        setStyleIfChanged(card, 'transform', `scale(${s})`, cache);
        setStyleIfChanged(card, 'backgroundColor', `rgb(${r}, ${g}, ${b})`, cache);
        children.forEach((el, childIdx) => {
          if (cache.childrenOpacity[childIdx] !== '0') {
            el.style.opacity = '0';
            cache.childrenOpacity[childIdx] = '0';
          }
        });
      } else if (useKind === 'inc2') {
        const s = 0.92 + 0.08 * useP;
        const o = useP;
        const r = Math.round(color18.r + (color21.r - color18.r) * useP);
        const g = Math.round(color18.g + (color21.g - color18.g) * useP);
        const b = Math.round(color18.b + (color21.b - color18.b) * useP);
        setStyleIfChanged(card, 'transform', `scale(${s})`, cache);
        setStyleIfChanged(card, 'backgroundColor', `rgb(${r}, ${g}, ${b})`, cache);
        const oStr = String(o);
        children.forEach((el, childIdx) => {
          if (cache.childrenOpacity[childIdx] !== oStr) {
            el.style.opacity = oStr;
            cache.childrenOpacity[childIdx] = oStr;
          }
        });
      } else {
        if (hasBottomTargets && i > furthestBottomIdx) {
          setStyleIfChanged(card, 'transform', 'scale(0.79)', cache);
          setStyleIfChanged(card, 'backgroundColor', `rgb(${ns.colors.color14.r}, ${ns.colors.color14.g}, ${ns.colors.color14.b})`, cache);
          setStyleIfChanged(card, 'top', '0px', cache);
          setStyleIfChanged(card, 'bottom', `${-m.bottomIndex3StartPx}px`, cache);
          children.forEach((el, childIdx) => {
            if (cache.childrenOpacity[childIdx] !== '0') {
              el.style.opacity = '0';
              cache.childrenOpacity[childIdx] = '0';
            }
          });
        } else {
          setStyleIfChanged(card, 'transform', 'scale(1)', cache);
          setStyleIfChanged(card, 'backgroundColor', `rgb(${ns.colors.color21.r}, ${ns.colors.color21.g}, ${ns.colors.color21.b})`, cache);
          children.forEach((el, childIdx) => {
            if (cache.childrenOpacity[childIdx] !== '1') {
              el.style.opacity = '1';
              cache.childrenOpacity[childIdx] = '1';
            }
          });
        }
      }
    }

    console.log('ns.state.fromListScroll', ns.state.fromListScroll);
    console.log('ns.state.isProgrammaticListScroll', ns.state.isProgrammaticListScroll);
    console.log('currentCard', currentCard);
    console.log('currentIdx', currentIdx);

    if (ns.state.fromListScroll && !ns.state.isProgrammaticListScroll && currentCard && currentIdx !== -1) {
      const r = meas ? meas.cardRects[currentIdx] : currentCard.getBoundingClientRect();
      const distTop = r.top - containerRect.top - 1;
      const distFromBottom = containerRect.bottom - r.bottom - 1;

      const isAboveEnd = distTop < ns.metrics.effectEndPx;
      const isBelowStart = distFromBottom > ns.metrics.bottomBandStartPx;
      const isWithin = distTop >= ns.metrics.effectEndPx && distFromBottom <= ns.metrics.bottomBandStartPx;

      if (isAboveEnd || isBelowStart) {
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

  function scheduleFrameUpdate(ns) {
    if (ns.state.tickingFrame) return;
    ns.state.tickingFrame = true;
    requestAnimationFrame(() => {
      const containerRect = ns.dom.container.getBoundingClientRect();
      const cardRects = ns.collections.cards.map(c => c.getBoundingClientRect());
      const meas = { containerRect, cardRects };

      updateZIndexes(ns, meas);
      updateListItemEffects(ns, meas);

      ns.state.fromListScroll = false;
      ns.state.tickingFrame = false;
    });
  }

  ns.effects = {
    updateZIndexes,
    updateListItemEffects,
    scheduleFrameUpdate
  };
})(window.StackUI);
