document.addEventListener("DOMContentLoaded", () => {
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;
  
  const items = document.querySelectorAll(".cases-grid__item");
  const itemsArray = Array.from(items);
  const indexByItem = new Map(itemsArray.map((el, i) => [el, i]));
  let playbandEl = null;
  let playbandActiveItem = null;
  let playbandVideos = [];
  let playbandRafPending = false;

  function ensurePlayband() {
    if (playbandEl && document.body.contains(playbandEl)) return playbandEl;
    const el = document.createElement('div');
    el.id = 'cases-playband-observer';
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'fixed', left: '0', right: '0', height: '0.5625rem',
      top: '27vh', pointerEvents: 'none', zIndex: '2147483647', background: 'transparent'
    });
    document.body.appendChild(el);
    return playbandEl = el;
  }

  function collectPlaybandVideos(item) {
    const container = item?.querySelector('.cases-grid__item__container');
    if (!container) return [];
    return Array.from(container.querySelectorAll('video'))
      .filter(v => !v.closest('.cases-grid__item__container__wrap__talking-head'));
  }

  function isOverlappingPlayband(element) {
    if (!playbandEl) return false;
    const bandRect = playbandEl.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && 
           (rect.bottom > bandRect.top) && (rect.top < bandRect.bottom);
  }

  function updatePlaybandPlayback() {
    if (!playbandActiveItem) return;
    const isActive = playbandActiveItem.classList.contains('active');
    let anyPlayed = false;
    
    for (const video of playbandVideos) {
      const shouldPlay = isActive && isOverlappingPlayband(video);
      if (shouldPlay) {
        if (video.paused) video.play().catch(() => {});
        anyPlayed = true;
      } else {
        video.pause();
      }
    }
    
    if (!anyPlayed && isActive) {
      const fallback = playbandVideos[0] || playbandActiveItem.querySelector('video');
      if (fallback?.paused) fallback.play().catch(() => {});
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
    if (playbandActiveItem && playbandActiveItem !== item) detachPlayband();
    playbandActiveItem = item;
    playbandVideos = collectPlaybandVideos(item);
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    updatePlaybandPlayback();
  }

  function detachPlayband(itemLosingActive = null) {
    if (!playbandActiveItem || (itemLosingActive && itemLosingActive !== playbandActiveItem)) return;
    window.removeEventListener('scroll', onScrollOrResize);
    window.removeEventListener('resize', onScrollOrResize);
    playbandVideos.forEach(v => v.pause());
    playbandActiveItem = null;
    playbandVideos = [];
  }

  function getContainerVideos(item) {
    const container = item.querySelector(".cases-grid__item__container");
    if (!container) return [];
    return Array.from(container.querySelectorAll("video[data-src]"));
  }

  function loadVideo(video) {
    if (video.readyState >= 4) return;
    
    if (video.querySelector("source")) {
      video.preload = 'auto';
      return;
    }

    if (video.dataset.fetching === 'true') return;

    video.dataset.fetching = 'true';
    const url = video.dataset.src;
    
    const createSource = (sourceUrl) => {
      const source = document.createElement('source');
      source.src = sourceUrl;
      source.type = 'video/mp4';
      video.appendChild(source);
      video.preload = 'auto';
      if (video.readyState === 0) {
        try { video.load(); } catch(e) {}
      }
    };
    
    try {
      const urlObj = new URL(url, window.location.href);
      const sameOrigin = urlObj.origin === window.location.origin;
      
      if (!sameOrigin) {
        createSource(url);
        delete video.dataset.fetching;
        return;
      }
    } catch (_) {
      createSource(url);
      delete video.dataset.fetching;
      return;
    }

    fetch(url, { credentials: 'omit', cache: 'default' })
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch');
        return response.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        createSource(blobUrl);
        video.dataset.blobUrl = blobUrl;
        delete video.dataset.fetching;
      })
      .catch(() => {
        createSource(url);
        delete video.dataset.fetching;
      });
  }

  function loadVideosForItem(item) {
    getContainerVideos(item).forEach(video => {
      loadVideo(video);
    });
  }

  function applyAudioState(item) {
    const soundOn = !!(window.CasesAudio?.soundOn);
    getPlatformVideos(item).forEach(video => {
      video.muted = !soundOn;
      if (soundOn) {
        video.currentTime = 0;
        video.volume = 1;
      }
    });
  }

  function enableAutoplayAndPlay(item) {
    const isActive = item.classList.contains("active");
    getPlatformVideos(item).forEach(video => {
      const isTalkingHead = !!video.closest('.cases-grid__item__container__wrap__talking-head');
      
      if (isTalkingHead) {
        if (isActive) {
          video.autoplay = true;
          if (!video.hasAttribute('autoplay')) video.setAttribute('autoplay', '');
        }
        video.preload = 'auto';
      } else {
        video.autoplay = false;
        video.removeAttribute("autoplay");
        video.preload = "auto";
      }

      const tryPlay = () => {
        if (!isActive) return;
        if (isTalkingHead) {
          if (video.paused) video.play().catch(() => {});
          return;
        }
        const useBand = (playbandActiveItem === item) && playbandEl;
        if (useBand) {
          isOverlappingPlayband(video) 
            ? (video.paused && video.play().catch(() => {}))
            : video.pause();
          return;
        }
        if (video.paused) video.play().catch(() => {});
      };

      video.readyState >= 4 ? tryPlay() : 
        video.addEventListener("canplaythrough", tryPlay, { once: true });
    });
  }

  function disableAutoplayAndReset(item) {
    getPlatformVideos(item).forEach(video => {
      video.autoplay = false;
      video.removeAttribute("autoplay");
      video.muted = true;
      video.pause();
      if (video.readyState > 0) {
        video.currentTime = 0;
      } else {
        video.addEventListener("loadedmetadata", () => { video.currentTime = 0; }, { once: true });
      }
    });
  }

  function getPlatformVideos(item) {
    const container = item.querySelector(".cases-grid__item__container");
    const talkingHead = item.querySelector('.cases-grid__item__container__wrap__talking-head');
    const platformVideos = container ? Array.from(container.querySelectorAll('video')) : [];
    const talkingHeadVideos = talkingHead ? Array.from(talkingHead.querySelectorAll('video')) : [];
    return Array.from(new Set([...platformVideos, ...talkingHeadVideos]));
  }

  function handleActiveItem(activeIndex) {
    const activeItem = itemsArray[activeIndex];
    if (!activeItem) return;

    loadVideosForItem(activeItem);

    const nextItem = activeIndex < itemsArray.length - 1 ? itemsArray[activeIndex + 1] : null;
    if (nextItem) {
      loadVideosForItem(nextItem);
    }

    applyAudioState(activeItem);
    enableAutoplayAndPlay(activeItem);
  }

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
        if (index > -1) {
          handleActiveItem(index);
          attachPlaybandToItem(item);
        }
      } else if (wasActive && !isActive) {
        disableAutoplayAndReset(item);
        detachPlayband(item);
      }
    });
  });

  items.forEach(item => observer.observe(item, { 
    attributes: true, 
    attributeFilter: ['class'], 
    attributeOldValue: true 
  }));

  function init() {
    const active = itemsArray.find(i => i.classList.contains('active'));
    if (active) attachPlaybandToItem(active);
    
    const activeIndex = itemsArray.findIndex(item => item.classList.contains("active"));
    if (activeIndex > -1) handleActiveItem(activeIndex);
    
    onScrollOrResize();
  }

  function enableAssetsAfterLoad() {
    init();
  }

  init();
  if (document.readyState === 'complete') {
    enableAssetsAfterLoad();
  } else {
    window.addEventListener('load', enableAssetsAfterLoad, { once: true });
  }
});
