document.addEventListener("DOMContentLoaded", () => {
  // Работаем только на мобильных устройствах (ширина экрана до 479px)
  if (!window.matchMedia || !window.matchMedia('(max-width: 479px)').matches) return;
  
  const items = document.querySelectorAll(".cases-grid__item");
  const itemsArray = Array.from(items);
  const indexByItem = new Map(itemsArray.map((el, i) => [el, i]));
  let prioritySequenceId = 0;

  // Простая детекция iOS Safari
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  const isIOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);

  // Вспомогательные функции для работы с видео по новой структуре
  function selectStoryTrackWrapper(item) {
    // Ищем story-track-wrapper через story-slider
    return item.querySelector(".story-slider .story-track-wrapper");
  }

  function getStoryTrackVideos(item, onlyWithDataSrc = false) {
    const selector = onlyWithDataSrc ? "video[data-src]" : "video";
    const storyWrapper = selectStoryTrackWrapper(item);
    const storyVideos = storyWrapper ? Array.from(storyWrapper.querySelectorAll(selector)) : [];
    
    // talking-head — всегда грузим, независимо от структуры
    const talkingHeadContainer = item.querySelector('.cases-grid__item__container__wrap__talking-head');
    const talkingHeadVideos = talkingHeadContainer ? Array.from(talkingHeadContainer.querySelectorAll(selector)) : [];
    
    // Объединяем и убираем дубликаты
    const combined = [...storyVideos, ...talkingHeadVideos];
    return Array.from(new Set(combined));
  }

  // Получаем видео только из активного слайда в story-track-wrapper
  function getActiveSlideVideos(item) {
    const storyWrapper = selectStoryTrackWrapper(item);
    if (!storyWrapper) return [];
    
    const activeSlide = storyWrapper.querySelector('.story-track-wrapper__slide.active');
    if (!activeSlide) return [];
    
    return Array.from(activeSlide.querySelectorAll('video'));
  }


  // Talking-head: грузим видео сразу
  function loadTalkingHeadAssetsImmediately() {
    console.log('🎬 Начинаем загрузку talking-head видео');
    let loadedCount = 0;
    let totalCount = 0;
    
    itemsArray.forEach(item => {
      const head = item.querySelector('.cases-grid__item__container__wrap__talking-head');
      if (!head) return;
      const videos = Array.from(head.querySelectorAll('video'));
      videos.forEach(video => {
        if (video.dataset && video.dataset.src) {
          totalCount++;
          console.log(`📥 Загружаем talking-head видео: ${video.dataset.src}`);
          
          // видео ресурсы
          if (!video.dataset.loaded) {
            const source = document.createElement('source');
            source.src = video.dataset.src;
            source.type = 'video/mp4';
            video.appendChild(source);
            video.preload = isIOS ? 'metadata' : 'auto';
            try { video.load(); } catch(e) {}
            video.dataset.loaded = 'true';
            loadedCount++;
            console.log(`✅ Talking-head видео загружено: ${video.dataset.src}`);
          } else {
            console.log(`⏭️ Talking-head видео уже загружено: ${video.dataset.src}`);
            loadedCount++;
          }
        }
      });
    });
    
    console.log(`🎬 Talking-head видео: загружено ${loadedCount}/${totalCount}`);
  }

  // Подгрузка всех видео в блоке
  function loadVideos(item, prefetchOnly = false) {
    const videos = getStoryTrackVideos(item, true);
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
    console.log(`📥 Начинаем загрузку видео: ${url}`);
    
    // Если источник кросс-доменный — НЕ используем fetch (избежим CORS), подключаем напрямую
    try {
      const urlObj = new URL(url, window.location.href);
      const sameOrigin = urlObj.origin === window.location.origin;
      if (!sameOrigin) {
        console.log(`🌐 Кросс-доменное видео, подключаем напрямую: ${url}`);
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = isIOS ? 'metadata' : 'auto';
        try { video.load(); } catch(e) {}
        video.dataset.loaded = 'true';
        console.log(`✅ Кросс-доменное видео загружено: ${url}`);
        delete video.dataset.fetching;
        return;
      }
    } catch (_) {
      // В случае ошибок парсинга URL — подключаем напрямую
      console.log(`⚠️ Ошибка парсинга URL, подключаем напрямую: ${url}`);
      const source = document.createElement('source');
      source.src = url;
      source.type = 'video/mp4';
      video.appendChild(source);
      video.preload = isIOS ? 'metadata' : 'auto';
      try { video.load(); } catch(e) {}
      video.dataset.loaded = 'true';
      console.log(`✅ Видео загружено (ошибка парсинга): ${url}`);
      delete video.dataset.fetching;
      return;
    }
    try {
      console.log(`🔄 Загружаем через fetch: ${url}`);
      const response = await fetch(url, { credentials: 'omit', cache: 'default' });
      if (!response.ok) throw new Error('Failed to fetch video');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const source = document.createElement('source');
      source.src = blobUrl;
      source.type = 'video/mp4';
      video.appendChild(source);
      video.preload = isIOS ? 'metadata' : 'auto';
      try { video.load(); } catch(e) {}
      video.dataset.loaded = 'true';
      video.dataset.blobUrl = blobUrl;
      console.log(`✅ Видео загружено через fetch: ${url}`);
    } catch (e) {
      console.log(`❌ Ошибка fetch, используем фолбэк: ${url}`);
      // Фолбэк: если fetch недоступен (CORS и т.п.), подключаем источник напрямую
      try {
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = isIOS ? 'metadata' : 'auto';
        try { video.load(); } catch(err) {}
        video.dataset.loaded = 'true';
        console.log(`✅ Видео загружено через фолбэк: ${url}`);
      } catch (_) {
        console.log(`❌ Фолбэк тоже не сработал: ${url}`);
      }
    } finally {
      try { delete video.dataset.fetching; } catch(_) {}
    }
  }

  // Применяем состояние звука при активации слайда
  function applyAudioStateOnActivation(item) {
    const videos = getStoryTrackVideos(item, false);
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
    const videos = getStoryTrackVideos(item, false);
    videos.forEach(video => {
      const isTalkingHead = !!video.closest('.cases-grid__item__container__wrap__talking-head');
      const isInActiveSlide = getActiveSlideVideos(item).includes(video);
      
      if (isTalkingHead) {
        // Для talking-head включаем autoplay при активном слайде
        if (item.classList.contains('active')) {
          try { video.autoplay = true; } catch(_) {}
          try { if (!video.hasAttribute('autoplay')) video.setAttribute('autoplay', ''); } catch(_) {}
        }
        // talking-head всегда буферизуем
        video.preload = isIOS ? 'metadata' : 'auto';
      } else {
        // Для остальных — включаем autoplay только для видео в активном слайде
        if (isInActiveSlide && item.classList.contains('active')) {
          try { video.autoplay = true; } catch(_) {}
          try { if (!video.hasAttribute('autoplay')) video.setAttribute('autoplay', ''); } catch(_) {}
        } else {
          if (video.autoplay) {
            video.autoplay = false;
          }
          if (video.hasAttribute("autoplay")) {
            video.removeAttribute("autoplay");
          }
        }
        // Гарантируем буферизацию активного
        video.preload = isIOS ? "metadata" : "auto";
      }

      const tryPlay = () => {
        if (!item.classList.contains("active")) return;
        if (isTalkingHead) {
          try { 
            if (video.paused) {
              video.play().catch(()=>{}); 
            }
          } catch(e) {}
          return;
        }
        // Играем только видео из активного слайда
        if (isInActiveSlide) {
          try { 
            if (video.paused) {
              video.play().catch(()=>{}); 
            }
          } catch(e) {}
        } else {
          try { 
            if (!video.paused) {
              video.pause(); 
            }
          } catch(e) {}
        }
      };

      // Пробуем запустить сразу, если видео готово
      if (video.readyState >= 2) {
        // HAVE_CURRENT_DATA — минимум для старта на мобильных
        tryPlay();
      } else if (video.readyState >= 4) {
        // HAVE_ENOUGH_DATA — можно воспроизводить
        tryPlay();
      } else {
        // Ждем готовности с несколькими событиями для мобильных
        const onReady = () => { tryPlay(); };
        video.addEventListener("canplay", onReady, { once: true });
        video.addEventListener("canplaythrough", onReady, { once: true });
        video.addEventListener("loadeddata", onReady, { once: true });
      }
    });
  }

  // Выключаем autoplay и возвращаем видео в начало при потере active
  function disableAutoplayAndReset(item) {
    const videos = getStoryTrackVideos(item, false);
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
      console.log('❌ Активный элемент не найден');
      return;
    }
    console.log(`🎯 Активный элемент найден (индекс ${activeIndex}), запускаем приоритетную загрузку`);
    startPrioritySequence(activeIndex);
  }

  function isInScope(index, activeIndex) {
    return index === activeIndex || index === activeIndex - 1 || index === activeIndex + 1;
  }

  function pauseVideos(item) {
    const videos = getStoryTrackVideos(item, false);
    videos.forEach(video => {
      try { video.pause(); } catch(e) {}
      try { video.muted = true; } catch(e) {}
      try { video.currentTime = 0; } catch(e) {}
      if (video.autoplay) video.autoplay = false;
      if (video.hasAttribute("autoplay")) video.removeAttribute("autoplay");
    });
  }

  function updateLoadingScope(activeIndex) {
    itemsArray.forEach((item, index) => {
      if (!isInScope(index, activeIndex)) {
        pauseVideos(item);
      }
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

    console.log(`🔄 Начинаем приоритетную последовательность (ID: ${seqId})`);
    console.log(`📋 План загрузки: Active(${activeIndex}) → Next(${nextItem ? activeIndex + 1 : 'нет'}) → Prev(${prevItem ? activeIndex - 1 : 'нет'})`);

    // Выгружаем всё вне области и готовим активный
    updateLoadingScope(activeIndex);

    // 1) Active — грузим полностью, применяем звук и запускаем при готовности (видео ждём по canplaythrough)
    console.log(`🎯 Этап 1: Загружаем активный элемент (${activeIndex})`);
    loadVideos(activeItem, false);
    applyAudioStateOnActivation(activeItem);
    enableAutoplayAndPlay(activeItem);
    await waitAllCanPlayThrough(getStoryTrackVideos(activeItem, false));
    if (seqId !== prioritySequenceId) return;
    console.log(`✅ Активный элемент загружен и готов к воспроизведению`);

    // 2) index+1 — после полной загрузки active
    if (nextItem) {
      console.log(`🎯 Этап 2: Загружаем следующий элемент (${activeIndex + 1})`);
      loadVideos(nextItem, true);
      await waitAllCanPlayThrough(getStoryTrackVideos(nextItem, false));
      if (seqId !== prioritySequenceId) return;
      console.log(`✅ Следующий элемент загружен`);
    }

    // 3) index-1 — после полной загрузки index+1
    if (prevItem) {
      console.log(`🎯 Этап 3: Загружаем предыдущий элемент (${activeIndex - 1})`);
      loadVideos(prevItem, true);
    }

    console.log(`🎉 Приоритетная последовательность завершена (ID: ${seqId})`);
  }

  // Функция для обработки изменения активного слайда внутри story-track-wrapper
  function handleActiveSlideChange(item) {
    if (!item.classList.contains('active')) return;
    
    console.log('🔄 Обрабатываем смену активного слайда');
    
    // Сначала останавливаем ВСЕ видео в элементе
    const allVideos = getStoryTrackVideos(item, false);
    let pausedCount = 0;
    allVideos.forEach(video => {
      try { 
        if (!video.paused) {
          video.pause(); 
          pausedCount++;
        }
      } catch(e) {}
    });
    if (pausedCount > 0) {
      console.log(`⏸️ Остановлено видео: ${pausedCount}`);
    }
    
    // Затем запускаем только видео в активном слайде + talking-head
    const activeSlideVideos = getActiveSlideVideos(item);
    const talkingHeadVideos = Array.from(item.querySelectorAll('.cases-grid__item__container__wrap__talking-head video'));
    
    console.log(`📊 Найдено видео: активный слайд(${activeSlideVideos.length}) + talking-head(${talkingHeadVideos.length})`);
    
    // Объединяем видео для запуска (активный слайд + talking-head)
    const videosToPlay = [...activeSlideVideos, ...talkingHeadVideos];
    
    let playedCount = 0;
    videosToPlay.forEach(video => {
      try { 
        if (video.paused) {
          video.play().catch(()=>{}); 
          playedCount++;
          console.log(`▶️ Запускаем видео: ${video.dataset.src || 'без data-src'}`);
        }
      } catch(e) {}
    });
    
    if (playedCount > 0) {
      console.log(`🎬 Запущено видео: ${playedCount}`);
    }
  }

  // Выполняем скрипт только после полной загрузки страницы
  function initVideoLazy() {
    console.log('Страница загружена');
    
    // Отключаем preload у всех видео ПОСЛЕ полной загрузки страницы
    let disabledCount = 0;
    itemsArray.forEach(item => {
      const allVideos = item.querySelectorAll('video');
      allVideos.forEach(video => {
        video.preload = 'none';
        disabledCount++;
      });
    });
    console.log(`🚫 Отключен preload у ${disabledCount} видео после загрузки страницы`);

    // Следим за изменением класса active на .cases-grid__item
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        const item = mutation.target;
        const wasActive = (mutation.oldValue || "").split(/\s+/).includes("active");
        const isActive = item.classList.contains("active");

        if (!wasActive && isActive) {
          // Элемент стал активным: запускаем приоритетную последовательность
          console.log('🔄 Элемент стал активным');
          let index = indexByItem.get(item);
          if (index === undefined) {
            index = itemsArray.indexOf(item);
            if (index !== -1) indexByItem.set(item, index);
          }
          if (index > -1) startPrioritySequence(index);
          // Немедленно запускаем видео в активном слайде
          handleActiveSlideChange(item);
        } else if (wasActive && !isActive) {
          // Элемент потерял active: останавливаем, сбрасываем и гарантируем muted
          console.log('⏹️ Элемент потерял активность');
          disableAutoplayAndReset(item);
        }
      });
    });
    items.forEach(item => observer.observe(item, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));

    // Следим за изменением класса active на слайдах внутри story-track-wrapper
    const slideObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        const slide = mutation.target;
        if (slide.classList.contains('story-track-wrapper__slide')) {
          const storyWrapper = slide.closest('.story-track-wrapper');
          const gridItem = storyWrapper ? storyWrapper.closest('.cases-grid__item') : null;
          if (gridItem) {
            handleActiveSlideChange(gridItem);
          }
        }
      });
    });
    
    // Наблюдаем за всеми слайдами
    items.forEach(item => {
      const slides = item.querySelectorAll('.story-track-wrapper__slide');
      slides.forEach(slide => {
        slideObserver.observe(slide, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
      });
    });

    // talking-head — грузим сразу после полной загрузки
    loadTalkingHeadAssetsImmediately();
    // Стартуем подгрузку активных видео
    updateActiveVideos();
    // Немедленно запускаем видео в активном слайде
    const activeItem = itemsArray.find(item => item.classList.contains('active'));
    if (activeItem) {
      console.log('🎬 Запускаем видео в активном слайде при инициализации');
      handleActiveSlideChange(activeItem);
    } else {
      console.log('❌ Активный элемент не найден при инициализации');
    }
  }

  if (document.readyState === 'complete') {
    initVideoLazy();
  } else {
    window.addEventListener('load', initVideoLazy, { once: true });
  }
});
