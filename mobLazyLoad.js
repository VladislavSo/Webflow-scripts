document.addEventListener("DOMContentLoaded", () => {
  // Работаем только на мобильных устройствах (ширина экрана до 479px)
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  
  if (!window.matchMedia || !window.matchMedia('(max-width: 479px)').matches) {
    console.log(`[${timeStr}] [newMobVideoLazy] SKIPPED: not mobile device`);
    return;
  }
  console.log(`[${timeStr}] [newMobVideoLazy] INIT: script started`);
  
  // Кеш для хранения информации о загруженных видео
  // Структура: { itemId: { storyTrackLoaded: boolean, talkingHeadLoaded: boolean } }
  const loadCache = new Map();

  // Простая детекция iOS Safari
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  const isIOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);

  // Получить время с миллисекундами для логов
  function getTimeStamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  // Получить информацию о видео для логов
  function getVideoInfo(video) {
    if (!video) return 'unknown';
    try {
      const src = video.src || (video.querySelector('source') ? video.querySelector('source').src : 'no-src');
      const srcFileName = src && src !== 'no-src' ? src.substring(src.lastIndexOf('/') + 1).substring(0, 30) : 'no-src';
      const id = video.id || 'no-id';
      const className = video.className || 'no-class';
      // Определяем тип видео по родительским элементам
      let videoType = 'unknown';
      try {
        if (video.closest && video.closest('.cases-grid__item__container__wrap__talking-head')) {
          videoType = 'talking-head';
        } else if (video.closest && video.closest('.story-track-wrapper')) {
          videoType = 'story-track';
        }
      } catch(_) {}
      return `video[type:${videoType}][id:${id}][class:${className}][src:${srcFileName}]`;
    } catch(_) {
      return 'video[error]';
    }
  }

  // Получить ID элемента .cases-grid__item
  function getItemId(item) {
    if (!item) return null;
    try {
      return item.id || item.getAttribute('id') || null;
    } catch(_) {
      return null;
    }
  }

  // Найти все видео в .story-track-wrapper в любой глубине вложенности
  function getStoryTrackVideos(item) {
    if (!item) return [];
    try {
      const storyWrapper = item.querySelector('.story-track-wrapper');
      if (!storyWrapper) return [];
      return Array.from(storyWrapper.querySelectorAll('video'));
    } catch(_) {
      return [];
    }
  }

  // Найти видео в .cases-grid__item__container__wrap__talking-head в любой глубине
  function getTalkingHeadVideos(item) {
    if (!item) return [];
    try {
      const talkingHead = item.querySelector('.cases-grid__item__container__wrap__talking-head');
      if (!talkingHead) return [];
      return Array.from(talkingHead.querySelectorAll('video'));
    } catch(_) {
      return [];
    }
  }

  // Загрузить источник видео (если нужно) и вызвать load(), ждем готовности
  async function loadVideoSource(video) {
    if (!video) return;
    
    // Проверяем, есть ли уже источник
    if (video.src || (video.querySelector && video.querySelector('source'))) {
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] SOURCE ALREADY EXISTS: ${getVideoInfo(video)}`);
      try {
        video.load();
        // Ждем готовности видео
        await new Promise(resolve => {
          if (video.readyState >= 2) { // HAVE_CURRENT_DATA
            resolve();
          } else {
            const onCanPlay = () => { resolve(); };
            video.addEventListener('canplay', onCanPlay, { once: true });
            video.addEventListener('error', onCanPlay, { once: true });
          }
        });
      } catch(e) {}
      return;
    }

    // Получаем URL из атрибутов
    const mobAttr = typeof video.getAttribute === 'function' ? video.getAttribute('mob-data-src') : null;
    const dataAttr = video.dataset ? video.dataset.src : null;
    const dataSrcAttr = mobAttr || dataAttr;
    
    if (!dataSrcAttr) {
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] NO DATA-SRC ATTRIBUTE: ${getVideoInfo(video)}`);
      try {
        video.load();
        await new Promise(resolve => {
          if (video.readyState >= 2) {
            resolve();
          } else {
            const onCanPlay = () => { resolve(); };
            video.addEventListener('canplay', onCanPlay, { once: true });
            video.addEventListener('error', onCanPlay, { once: true });
          }
        });
      } catch(e) {}
      return;
    }

    // Если уже загружается или загружено
    if (video.dataset && video.dataset.loaded) {
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] VIDEO ALREADY LOADED: ${getVideoInfo(video)}`);
      try {
        video.load();
        await new Promise(resolve => {
          if (video.readyState >= 2) {
            resolve();
          } else {
            const onCanPlay = () => { resolve(); };
            video.addEventListener('canplay', onCanPlay, { once: true });
            video.addEventListener('error', onCanPlay, { once: true });
          }
        });
      } catch(e) {}
      return;
    }

    if (video.dataset && video.dataset.fetching === 'true') {
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] VIDEO ALREADY FETCHING: ${getVideoInfo(video)}, waiting...`);
      // Ждем завершения загрузки
      return new Promise(resolve => {
        const checkLoaded = () => {
          if (video.dataset.loaded) {
            console.log(`[${getTimeStamp()}] [newMobVideoLazy] VIDEO FETCHING COMPLETED: ${getVideoInfo(video)}`);
            try {
              video.load();
              if (video.readyState >= 2) {
                resolve();
              } else {
                const onCanPlay = () => { resolve(); };
                video.addEventListener('canplay', onCanPlay, { once: true });
                video.addEventListener('error', onCanPlay, { once: true });
              }
            } catch(e) {
              resolve();
            }
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
      });
    }

    if (video.dataset) video.dataset.fetching = 'true';
    const url = dataSrcAttr;
    console.log(`[${getTimeStamp()}] [newMobVideoLazy] START LOADING: ${getVideoInfo(video)}, url: ${url.substring(url.lastIndexOf('/') + 1)}`);

    // Если источник кросс-доменный — подключаем напрямую
    try {
      const urlObj = new URL(url, window.location.href);
      const sameOrigin = urlObj.origin === window.location.origin;
      if (!sameOrigin) {
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = isIOS ? 'metadata' : 'auto';
        console.log(`[${getTimeStamp()}] [newMobVideoLazy] SOURCE CREATED (cross-origin): ${getVideoInfo(video)}, url: ${url.substring(url.lastIndexOf('/') + 1)}`);
        try {
          video.load();
        } catch(e) {}
        // Ждем готовности
        await new Promise(resolve => {
          if (video.readyState >= 2) {
            resolve();
          } else {
            const onCanPlay = () => { resolve(); };
            video.addEventListener('canplay', onCanPlay, { once: true });
            video.addEventListener('error', onCanPlay, { once: true });
          }
        });
        if (video.dataset) video.dataset.loaded = 'true';
        console.log(`[${getTimeStamp()}] [newMobVideoLazy] SOURCE CREATED AND LOADED (cross-origin): ${getVideoInfo(video)}`);
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
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] SOURCE CREATED (URL parse error fallback): ${getVideoInfo(video)}, url: ${url.substring(url.lastIndexOf('/') + 1)}`);
      try {
        video.load();
      } catch(e) {}
      // Ждем готовности
      await new Promise(resolve => {
        if (video.readyState >= 2) {
          resolve();
        } else {
          const onCanPlay = () => { resolve(); };
          video.addEventListener('canplay', onCanPlay, { once: true });
          video.addEventListener('error', onCanPlay, { once: true });
        }
      });
      if (video.dataset) video.dataset.loaded = 'true';
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] SOURCE CREATED AND LOADED (URL parse error fallback): ${getVideoInfo(video)}`);
      try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
      return;
    }

    // Пытаемся загрузить через fetch
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
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] SOURCE CREATED (fetch blob): ${getVideoInfo(video)}, url: ${url.substring(url.lastIndexOf('/') + 1)}`);
      try {
        video.load();
      } catch(e) {}
      // Ждем готовности
      await new Promise(resolve => {
        if (video.readyState >= 2) {
          resolve();
        } else {
          const onCanPlay = () => { resolve(); };
          video.addEventListener('canplay', onCanPlay, { once: true });
          video.addEventListener('error', onCanPlay, { once: true });
        }
      });
      if (video.dataset) {
        video.dataset.loaded = 'true';
        video.dataset.blobUrl = blobUrl;
      }
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] SOURCE CREATED AND LOADED (fetch blob): ${getVideoInfo(video)}`);
    } catch (e) {
      // Фолбэк: подключаем источник напрямую
      try {
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = isIOS ? 'metadata' : 'auto';
        console.log(`[${getTimeStamp()}] [newMobVideoLazy] SOURCE CREATED (fetch error fallback): ${getVideoInfo(video)}, url: ${url.substring(url.lastIndexOf('/') + 1)}`);
        try {
          video.load();
        } catch(err) {}
        // Ждем готовности
        await new Promise(resolve => {
          if (video.readyState >= 2) {
            resolve();
          } else {
            const onCanPlay = () => { resolve(); };
            video.addEventListener('canplay', onCanPlay, { once: true });
            video.addEventListener('error', onCanPlay, { once: true });
          }
        });
        if (video.dataset) video.dataset.loaded = 'true';
        console.log(`[${getTimeStamp()}] [newMobVideoLazy] SOURCE CREATED AND LOADED (fetch error fallback): ${getVideoInfo(video)}`);
      } catch (_) {}
    } finally {
      try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
    }
  }

  // Загрузить видео для активного элемента
  async function loadVideosForItem(item) {
    if (!item) {
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] loadVideosForItem: item is null`);
      return;
    }

    const itemId = getItemId(item);
    if (!itemId) {
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] loadVideosForItem: item has no id`);
      return;
    }

    console.log(`[${getTimeStamp()}] [newMobVideoLazy] loadVideosForItem: starting for item id: ${itemId}`);

    // Проверяем кеш - если запись есть, значит все видео уже загружены
    if (loadCache.has(itemId)) {
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] loadVideosForItem: already in cache, skipping`);
      return; // Все уже загружено
    }

    // Находим все видео в .story-track-wrapper
    const storyTrackVideos = getStoryTrackVideos(item);
    console.log(`[${getTimeStamp()}] [newMobVideoLazy] loadVideosForItem: found ${storyTrackVideos.length} story-track videos`);
    
    // Загружаем видео из story-track-wrapper
    if (storyTrackVideos.length > 0) {
      // Для первого видео: load и play
      if (storyTrackVideos[0]) {
        await loadVideoSource(storyTrackVideos[0]);
        try {
          if (storyTrackVideos[0].paused) {
            console.log(`[${getTimeStamp()}] [newMobVideoLazy] PLAY CALLED (story-track first video): ${getVideoInfo(storyTrackVideos[0])}`);
            storyTrackVideos[0].play().catch(() => {});
          }
        } catch(_) {}
      }
      
      // Для остальных: только load
      for (let i = 1; i < storyTrackVideos.length; i++) {
        await loadVideoSource(storyTrackVideos[i]);
      }
    }

    // Проверяем наличие talking-head
    const talkingHead = item.querySelector('.cases-grid__item__container__wrap__talking-head');
    if (talkingHead) {
      const talkingHeadVideos = getTalkingHeadVideos(item);
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] loadVideosForItem: found ${talkingHeadVideos.length} talking-head videos`);
      if (talkingHeadVideos.length > 0) {
        // Для всех talking-head видео: load и play
        for (const video of talkingHeadVideos) {
          await loadVideoSource(video);
          try {
            if (video.paused) {
              console.log(`[${getTimeStamp()}] [newMobVideoLazy] PLAY CALLED (talking-head): ${getVideoInfo(video)}`);
              video.play().catch(() => {});
            }
          } catch(_) {}
        }
      }
    }

    // Сохраняем в кеш - отмечаем, что для этого элемента видео загружены
    loadCache.set(itemId, true);
    console.log(`[${getTimeStamp()}] [newMobVideoLazy] loadVideosForItem: completed for item id: ${itemId}`);
  }

  // Инициализация при загрузке страницы
  function initVideoLazy() {
    console.log(`[${getTimeStamp()}] [newMobVideoLazy] INIT: initVideoLazy called`);
    // Находим активный элемент
    const activeItem = document.querySelector('.cases-grid__item.active');
    
    if (activeItem) {
      const itemId = getItemId(activeItem);
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] INIT: found active item, id: ${itemId}`);
      loadVideosForItem(activeItem);
    } else {
      console.log(`[${getTimeStamp()}] [newMobVideoLazy] INIT: no active item found`);
    }

    // Создаем обсервер для изменения active
    const items = document.querySelectorAll('.cases-grid__item');
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        const item = mutation.target;
        if (!item || !item.classList || !item.classList.contains('cases-grid__item')) return;
        
        const wasActive = (mutation.oldValue || '').split(/\s+/).includes('active');
        const isActive = item.classList.contains('active');

        // Если элемент получил active
        if (!wasActive && isActive) {
          const itemId = getItemId(item);
          console.log(`[${getTimeStamp()}] [newMobVideoLazy] OBSERVER: item got active, id: ${itemId}`);
          loadVideosForItem(item);
        }
      });
    });

    // Наблюдаем за всеми элементами
    console.log(`[${getTimeStamp()}] [newMobVideoLazy] INIT: observing ${items.length} items`);
    items.forEach(item => {
      observer.observe(item, { 
        attributes: true, 
        attributeFilter: ['class'], 
        attributeOldValue: true 
      });
    });
  }

  if (document.readyState === 'complete') {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    console.log(`[${timeStr}] [newMobVideoLazy] INIT: document already complete, calling initVideoLazy`);
    initVideoLazy();
  } else {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    console.log(`[${timeStr}] [newMobVideoLazy] INIT: waiting for load event`);
    window.addEventListener('load', function() {
      const now2 = new Date();
      const timeStr2 = `${String(now2.getHours()).padStart(2, '0')}:${String(now2.getMinutes()).padStart(2, '0')}:${String(now2.getSeconds()).padStart(2, '0')}.${String(now2.getMilliseconds()).padStart(3, '0')}`;
      console.log(`[${timeStr2}] [newMobVideoLazy] INIT: load event fired, calling initVideoLazy`);
      initVideoLazy();
    }, { once: true });
  }
});
