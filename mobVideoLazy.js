document.addEventListener("DOMContentLoaded", () => {
  // Работаем только на мобильных устройствах (ширина экрана до 479px)
  if (!window.matchMedia || !window.matchMedia('(max-width: 479px)').matches) return;
  
  // Кеш для хранения информации о загруженных видео
  // Структура: { itemId: { storyTrackLoaded: boolean, talkingHeadLoaded: boolean } }
  const loadCache = new Map();

  // Простая детекция iOS Safari
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  const isIOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);

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

  // Загрузить источник видео (если нужно) и вызвать load()
  async function loadVideoSource(video) {
    if (!video) return;
    
    // Проверяем, есть ли уже источник
    if (video.src || (video.querySelector && video.querySelector('source'))) {
      try {
        video.load();
      } catch(e) {}
      return;
    }

    // Получаем URL из атрибутов
    const mobAttr = typeof video.getAttribute === 'function' ? video.getAttribute('mob-data-src') : null;
    const dataAttr = video.dataset ? video.dataset.src : null;
    const dataSrcAttr = mobAttr || dataAttr;
    
    if (!dataSrcAttr) {
      try {
        video.load();
      } catch(e) {}
      return;
    }

    // Если уже загружается или загружено
    if (video.dataset && video.dataset.loaded) {
      try {
        video.load();
      } catch(e) {}
      return;
    }

    if (video.dataset && video.dataset.fetching === 'true') {
      // Ждем завершения загрузки
      return new Promise(resolve => {
        const checkLoaded = () => {
          if (video.dataset.loaded) {
            try {
              video.load();
            } catch(e) {}
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
        try {
          video.load();
        } catch(e) {}
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
      try {
        video.load();
      } catch(e) {}
      if (video.dataset) video.dataset.loaded = 'true';
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
      try {
        video.load();
      } catch(e) {}
      if (video.dataset) {
        video.dataset.loaded = 'true';
        video.dataset.blobUrl = blobUrl;
      }
    } catch (e) {
      // Фолбэк: подключаем источник напрямую
      try {
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = isIOS ? 'metadata' : 'auto';
        try {
          video.load();
        } catch(err) {}
        if (video.dataset) video.dataset.loaded = 'true';
      } catch (_) {}
    } finally {
      try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
    }
  }

  // Загрузить видео для активного элемента
  async function loadVideosForItem(item) {
    if (!item) return;

    const itemId = getItemId(item);
    if (!itemId) return;

    // Проверяем кеш - если запись есть, значит все видео уже загружены
    if (loadCache.has(itemId)) {
      return; // Все уже загружено
    }

    // Находим все видео в .story-track-wrapper
    const storyTrackVideos = getStoryTrackVideos(item);
    
    // Загружаем видео из story-track-wrapper
    if (storyTrackVideos.length > 0) {
      // Для первого видео: load и play
      if (storyTrackVideos[0]) {
        await loadVideoSource(storyTrackVideos[0]);
        try {
          if (storyTrackVideos[0].paused) {
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
      if (talkingHeadVideos.length > 0) {
        // Для всех talking-head видео: load и play
        for (const video of talkingHeadVideos) {
          await loadVideoSource(video);
          try {
            if (video.paused) {
              video.play().catch(() => {});
            }
          } catch(_) {}
        }
      }
    }

    // Сохраняем в кеш - отмечаем, что для этого элемента видео загружены
    loadCache.set(itemId, true);
  }

  // Инициализация при загрузке страницы
  function initVideoLazy() {
    // Находим активный элемент
    const activeItem = document.querySelector('.cases-grid__item.active');
    
    if (activeItem) {
      loadVideosForItem(activeItem);
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
          loadVideosForItem(item);
        }
      });
    });

    // Наблюдаем за всеми элементами
    items.forEach(item => {
      observer.observe(item, { 
        attributes: true, 
        attributeFilter: ['class'], 
        attributeOldValue: true 
      });
    });
  }

  if (document.readyState === 'complete') {
    initVideoLazy();
  } else {
    window.addEventListener('load', initVideoLazy, { once: true });
  }
});
