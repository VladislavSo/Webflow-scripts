(function(){
  if (!window.matchMedia || !window.matchMedia('(max-width: 479px)').matches) return;
  // Утилиты
  var PROGRESS_ADVANCE_THRESHOLD = 0.98;
  function qs(root, sel){ return (root||document).querySelector ? (root||document).querySelector(sel) : null; }
  function qsa(root, sel){ return (root||document).querySelectorAll ? (root||document).querySelectorAll(sel) : []; }
  function each(list, cb){ if(!list) return; (list.forEach ? list.forEach(cb) : Array.prototype.forEach.call(list, cb)); }

  // Построение прогресса внутри .story-track-wrapper
  function buildProgress(containerEl, slidesCount){
    if (!containerEl || !slidesCount || slidesCount <= 0) return null;
    var existing = qs(containerEl, '.story-progress');
    if (existing) return { root: existing, segments: qsa(containerEl, '.story-progress__segment'), fills: qsa(containerEl, '.story-progress__fill') };

    var bar = document.createElement('div');
    bar.className = 'story-progress';
    for (var i=0; i<slidesCount; i++){
      var seg = document.createElement('div');
      seg.className = 'story-progress__segment';
      var fill = document.createElement('div');
      fill.className = 'story-progress__fill';
      seg.appendChild(fill);
      bar.appendChild(seg);
    }
    containerEl.appendChild(bar);
    return { root: bar, segments: qsa(containerEl, '.story-progress__segment'), fills: qsa(containerEl, '.story-progress__fill') };
  }

  if (typeof window !== 'undefined') {
    window.buildSnapSliderProgress = buildProgress;
    // Экспортируем функцию для включения звука для ленты (для переключателя звука)
    window.setSnapSliderSoundPreferred = function(enabled){
      soundPreferred = !!enabled;
      // Если включили звук, пробуем включить его у активных видео
      if (soundPreferred && isTelegramAndroid){
        var activeCase = qs(document, '.cases-grid__item.active, .case.active');
        if (activeCase){
          var activeSlides = qsa(activeCase, '.story-track-wrapper__slide.active');
          each(activeSlides, function(slide){
            var videos = qsa(slide, 'video');
            each(videos, function(v){
              tryUnmuteInGestureWindow(v);
            });
          });
          var talkingHead = getTalkingHeadVideo(activeCase);
          if (talkingHead) tryUnmuteInGestureWindow(talkingHead);
        }
      }
    };
  }

  // Детект Telegram WebView на Android
  var ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  var isTelegram = /Telegram/i.test(ua);
  var isAndroid = /Android/i.test(ua);
  var isTelegramAndroid = isTelegram && isAndroid;

  // Состояние для разблокировки медиа и отслеживания user activation
  var mediaUnlocked = false;
  var lastGestureAt = 0;
  var soundPreferred = false; // можно будет сделать переключатель звука для ленты

  // Разблокировка медиа на первый тап (критично для Telegram WebView)
  function unlockMediaOnce(){
    if (mediaUnlocked) return;
    mediaUnlocked = true;

    try {
      // 1) Скрытое немое видео для "пробуждения" медиасистемы
      // Используем минимальный подход: создаем video элемент и пробуем play без src
      // Это "пробуждает" медиасистему Telegram без необходимости загружать данные
      var v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.style.position = 'fixed';
      v.style.width = v.style.height = '1px';
      v.style.opacity = '0';
      v.style.pointerEvents = 'none';
      if (document.body) document.body.appendChild(v);
      // Пробуем play() даже без src - это должно "пробудить" медиасистему
      v.play().catch(function(){
        // Если не получилось без src, пробуем с крошечным blob
        try {
          var blob = new Blob([''], { type: 'video/mp4' });
          v.src = URL.createObjectURL(blob);
          v.play().catch(function(){});
        } catch(__){}
      });
      // Удаляем через 1 секунду
      setTimeout(function(){
        try {
          if (v.src && v.src.startsWith('blob:')) URL.revokeObjectURL(v.src);
          if (v.parentNode) v.parentNode.removeChild(v);
        } catch(_){}
      }, 1000);
    } catch(_){}

    try {
      // 2) Аудиоконтекст для "пробуждения" в Telegram
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx){
        var ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume().catch(function(){});
        // Держим ссылку, чтобы GC не убил
        window.__tgAudioCtx = ctx;
      }
    } catch(_){}
  }

  // Инициализация разблокировки на первый жест (только для Telegram Android)
  if (isTelegramAndroid && typeof document !== 'undefined'){
    ['touchstart','pointerdown','click'].forEach(function(evt){
      document.addEventListener(evt, unlockMediaOnce, { once: true, passive: true });
    });
  }

  // Отслеживание жестов для окна user activation
  if (isTelegramAndroid && typeof document !== 'undefined'){
    ['touchstart','pointerdown'].forEach(function(evt){
      document.addEventListener(evt, function(){
        lastGestureAt = Date.now();
      }, { passive: true });
    });
  }

  // Ожидание готовности видео (canplay/loadeddata)
  function waitCanPlay(video, timeout){
    if (!video) return Promise.resolve();
    timeout = timeout || 800;
    if (video.readyState >= 3) return Promise.resolve(); // HAVE_FUTURE_DATA
    return new Promise(function(resolve){
      var done = false;
      var cleanup = function(){
        if (done) return;
        done = true;
        try {
          video.removeEventListener('canplay', onReady);
          video.removeEventListener('loadeddata', onReady);
        } catch(_){}
        if (timer) clearTimeout(timer);
      };
      var onReady = function(){
        cleanup();
        resolve();
      };
      try {
        video.addEventListener('canplay', onReady, { once: true });
        video.addEventListener('loadeddata', onReady, { once: true });
      } catch(_){
        // Если не удалось подписаться, просто resolve сразу
        resolve();
      }
      var timer = setTimeout(onReady, timeout);
    });
  }

  // Безопасный play для Telegram WebView: всегда начинаем с muted
  async function safePlay(video){
    if (!video || typeof video.play !== 'function') return;
    try {
      // Критично: всегда muted при автоплее
      video.muted = true;
      if (!video.hasAttribute('playsinline')) video.setAttribute('playsinline', '');
      var p = video.play();
      if (p && typeof p.then === 'function') await p;
    } catch (e) {
      // В Telegram ошибки часто "тихие", логируем для отладки
      if (isTelegramAndroid) {
        console.warn('[TG webview] play blocked:', e?.name || 'unknown', e?.message || '');
      }
    }
  }

  // Активация видео с ожиданием готовности и ретраями
  var currentPlayingVideos = new Set(); // Отслеживание активных видео
  async function activateVideo(video){
    if (!video || typeof video.play !== 'function') return;
    
    // На мгновение даём верстке устаканиться (TG любит rAF)
    await new Promise(function(r){
      requestAnimationFrame(function(){
        requestAnimationFrame(r);
      });
    });

    // Ждём готовности видео
    await waitCanPlay(video, 800);
    
    // Пытаемся запустить
    await safePlay(video);

    // Если всё ещё не играет, делаем пару мягких ретраев
    if (video.paused || video.readyState < 3){
      await new Promise(function(r){ setTimeout(r, 150); });
      await waitCanPlay(video, 600);
      await safePlay(video);
      
      // Финальный ретрай если всё ещё не играет
      if (video.paused){
        await new Promise(function(r){ setTimeout(r, 100); });
        try {
          if (video.readyState >= 3 || video.readyState >= 2){
            await safePlay(video);
          }
        } catch(_){}
      }
    }

    if (!video.paused) {
      currentPlayingVideos.add(video);
    }
  }

  // Попытка включить звук в окне user activation (для Telegram)
  async function tryUnmuteInGestureWindow(video){
    if (!isTelegramAndroid || !soundPreferred || !video) return;
    
    var withinGesture = (Date.now() - lastGestureAt) < 600; // окно 600мс
    if (!withinGesture) return;
    
    try {
      video.muted = false;
      video.volume = 1.0;
      var p = video.play();
      if (p && typeof p.then === 'function') await p;
    } catch (e) {
      // Telegram WebView обычно даст NotAllowedError — тихо откатываемся в mute
      video.muted = true;
    }
  }

  // Здесь только базовое управление воспроизведением: play/pause и сброс времени.
  function playVideos(slideEl){
    if (!slideEl) return;
    var videos = qsa(slideEl, '.slide-inner__video-block video, video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      if (!video || typeof video.play !== 'function') return;
      
      if (isTelegramAndroid){
        // Для Telegram используем activateVideo (с ожиданием готовности и ретраями)
        activateVideo(video).then(function(){
          // После успешного mute-автоплея пробуем включить звук в окне жеста
          tryUnmuteInGestureWindow(video);
        }).catch(function(){});
      } else {
        // Для обычных браузеров используем activateVideo тоже (но без дополнительных проверок для TG)
        activateVideo(video).catch(function(){});
      }
    });
  }

  function pauseAndResetVideos(slideEl){
    if (!slideEl) return;
    var videos = qsa(slideEl, '.slide-inner__video-block video, video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      try { if (video && typeof video.pause === 'function') video.pause(); } catch(_){ }
      try { if (typeof video.currentTime === 'number') video.currentTime = 0; } catch(_){ }
    });
  }

  function pauseAndResetVideosInElement(rootEl){
    if (!rootEl) return;
    var videos = qsa(rootEl, 'video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      try { if (video && typeof video.pause === 'function') video.pause(); } catch(_){ }
      // talking-head: не сбрасываем время, только пауза
      var isTalking = false;
      try { isTalking = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head__video')); } catch(__){}
      if (!isTalking){
        try { if (typeof video.currentTime === 'number') video.currentTime = 0; } catch(_){ }
      }
    });
  }

  // Пауза всех видео без сброса времени (используем при выходе .cases-grid из зоны)
  function pauseAllVideosInElement(rootEl){
    if (!rootEl) return;
    var videos = qsa(rootEl, 'video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      try { if (video && typeof video.pause === 'function') video.pause(); } catch(_){ }
    });
  }

  // Сброс/загрузка видео не в зоне ответственности этого скрипта

  // Помощники прогресса
  function updateSegmentDurationByIndexInWrapper(wrapperEl, index, durationSec){
    if (!wrapperEl || !isFinite(durationSec) || durationSec <= 0) return;
    var segs = qsa(wrapperEl, '.story-progress__segment');
    if (!segs || !segs.length || index < 0 || index >= segs.length) return;
    var seg = segs[index];
    try {
      seg.style.animationDuration = durationSec + 's';
      seg.style.setProperty('--progress-duration', durationSec + 's');
    } catch(_){ }
  }

  function syncProgressDurations(wrapperEl){
    if (!wrapperEl) return;
    var slides = qsa(wrapperEl, '.story-track-wrapper__slide');
    if (!slides || !slides.length) return;
    each(slides, function(slide, idx){
      var video = qs(slide, '.slide-inner__video-block video') || qs(slide, 'video');
      if (!video) return;
      var apply = function(){ updateSegmentDurationByIndexInWrapper(wrapperEl, idx, video.duration); };
      if (isFinite(video.duration) && video.duration > 0){
        apply();
      } else {
        try { video.addEventListener('loadedmetadata', apply, { once: true }); } catch(_){ }
      }
    });
  }

  // Гейты по положению элементов относительно вьюпорта (с зазором 2px)
  function isEligibleBySelector(selector){
    var el = qs(document, selector);
    if (!el) return false;
    var r = el.getBoundingClientRect();
    var vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : ((document.documentElement && document.documentElement.clientHeight) ? document.documentElement.clientHeight : 0);
    var m = 2; // зазор 2px
    return (r.top <= 0 + m) && (r.bottom >= vh - m);
  }

  function isCasesGridEligible(){
    return isEligibleBySelector('.cases-grid');
  }

  function isMainContainerEligible(){
    return isEligibleBySelector('.main-container');
  }

  function setCasesGridInProgress(_ignored){
    var grid = qs(document, '.cases-grid');
    var container = qs(document, '.main-container');
    var contEligible = isMainContainerEligible();
    var gridEligible = isCasesGridEligible();
    // Ставим классы независимо: контейнеру — in-progress, гриду — state-view
    try { if (container){ if (contEligible) container.classList.add('in-progress'); else container.classList.remove('in-progress'); } } catch(_){ }
    try { if (grid){ if (gridEligible) grid.classList.add('state-view'); else grid.classList.remove('state-view'); } } catch(_){ }
  }
  
  // Установить .active для слайда внутри wrapper по близости к центру wrapper
  function setActiveSlideInWrapperByCenter(wrapperEl){
    if (!wrapperEl) return null;
    var slides = qsa(wrapperEl, '.story-track-wrapper__slide');
    if (!slides || !slides.length) return null;
    var rootRect = wrapperEl.getBoundingClientRect();
    var centerX = rootRect.left + (rootRect.width || 0) / 2;
    var best = null; var bestDist = Infinity;
    for (var i=0; i<slides.length; i++){
      var r = slides[i].getBoundingClientRect();
      var ix = r.left + (r.width || 0) / 2;
      var d = Math.abs(ix - centerX);
      if (d < bestDist){ bestDist = d; best = slides[i]; }
    }
    if (best){
      (slides.forEach ? slides.forEach : Array.prototype.forEach).call(slides, function(s){
        if (s === best) { try { s.classList.add('active'); } catch(_){ } }
        else { try { s.classList.remove('active'); } catch(_){ } }
      });
    }
    return best;
  }

  // Извлекаем ключ бренда из id кейса (убираем суффикс -case)
  function extractBrandKeyFromCase(el){
    try {
      var id = el && (el.id || (el.getAttribute ? el.getAttribute('id') : null));
      if (!id) return null;
      return id.replace(/-case$/i, '');
    } catch(_){ return null; }
  }

  // Устанавливаем .current в списке мини‑вью по brand-data="<brand>-mini-view"
  function setStackMiniViewCurrent(brandKey){
    if (!brandKey) return;
    var list = qs(document, '.main-container__stack-wrap__wrapper__list');
    if (!list) return;
    try {
      var target = qs(list, '[brand-data="' + brandKey + '-mini-view"]');
      if (!target) return;
      var currents = qsa(list, '.current');
      each(currents, function(el){ try { el.classList.remove('current'); } catch(_){ } });
      try { target.classList.add('current'); } catch(_){ }
      try { updateStackOpacityByCurrent(); } catch(_){ }
    } catch(_){ }
  }

  function getStackList(){ return qs(document, '.main-container__stack-wrap__wrapper__list'); }
  function getStackItems(){ var l = getStackList(); return l ? qsa(l, '.main-container__stack-wrap__wrapper__list__item') : []; }
  function getStackContainer(){ return qs(document, '.main-container__stack-wrap'); }

  // Talking-head helpers
  function getTalkingHeadVideo(root){ return qs(root, '.cases-grid__item__container__wrap__talking-head__video video'); }
  function playTalkingHead(root){
    var v = getTalkingHeadVideo(root);
    if (!v) return;
    if (isTelegramAndroid){
      activateVideo(v).then(function(){
        tryUnmuteInGestureWindow(v);
      }).catch(function(){});
    } else {
      activateVideo(v).catch(function(){});
    }
  }
  function pauseTalkingHead(root){ var v = getTalkingHeadVideo(root); if (v){ try { v.pause(); } catch(_){ } } }

  // Гарантированный старт talking-head после загрузки метаданных, если кейс активен
  function ensureTalkingHeadAutoPlay(caseEl){
    try {
      var v = getTalkingHeadVideo(caseEl);
      if (!v) return;
      var onMeta = function(){
        try {
          if (caseEl.classList && caseEl.classList.contains('active')){
            if (isTelegramAndroid){
              // Для Telegram используем activateVideo
              activateVideo(v).then(function(){
                tryUnmuteInGestureWindow(v);
              }).catch(function(){});
            } else {
              playTalkingHead(caseEl);
            }
          }
        } catch(_){ }
      };
      try { v.addEventListener('loadedmetadata', onMeta, { once: true }); } catch(_){ }
    } catch(_){ }
  }

  // Извлекаем ключ бренда из айтема стека: brand-data="xx-mini-view" на самом айтеме или его потомке
  function extractBrandKeyFromStackItem(item){
    if (!item) return null;
    try {
      var attr = item.getAttribute ? item.getAttribute('brand-data') : null;
      if (!attr){
        var inner = item.querySelector ? item.querySelector('[brand-data$="-mini-view"]') : null;
        if (inner) { attr = inner.getAttribute('brand-data'); }
      }
      if (!attr) return null;
      var m = attr.match(/^(.+)-mini-view$/);
      return m ? m[1] : null;
    } catch(_){ return null; }
  }

  function scrollToCaseByBrand(brandKey, opts){
    if (!brandKey) return;
    var caseEl = document.getElementById(brandKey + '-case') || qs(document, '#' + brandKey + '-case');
    if (!caseEl) return;
    try {
      var scroller = qs(document, '.main-section');
      if (!scroller){
        var behavior = (opts && opts.instant) ? 'auto' : 'smooth';
        caseEl.scrollIntoView({ behavior: behavior, block: 'start', inline: 'nearest' });
        return;
      }

      // Целевая позиция внутри скроллера
      var beforeTop = scroller.scrollTop || 0;
      var scrRect = scroller.getBoundingClientRect();
      var tgtRect = caseEl.getBoundingClientRect();
      var targetTopWithin = (tgtRect.top - scrRect.top) + beforeTop;
      var desiredTop = Math.max(0, targetTopWithin);

      // Временно отключаем scroll-snap для плавного скролла
      var prevSnap = scroller.style.scrollSnapType;
      scroller.style.scrollSnapType = 'none';

      var instant = !!(opts && opts.instant);
      if (instant){
        scroller.scrollTop = desiredTop;
      } else if (typeof scroller.scrollTo === 'function') {
        scroller.scrollTo({ top: desiredTop, behavior: 'smooth' });
      } else {
        scroller.scrollTop = desiredTop;
      }

      // Возвращаем snap чуть позже, затем доснапливаем к началу элемента
      var restoreMs = instant ? 60 : 400;
      if (scroller.__snapRestoreTimer) { clearTimeout(scroller.__snapRestoreTimer); }
      scroller.__snapRestoreTimer = setTimeout(function(){
        try { scroller.style.scrollSnapType = prevSnap || 'y mandatory'; } catch(__){}
        try { caseEl.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' }); } catch(__){}
        try { scroller.__snapRestoreTimer = null; } catch(__){}
      }, restoreMs);
    } catch(_){ }
  }

  function initializeStackZIndex(){
    var items = getStackItems();
    if (!items || !items.length) return;
    var n = items.length;
    each(items, function(el, idx){ try { el.style.zIndex = String((n - idx) + 1); } catch(_){ } });
  }

  function clearStackCardStyles(){
    var items = getStackItems();
    each(items, function(el){
      try {
        var cls = (el.className || '').split(/\s+/);
        for (var i=cls.length-1; i>=0; i--){ if (/-card-style$/.test(cls[i])) { el.classList.remove(cls[i]); } }
      } catch(_){ }
    });
  }

  function updateStackOpacityByCurrent(){
    var items = getStackItems(); if (!items || !items.length) return;
    var container = getStackContainer();
    var isOpen = !!(container && container.classList && container.classList.contains('open-stack'));
    var currentIndex = -1;
    for (var i=0; i<items.length; i++){ if (items[i].classList && items[i].classList.contains('current')) { currentIndex = i; break; } }
    if (isOpen){
      each(items, function(el){ try { el.style.opacity = '1'; } catch(_){ } });
    } else if (currentIndex >= 0){
      // При закрытом стеке показываем только current; элементы до и после — скрываем
      each(items, function(el, idx){ try { el.style.opacity = (idx === currentIndex) ? '1' : '0'; } catch(_){ } });
    }
  }

  // Индекс активного слайда в wrapper
  function getActiveSlideIndex(wrapperEl){
    var slides = qsa(wrapperEl, '.story-track-wrapper__slide');
    if (!slides || !slides.length) return -1;
    for (var i=0; i<slides.length; i++){
      if (slides[i].classList && slides[i].classList.contains('active')) return i;
    }
    return -1;
  }

  // Прокрутка к целевому слайду (программный свайп)
  function scrollToSlide(wrapperEl, slides, index, options){
    if (!wrapperEl || !slides || !slides.length) return;
    var target = slides[index];
    if (!target) return;
    try {
      var st = wrapperEl.__snapState || (wrapperEl.__snapState = {});
      var force = options && options.forceIgnoreUser === true;
      if (st.isUserInteracting && !force) return;
      if (st._autoLockTimer) { clearTimeout(st._autoLockTimer); }
      st.autoScrollLock = true;
      st._autoLockTimer = setTimeout(function(){ st.autoScrollLock = false; }, 600);
    } catch(_){ }
    try {
      target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    } catch(_){
      try { wrapperEl.scrollTo({ left: target.offsetLeft, behavior: 'smooth' }); }
      catch(__){ try { wrapperEl.scrollLeft = target.offsetLeft; } catch(___){ } }
    }
  }

  // Обновление воспроизведения и заполнения прогресса для текущего wrapper
  function updateWrapperPlayback(wrapperEl){
    if (!wrapperEl) return;
    var slides = qsa(wrapperEl, '.story-track-wrapper__slide');
    var fills = qsa(wrapperEl, '.story-progress__fill');
    if (!slides || !slides.length) return;

    // Обновляем проигрывание только если родительский кейс активен
    var caseEl = wrapperEl.closest ? wrapperEl.closest('.cases-grid__item, .case') : null;
    var caseIsActive = !!(caseEl && caseEl.classList && caseEl.classList.contains('active'));

    var activeIdx = -1;
    for (var i=0; i<slides.length; i++){
      if (slides[i].classList && slides[i].classList.contains('active')){ activeIdx = i; break; }
    }

    each(slides, function(slide, idx){
      var video = qs(slide, '.slide-inner__video-block video') || qs(slide, 'video');
      var fill = (fills && fills[idx]) ? fills[idx] : null;

      function detachHandlers(v){
        if(!v) return;
        try { if(v.__progressHandler){ v.removeEventListener('timeupdate', v.__progressHandler); v.__progressHandler = null; } } catch(_){ }
        try { if(v.__metaHandler){ v.removeEventListener('loadedmetadata', v.__metaHandler); v.__metaHandler = null; } } catch(_){ }
        try { if(v.__endedHandler){ v.removeEventListener('ended', v.__endedHandler); v.__endedHandler = null; } } catch(_){ }
        // загрузочные обработчики не используются здесь
        if (v.__rafProgressId){ try { cancelAnimationFrame(v.__rafProgressId); } catch(_){ } v.__rafProgressId = null; }
      }

      if (idx !== activeIdx || !caseIsActive){
        detachHandlers(video);
        if (fill) { try { fill.style.transform = 'scaleX(0)'; } catch(_){ } }
        // сбрасываем видео в неактивных слайдах
        try { pauseAndResetVideos(slide); } catch(_){ }
        try { delete slide.__progressAdvancedOnce; } catch(_){ }
      } else {
        if (video){
          detachHandlers(video);
          // rAF апдейтер прогресса, чтобы бар заполнялся стабильно
          var startRafIfNeeded = function(){
            if (video.__rafProgressId) return;
            var rafFn = function(){
              var dur = (isFinite(video.duration) && video.duration > 0) ? video.duration : 0;
              var ct = Math.max(0, video.currentTime || 0);
              var p = dur > 0 ? Math.min(1, ct / dur) : 0;
              if (fill) { try { fill.style.transform = 'scaleX(' + p + ')'; } catch(_){ } }
              // автопереход по 98%
              try {
                if (p >= PROGRESS_ADVANCE_THRESHOLD && !slide.__progressAdvancedOnce){
                  slide.__progressAdvancedOnce = true;
                  var st = wrapperEl.__snapState || {};
                  if (!st.isUserInteracting && !st.autoScrollLock){
                    var nextIndex = (idx + 1) < slides.length ? (idx + 1) : 0;
                    scrollToSlide(wrapperEl, slides, nextIndex);
                  }
                }
              } catch(_){ }
              if (!video.paused && !video.ended){ video.__rafProgressId = requestAnimationFrame(rafFn); } else { video.__rafProgressId = null; }
            };
            video.__rafProgressId = requestAnimationFrame(rafFn);
          };

          video.__progressHandler = function(){
            var dur = (isFinite(video.duration) && video.duration > 0) ? video.duration : 0;
            var ct = Math.max(0, video.currentTime || 0);
            var p = dur > 0 ? Math.min(1, ct / dur) : 0;
            if (fill) { try { fill.style.transform = 'scaleX(' + p + ')'; } catch(_){ } }
            // Переход к следующему слайду на 98%, если видео зациклено (ended может не сработать)
            try {
              if (p >= PROGRESS_ADVANCE_THRESHOLD && !slide.__progressAdvancedOnce){
                slide.__progressAdvancedOnce = true;
                var st = wrapperEl.__snapState || {};
                if (!st.isUserInteracting && !st.autoScrollLock){
                  var nextIndex = (idx + 1) < slides.length ? (idx + 1) : 0;
                  scrollToSlide(wrapperEl, slides, nextIndex);
                }
              }
            } catch(_){ }
            // Стартуем rAF-поток при первом обновлении времени
            startRafIfNeeded();
          };
          video.__metaHandler = function(){
            if (video.__progressHandler) video.__progressHandler();
            // После появления метаданных у активного слайда в активном кейсе — запустим воспроизведение
            try {
              if (idx === activeIdx && caseIsActive) { playVideos(slide); }
            } catch(_){ }
          };
          video.__endedHandler = function(){
            if (fill) { try { fill.style.transform = 'scaleX(1)'; } catch(_){ } }
            try {
              var st = wrapperEl.__snapState || {};
              if (!st.isUserInteracting && !st.autoScrollLock){
                var nextIndex = (idx + 1) < slides.length ? (idx + 1) : 0;
                scrollToSlide(wrapperEl, slides, nextIndex);
              }
            } catch(_){ }
          };
          try { video.addEventListener('timeupdate', video.__progressHandler); } catch(_){ }
          try { video.addEventListener('loadedmetadata', video.__metaHandler, { once: true }); } catch(_){ }
          try { video.addEventListener('ended', video.__endedHandler, { once: true }); } catch(_){ }
        }
        // Управление запуском выполняется внешним скриптом; здесь не трогаем playback
      }
    });

    // Обновляем заполнения для сегментов до/после активного
    if (fills && activeIdx >= 0){
      for (var f=0; f<fills.length; f++){
        if (f < activeIdx){ try { fills[f].style.transform = 'scaleX(1)'; } catch(_){ }
                          } else if (f > activeIdx){ try { fills[f].style.transform = 'scaleX(0)'; } catch(_){ }
                                                    }
      }
    }
  }

  // Переключение .active у .cases-grid__item с учётом scroll-snap
  function setupCasesActiveOnScrollSnap(){
    var scroller = (document && document.querySelector) ? document.querySelector('.main-section') : null;
    if (!scroller) return;
    var items = scroller.querySelectorAll ? scroller.querySelectorAll('.cases-grid__item, .case') : null;
    if (!items || !items.length) return;

    var rafId = null;
    var settleTimer = null;
    var lastEligibility = null;
    var lastActiveCase = null;

    function updateActive(){
      rafId = null;
      // Гейт: активируем кейсы только когда .main-container покрывает вьюпорт сверху и снизу
      var eligible = isMainContainerEligible();
      setCasesGridInProgress(eligible);
      if (!eligible){
        lastEligibility = false;
        // Вне активной зоны — ставим все видео на паузу и не меняем active
        pauseAllVideosInElement(document);
        return;
      }
      // Вернулись в активную зону после паузы — синхронизируем и запускаем активный слайд
      if (lastEligibility === false){
        var activeCase = qs(document, '.cases-grid__item.active, .case.active');
        if (activeCase){
          var wrappersInCase0 = qsa(activeCase, '.story-track-wrapper');
          each(wrappersInCase0, function(w){ try { updateWrapperPlayback(w); } catch(_){ } });
          var activeSlides = qsa(activeCase, '.story-track-wrapper__slide.active');
          if (activeSlides && activeSlides.length){ each(activeSlides, function(s){ try { playVideos(s); } catch(_){ } }); }
          // talking-head автозапуск после возврата в зону
          try { ensureTalkingHeadAutoPlay(activeCase); } catch(_){ }
        }
      }
      lastEligibility = true;
      var rootRect = scroller.getBoundingClientRect();
      var isHorizontal = (scroller.scrollWidth - scroller.clientWidth) > (scroller.scrollHeight - scroller.clientHeight);
      var centerX = rootRect.left + (rootRect.width || 0) / 2;
      var centerY = rootRect.top + (rootRect.height || 0) / 2;
      var best = null; var bestDist = Infinity;
      for (var i=0; i<items.length; i++){
        var r = items[i].getBoundingClientRect();
        var ix = r.left + (r.width || 0) / 2;
        var iy = r.top + (r.height || 0) / 2;
        var d = isHorizontal ? Math.abs(ix - centerX) : Math.abs(iy - centerY);
        if (d < bestDist) { bestDist = d; best = items[i]; }
      }
      if (best){
        var caseChanged = (best !== lastActiveCase);
        
        // Если активный кейс изменился — обновляем все
        if (caseChanged){
          (items.forEach ? items.forEach : Array.prototype.forEach).call(items, function(el){
            if (el === best) { el.classList.add('active'); playTalkingHead(el); try { ensureTalkingHeadAutoPlay(el); } catch(_){ } }
            else { el.classList.remove('active'); pauseTalkingHead(el); }
          });

          // Синхронизируем мини‑вью бренда и opacity (card-style назначаем ТОЛЬКО при open-stack)
          try {
            var brandKey = extractBrandKeyFromCase(best);
            setStackMiniViewCurrent(brandKey);
            updateStackOpacityByCurrent();
          } catch(_){ }

          // Снимаем active со всех слайдов внутри неактивных кейсов
          (items.forEach ? items.forEach : Array.prototype.forEach).call(items, function(el){
            if (!el.classList || el.classList.contains('active')) return;
            var nonActiveSlides = qsa(el, '.story-track-wrapper__slide.active');
            (nonActiveSlides.forEach ? nonActiveSlides.forEach : Array.prototype.forEach).call(nonActiveSlides, function(s){
              try { s.classList.remove('active'); } catch(_){ }
            });
          });

          // Ставим на паузу и сбрасываем все видео внутри неактивных кейсов
          (items.forEach ? items.forEach : Array.prototype.forEach).call(items, function(el){
            if (!el.classList || el.classList.contains('active')) return;
            pauseAndResetVideosInElement(el);
          });

          lastActiveCase = best;
        }

        // Даже если кейс не изменился, обновляем активные слайды и воспроизведение
        // (это важно при скролле внутри кейса или когда видео не запустились)
        var wrappersInCase = qsa(best, '.story-track-wrapper');
        each(wrappersInCase, function(w){
          var activeSlide = null;
          try { activeSlide = setActiveSlideInWrapperByCenter(w); } catch(_){ }
          try { updateWrapperPlayback(w); } catch(_){ }
          if (activeSlide) { try { playVideos(activeSlide); } catch(_){ } }
        });

        // Запускаем видео только в активных слайдах внутри активного кейса
        var activeSlidesInCase = qsa(best, '.story-track-wrapper__slide.active');
        each(activeSlidesInCase, function(s){ try { playVideos(s); } catch(_){ } });
      }
    }

    function onScroll(){
      if (rafId) return;
      rafId = requestAnimationFrame(updateActive);
      if (settleTimer) { clearTimeout(settleTimer); }
      settleTimer = setTimeout(updateActive, 140); // даём snap «досесть»
    }

    function onTouchEnd(){
      // После завершения touch-жеста принудительно обновляем с небольшой задержкой
      // чтобы snap успел "досесть"
      if (settleTimer) { clearTimeout(settleTimer); }
      settleTimer = setTimeout(updateActive, 200);
    }

    scroller.addEventListener('scroll', onScroll, { passive:true });
    // Добавляем обработчик touchend для гарантированного обновления после завершения жеста
    scroller.addEventListener('touchend', onTouchEnd, { passive:true });
    scroller.addEventListener('touchcancel', onTouchEnd, { passive:true });
    window.addEventListener('resize', onScroll, { passive:true });
    window.addEventListener('orientationchange', onScroll, { passive:true });
    updateActive();
  }

  // Наблюдатель активности слайда в зоне видимости wrapper-а
  function setupActiveObserver(wrapperEl){
    if (!wrapperEl) return;
    var slides = qsa(wrapperEl, '.story-track-wrapper__slide');
    if (!slides || !slides.length) return;

    var ratios = new Map();
    var ACTIVE_THRESHOLD = 0.6; // Слайд считается активным при видимости >= 60%

    var io = new IntersectionObserver(function(entries){
      each(entries, function(entry){
        ratios.set(entry.target, entry.intersectionRatio || 0);
      });

      // Выбираем максимально видимый слайд
      var bestSlide = null; var bestRatio = 0;
      each(slides, function(slide){
        var r = ratios.get(slide) || 0;
        if (r > bestRatio){ bestRatio = r; bestSlide = slide; }
      });

      if (bestSlide && bestRatio >= ACTIVE_THRESHOLD){
        // Меняем active только если родительский кейс активен
        var caseEl = wrapperEl.closest ? wrapperEl.closest('.cases-grid__item, .case') : null;
        var caseIsActive = !!(caseEl && caseEl.classList && caseEl.classList.contains('active'));
        if (caseIsActive){
          each(slides, function(slide){
            if (slide === bestSlide){ try { slide.classList.add('active'); } catch(_){ } }
            else { try { slide.classList.remove('active'); } catch(_){ } }
          });
          updateWrapperPlayback(wrapperEl);
          // После присвоения active — запускаем видео в активном слайде
          try { playVideos(bestSlide); } catch(_){ }
        }
      }
    }, { root: wrapperEl, threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] });

    each(slides, function(slide){ io.observe(slide); });

    // Начальная инициализация
    setTimeout(function(){ updateWrapperPlayback(wrapperEl); }, 0);
  }

  // Начальная синхронизация: оставить активным текущий кейс, остальные — пауза+сброс; в активном — выбрать слайды по центру и запустить
  function initializeActiveCasePlaybackOnce(){
    try {
      var scroller = qs(document, '.main-section');
      var cases = scroller ? qsa(scroller, '.cases-grid__item, .case') : qsa(document, '.cases-grid__item, .case');
      if (!cases || !cases.length) return;
      var activeCase = qs(document, '.cases-grid__item.active, .case.active');
      if (!activeCase) return;

      // Снимаем active с остальных кейсов, ставим паузу+0 для видео; talking-head только пауза
      (cases.forEach ? cases.forEach : Array.prototype.forEach).call(cases, function(el){
        if (el === activeCase){
          try { el.classList.add('active'); } catch(_){ }
          try { playTalkingHead(el); } catch(_){ }
          try { ensureTalkingHeadAutoPlay(el); } catch(_){ }
        } else {
          try { el.classList.remove('active'); } catch(_){ }
          try { pauseTalkingHead(el); } catch(_){ }
          try { pauseAndResetVideosInElement(el); } catch(_){ }
        }
      });

      // Для каждого wrapper внутри активного кейса — выбрать слайд по центру, обновить прогресс, запустить активный
      var wrappers = qsa(activeCase, '.story-track-wrapper');
      each(wrappers, function(w){
        var slide = null;
        try { slide = setActiveSlideInWrapperByCenter(w); } catch(_){ }
        try { updateWrapperPlayback(w); } catch(_){ }
        if (slide){ try { playVideos(slide); } catch(_){ } }
      });

      // Дополнительно запустить все уже активные слайды в активном кейсе
      var activeSlides = qsa(activeCase, '.story-track-wrapper__slide.active');
      each(activeSlides, function(s){ try { playVideos(s); } catch(_){ } });
    } catch(_){ }
  }

  // Установка необходимых атрибутов для видео (критично для Telegram WebView)
  function ensureVideoAttributes(){
    var videos = qsa(document, 'video');
    each(videos, function(video){
      try {
        if (!video.hasAttribute('muted')) video.setAttribute('muted', '');
        if (!video.hasAttribute('playsinline')) video.setAttribute('playsinline', '');
        // Устанавливаем muted как свойство (важно для Telegram)
        video.muted = true;
        // playsinline как свойство
        video.playsInline = true;
        // preload="metadata" если не установлен
        if (!video.hasAttribute('preload')) video.setAttribute('preload', 'metadata');
      } catch(_){}
    });
  }

  // Подстановка src и load() для предподогрева видео
  function ensureSrcAndLoad(video){
    if (!video) return;
    try {
      // Если src уже есть (и не blob), не трогаем
      if (video.src && video.src.length > 0 && !video.src.startsWith('blob:') && !video.src.startsWith('data:')) return;
      
      // Если уже есть source элементы, значит загрузка уже идёт через newMobVideoLazy.js - не трогаем
      var hasSource = video.querySelector && video.querySelector('source');
      if (hasSource) return;
      
      // Проверяем data-src или mob-data-src
      var dataSrc = video.dataset && video.dataset.src;
      var mobDataSrc = video.getAttribute && video.getAttribute('mob-data-src');
      var srcToUse = mobDataSrc || dataSrc;
      
      if (srcToUse && srcToUse.length > 0){
        // Если это data-src или mob-data-src, лучше не трогать - пусть newMobVideoLazy.js сам управляет загрузкой
        // Но можем вызвать load() если видео уже загружено через source
        if (video.readyState > 0) {
          try { video.load(); } catch(_){}
        }
      }
    } catch(_){}
  }

  // Настройка prewarm IntersectionObserver для раннего подогрева видео (Telegram)
  function setupVideoPrewarm(){
    if (!isTelegramAndroid || typeof IntersectionObserver === 'undefined') return;
    
    var NEAR_ROOT_MARGIN = '200% 0px'; // подогреваем за 1-2 экрана
    var prewarmIO = new IntersectionObserver(function(entries){
      each(entries, function(entry){
        if (entry.isIntersecting){
          var video = entry.target;
          ensureSrcAndLoad(video);
          // После первого подогрева отписываемся
          try { prewarmIO.unobserve(video); } catch(_){}
        }
      });
    }, { rootMargin: NEAR_ROOT_MARGIN, threshold: 0 });

    // Наблюдаем все видео для предподогрева
    var videos = qsa(document, 'video');
    each(videos, function(video){
      try { prewarmIO.observe(video); } catch(_){}
    });

    // Также подписываемся на новые видео
    if (typeof MutationObserver !== 'undefined' && document.body){
      var prewarmObserver = new MutationObserver(function(mutations){
        mutations.forEach(function(mutation){
          if (mutation.addedNodes){
            each(mutation.addedNodes, function(node){
              if (node.nodeType === 1){
                if (node.tagName === 'VIDEO'){
                  try { prewarmIO.observe(node); } catch(_){}
                } else {
                  var videos = qsa(node, 'video');
                  each(videos, function(v){
                    try { prewarmIO.observe(v); } catch(_){}
                  });
                }
              }
            });
          }
        });
      });
      prewarmObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Инициализация всего snap-слайдера
  function initSnapSlider(){
    // Устанавливаем атрибуты для всех видео (особенно важно для Telegram)
    if (isTelegramAndroid){
      ensureVideoAttributes();
      
      // Настраиваем prewarm для раннего подогрева видео
      setupVideoPrewarm();
      
      // Также устанавливаем при динамическом добавлении видео
      if (typeof MutationObserver !== 'undefined'){
        var videoObserver = new MutationObserver(function(mutations){
          mutations.forEach(function(mutation){
            if (mutation.addedNodes){
              each(mutation.addedNodes, function(node){
                if (node.nodeType === 1){
                  if (node.tagName === 'VIDEO'){
                    try {
                      node.muted = true;
                      node.playsInline = true;
                      if (!node.hasAttribute('muted')) node.setAttribute('muted', '');
                      if (!node.hasAttribute('playsinline')) node.setAttribute('playsinline', '');
                      if (!node.hasAttribute('preload')) node.setAttribute('preload', 'metadata');
                    } catch(_){}
                  } else {
                    var videos = qsa(node, 'video');
                    each(videos, function(v){
                      try {
                        v.muted = true;
                        v.playsInline = true;
                        if (!v.hasAttribute('muted')) v.setAttribute('muted', '');
                        if (!v.hasAttribute('playsinline')) v.setAttribute('playsinline', '');
                        if (!v.hasAttribute('preload')) v.setAttribute('preload', 'metadata');
                      } catch(_){}
                    });
                  }
                }
              });
            }
          });
        });
        if (document.body){
          videoObserver.observe(document.body, { childList: true, subtree: true });
        }
      }
    }

    var wrappers = qsa(document, '.story-track-wrapper');
    if (!wrappers || !wrappers.length) return;
    each(wrappers, function(wrapper){
      var slides = qsa(wrapper, '.story-track-wrapper__slide');
      if (!slides || !slides.length) return;

      // Строим прогресс, если он ещё не создан
      if (!qs(wrapper, '.story-progress')){
        try { buildProgress(wrapper, slides.length); } catch(_){ }
      }

      // Синхронизируем длительности сегментов с длительностями видео
      syncProgressDurations(wrapper);

      // Запускаем наблюдатель за активным слайдом
      setupActiveObserver(wrapper);

      // Обновляем при изменении размеров окна
      try {
        window.addEventListener('resize', function(){ updateWrapperPlayback(wrapper); }, { passive: true });
        window.addEventListener('orientationchange', function(){ updateWrapperPlayback(wrapper); }, { passive: true });
      } catch(_){ }

      // Отслеживаем пользовательские свайпы/прокрутки внутри wrapper, чтобы не перебивать их автопереходами
      try {
        var st = wrapper.__snapState || (wrapper.__snapState = {});
        var onDown = function(){ st.isUserInteracting = true; if (st._uiTimer) clearTimeout(st._uiTimer); };
        var onUp = function(){ if (st._uiTimer) clearTimeout(st._uiTimer); st._uiTimer = setTimeout(function(){ st.isUserInteracting = false; }, 300); };
        var onScrollEvt = function(){
          st.isUserInteracting = true;
          if (st._uiTimer) clearTimeout(st._uiTimer);
          st._uiTimer = setTimeout(function(){ st.isUserInteracting = false; }, 150);
        };
        wrapper.addEventListener('pointerdown', onDown, { passive: true });
        wrapper.addEventListener('pointerup', onUp, { passive: true });
        wrapper.addEventListener('pointercancel', onUp, { passive: true });
        wrapper.addEventListener('touchstart', onDown, { passive: true });
        wrapper.addEventListener('touchend', onUp, { passive: true });
        wrapper.addEventListener('wheel', onScrollEvt, { passive: true });
        wrapper.addEventListener('scroll', onScrollEvt, { passive: true });
      } catch(_){ }
    });

    // Инициализируем Z-Index для элементов стека на мобильных
    try { initializeStackZIndex(); } catch(_){ }

    // Глобально включаем переключение active у .cases-grid__item по центру snap-скроллера
    setupCasesActiveOnScrollSnap();

    // Делегирование кликов по зонам навигации слайдов внутри активного кейса
    try {
      document.addEventListener('click', function(ev){
        var target = ev.target;
        if (!target) return;
        // Тап по айтему списка стека или collection-item — открываем стек; при открытом: current -> переход по ссылке; не current -> закрытие и скролл к кейсу
        var stackItem = target.closest ? target.closest('.main-container__stack-wrap__wrapper__list__item') : null;
        var collectionItem = target.closest ? target.closest('.collection-item') : null;
        if (stackItem || collectionItem){
          var container = getStackContainer();
          if (container){
            var isOpen = container.classList.contains('open-stack');
            if (!isOpen){
              const header = document.getElementById('header');
              header.style.zIndex = '9';
              container.classList.add('open-stack');
              // При открытии: добавляем xx-card-style на текущий элемент
              try {
                var activeCaseEl = qs(document, '.cases-grid__item.active, .case.active');
                var brandKeyOpen = extractBrandKeyFromCase(activeCaseEl);
                var listOpen = getStackList();
                if (brandKeyOpen && listOpen){
                  var currentElOpen = qs(listOpen, '.main-container__stack-wrap__wrapper__list__item.current');
                  if (!currentElOpen){ setStackMiniViewCurrent(brandKeyOpen); currentElOpen = qs(listOpen, '.main-container__stack-wrap__wrapper__list__item.current'); }
                  if (currentElOpen){ clearStackCardStyles(); currentElOpen.classList.add(brandKeyOpen + '-card-style'); }
                }
              } catch(_){ }
              try { updateStackOpacityByCurrent(); } catch(_){ }
              // Скрываем collection-wrapper при открытии стека
              try {
                var collectionWrappers = qsa(document, '.collection-wrapper');
                each(collectionWrappers, function(el){ try { el.style.opacity = '0'; } catch(_){ } });
              } catch(_){ }
              return;
            }
            // Стек открыт: поведение зависит от того, кликнули по current или нет
            var isCurrent = stackItem.classList && stackItem.classList.contains('current');
            if (isCurrent){
              // Переход по ближайшей ссылке внутри айтема
              try {
                var link = stackItem.querySelector ? stackItem.querySelector('a[href]') : null;
                if (link && link.href){ link.click ? link.click() : (window.location.href = link.href); }
              } catch(_){ }
              return;
            }
            // Клик по не current: закрываем стек, чистим card-style, делаем мгновенный скролл к кейсу и сразу выставляем current/active
            try {
              const header = document.getElementById('header');
              header.style.zIndex = '14';
              container.classList.remove('open-stack');
              clearStackCardStyles();
              updateStackOpacityByCurrent();
              var brandKeyItem = extractBrandKeyFromStackItem(stackItem);
              // мгновенный скролл внутри .main-section
              scrollToCaseByBrand(brandKeyItem, { instant: true });
              // сразу выставляем .active кейсу и .current айтему
              if (brandKeyItem){
                try {
                  var caseElTarget = document.getElementById(brandKeyItem + '-case') || qs(document, '#' + brandKeyItem + '-case');
                  if (caseElTarget){
                    var scroller2 = qs(document, '.main-section');
                    var cases = scroller2 ? qsa(scroller2, '.cases-grid__item, .case') : qsa(document, '.cases-grid__item, .case');
                    each(cases, function(el){ if (el === caseElTarget) { try { el.classList.add('active'); playTalkingHead(el); } catch(__){} } else { try { el.classList.remove('active'); pauseTalkingHead(el); } catch(__){} } });
                  }
                  // current в списке
                  var listAll = getStackList();
                  if (listAll){
                    var targetItem = qs(listAll, '[brand-data="' + brandKeyItem + '-mini-view"]') || (listAll.querySelector ? listAll.querySelector('[brand-data$="-mini-view"][brand-data^="' + brandKeyItem + '"]') : null);
                    if (targetItem){
                      var currents = qsa(listAll, '.current');
                      each(currents, function(el){ try { el.classList.remove('current'); } catch(__){} });
                      try { targetItem.classList.add('current'); } catch(__){}
                    }
                  }
                  // пересчёт opacity после смены current
                  updateStackOpacityByCurrent();
                } catch(__){}
              }
            } catch(_){ }
            return;
          }
          return;
        }

        var closeStack = target.closest ? target.closest('#mob-stack-close') : null;
        if (closeStack){
          var container2 = getStackContainer();
          if (container2 && container2.classList.contains('open-stack')){
            const header = document.getElementById('header');
            header.style.zIndex = '14';
            container2.classList.remove('open-stack');
          }
          // При закрытии — восстанавливаем opacity правило «все до current = 0» и снимаем card-style
          try {
            updateStackOpacityByCurrent();
            clearStackCardStyles();
          } catch(_){ }
          // Показываем collection-wrapper при закрытии стека с задержкой 300ms
          try {
            setTimeout(function(){
              try {
                var collectionWrappers = qsa(document, '.collection-wrapper');
                each(collectionWrappers, function(el){ try { el.style.opacity = '1'; } catch(_){ } });
              } catch(_){ }
            }, 300);
          } catch(_){ }
          return;
        }
        var isLeft = target.closest ? target.closest('.story-tap-left') : null;
        var isRight = target.closest ? target.closest('.story-tap-right') : null;
        if (!isLeft && !isRight) return;
        ev.preventDefault();
        var caseEl = target.closest ? target.closest('.cases-grid__item, .case') : null;
        if (!caseEl || !caseEl.classList || !caseEl.classList.contains('active')) return; // работаем только в активном кейсе
        var wrapper = qs(caseEl, '.story-track-wrapper');
        if (!wrapper) return;
        var slides = qsa(wrapper, '.story-track-wrapper__slide');
        if (!slides || !slides.length) return;
        // Убеждаемся, что есть активный слайд
        var curIdx = getActiveSlideIndex(wrapper);
        if (curIdx === -1){
          var ensured = setActiveSlideInWrapperByCenter(wrapper);
          curIdx = ensured ? Array.prototype.indexOf.call(slides, ensured) : 0;
          if (curIdx < 0) curIdx = 0;
        }
        var nextIdx = curIdx;
        if (isRight) { nextIdx = (curIdx + 1) < slides.length ? (curIdx + 1) : 0; }
        else if (isLeft) { nextIdx = (curIdx - 1) >= 0 ? (curIdx - 1) : (slides.length - 1); }

        // Ставим active на целевой, снимаем с остальных
        (slides.forEach ? slides.forEach : Array.prototype.forEach).call(slides, function(s, i){
          if (i === nextIdx) { try { s.classList.add('active'); } catch(_){ } }
          else { try { s.classList.remove('active'); } catch(_){ } }
        });

        // Прокручиваем к целевому и обновляем прогресс/воспроизведение
        try { scrollToSlide(wrapper, slides, nextIdx, { forceIgnoreUser: true }); } catch(_){ }
        try { updateWrapperPlayback(wrapper); } catch(_){ }
        try { playVideos(slides[nextIdx]); } catch(_){ }
        // Даем snap «досесть» и синхронизируем active и воспроизведение по центру
        try {
          setTimeout(function(){
            try {
              var actual = setActiveSlideInWrapperByCenter(wrapper);
              updateWrapperPlayback(wrapper);
              if (actual) { playVideos(actual); }
            } catch(__){}
          }, 160);
        } catch(__){}
      });
    } catch(_){ }
  }

  if (typeof document !== 'undefined'){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', function(){
        initSnapSlider();
        // Начальная синхронизация проигрывания для активного кейса
        initializeActiveCasePlaybackOnce();
      }, { once: true });
    } else {
      initSnapSlider();
      // Начальная синхронизация проигрывания для активного кейса
      initializeActiveCasePlaybackOnce();
    }
  }
})();
