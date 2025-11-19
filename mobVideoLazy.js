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
    return Array.from(head.querySelectorAll('video'));
  }

  // Получаем все видео в кейсе (story-track + talking-head)
  function getAllCaseVideos(item) {
    const storyVideos = getStoryTrackVideos(item, false);
    const talkingHeadVideos = getTalkingHeadVideos(item);
    return Array.from(new Set([...storyVideos, ...talkingHeadVideos]));
  }

  // Проверяем наличие talking head в кейсе
  function hasTalkingHead(item) {
    const head = item.querySelector('.cases-grid__item__container__wrap__talking-head video');
    return !!head;
  }

  // Получаем видео из первого слайда (index 0)
  function getFirstSlideVideos(item) {
    return getSlideVideos(item, 0);
  }

  // Проверяем готовность видео к воспроизведению (есть source и readyState >= 3)
  function isVideoReady(video) {
    if (!video) return false;
    // Проверяем наличие source элемента
    const hasSource = video.querySelector('source') !== null || (video.src && video.src.length > 0);
    if (!hasSource) return false;
    // Проверяем readyState (HAVE_FUTURE_DATA = 3, HAVE_ENOUGH_DATA = 4)
    return video.readyState >= 3;
  }

  // Проверяем готовность видео с повторными попытками
  function waitForVideoReady(video, initialDelay = 100, retryDelay = 200) {
    return new Promise((resolve) => {
      const checkReady = () => {
        if (isVideoReady(video)) {
          resolve(true);
          return;
        }
        // Если видео еще не готово, проверяем событие canplay
        const onCanPlay = () => {
          video.removeEventListener('canplay', onCanPlay);
          resolve(true);
        };
        video.addEventListener('canplay', onCanPlay, { once: true });
      };

      setTimeout(checkReady, initialDelay);
    });
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

  // Применяем звуковые настройки к кейсу согласно флагу soundOn
  function applySoundSettingsToCase(item) {
    if (!item || !item.classList.contains('active')) return;
    
    const soundOn = window.CasesAudio && window.CasesAudio.soundOn;
    const allVideos = getAllCaseVideos(item);
    const hasTH = hasTalkingHead(item);
    const talkingHeadVideos = hasTH ? getTalkingHeadVideos(item) : [];
    const firstSlideVideos = getFirstSlideVideos(item);

    if (!soundOn) {
      // soundOn = false: добавляем muted всем видео
      allVideos.forEach(video => {
        try {
          video.muted = true;
          video.setAttribute('muted', '');
        } catch(e) {}
      });
    } else {
      // soundOn = true
      if (hasTH) {
        // Есть talking head: убираем muted только у talking head
        talkingHeadVideos.forEach(video => {
          try {
            video.muted = false;
            video.removeAttribute('muted');
          } catch(e) {}
        });
        // Остальным видео добавляем muted
        allVideos.forEach(video => {
          if (!talkingHeadVideos.includes(video)) {
            try {
              video.muted = true;
              video.setAttribute('muted', '');
            } catch(e) {}
          }
        });
      } else {
        // Нет talking head: убираем muted у первого слайда (index 0)
        firstSlideVideos.forEach(video => {
          try {
            video.muted = false;
            video.removeAttribute('muted');
          } catch(e) {}
        });
        // Остальным видео добавляем muted
        allVideos.forEach(video => {
          if (!firstSlideVideos.includes(video)) {
            try {
              video.muted = true;
              video.setAttribute('muted', '');
            } catch(e) {}
          }
        });
      }
    }
  }

  // Экспортируем функцию для использования в других скриптах
  if (typeof window !== 'undefined') {
    window.applySoundSettingsToCase = applySoundSettingsToCase;
  }

  async function startPrioritySequence(activeIndex) {
    const seqId = ++prioritySequenceId;
    const activeItem = itemsArray[activeIndex];
    const nextItem = activeIndex < itemsArray.length - 1 ? itemsArray[activeIndex + 1] : null;

    updateLoadingScope(activeIndex);

    // 1) Находим все видео и talking head в кейсе
    const allCaseVideos = getAllCaseVideos(activeItem);
    
    // 2) Загружаем все видео внутри кейса
    if (allCaseVideos.length > 0) {
      await loadVideosList(allCaseVideos);
      if (seqId !== prioritySequenceId) return;
    }

    // 3) Применяем звуковые настройки согласно флагу soundOn
    applySoundSettingsToCase(activeItem);

    // 4) Через 100мс проверяем готовность видео talking head и активного слайда
    setTimeout(async () => {
      if (seqId !== prioritySequenceId) return;

      const talkingHeadVideos = getTalkingHeadVideos(activeItem);
      const activeSlideVideos = getActiveSlideVideos(activeItem);
      const videosToCheck = [...talkingHeadVideos, ...activeSlideVideos];

      let allReady = true;
      for (const video of videosToCheck) {
        if (!isVideoReady(video)) {
          allReady = false;
          break;
        }
      }

      if (!allReady) {
        // Если не готовы, повторяем проверку через 200мс
        setTimeout(async () => {
          if (seqId !== prioritySequenceId) return;
          for (const video of videosToCheck) {
            await waitForVideoReady(video, 0, 200);
          }
          
          // 5) Когда проверка пройдена, вызываем play
          if (seqId === prioritySequenceId) {
            talkingHeadVideos.forEach(video => {
              try {
                if (video.paused) {
                  video.play().catch(() => {});
                }
              } catch(e) {}
            });
            activeSlideVideos.forEach(video => {
              try {
                if (video.paused) {
                  video.play().catch(() => {});
                }
              } catch(e) {}
            });
          }
        }, 200);
      } else {
        // Все готовы сразу - вызываем play
        if (seqId === prioritySequenceId) {
          talkingHeadVideos.forEach(video => {
            try {
              if (video.paused) {
                video.play().catch(() => {});
              }
            } catch(e) {}
          });
          activeSlideVideos.forEach(video => {
            try {
              if (video.paused) {
                video.play().catch(() => {});
              }
            } catch(e) {}
          });
        }
      }
    }, 100);

    // Продолжаем загрузку следующего кейса в фоне
    if (nextItem) {
      const nextCaseVideos = getAllCaseVideos(nextItem);
      if (nextCaseVideos.length > 0) {
        loadVideosList(nextCaseVideos).catch(() => {});
      }
    }

    // Загружаем второй слайд текущего кейса в фоне
    const secondSlideVideos = getSlideVideos(activeItem, 1);
    if (secondSlideVideos.length > 0) {
      loadVideosList(secondSlideVideos).catch(() => {});
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

  // Обработка смены активного слайда
  async function handleActiveSlideChange(item) {
    if (!item || !item.classList.contains('active')) return;

    const activeSlideVideos = getActiveSlideVideos(item);
    if (activeSlideVideos.length === 0) return;

    // 1) Проверяем готовность видео с повторными попытками через 100мс
    const checkAndPlay = async () => {
      let allReady = true;
      for (const video of activeSlideVideos) {
        if (!isVideoReady(video)) {
          allReady = false;
          break;
        }
      }

      if (!allReady) {
        // Если не готовы, повторяем через 100мс
        setTimeout(checkAndPlay, 100);
        return;
      }

      // 2) Когда проверка пройдена, вызываем play
      activeSlideVideos.forEach(video => {
        try {
          if (video.paused) {
            video.play().catch(() => {});
          }
        } catch(e) {}
      });
    };

    checkAndPlay();

    // Загружаем следующий слайд в фоне
    loadNextSlide(item);
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
          handleActiveSlideChange(item);
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
          videosToPlay.forEach(video => {
            try {
              if (video.paused) {
                video.play().catch(()=>{});
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
