document.addEventListener("DOMContentLoaded", () => {
  const items = document.querySelectorAll(".cases-grid__item");
  const itemsArray = Array.from(items);
  const indexByItem = new Map(itemsArray.map((el, i) => [el, i]));
  let prioritySequenceId = 0;

  // --- Полоса-наблюдатель для play/pause внутри активного слайда ---
  let playbandEl = null;                // DOM-элемент полосы-наблюдателя
  let playbandActiveItem = null;        // Текущий активный .cases-grid__item для playband
  let playbandVideos = [];              // Видео внутри .cases-grid__item__container (без talking-head)
  let playbandRafPending = false;       // Флаг для rAF батчинга

  function ensurePlayband() {
    if (playbandEl && document.body.contains(playbandEl)) return playbandEl;
    const el = document.createElement('div');
    el.id = 'cases-playband-observer';
    el.setAttribute('aria-hidden', 'true');
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.right = '0';
    el.style.height = '0.5625rem'; // 9px при базовом 16px, 1rem = font-size
    el.style.top = '27vh';         // 27% от высоты окна
    el.style.pointerEvents = 'none';
    el.style.zIndex = '2147483647';
    el.style.background = 'transparent'; // невидимый маркер
    document.body.appendChild(el);
    playbandEl = el;
    return el;
  }

  function getContainerForPlayband(item) {
    // По требованию ищем видео ТОЛЬКО внутри .cases-grid__item__container
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
    // Фолбэк: если ни одно подходящее видео не в зоне полосы — снимаем паузу у первого
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
    // если уже прикреплено к этому же item — просто обновим список и состояние
    if (playbandActiveItem && playbandActiveItem !== item) {
      detachPlayband();
    }
    playbandActiveItem = item;
    playbandVideos = collectPlaybandVideos(item);
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    // первичное применение состояния
    updatePlaybandPlayback();
  }

  function detachPlayband(itemLosingActive = null) {
    if (!playbandActiveItem) return;
    if (itemLosingActive && itemLosingActive !== playbandActiveItem) return;
    window.removeEventListener('scroll', onScrollOrResize);
    window.removeEventListener('resize', onScrollOrResize);
    // При отключении ставим все видео на паузу
    for (const v of playbandVideos) {
      try { v.pause(); } catch (_) {}
    }
    playbandActiveItem = null;
    playbandVideos = [];
  }

  function attachPlaybandToCurrentActive() {
    // Полоса используется только на десктопе
    if (!isDesktop) return;
    const active = itemsArray.find(i => i.classList.contains('active'));
    if (active) attachPlaybandToItem(active);
  }

  // Определяем платформу: мобильная (≤ 479px) или десктопная
  const isMobile = !!(window.matchMedia && window.matchMedia("(max-width: 479px)").matches);
  const isDesktop = !isMobile;

  // Вспомогательные выборки видео по платформе и исключение talking-head
  function selectPlatformContainer(item) {
    if (isDesktop) return item.querySelector(".cases-grid__item__container");
    // Мобильный контейнер: новый wrapper/inner
    return item.querySelector('.story-slider__wrapper__mask__inner') || item.querySelector('.story-slider__wrapper') || item.querySelector('.story-track');
  }

  function getPlatformVideos(item, onlyWithDataSrc = false) {
    const selector = onlyWithDataSrc ? "video[data-src]" : "video";
    const platformContainer = selectPlatformContainer(item);
    const platformVideos = platformContainer ? Array.from(platformContainer.querySelectorAll(selector)) : [];
    // talking-head — всегда грузим, независимо от платформы
    const talkingHeadContainer = item.querySelector('.cases-grid__item__container__wrap__talking-head');
    const talkingHeadVideos = talkingHeadContainer ? Array.from(talkingHeadContainer.querySelectorAll(selector)) : [];
    // Объединяем и убираем дубликаты
    const combined = [...platformVideos, ...talkingHeadVideos];
    return Array.from(new Set(combined));
  }

  // --------- Постеры: новая строгая логика ---------
  function getPosterVideosByPlatform(item) {
    const container = isDesktop
      ? item.querySelector(".cases-grid__item__container")
      : (item.querySelector('.story-slider__wrapper__mask__inner') || item.querySelector('.story-slider__wrapper') || item.querySelector('.story-track'));
    if (!container) return [];
    // постеры talking-head НЕ учитываем — по требованию постеры строго по платформе
    return Array.from(container.querySelectorAll('video')).filter(v => !v.closest('.cases-grid__item__container__wrap__talking-head'));
  }

  function loadPostersForItem(item) {
    const videos = getPosterVideosByPlatform(item);
    const urls = [];
    videos.forEach(video => {
      let poster = video.getAttribute('poster');
      if (!poster && video.dataset && video.dataset.poster) {
        try { video.setAttribute('poster', video.dataset.poster); } catch(e) {}
        poster = video.dataset.poster;
      }
      if (poster) urls.push(poster);
    });
    const waits = urls.map(src => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    }));
    return Promise.all(waits);
  }

  function startPosterPriorityChain(activeIndex) {
    const seqId = ++prioritySequenceId; // используем общий счётчик для отмены при смене active
    const order = [];
    const activeItem = itemsArray[activeIndex];
    if (activeItem) order.push(activeItem);
    const nextItem = activeIndex < itemsArray.length - 1 ? itemsArray[activeIndex + 1] : null;
    if (nextItem) order.push(nextItem);
    const prevItem = activeIndex > 0 ? itemsArray[activeIndex - 1] : null;
    if (prevItem) order.push(prevItem);
    const next2Item = activeIndex + 2 < itemsArray.length ? itemsArray[activeIndex + 2] : null;
    if (next2Item) order.push(next2Item);

    (async () => {
      for (const item of order) {
        if (seqId !== prioritySequenceId) return;
        await loadPostersForItem(item);
      }
    })();
  }

  // Talking-head: грузим ВСЁ сразу (и постеры, и видео), вне зависимости от платформы
  function loadTalkingHeadAssetsImmediately() {
    itemsArray.forEach(item => {
      const head = item.querySelector('.cases-grid__item__container__wrap__talking-head');
      if (!head) return;
      const videos = Array.from(head.querySelectorAll('video'));
      videos.forEach(video => {
        // постер: создаём из data-poster при необходимости
        let poster = video.getAttribute('poster');
        if (!poster && video.dataset && video.dataset.poster) {
          try { video.setAttribute('poster', video.dataset.poster); } catch(e) {}
          poster = video.dataset.poster;
        }
        if (poster) { const img = new Image(); img.src = poster; }
        // видео ресурсы
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

  // Подгрузка всех видео в блоке
  function loadVideos(item, prefetchOnly = false) {
    const videos = getPlatformVideos(item, true);
    videos.forEach(video => {
      if (video.dataset.loaded) return;
      if (prefetchOnly) {
        // для prefetch соседей не создаём source, чтобы не сбить poster
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
    // Если источник кросс-доменный — НЕ используем fetch (избежим CORS), подключаем напрямую
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
      // В случае ошибок парсинга URL — подключаем напрямую
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
      // Фолбэк: если fetch недоступен (CORS и т.п.), подключаем источник напрямую
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

  // Применяем состояние звука при активации слайда
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

  // Запускаем видео только после полной загрузки (canplaythrough)
  function enableAutoplayAndPlay(item) {
    const videos = getPlatformVideos(item, false);
    videos.forEach(video => {
      const isTalkingHead = !!video.closest('.cases-grid__item__container__wrap__talking-head');
      if (isTalkingHead) {
        // Для talking-head возвращаем autoplay при активном слайде
        if (item.classList.contains('active')) {
          try { video.autoplay = true; } catch(_) {}
          try { if (!video.hasAttribute('autoplay')) video.setAttribute('autoplay', ''); } catch(_) {}
        }
        // talking-head всегда буферизуем
        video.preload = 'auto';
      } else {
        // Для остальных — автозапуск выключаем; стартуем вручную/по полосе
        if (video.autoplay) {
          video.autoplay = false;
        }
        if (video.hasAttribute("autoplay")) {
          video.removeAttribute("autoplay");
        }
        // Гарантируем буферизацию активного
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
        // HAVE_ENOUGH_DATA — можно воспроизводить
        tryPlay();
      } else {
        const onReady = () => { tryPlay(); };
        video.addEventListener("canplaythrough", onReady, { once: true });
      }
    });
  }

  // Выключаем autoplay и возвращаем видео в начало при потере active
  function disableAutoplayAndReset(item) {
    const videos = getPlatformVideos(item, false);
    videos.forEach(video => {
      if (video.autoplay) {
        video.autoplay = false;
      }
      if (video.hasAttribute("autoplay")) {
        video.removeAttribute("autoplay");
      }
      // звук должен быть доступен только при active — здесь гарантируем mute
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

  // Загрузка с приоритетом: active → next → prev
  function updateActiveVideos() {
    const activeIndex = itemsArray.findIndex(item => item.classList.contains("active"));
    if (activeIndex === -1) {
      // Фолбэк для мобильных: запускаем от первого кейса, чтобы не ждать появления класса active
      if (isMobile) {
        startPrioritySequenceMobile(0);
      }
      return;
    }
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
      // освобождаем blob URL если использовался
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

  // Очистка нерелевантных контейнеров от источников и постеров (кроме talking-head)
  function cleanupIrrelevantContainers() {
    itemsArray.forEach(item => {
      const irrelevantSelectors = isDesktop
        ? [".story-track", ".story-slider"]
        : [".cases-grid__item__container"];
      irrelevantSelectors.forEach(sel => {
        const irrelevantContainer = item.querySelector(sel);
        if (!irrelevantContainer) return;
        const irrelevantVideos = irrelevantContainer.querySelectorAll("video");
        irrelevantVideos.forEach(video => {
          // Не трогаем talking-head — он платформенно-агностичен
          if (video.closest('.cases-grid__item__container__wrap__talking-head')) return;
          // снимаем возможные source и пометки, чтобы исключить загрузку
          const sources = Array.from(video.querySelectorAll("source"));
          sources.forEach(s => s.remove());
          // удаляем постер, чтобы не грузился на нерелевантной платформе
          if (video.hasAttribute("poster")) {
            try { video.removeAttribute("poster"); } catch(e) {}
          }
          if (!video.hasAttribute("data-src")) {
            // если нет lazy-атрибута, принудительно делаем видео ленивым "пустым"
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

  // Ожидание готовности одного видео до воспроизведения (мобильный сценарий)
  function waitCanPlayThroughSingle(video) {
    return new Promise(resolve => {
      if (!video) return resolve();
      if (video.readyState >= 4) { resolve(); return; }
      const onReady = () => resolve();
      video.addEventListener('canplaythrough', onReady, { once: true });
      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('loadedmetadata', onReady, { once: true });
    });
  }

  // Видео строго из .story-track (мобильная платформа)
  function getStoryTrackVideos(item) {
    if (!item) return [];
    // Собирать видео из всей mask: для первой загрузки берём первый ролик активного inner отдельно
    const mask = item.querySelector('.story-slider__wrapper__mask');
    const root = mask || item.querySelector('.story-slider__wrapper__mask__inner') || item.querySelector('.story-slider__wrapper') || item.querySelector('.story-track') || item;
    return Array.from(root.querySelectorAll('video'));
  }

  async function startPrioritySequence(activeIndex) {
    // Для мобильной платформы (<= 479px) используем особый порядок загрузки
    if (isMobile) {
      return startPrioritySequenceMobile(activeIndex);
    }

    const seqId = ++prioritySequenceId;
    const activeItem = itemsArray[activeIndex];
    const nextItem = activeIndex < itemsArray.length - 1 ? itemsArray[activeIndex + 1] : null;
    const prevItem = activeIndex > 0 ? itemsArray[activeIndex - 1] : null;

    // Выгружаем всё вне области и готовим активный
    updateLoadingScope(activeIndex);

    // Сразу запускаем цепочку загрузки постеров по строгому порядку
    startPosterPriorityChain(activeIndex);

    // 1) Active — грузим полностью, применяем звук и запускаем при готовности (видео ждём по canplaythrough)
    loadVideos(activeItem, false);
    applyAudioStateOnActivation(activeItem);
    enableAutoplayAndPlay(activeItem);
    await waitAllCanPlayThrough(getPlatformVideos(activeItem, false));
    if (seqId !== prioritySequenceId) return;

    // 2) index+1 — после полной загрузки active
    if (nextItem) {
      loadVideos(nextItem, true);
      await waitAllCanPlayThrough(getPlatformVideos(nextItem, false));
      if (seqId !== prioritySequenceId) return;
    }

    // 3) index-1 — после полной загрузки index+1
    if (prevItem) {
      loadVideos(prevItem, true);
    }

    // 4) Остальные постеры грузит стартовавшая цепочка startPosterPriorityChain
  }

  // Мобильная приоритетная последовательность загрузки
  async function startPrioritySequenceMobile(activeIndex) {
    const seqId = ++prioritySequenceId;
    // Фолбэк: если нет активного, берём первый элемент
    let idx = activeIndex;
    if (idx == null || idx === -1) {
      idx = 0;
    }
    const activeItem = itemsArray[idx];
    const nextItem = idx < itemsArray.length - 1 ? itemsArray[idx + 1] : null;
    const prevItem = idx > 0 ? itemsArray[idx - 1] : null;

    // Выгружаем всё вне области (оставляем только active, next, prev)
    updateLoadingScope(activeIndex);

    // Запускаем загрузку постеров в порядке active → next → prev → next2 (как и раньше)
    startPosterPriorityChain(activeIndex);

    // Вспомогательные загрузчики
    const loadFirstVideo = async (item, autoplay) => {
      if (!item) return;
      const videos = getStoryTrackVideos(item);
      const first = videos[0];
      if (!first) return;
      // Обязательные атрибуты для мобильного автоплея
      try { first.muted = true; } catch(_) {}
      try { if (!first.hasAttribute('muted')) first.setAttribute('muted', ''); } catch(_) {}
      try { if (!first.hasAttribute('playsinline')) first.setAttribute('playsinline', ''); } catch(_) {}
      try { if (!first.hasAttribute('webkit-playsinline')) first.setAttribute('webkit-playsinline', ''); } catch(_) {}
      if (first.dataset && first.dataset.src && !first.dataset.loaded) {
        await attachSourceAfterFetch(first);
      }
      await waitCanPlayThroughSingle(first);
      if (autoplay) {
        try { if (item.classList.contains('active') && first.paused) first.play().catch(()=>{}); } catch(_) {}
      }
    };
    const loadRestVideos = async (item) => {
      if (!item) return;
      const mask = item.querySelector('.story-slider__wrapper__mask');
      const inners = mask ? Array.from(mask.querySelectorAll('.story-slider__wrapper__mask__inner')) : [];
      // Собираем все видео из всех иннеров, пропуская первый ролик активного иннера
      const activeInner = inners.find(el => !el.hasAttribute('aria-hidden')) || inners[0] || null;
      const activeFirst = activeInner ? (activeInner.querySelector('.slide-inner__video-block video') || activeInner.querySelector('video')) : null;
      const all = getStoryTrackVideos(item);
      const rest = all.filter(v => v !== activeFirst);
      for (const v of rest) {
        if (seqId !== prioritySequenceId) return;
        if (v.dataset && v.dataset.src && !v.dataset.loaded) {
          await attachSourceAfterFetch(v);
        }
      }
    };

    // Активный: сразу применяем звук
    if (activeItem) {
      applyAudioStateOnActivation(activeItem);
      await loadFirstVideo(activeItem, true);
      if (seqId !== prioritySequenceId) return;
    }

    // Далее: первый ролик следующего, затем предыдущего
    if (nextItem) {
      await loadFirstVideo(nextItem, false);
      if (seqId !== prioritySequenceId) return;
    }
    if (prevItem) {
      await loadFirstVideo(prevItem, false);
      if (seqId !== prioritySequenceId) return;
    }

    // Возвращаемся: догружаем остальные видео по порядку active → next → prev
    if (activeItem) {
      await loadRestVideos(activeItem);
      if (seqId !== prioritySequenceId) return;
      // Обновим автозапуск по текущему состоянию (для остальных видео)
      enableAutoplayAndPlay(activeItem);
    }
    if (nextItem) {
      await loadRestVideos(nextItem);
      if (seqId !== prioritySequenceId) return;
    }
    if (prevItem) {
      await loadRestVideos(prevItem);
      if (seqId !== prioritySequenceId) return;
    }
  }

  // (poster не трогаем до DOMContentLoaded, так как используется data-poster в разметке)

  // Чистим нерелевантные контейнеры, но без создания sources
  cleanupIrrelevantContainers();

  // Следим за изменением класса active
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      const item = mutation.target;
      const wasActive = (mutation.oldValue || "").split(/\s+/).includes("active");
      const isActive = item.classList.contains("active");

      if (!wasActive && isActive) {
        // Элемент стал активным: запускаем приоритетную последовательность
        let index = indexByItem.get(item);
        if (index === undefined) {
          index = itemsArray.indexOf(item);
          if (index !== -1) indexByItem.set(item, index);
        }
        if (index > -1) startPrioritySequence(index);
        // Подключаем полосу-наблюдатель к активному элементу
        attachPlaybandToItem(item);
      } else if (wasActive && !isActive) {
        // Элемент потерял active: останавливаем, сбрасываем и гарантируем muted
        disableAutoplayAndReset(item);
        // Отвязываем полосу-наблюдатель от ушедшего active
        detachPlayband(item);
      }
    });
  });
  items.forEach(item => observer.observe(item, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));

  // Ранняя инициализация на DOMContentLoaded для мгновенного старта
  attachPlaybandToCurrentActive();
  updateActiveVideos();
  // Принудительно обновляем состояние полосы без скролла
  onScrollOrResize();

  // Дожидаемся полной загрузки страницы, чтобы включить подгрузку ассетов
  function enableAssetsAfterLoad() {
    // talking-head — грузим сразу после полной загрузки
    loadTalkingHeadAssetsImmediately();
    // Стартуем очередь постеров и подгрузку активных видео
    updateActiveVideos();
    // Инициализируем полосу-наблюдатель для текущего active
    attachPlaybandToCurrentActive();
    // Принудительно обновляем состояние полосы без скролла
    onScrollOrResize();
  }
  if (document.readyState === 'complete') {
    enableAssetsAfterLoad();
  } else {
    window.addEventListener('load', enableAssetsAfterLoad, { once: true });
  }
});

/*document.addEventListener("DOMContentLoaded", () => {
  const items = document.querySelectorAll(".cases-grid__item");
  const itemsArray = Array.from(items);
  const indexByItem = new Map(itemsArray.map((el, i) => [el, i]));
  let prioritySequenceId = 0;

  // --- Полоса-наблюдатель для play/pause внутри активного слайда ---
  let playbandEl = null;                // DOM-элемент полосы-наблюдателя
  let playbandActiveItem = null;        // Текущий активный .cases-grid__item для playband
  let playbandVideos = [];              // Видео внутри .cases-grid__item__container (без talking-head)
  let playbandRafPending = false;       // Флаг для rAF батчинга

  function ensurePlayband() {
    if (playbandEl && document.body.contains(playbandEl)) return playbandEl;
    const el = document.createElement('div');
    el.id = 'cases-playband-observer';
    el.setAttribute('aria-hidden', 'true');
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.right = '0';
    el.style.height = '0.5625rem'; // 9px при базовом 16px, 1rem = font-size
    el.style.top = '27vh';         // 27% от высоты окна
    el.style.pointerEvents = 'none';
    el.style.zIndex = '2147483647';
    el.style.background = 'transparent'; // невидимый маркер
    document.body.appendChild(el);
    playbandEl = el;
    return el;
  }

  function getContainerForPlayband(item) {
    // По требованию ищем видео ТОЛЬКО внутри .cases-grid__item__container
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
    // Фолбэк: если ни одно подходящее видео не в зоне полосы — снимаем паузу у первого
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
    // если уже прикреплено к этому же item — просто обновим список и состояние
    if (playbandActiveItem && playbandActiveItem !== item) {
      detachPlayband();
    }
    playbandActiveItem = item;
    playbandVideos = collectPlaybandVideos(item);
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    // первичное применение состояния
    updatePlaybandPlayback();
  }

  function detachPlayband(itemLosingActive = null) {
    if (!playbandActiveItem) return;
    if (itemLosingActive && itemLosingActive !== playbandActiveItem) return;
    window.removeEventListener('scroll', onScrollOrResize);
    window.removeEventListener('resize', onScrollOrResize);
    // При отключении ставим все видео на паузу
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

  // Определяем платформу: мобильная (≤ 479px) или десктопная
  const isMobile = !!(window.matchMedia && window.matchMedia("(max-width: 479px)").matches);
  const isDesktop = !isMobile;

  // Вспомогательные выборки видео по платформе и исключение talking-head
  function selectPlatformContainer(item) {
    return item.querySelector(isDesktop ? ".cases-grid__item__container" : ".story-track");
  }

  function getPlatformVideos(item, onlyWithDataSrc = false) {
    const selector = onlyWithDataSrc ? "video[data-src]" : "video";
    const platformContainer = selectPlatformContainer(item);
    const platformVideos = platformContainer ? Array.from(platformContainer.querySelectorAll(selector)) : [];
    // talking-head — всегда грузим, независимо от платформы
    const talkingHeadContainer = item.querySelector('.cases-grid__item__container__wrap__talking-head');
    const talkingHeadVideos = talkingHeadContainer ? Array.from(talkingHeadContainer.querySelectorAll(selector)) : [];
    // Объединяем и убираем дубликаты
    const combined = [...platformVideos, ...talkingHeadVideos];
    return Array.from(new Set(combined));
  }

  // --------- Постеры: новая строгая логика ---------
  function getPosterVideosByPlatform(item) {
    const container = item.querySelector(isDesktop ? ".cases-grid__item__container" : ".story-track");
    if (!container) return [];
    // постеры talking-head НЕ учитываем — по требованию постеры строго по платформе
    return Array.from(container.querySelectorAll('video')).filter(v => !v.closest('.cases-grid__item__container__wrap__talking-head'));
  }

  function loadPostersForItem(item) {
    const videos = getPosterVideosByPlatform(item);
    const urls = [];
    videos.forEach(video => {
      let poster = video.getAttribute('poster');
      if (!poster && video.dataset && video.dataset.poster) {
        try { video.setAttribute('poster', video.dataset.poster); } catch(e) {}
        poster = video.dataset.poster;
      }
      if (poster) urls.push(poster);
    });
    const waits = urls.map(src => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    }));
    return Promise.all(waits);
  }

  function startPosterPriorityChain(activeIndex) {
    const seqId = ++prioritySequenceId; // используем общий счётчик для отмены при смене active
    const order = [];
    const activeItem = itemsArray[activeIndex];
    if (activeItem) order.push(activeItem);
    const nextItem = activeIndex < itemsArray.length - 1 ? itemsArray[activeIndex + 1] : null;
    if (nextItem) order.push(nextItem);
    const prevItem = activeIndex > 0 ? itemsArray[activeIndex - 1] : null;
    if (prevItem) order.push(prevItem);
    const next2Item = activeIndex + 2 < itemsArray.length ? itemsArray[activeIndex + 2] : null;
    if (next2Item) order.push(next2Item);

    (async () => {
      for (const item of order) {
        if (seqId !== prioritySequenceId) return;
        await loadPostersForItem(item);
      }
    })();
  }

  // Talking-head: грузим ВСЁ сразу (и постеры, и видео), вне зависимости от платформы
  function loadTalkingHeadAssetsImmediately() {
    itemsArray.forEach(item => {
      const head = item.querySelector('.cases-grid__item__container__wrap__talking-head');
      if (!head) return;
      const videos = Array.from(head.querySelectorAll('video'));
      videos.forEach(video => {
        // постер: создаём из data-poster при необходимости
        let poster = video.getAttribute('poster');
        if (!poster && video.dataset && video.dataset.poster) {
          try { video.setAttribute('poster', video.dataset.poster); } catch(e) {}
          poster = video.dataset.poster;
        }
        if (poster) { const img = new Image(); img.src = poster; }
        // видео ресурсы
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

  // Подгрузка всех видео в блоке
  function loadVideos(item, prefetchOnly = false) {
    const videos = getPlatformVideos(item, true);
    videos.forEach(video => {
      if (video.dataset.loaded) return;
      if (prefetchOnly) {
        // для prefetch соседей не создаём source, чтобы не сбить poster
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
    // Если источник кросс-доменный — НЕ используем fetch (избежим CORS), подключаем напрямую
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
      // В случае ошибок парсинга URL — подключаем напрямую
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
      // Фолбэк: если fetch недоступен (CORS и т.п.), подключаем источник напрямую
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

  // Применяем состояние звука при активации слайда
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

  // Запускаем видео только после полной загрузки (canplaythrough)
  function enableAutoplayAndPlay(item) {
    const videos = getPlatformVideos(item, false);
    videos.forEach(video => {
      const isTalkingHead = !!video.closest('.cases-grid__item__container__wrap__talking-head');
      if (isTalkingHead) {
        // Для talking-head возвращаем autoplay при активном слайде
        if (item.classList.contains('active')) {
          try { video.autoplay = true; } catch(_) {}
          try { if (!video.hasAttribute('autoplay')) video.setAttribute('autoplay', ''); } catch(_) {}
        }
        // talking-head всегда буферизуем
        video.preload = 'auto';
      } else {
        // Для остальных — автозапуск выключаем; стартуем вручную/по полосе
        if (video.autoplay) {
          video.autoplay = false;
        }
        if (video.hasAttribute("autoplay")) {
          video.removeAttribute("autoplay");
        }
        // Гарантируем буферизацию активного
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
        // HAVE_ENOUGH_DATA — можно воспроизводить
        tryPlay();
      } else {
        const onReady = () => { tryPlay(); };
        video.addEventListener("canplaythrough", onReady, { once: true });
      }
    });
  }

  // Выключаем autoplay и возвращаем видео в начало при потере active
  function disableAutoplayAndReset(item) {
    const videos = getPlatformVideos(item, false);
    videos.forEach(video => {
      if (video.autoplay) {
        video.autoplay = false;
      }
      if (video.hasAttribute("autoplay")) {
        video.removeAttribute("autoplay");
      }
      // звук должен быть доступен только при active — здесь гарантируем mute
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

  // Загрузка с приоритетом: active → next → prev
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
      // освобождаем blob URL если использовался
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

  // Очистка нерелевантных контейнеров от источников и постеров (кроме talking-head)
  function cleanupIrrelevantContainers() {
    itemsArray.forEach(item => {
      const irrelevantSelectors = isDesktop
        ? [".story-track", ".story-slider"]
        : [".cases-grid__item__container"];
      irrelevantSelectors.forEach(sel => {
        const irrelevantContainer = item.querySelector(sel);
        if (!irrelevantContainer) return;
        const irrelevantVideos = irrelevantContainer.querySelectorAll("video");
        irrelevantVideos.forEach(video => {
          // Не трогаем talking-head — он платформенно-агностичен
          if (video.closest('.cases-grid__item__container__wrap__talking-head')) return;
          // снимаем возможные source и пометки, чтобы исключить загрузку
          const sources = Array.from(video.querySelectorAll("source"));
          sources.forEach(s => s.remove());
          // удаляем постер, чтобы не грузился на нерелевантной платформе
          if (video.hasAttribute("poster")) {
            try { video.removeAttribute("poster"); } catch(e) {}
          }
          if (!video.hasAttribute("data-src")) {
            // если нет lazy-атрибута, принудительно делаем видео ленивым "пустым"
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

    // Выгружаем всё вне области и готовим активный
    updateLoadingScope(activeIndex);

    // Сразу запускаем цепочку загрузки постеров по строгому порядку
    startPosterPriorityChain(activeIndex);

    // 1) Active — грузим полностью, применяем звук и запускаем при готовности (видео ждём по canplaythrough)
    loadVideos(activeItem, false);
    applyAudioStateOnActivation(activeItem);
    enableAutoplayAndPlay(activeItem);
    await waitAllCanPlayThrough(getPlatformVideos(activeItem, false));
    if (seqId !== prioritySequenceId) return;

    // 2) index+1 — после полной загрузки active
    if (nextItem) {
      loadVideos(nextItem, true);
      await waitAllCanPlayThrough(getPlatformVideos(nextItem, false));
      if (seqId !== prioritySequenceId) return;
    }

    // 3) index-1 — после полной загрузки index+1
    if (prevItem) {
      loadVideos(prevItem, true);
    }

    // 4) Остальные постеры грузит стартовавшая цепочка startPosterPriorityChain
  }

  // (poster не трогаем до DOMContentLoaded, так как используется data-poster в разметке)

  // Чистим нерелевантные контейнеры, но без создания sources
  cleanupIrrelevantContainers();

  // Следим за изменением класса active
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      const item = mutation.target;
      const wasActive = (mutation.oldValue || "").split(/\s+/).includes("active");
      const isActive = item.classList.contains("active");

      if (!wasActive && isActive) {
        // Элемент стал активным: запускаем приоритетную последовательность
        let index = indexByItem.get(item);
        if (index === undefined) {
          index = itemsArray.indexOf(item);
          if (index !== -1) indexByItem.set(item, index);
        }
        if (index > -1) startPrioritySequence(index);
        // Подключаем полосу-наблюдатель к активному элементу
        attachPlaybandToItem(item);
      } else if (wasActive && !isActive) {
        // Элемент потерял active: останавливаем, сбрасываем и гарантируем muted
        disableAutoplayAndReset(item);
        // Отвязываем полосу-наблюдатель от ушедшего active
        detachPlayband(item);
      }
    });
  });
  items.forEach(item => observer.observe(item, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));

  // Ранняя инициализация на DOMContentLoaded для мгновенного старта
  attachPlaybandToCurrentActive();
  updateActiveVideos();
  // Принудительно обновляем состояние полосы без скролла
  onScrollOrResize();

  // Дожидаемся полной загрузки страницы, чтобы включить подгрузку ассетов
  function enableAssetsAfterLoad() {
    // talking-head — грузим сразу после полной загрузки
    loadTalkingHeadAssetsImmediately();
    // Стартуем очередь постеров и подгрузку активных видео
    updateActiveVideos();
    // Инициализируем полосу-наблюдатель для текущего active
    attachPlaybandToCurrentActive();
    // Принудительно обновляем состояние полосы без скролла
    onScrollOrResize();
  }
  if (document.readyState === 'complete') {
    enableAssetsAfterLoad();
  } else {
    window.addEventListener('load', enableAssetsAfterLoad, { once: true });
  }
});
*/
