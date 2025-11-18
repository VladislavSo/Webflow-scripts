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

    // Загрузить источник видео (если нужно) и вызвать load(), ждем готовности
    async function loadVideoSource(video) {
      if (!video) return;
      
      console.log('[newMobVideoLazy] loadVideoSource called');
      
      // Проверяем, загружено ли видео уже
      if (video.dataset && video.dataset.loaded === 'true') {
        // Видео уже загружено - не пересоздаем его
        console.log('[newMobVideoLazy] Video already loaded, skipping');
        return;
      }
      
      // Проверяем, есть ли уже источник
      if (video.src || (video.querySelector && video.querySelector('source'))) {
        console.log('[newMobVideoLazy] Source already exists, waiting for readyState');
        // Если источник есть, но видео еще не готово - ждем готовности без вызова load()
        // (load() сбросит состояние видео, если оно уже играет)
        try {
          // Ждем готовности видео без вызова load()
          await new Promise(resolve => {
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA
              console.log('[newMobVideoLazy] Video readyState >= 2, already ready');
              resolve();
            } else {
              console.log('[newMobVideoLazy] Waiting for canplay event, current readyState:', video.readyState);
              var resolved = false;
              var timeoutId = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  console.log('[newMobVideoLazy] Timeout waiting for canplay');
                  resolve();
                }
              }, 10000); // Таймаут 10 секунд
              const onCanPlay = () => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeoutId);
                  console.log('[newMobVideoLazy] canplay event received');
                  resolve();
                }
              };
              video.addEventListener('canplay', onCanPlay, { once: true });
              video.addEventListener('error', onCanPlay, { once: true });
            }
          });
          if (video.dataset) video.dataset.loaded = 'true';
          console.log('[newMobVideoLazy] Video loaded, dataset.loaded set to true');
        } catch(e) {
          console.error('[newMobVideoLazy] Error waiting for video ready:', e);
        }
        return;
      }

      // Получаем URL из атрибутов
      const mobAttr = typeof video.getAttribute === 'function' ? video.getAttribute('mob-data-src') : null;
      const dataAttr = video.dataset ? video.dataset.src : null;
      const dataSrcAttr = mobAttr || dataAttr;
      
      console.log('[newMobVideoLazy] URL from attributes:', dataSrcAttr);
      
      if (!dataSrcAttr) {
        // Нет источника и нет атрибутов - ничего не делаем
        // Не вызываем load() чтобы не пересоздать видео
        console.log('[newMobVideoLazy] No source URL found, skipping');
        return;
      }

      // Если уже загружено - не пересоздаем
      if (video.dataset && video.dataset.loaded === 'true') {
        return;
      }

      if (video.dataset && video.dataset.fetching === 'true') {
        console.log('[newMobVideoLazy] Video is already fetching, waiting...');
        // Ждем завершения загрузки
        return new Promise(resolve => {
          const checkLoaded = () => {
            if (video.dataset.loaded === 'true') {
              // Видео уже загружено - не вызываем load(), чтобы не пересоздать его
              console.log('[newMobVideoLazy] Video finished loading while waiting');
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
      console.log('[newMobVideoLazy] Starting video load, URL:', url);

      // Если источник кросс-доменный — подключаем напрямую
      try {
        const urlObj = new URL(url, window.location.href);
        const sameOrigin = urlObj.origin === window.location.origin;
        if (!sameOrigin) {
          console.log('[newMobVideoLazy] Cross-origin video, creating source directly');
          const source = document.createElement('source');
          source.src = url;
          source.type = 'video/mp4';
          video.appendChild(source);
          // Используем 'metadata' вместо 'auto' чтобы избежать автозапуска
          video.preload = 'metadata';
          try {
            video.load();
            console.log('[newMobVideoLazy] video.load() called (cross-origin)');
          } catch(e) {
            console.error('[newMobVideoLazy] Error calling video.load() (cross-origin):', e);
          }
          // Ждем готовности
          await new Promise(resolve => {
            if (video.readyState >= 2) {
              console.log('[newMobVideoLazy] Video readyState >= 2 (cross-origin)');
              resolve();
            } else {
              console.log('[newMobVideoLazy] Waiting for canplay (cross-origin), readyState:', video.readyState);
              var resolved = false;
              var timeoutId = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  console.log('[newMobVideoLazy] Timeout waiting for canplay (cross-origin)');
                  resolve();
                }
              }, 10000); // Таймаут 10 секунд
              const onCanPlay = () => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeoutId);
                  console.log('[newMobVideoLazy] canplay event received (cross-origin)');
                  resolve();
                }
              };
              video.addEventListener('canplay', onCanPlay, { once: true });
              video.addEventListener('error', onCanPlay, { once: true });
            }
          });
          if (video.dataset) video.dataset.loaded = 'true';
          console.log('[newMobVideoLazy] Video loaded (cross-origin), dataset.loaded = true');
          try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
          return;
        }
      } catch (_) {
        console.log('[newMobVideoLazy] URL parsing error, creating source directly');
        // В случае ошибок парсинга URL — подключаем напрямую
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = isIOS ? 'metadata' : 'auto';
        try {
          video.load();
          console.log('[newMobVideoLazy] video.load() called (URL parse error fallback)');
        } catch(e) {
          console.error('[newMobVideoLazy] Error calling video.load() (URL parse error fallback):', e);
        }
        // Ждем готовности
        await new Promise(resolve => {
          if (video.readyState >= 2) {
            console.log('[newMobVideoLazy] Video readyState >= 2 (URL parse error fallback)');
            resolve();
          } else {
            console.log('[newMobVideoLazy] Waiting for canplay (URL parse error fallback)');
            const onCanPlay = () => { 
              console.log('[newMobVideoLazy] canplay event received (URL parse error fallback)');
              resolve(); 
            };
            video.addEventListener('canplay', onCanPlay, { once: true });
            video.addEventListener('error', onCanPlay, { once: true });
          }
        });
        if (video.dataset) video.dataset.loaded = 'true';
        console.log('[newMobVideoLazy] Video loaded (URL parse error fallback), dataset.loaded = true');
        try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
        return;
      }

      // Пытаемся загрузить через fetch
      try {
        console.log('[newMobVideoLazy] Fetching video via fetch API');
        const response = await fetch(url, { credentials: 'omit', cache: 'default' });
        if (!response.ok) throw new Error('Failed to fetch video');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        console.log('[newMobVideoLazy] Video fetched, creating blob URL');
        const source = document.createElement('source');
        source.src = blobUrl;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = isIOS ? 'metadata' : 'auto';
        try {
          video.load();
          console.log('[newMobVideoLazy] video.load() called (fetch)');
        } catch(e) {
          console.error('[newMobVideoLazy] Error calling video.load() (fetch):', e);
        }
        // Ждем готовности
        await new Promise(resolve => {
          if (video.readyState >= 2) {
            console.log('[newMobVideoLazy] Video readyState >= 2 (fetch)');
            resolve();
          } else {
            console.log('[newMobVideoLazy] Waiting for canplay (fetch)');
            const onCanPlay = () => { 
              console.log('[newMobVideoLazy] canplay event received (fetch)');
              resolve(); 
            };
            video.addEventListener('canplay', onCanPlay, { once: true });
            video.addEventListener('error', onCanPlay, { once: true });
          }
        });
        if (video.dataset) {
          video.dataset.loaded = 'true';
          video.dataset.blobUrl = blobUrl;
        }
        console.log('[newMobVideoLazy] Video loaded (fetch), dataset.loaded = true');
      } catch (e) {
        console.error('[newMobVideoLazy] Fetch failed, using fallback:', e);
        // Фолбэк: подключаем источник напрямую
        try {
          console.log('[newMobVideoLazy] Using fallback: creating source directly');
          const source = document.createElement('source');
          source.src = url;
          source.type = 'video/mp4';
          video.appendChild(source);
          // Используем 'metadata' вместо 'auto' чтобы избежать автозапуска
          video.preload = 'metadata';
          try {
            video.load();
            console.log('[newMobVideoLazy] video.load() called (fallback)');
          } catch(err) {
            console.error('[newMobVideoLazy] Error calling video.load() (fallback):', err);
          }
          // Ждем готовности
          await new Promise(resolve => {
            if (video.readyState >= 2) {
              console.log('[newMobVideoLazy] Video readyState >= 2 (fallback)');
              resolve();
            } else {
              console.log('[newMobVideoLazy] Waiting for canplay (fallback), readyState:', video.readyState);
              var resolved = false;
              var timeoutId = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  console.log('[newMobVideoLazy] Timeout waiting for canplay (fallback)');
                  resolve();
                }
              }, 10000); // Таймаут 10 секунд
              const onCanPlay = () => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeoutId);
                  console.log('[newMobVideoLazy] canplay event received (fallback)');
                  resolve();
                }
              };
              video.addEventListener('canplay', onCanPlay, { once: true });
              video.addEventListener('error', onCanPlay, { once: true });
            }
          });
          if (video.dataset) video.dataset.loaded = 'true';
          console.log('[newMobVideoLazy] Video loaded (fallback), dataset.loaded = true');
        } catch (_) {
          console.error('[newMobVideoLazy] Error in fallback:', _);
        }
      } finally {
        try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
        console.log('[newMobVideoLazy] loadVideoSource completed');
      }
    }

    // Загрузить видео для активного элемента
    async function loadVideosForItem(item) {
      if (!item) return;

      const itemId = getItemId(item);
      if (!itemId) {
        console.log('[newMobVideoLazy] loadVideosForItem: no itemId');
        return;
      }

      console.log('[newMobVideoLazy] loadVideosForItem called for itemId:', itemId);

      // Проверяем кеш - если запись есть, значит все видео уже загружены
      if (loadCache.has(itemId)) {
        console.log('[newMobVideoLazy] Item already in cache, skipping:', itemId);
        return; // Все уже загружено
      }

      // Находим все видео в .story-track-wrapper
      const storyTrackVideos = getStoryTrackVideos(item);
      console.log('[newMobVideoLazy] Found story-track videos:', storyTrackVideos.length);
      
      // Загружаем видео из story-track-wrapper
      if (storyTrackVideos.length > 0) {
        // Для первого видео: load и play
        if (storyTrackVideos[0]) {
          console.log('[newMobVideoLazy] Loading first story-track video');
          await loadVideoSource(storyTrackVideos[0]);
          try {
            if (storyTrackVideos[0].paused) {
              console.log('[newMobVideoLazy] Playing first story-track video');
              storyTrackVideos[0].play().catch(() => {});
            }
          } catch(_) {}
        }
        
        // Для остальных: только load
        for (let i = 1; i < storyTrackVideos.length; i++) {
          console.log('[newMobVideoLazy] Loading story-track video', i + 1);
          await loadVideoSource(storyTrackVideos[i]);
        }
      }

      // Проверяем наличие talking-head
      const talkingHead = item.querySelector('.cases-grid__item__container__wrap__talking-head');
      if (talkingHead) {
        const talkingHeadVideos = getTalkingHeadVideos(item);
        console.log('[newMobVideoLazy] Found talking-head videos:', talkingHeadVideos.length);
        if (talkingHeadVideos.length > 0) {
          // Для всех talking-head видео: только load (запуск управляется через snapSlider.js)
          for (const video of talkingHeadVideos) {
            console.log('[newMobVideoLazy] Loading talking-head video');
            await loadVideoSource(video);
          }
        }
      } else {
        console.log('[newMobVideoLazy] No talking-head found');
      }

      // Сохраняем в кеш - отмечаем, что для этого элемента видео загружены
      loadCache.set(itemId, true);
      console.log('[newMobVideoLazy] Item added to cache:', itemId);
    }

    // Инициализация при загрузке страницы
    function initVideoLazy() {
      console.log('[newMobVideoLazy] initVideoLazy called');
      // Находим активный элемент
      const activeItem = document.querySelector('.cases-grid__item.active');
      
      if (activeItem) {
        console.log('[newMobVideoLazy] Active item found, loading videos');
        loadVideosForItem(activeItem);
      } else {
        console.log('[newMobVideoLazy] No active item found');
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
            console.log('[newMobVideoLazy] Item became active, loading videos:', getItemId(item));
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
