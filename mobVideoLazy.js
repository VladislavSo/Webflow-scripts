(function initMobileVideoLazyLoader() {
  if (typeof document === 'undefined') return;
  if (!window.matchMedia || !window.matchMedia('(max-width: 479px)').matches) return;
  
  // Простая детекция iOS Safari
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  const isIOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);

  // Автозапуска нет — только подгрузка. Оставляем детекцию iOS для выбора preload.

  /**
   * Возвращает массив элементов по селектору, безопасно.
   * @param {Element|Document} root
   * @param {string} selector
   * @returns {Element[]}
   */
  function queryAll(root, selector) {
    return Array.prototype.slice.call(root.querySelectorAll(selector));
  }

  /**
   * Дебаунс для событий (например, при быстрой смене active)
   * @param {Function} fn
   * @param {number} delay
   */
  function debounce(fn, delay) {
    let t = null;
    return function debounced() {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, arguments), delay);
    };
  }

  /**
   * Ждет одноразовое событие.
   * @param {EventTarget} target
   * @param {string} event
   * @param {number} timeoutMs
   * @returns {Promise<void>}
   */
  function waitForEvent(target, event, timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false;
      const onResolve = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve();
      };
      const onReject = () => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('timeout'));
      };
      const cleanup = () => {
        target.removeEventListener(event, onResolve);
        if (timer) clearTimeout(timer);
      };
      target.addEventListener(event, onResolve, { once: true });
      const timer = timeoutMs ? setTimeout(onReject, timeoutMs) : null;
    });
  }

  /**
   * Загружает изображение и резолвит, когда оно готово.
   * @param {string} src
   * @returns {Promise<void>}
   */
  function preloadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve();
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // не блокируем цепочку из-за постера
      img.src = src;
    });
  }

  /**
   * Устанавливает постер для <video> из data-poster/poster-src.
   * Сохраняет постер в CSS-фоне до готовности видео.
   * @param {HTMLVideoElement} video
   * @returns {Promise<void>}
   */
  async function ensurePosterLoaded(video) {
    const posterFromData = video.getAttribute('data-poster');
    const posterFromAlt = video.getAttribute('poster-src');
    const posterUrl = posterFromData || posterFromAlt || video.getAttribute('poster');
    if (!posterUrl) return;
    await preloadImage(posterUrl);
    try {
      if (!video.getAttribute('poster')) {
        video.setAttribute('poster', posterUrl);
      }
      // Сохраняем постер в CSS-фоне для плавного перехода
      video.style.backgroundImage = `url(${posterUrl})`;
      video.style.backgroundSize = 'cover';
      video.style.backgroundPosition = 'center';
      video.style.backgroundRepeat = 'no-repeat';
    } catch (_) {
      // ignore
    }
  }

  /**
   * Полностью загружает видео, устанавливая src из data-src или mob-data-src при необходимости.
   * Ждет готовности к воспроизведению и запускает play() если включен autoplay.
   * @param {HTMLVideoElement} video
   * @returns {Promise<void>}
   */
  async function loadAndMaybePlayVideo(video) {
    const alreadyLoaded = video.getAttribute('data-loaded') === 'true' || video.readyState >= 3;
    const dataSrc = video.getAttribute('data-src') || video.getAttribute('mob-data-src');

    if (!alreadyLoaded && dataSrc) {
      // Удаляем crossorigin, чтобы не требовать CORS от сервера для <video>
      try { video.removeAttribute('crossorigin'); } catch (_) { /* ignore */ }
      try { video.crossOrigin = null; } catch (_) { /* ignore */ }

      // На iOS надёжнее preload="metadata"
      video.preload = isIOS ? 'metadata' : 'auto';
      // Используем <source> вместо прямого назначения video.src
      try { video.removeAttribute('src'); } catch (_) { /* ignore */ }

      // Проверяем, есть ли уже source с таким src
      const existingSources = Array.prototype.slice.call(video.querySelectorAll('source'));
      const hasSameSource = existingSources.some(s => s.getAttribute('src') === dataSrc);

      if (!hasSameSource) {
        // Удалим предыдущие временные источники, если помечены
        const lazySources = existingSources.filter(s => s.getAttribute('data-lazy') === 'true');
        lazySources.forEach(s => { try { s.remove(); } catch (_) { /* ignore */ } });

        const srcEl = document.createElement('source');
        srcEl.setAttribute('src', dataSrc);
        srcEl.setAttribute('data-lazy', 'true');
        const type = inferMimeFromUrl(dataSrc);
        if (type) srcEl.setAttribute('type', type);
        try { video.appendChild(srcEl); } catch (_) { /* ignore */ }
      }
      try { video.load(); } catch (_) { /* ignore */ }
    }

    // Ждем минимальной готовности для старта (iOS часто не диспатчит canplaythrough)
    try {
      if (video.readyState < 2) { // HAVE_CURRENT_DATA
        await Promise.race([
          waitForEvent(video, 'loadedmetadata', 6000),
          waitForEvent(video, 'canplay', 6000),
          waitForEvent(video, 'loadeddata', 6000)
        ]);
      }
    } catch (e) {
      // Продолжаем даже при таймауте, чтобы не блокировать очередь
    }

    video.setAttribute('data-loaded', 'true');

    // Автовоспроизведение: по требованию или при наличии атрибута
    // Автозапуск отключен по требованиям — только подгрузка источника
  }

  /**
   * Примитивное определение MIME-типа по расширению URL.
   * @param {string} url
   * @returns {string|undefined}
   */
  function inferMimeFromUrl(url) {
    try {
      const lower = url.split('?')[0].toLowerCase();
      if (lower.endsWith('.mp4')) return 'video/mp4';
      if (lower.endsWith('.webm')) return 'video/webm';
      if (lower.endsWith('.ogg') || lower.endsWith('.ogv')) return 'video/ogg';
    } catch (_) { /* ignore */ }
    return undefined;
  }

  

  /**
   * Новый порядок загрузки по ТЗ:
   * 1) talking-head в активном cases-grid__item
   * 2) видео первого слайда активного
   * 3) talking-head в следующем (active + 1)
   * 4) видео первого слайда следующего
   * 5) видео второго слайда активного (если есть)
   */
  async function processAccordingToSpec() {
    const items = queryAll(document, '.cases-grid__item');
    if (!items.length) return;
    const activeIndex = items.findIndex(el => el.classList.contains('active'));
    if (activeIndex < 0) return;

    const activeItem = items[activeIndex];
    const nextItem = items[activeIndex + 1];

    // Helpers
    const getSlides = (item) => item ? queryAll(item, '.story-track-wrapper .story-track-wrapper__slide') : [];
    const getTalkingHeadVideos = (item) => item ? queryAll(item, '.cases-grid__item__container__wrap__talking-head__video video') : [];
    const getSlideVideos = (slide) => slide ? queryAll(slide, 'video') : [];

    // Active: talking-head
    const activeTalkingHead = getTalkingHeadVideos(activeItem);
    await Promise.all(activeTalkingHead.map(ensurePosterLoaded));
    for (let i = 0; i < activeTalkingHead.length; i += 1) {
      await loadAndMaybePlayVideo(activeTalkingHead[i]);
    }

    // Active: first slide videos
    const activeSlides = getSlides(activeItem);
    const activeFirstSlideVideos = getSlideVideos(activeSlides[0]);
    await Promise.all(activeFirstSlideVideos.map(ensurePosterLoaded));
    for (let i = 0; i < activeFirstSlideVideos.length; i += 1) {
      await loadAndMaybePlayVideo(activeFirstSlideVideos[i]);
    }

    // Next: talking-head
    if (nextItem) {
      const nextTalkingHead = getTalkingHeadVideos(nextItem);
      await Promise.all(nextTalkingHead.map(ensurePosterLoaded));
      for (let i = 0; i < nextTalkingHead.length; i += 1) {
        await loadAndMaybePlayVideo(nextTalkingHead[i]);
      }
    }

    // Next: first slide videos
    if (nextItem) {
      const nextSlides = getSlides(nextItem);
      const nextFirstSlideVideos = getSlideVideos(nextSlides[0]);
      await Promise.all(nextFirstSlideVideos.map(ensurePosterLoaded));
      for (let i = 0; i < nextFirstSlideVideos.length; i += 1) {
        await loadAndMaybePlayVideo(nextFirstSlideVideos[i]);
      }
    }

    // Active: second slide videos (if exists)
    const activeSecondSlideVideos = getSlideVideos(activeSlides[1]);
    await Promise.all(activeSecondSlideVideos.map(ensurePosterLoaded));
    for (let i = 0; i < activeSecondSlideVideos.length; i += 1) {
      await loadAndMaybePlayVideo(activeSecondSlideVideos[i]);
    }
  }

  

  async function run() {
    const processFromActive = async () => {
      await processAccordingToSpec();
    };

    // Первичная подгрузка
    await processFromActive();

    // Отслеживание изменения класса active
    const debouncedProcess = debounce(processFromActive, 100);
    const debouncedLoadNextSlide = debounce(async (slideEl) => {
      try {
        const gridItem = slideEl.closest ? slideEl.closest('.cases-grid__item') : null;
        if (!gridItem || !gridItem.classList.contains('active')) return;
        const slides = queryAll(gridItem, '.story-track-wrapper .story-track-wrapper__slide');
        const currentIndex = slides.indexOf(slideEl);
        const nextSlide = slides[currentIndex + 1];
        if (!nextSlide) return;
        const videos = queryAll(nextSlide, 'video');
        await Promise.all(videos.map(ensurePosterLoaded));
        for (let i = 0; i < videos.length; i += 1) {
          await loadAndMaybePlayVideo(videos[i]);
        }
      } catch (_) { /* ignore */ }
    }, 100);
    const observer = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i += 1) {
        const m = mutations[i];
        if (m.type === 'attributes' && m.attributeName === 'class') {
          const el = m.target;
          if (el && el.matches && el.matches('.cases-grid__item')) {
            debouncedProcess();
            break;
          }
          // Реакция на смену активного слайда: догружаем следующий слайд активного grid item
          if (el && el.matches && el.matches('.story-track-wrapper__slide')) {
            if (el.classList && el.classList.contains('active')) {
              debouncedLoadNextSlide(el);
            }
          }
        }
      }
    });
    try {
      observer.observe(document.documentElement || document.body, {
        attributes: true,
        attributeFilter: ['class'],
        subtree: true
      });
    } catch (_) { /* ignore */ }
  }

  // Стартуем, когда DOM готов. Если уже готов — запускаем сразу.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
