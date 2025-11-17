document.addEventListener("DOMContentLoaded", () => {
  // Работаем только на мобильных устройствах (ширина экрана до 479px)
  if (!window.matchMedia || !window.matchMedia('(max-width: 479px)').matches) return;
  
  const items = document.querySelectorAll(".cases-grid__item");
  const itemsArray = Array.from(items);
  const indexByItem = new Map(itemsArray.map((el, i) => [el, i]));
  let prioritySequenceId = 0;
  let initialPlayDone = false;

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

  // Получаем talking-head видео из элемента
  function getTalkingHeadVideos(item) {
    const head = item.querySelector('.cases-grid__item__container__wrap__talking-head');
    if (!head) return [];
    return Array.from(head.querySelectorAll('video[mob-data-src]'));
  }

  // Получаем видео из конкретного слайда по индексу
  function getSlideVideos(item, slideIndex) {
    const storyWrapper = selectStoryTrackWrapper(item);
    if (!storyWrapper) return [];
    
    const slides = Array.from(storyWrapper.querySelectorAll('.story-track-wrapper__slide'));
    if (slideIndex < 0 || slideIndex >= slides.length) return [];
    
    return Array.from(slides[slideIndex].querySelectorAll('video[data-src]'));
  }

  

  // Загружаем список видео
  async function loadVideosList(videos) {
    const toLoad = videos.filter(v => {
      const mobAttr = typeof v.getAttribute === 'function' ? v.getAttribute('mob-data-src') : null;
      const dataAttr = v.dataset ? v.dataset.src : null;
      const chosen = mobAttr || dataAttr;
      return chosen && !(v.dataset && v.dataset.loaded);
    });
    if (toLoad.length === 0) return;
    
    // Запускаем загрузку всех видео и ждем завершения
    await Promise.all(toLoad.map(video => attachSourceAfterFetch(video)));
  }

  async function attachSourceAfterFetch(video) {
    const mobAttr = typeof video.getAttribute === 'function' ? video.getAttribute('mob-data-src') : null;
    const dataAttr = video.dataset ? video.dataset.src : null;
    const dataSrcAttr = mobAttr || dataAttr;
    if (!video || !dataSrcAttr) return;
    if (video.dataset && video.dataset.loaded) return;
    if (video.dataset.fetching === 'true') {
      // Если уже загружается, ждем завершения
      return new Promise(resolve => {
        const checkLoaded = () => {
          if (video.dataset.loaded) {
            resolve();
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
      });
    }
    
    if (video.dataset) video.dataset.fetching = 'true';
    const url = dataSrcAttr;
    
    // Если источник кросс-доменный — НЕ используем fetch (избежим CORS), подключаем напрямую
    try {
      const urlObj = new URL(url, window.location.href);
      const sameOrigin = urlObj.origin === window.location.origin;
      if (!sameOrigin) {
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = isIOS ? 'metadata' : 'auto';
        try { video.load(); } catch(e) {}
        await new Promise(resolve => {
          if (video.readyState >= 4) {
            resolve();
          } else {
            video.addEventListener("canplaythrough", resolve, { once: true });
          }
        });
        if (video.dataset) video.dataset.loaded = 'true';
        try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
        return;
      }
    } catch (_) {
      // В случае ошибок парсинга URL — подключаем напрямую
      const source = document.createElement('source');
      source.src = url;
      source.type = 'video/mp4';
      video.appendChild(source);
      video.preload = isIOS ? 'metadata' : 'auto';
      try { video.load(); } catch(e) {}
      await new Promise(resolve => {
        if (video.readyState >= 4) {
          resolve();
        } else {
          video.addEventListener("canplaythrough", resolve, { once: true });
        }
      });
      if (video.dataset) video.dataset.loaded = 'true';
      try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
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
      video.preload = isIOS ? 'metadata' : 'auto';
      try { video.load(); } catch(e) {}
      await new Promise(resolve => {
        if (video.readyState >= 4) {
          resolve();
        } else {
          video.addEventListener("canplaythrough", resolve, { once: true });
        }
      });
      if (video.dataset) {
        video.dataset.loaded = 'true';
        video.dataset.blobUrl = blobUrl;
      }
    } catch (e) {
      // Фолбэк: если fetch недоступен (CORS и т.п.), подключаем источник напрямую
      try {
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = isIOS ? 'metadata' : 'auto';
        try { video.load(); } catch(err) {}
        await new Promise(resolve => {
          if (video.readyState >= 4) {
            resolve();
          } else {
            video.addEventListener("canplaythrough", resolve, { once: true });
          }
        });
        if (video.dataset) video.dataset.loaded = 'true';
      } catch (_) {}
    } finally {
      try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
    }
  }

  function updateActiveVideos() {
    const activeIndex = itemsArray.findIndex(item => item.classList.contains("active"));
    if (activeIndex === -1) return;
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

    updateLoadingScope(activeIndex);

    // 1) talking-head видео в cases-grid__item.active
    const talkingHeadVideos = getTalkingHeadVideos(activeItem);
    if (talkingHeadVideos.length > 0) {
      await loadVideosList(talkingHeadVideos);
      if (seqId !== prioritySequenceId) return;
    }

    // 2) видео внутри первого story-track-wrapper__slide в cases-grid__item.active
    const firstSlideVideos = getSlideVideos(activeItem, 0);
    if (firstSlideVideos.length > 0) {
      await loadVideosList(firstSlideVideos);
      if (seqId !== prioritySequenceId) return;
    }

    // 3) talking-head видео в cases-grid__item.active + 1
    if (nextItem) {
      const nextTalkingHeadVideos = getTalkingHeadVideos(nextItem);
      if (nextTalkingHeadVideos.length > 0) {
        await loadVideosList(nextTalkingHeadVideos);
        if (seqId !== prioritySequenceId) return;
      }

      // 4) видео внутри первого story-track-wrapper__slide в cases-grid__item.active + 1
      const nextFirstSlideVideos = getSlideVideos(nextItem, 0);
      if (nextFirstSlideVideos.length > 0) {
        await loadVideosList(nextFirstSlideVideos);
        if (seqId !== prioritySequenceId) return;
      }
    }

    // 5) видео внутри второго story-track-wrapper__slide в cases-grid__item.active (если есть)
    const secondSlideVideos = getSlideVideos(activeItem, 1);
    if (secondSlideVideos.length > 0) {
      await loadVideosList(secondSlideVideos);
      if (seqId !== prioritySequenceId) return;
    }
  }

  // Функция для загрузки видео следующего слайда при смене активного слайда
  function loadNextSlide(item) {
    const storyWrapper = selectStoryTrackWrapper(item);
    if (!storyWrapper) return;
    
    const slides = Array.from(storyWrapper.querySelectorAll('.story-track-wrapper__slide'));
    const activeSlideIndex = slides.findIndex(slide => slide.classList.contains('active'));
    
    if (activeSlideIndex === -1 || activeSlideIndex >= slides.length - 1) return;
    
    const nextSlideIndex = activeSlideIndex + 1;
    const nextSlideVideos = getSlideVideos(item, nextSlideIndex);
    if (nextSlideVideos.length > 0) {
      loadVideosList(nextSlideVideos);
    }
  }

  function initVideoLazy() {
    itemsArray.forEach(item => {
      const allVideos = item.querySelectorAll('video');
      allVideos.forEach(video => {
        video.preload = 'none';
      });
    });

    // Следим за изменением класса active на .cases-grid__item
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
        }
      });
    });
    items.forEach(item => observer.observe(item, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));

    // Следим за изменением активного слайда внутри story-track-wrapper
    itemsArray.forEach(item => {
      const storyWrapper = selectStoryTrackWrapper(item);
      if (!storyWrapper) return;
      
      const slideObserver = new MutationObserver(() => {
        if (item.classList.contains('active')) {
          loadNextSlide(item);
        }
      });
      
      storyWrapper.querySelectorAll('.story-track-wrapper__slide').forEach(slide => {
        slideObserver.observe(slide, { attributes: true, attributeFilter: ['class'] });
      });
    });

    updateActiveVideos();
    
    const activeItem = itemsArray.find(item => item.classList.contains('active'));
    if (activeItem) {
      (async () => {
        try {
          await waitAllCanPlayThrough(getStoryTrackVideos(activeItem, false));
        } catch(_) {}
        if (!initialPlayDone) {
          const activeSlideVideos = getActiveSlideVideos(activeItem);
          const talkingHeadVideos = Array.from(activeItem.querySelectorAll('.cases-grid__item__container__wrap__talking-head video'));
          const videosToPlay = [...activeSlideVideos, ...talkingHeadVideos];
          // Безопасный запуск: сначала muted, затем play, через 150мс включаем звук (если нужно)
          const soundOn = !!(window.CasesAudio && window.CasesAudio.soundOn);
          videosToPlay.forEach(video => {
            try {
              if (video && typeof video.play === 'function') {
                video.muted = true;
                const p = video.play();
                if (p && p.catch) p.catch(()=>{});
                if (soundOn) {
                  setTimeout(() => {
                    try {
                      if (video && !video.paused) {
                        video.muted = false;
                        video.volume = 1;
                      }
                    } catch(_) {}
                  }, 150);
                }
              }
            } catch(_) {}
          });
          initialPlayDone = true;
        }
      })();
    }
  }

  if (document.readyState === 'complete') {
    initVideoLazy();
  } else {
    window.addEventListener('load', initVideoLazy, { once: true });
  }
});
