/*
  Мобильная лениво-управляемая загрузка видео в элементах `cases-grid__item`.

  Правила загрузки:
  1) Для активного `cases-grid__item.active` сначала загружаем все постеры всех <video> во всех `story-track-wrapper__slide`.
  2) Затем, начиная с первого слайда, последовательно полностью загружаем видео и запускаем его.
  3) После завершения всех слайдов активного элемента — загружаем следующий `cases-grid__item` (если есть) по тем же правилам.
  4) После следующего — загружаем предыдущий относительно активного (если есть).

  Поддерживаемые атрибуты источников:
  - видео: data-src (источник mp4/webm)
  - постер: data-poster или poster-src (оба поддерживаются)
*/

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
    return new Promise((resolve, reject) => {
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
   * Полностью загружает видео, устанавливая src из data-src при необходимости.
   * Ждет готовности к воспроизведению и запускает play() если включен autoplay.
   * @param {HTMLVideoElement} video
   * @returns {Promise<void>}
   */
  async function loadAndMaybePlayVideo(video) {
    const alreadyLoaded = video.getAttribute('data-loaded') === 'true' || video.readyState >= 3;
    const dataSrc = video.getAttribute('data-src');

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
    } catch (_) {
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
   * Для одного `cases-grid__item`: сначала постеры всех видео, затем по слайдам видео по порядку.
   * @param {Element} gridItem
   */
  async function processGridItem(gridItem) {
    if (!gridItem) return;

    const slides = queryAll(gridItem, '.story-track-wrapper .story-track-wrapper__slide');
    if (!slides.length) return;

    const isActive = gridItem.classList.contains('active');

    // 1) Постеры всех видео во всех слайдах
    const allVideos = slides
      .map(slide => queryAll(slide, 'video'))
      .flat();
    await Promise.all(allVideos.map(ensurePosterLoaded));

    // 2) Поочередная полная загрузка видео по слайдам
    for (let slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
      const slide = slides[slideIndex];
      const videosInSlide = queryAll(slide, 'video');
      // Загружаем все видео в текущем слайде, но запускаем только те, что с autoplay
      // (если несколько — каждая попытается запуститься самостоятельно)
      // Последовательность слайдов сохраняем
      for (let i = 0; i < videosInSlide.length; i += 1) {
        const video = videosInSlide[i];
        await loadAndMaybePlayVideo(video);
      }
    }
  }

  /**
   * Формирует порядок: активный, следующий, предыдущий (если существуют).
   * @param {Element[]} items
   * @returns {Element[]}
   */
  function buildProcessingOrder(items) {
    if (!items.length) return [];
    const activeIndex = items.findIndex(el => el.classList.contains('active'));
    const order = [];
    if (activeIndex >= 0) {
      order.push(items[activeIndex]);
      if (items[activeIndex + 1]) order.push(items[activeIndex + 1]);
      if (items[activeIndex - 1]) order.push(items[activeIndex - 1]);
    } else {
      // если активного нет — просто первый, второй, третий...
      return items.slice();
    }
    // Удаляем потенциальные дубликаты (если один и тот же элемент попал дважды)
    return order.filter((el, idx, arr) => arr.indexOf(el) === idx);
  }

  async function run() {
    const processFromActive = async () => {
      const allItems = queryAll(document, '.cases-grid__item');
      if (!allItems.length) return;
      const order = buildProcessingOrder(allItems);
      for (let index = 0; index < order.length; index += 1) {
        await processGridItem(order[index]);
      }
    };

    // Первичная подгрузка
    await processFromActive();

    // Отслеживание изменения класса active
    const debouncedProcess = debounce(processFromActive, 100);
    const observer = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i += 1) {
        const m = mutations[i];
        if (m.type === 'attributes' && m.attributeName === 'class') {
          const el = m.target;
          if (el && el.matches && el.matches('.cases-grid__item')) {
            debouncedProcess();
            break;
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
