document.addEventListener("DOMContentLoaded", () => {
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;
  const items = document.querySelectorAll(".cases-grid__item");
  const itemsArray = Array.from(items);
  const indexByItem = new Map(itemsArray.map((el, i) => [el, i]));
  let prioritySequenceId = 0;
  let playbandEl = null;
  let playbandActiveItem = null;
  let playbandVideos = [];
  let playbandRafPending = false;

  function ensurePlayband() {
    if (playbandEl && document.body.contains(playbandEl)) return playbandEl;
    const el = document.createElement('div');
    el.id = 'cases-playband-observer';
    el.setAttribute('aria-hidden', 'true');
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.right = '0';
    el.style.height = '0.5625rem';
    el.style.top = '27vh';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '2147483647';
    el.style.background = 'transparent';
    document.body.appendChild(el);
    playbandEl = el;
    return el;
  }

  function getContainerForPlayband(item) {
    return item ? item.querySelector('.cases-grid__item__container') : null;
  }

  function collectPlaybandVideos(item) {
    const container = getContainerForPlayband(item);
    if (!container) return [];
    const all = Array.from(container.querySelectorAll('video'));
    return all.filter(v => !v.closest('.cases-grid__item__container__wrap__talking-head'));
  }

  function isOverlappingPlayband(element) {
    if (!playbandEl) return false;
    const bandRect = playbandEl.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return (rect.bottom > bandRect.top) && (rect.top < bandRect.bottom);
  }

  function updatePlaybandPlayback() {
    if (!playbandActiveItem) return;
    const isActive = playbandActiveItem.classList.contains('active');
    let anyPlayed = false;
    for (const video of playbandVideos) {
      const shouldPlay = isActive && isOverlappingPlayband(video);
      if (shouldPlay) {
        try { if (video.paused) video.play().catch(() => {}); } catch (_) {}
        anyPlayed = true;
      } else {
        try { video.pause(); } catch (_) {}
      }
    }
    if (!anyPlayed && isActive) {
      const fallback = playbandVideos[0] || playbandActiveItem.querySelector('video');
      if (fallback) {
        try { if (fallback.paused) fallback.play().catch(() => {}); } catch (_) {}
      }
    }
  }

  function onScrollOrResize() {
    if (playbandRafPending) return;
    playbandRafPending = true;
    requestAnimationFrame(() => {
      playbandRafPending = false;
      updatePlaybandPlayback();
    });
  }

  function attachPlaybandToItem(item) {
    if (!item) return;
    ensurePlayband();
    if (playbandActiveItem && playbandActiveItem !== item) {
      detachPlayband();
    }
    playbandActiveItem = item;
    playbandVideos = collectPlaybandVideos(item);
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    updatePlaybandPlayback();
  }

  function detachPlayband(itemLosingActive = null) {
    if (!playbandActiveItem) return;
    if (itemLosingActive && itemLosingActive !== playbandActiveItem) return;
    window.removeEventListener('scroll', onScrollOrResize);
    window.removeEventListener('resize', onScrollOrResize);
    for (const v of playbandVideos) {
      try { v.pause(); } catch (_) {}
    }
    playbandActiveItem = null;
    playbandVideos = [];
  }

  function attachPlaybandToCurrentActive() {
    const active = itemsArray.find(i => i.classList.contains('active'));
    if (active) attachPlaybandToItem(active);
  }

  const isDesktop = true;

  function selectPlatformContainer(item) {
    return item.querySelector(".cases-grid__item__container");
  }

  function getPlatformVideos(item, onlyWithDataSrc = false) {
    const selector = onlyWithDataSrc ? "video[data-src]" : "video";
    const platformContainer = selectPlatformContainer(item);
    const platformVideos = platformContainer ? Array.from(platformContainer.querySelectorAll(selector)) : [];
    const talkingHeadContainer = item.querySelector('.cases-grid__item__container__wrap__talking-head');
    const talkingHeadVideos = talkingHeadContainer ? Array.from(talkingHeadContainer.querySelectorAll(selector)) : [];
    const combined = [...platformVideos, ...talkingHeadVideos];
    return Array.from(new Set(combined));
  }

  function loadTalkingHeadAssetsImmediately() {
    itemsArray.forEach(item => {
      const head = item.querySelector('.cases-grid__item__container__wrap__talking-head');
      if (!head) return;
      const videos = Array.from(head.querySelectorAll('video'));
      videos.forEach(video => {
        if (video.dataset && video.dataset.src && !video.dataset.loaded) {
          const source = document.createElement('source');
          source.src = video.dataset.src;
          source.type = 'video/mp4';
          video.appendChild(source);
          video.preload = 'auto';
          try { video.load(); } catch(e) {}
          video.dataset.loaded = 'true';
        }
      });
    });
  }

  function loadVideos(item, prefetchOnly = false) {
    const videos = getPlatformVideos(item, true);
    videos.forEach(video => {
      if (video.dataset.loaded) return;
      if (prefetchOnly) {
        return;
      }
      attachSourceAfterFetch(video);
    });
  }

  async function attachSourceAfterFetch(video) {
    if (!video || !video.dataset || !video.dataset.src) return;
    if (video.dataset.fetching === 'true' || video.dataset.loaded) return;
    video.dataset.fetching = 'true';
    const url = video.dataset.src;
    try {
      const urlObj = new URL(url, window.location.href);
      const sameOrigin = urlObj.origin === window.location.origin;
      if (!sameOrigin) {
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = 'auto';
        try { video.load(); } catch(e) {}
        video.dataset.loaded = 'true';
        delete video.dataset.fetching;
        return;
      }
    } catch (_) {
      const source = document.createElement('source');
      source.src = url;
      source.type = 'video/mp4';
      video.appendChild(source);
      video.preload = 'auto';
      try { video.load(); } catch(e) {}
      video.dataset.loaded = 'true';
      delete video.dataset.fetching;
      return;
    }
    try {
      const response = await fetch(url, { credentials: 'omit', cache: 'default' });
      if (!response.ok) throw new Error('Failed to fetch video');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const source = document.createElement('source');
      source.src = blobUrl;
      source.type = 'video/mp4';
      video.appendChild(source);
      video.preload = 'auto';
      try { video.load(); } catch(e) {}
      video.dataset.loaded = 'true';
      video.dataset.blobUrl = blobUrl;
    } catch (e) {
      try {
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = 'auto';
        try { video.load(); } catch(err) {}
        video.dataset.loaded = 'true';
      } catch (_) {}
    } finally {
      try { delete video.dataset.fetching; } catch(_) {}
    }
  }

  function applyAudioStateOnActivation(item) {
    const videos = getPlatformVideos(item, false);
    videos.forEach(video => {
      const soundOn = !!(window.CasesAudio && window.CasesAudio.soundOn);
      if (soundOn) {
        try { video.muted = false; } catch(e) {}
        try { video.currentTime = 0; } catch(e) {}
        try { video.volume = 1; } catch(e) {}
      } else {
        try { video.muted = true; } catch(e) {}
      }
    });
  }

  function enableAutoplayAndPlay(item) {
    const videos = getPlatformVideos(item, false);
    videos.forEach(video => {
      const isTalkingHead = !!video.closest('.cases-grid__item__container__wrap__talking-head');
      if (isTalkingHead) {
        if (item.classList.contains('active')) {
          try { video.autoplay = true; } catch(_) {}
          try { if (!video.hasAttribute('autoplay')) video.setAttribute('autoplay', ''); } catch(_) {}
        }
        video.preload = 'auto';
      } else {
        if (video.autoplay) {
          video.autoplay = false;
        }
        if (video.hasAttribute("autoplay")) {
          video.removeAttribute("autoplay");
        }
        video.preload = "auto";
      }

      const tryPlay = () => {
        if (!item.classList.contains("active")) return;
        if (isTalkingHead) {
          try { if (video.paused) video.play().catch(()=>{}); } catch(e) {}
          return;
        }
        const useBand = (playbandActiveItem === item) && !!playbandEl;
        if (useBand) {
          const shouldPlay = isOverlappingPlayband(video);
          if (shouldPlay) {
            try { if (video.paused) video.play().catch(()=>{}); } catch(e) {}
          } else {
            try { video.pause(); } catch(e) {}
          }
          return;
        }
        try { if (video.paused) video.play().catch(()=>{}); } catch(e) {}
      };

      if (video.readyState >= 4) {
        tryPlay();
      } else {
        const onReady = () => { tryPlay(); };
        video.addEventListener("canplaythrough", onReady, { once: true });
      }
    });
  }

  function disableAutoplayAndReset(item) {
    const videos = getPlatformVideos(item, false);
    videos.forEach(video => {
      if (video.autoplay) {
        video.autoplay = false;
      }
      if (video.hasAttribute("autoplay")) {
        video.removeAttribute("autoplay");
      }
      try { video.muted = true; } catch(e) {}
      try { video.pause(); } catch(e) {}
      if (video.readyState > 0) {
        try { video.currentTime = 0; } catch(e) {}
      } else {
        const resetToStart = () => {
          try { video.currentTime = 0; } catch(e) {}
        };
        video.addEventListener("loadedmetadata", resetToStart, { once: true });
      }
    });
  }

  function updateActiveVideos() {
    const activeIndex = itemsArray.findIndex(item => item.classList.contains("active"));
    if (activeIndex === -1) return;
    startPrioritySequence(activeIndex);
  }

  function isInScope(index, activeIndex) {
    return index === activeIndex || index === activeIndex - 1 || index === activeIndex + 1;
  }

  function stopAndUnloadVideos(item) {
    const videos = getPlatformVideos(item, false);
    videos.forEach(video => {
      try { video.pause(); } catch(e) {}
      try { video.muted = true; } catch(e) {}
      try { video.currentTime = 0; } catch(e) {}
      if (video.autoplay) video.autoplay = false;
      if (video.hasAttribute("autoplay")) video.removeAttribute("autoplay");
      video.setAttribute("preload", "none");
      const sources = Array.from(video.querySelectorAll("source"));
      sources.forEach(s => s.remove());
      if (video.dataset && video.dataset.blobUrl) {
        try { URL.revokeObjectURL(video.dataset.blobUrl); } catch(_) {}
        try { delete video.dataset.blobUrl; } catch(_) {}
      }
      try { video.removeAttribute("src"); } catch(e) {}
      try { delete video.dataset.loaded; } catch(e) {}
      try { video.load(); } catch(e) {}
    });
  }

  function updateLoadingScope(activeIndex) {
    itemsArray.forEach((item, index) => {
      if (!isInScope(index, activeIndex)) {
        stopAndUnloadVideos(item);
      }
    });
  }

  function cleanupIrrelevantContainers() {
    itemsArray.forEach(item => {
      const irrelevantSelectors = [".story-track", ".story-slider"];
      irrelevantSelectors.forEach(sel => {
        const irrelevantContainer = item.querySelector(sel);
        if (!irrelevantContainer) return;
        const irrelevantVideos = irrelevantContainer.querySelectorAll("video");
        irrelevantVideos.forEach(video => {
          if (video.closest('.cases-grid__item__container__wrap__talking-head')) return;
          const sources = Array.from(video.querySelectorAll("source"));
          sources.forEach(s => s.remove());
          if (!video.hasAttribute("data-src")) {
            video.setAttribute("preload", "none");
            try { video.removeAttribute("src"); } catch(e) {}
            try { video.load(); } catch(e) {}
          }
        });
      });
    });
  }

  function waitAllCanPlayThrough(videos) {
    const waiters = videos.map(video => new Promise(resolve => {
      if (video.readyState >= 4) {
        resolve();
      } else {
        const onReady = () => resolve();
        video.addEventListener("canplaythrough", onReady, { once: true });
      }
    }));
    return Promise.all(waiters);
  }

  async function startPrioritySequence(activeIndex) {
    const seqId = ++prioritySequenceId;
    const activeItem = itemsArray[activeIndex];
    const nextItem = activeIndex < itemsArray.length - 1 ? itemsArray[activeIndex + 1] : null;
    const prevItem = activeIndex > 0 ? itemsArray[activeIndex - 1] : null;

    updateLoadingScope(activeIndex);
    loadVideos(activeItem, false);
    applyAudioStateOnActivation(activeItem);
    enableAutoplayAndPlay(activeItem);
    await waitAllCanPlayThrough(getPlatformVideos(activeItem, false));
    if (seqId !== prioritySequenceId) return;

    if (nextItem) {
      loadVideos(nextItem, true);
      await waitAllCanPlayThrough(getPlatformVideos(nextItem, false));
      if (seqId !== prioritySequenceId) return;
    }

    if (prevItem) {
      loadVideos(prevItem, true);
    }
  }

  cleanupIrrelevantContainers();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      const item = mutation.target;
      const wasActive = (mutation.oldValue || "").split(/\s+/).includes("active");
      const isActive = item.classList.contains("active");

      if (!wasActive && isActive) {
        let index = indexByItem.get(item);
        if (index === undefined) {
          index = itemsArray.indexOf(item);
          if (index !== -1) indexByItem.set(item, index);
        }
        if (index > -1) startPrioritySequence(index);
        attachPlaybandToItem(item);
      } else if (wasActive && !isActive) {
        disableAutoplayAndReset(item);
        detachPlayband(item);
      }
    });
  });
  items.forEach(item => observer.observe(item, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));

  attachPlaybandToCurrentActive();
  updateActiveVideos();
  onScrollOrResize();

  function enableAssetsAfterLoad() {
    loadTalkingHeadAssetsImmediately();
    updateActiveVideos();
    attachPlaybandToCurrentActive();
    onScrollOrResize();
  }
  if (document.readyState === 'complete') {
    enableAssetsAfterLoad();
  } else {
    window.addEventListener('load', enableAssetsAfterLoad, { once: true });
  }
});
