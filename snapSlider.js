(function(){
  if (!window.matchMedia || !window.matchMedia('(max-width: 479px)').matches) return;
  // Утилиты
  var PROGRESS_ADVANCE_THRESHOLD = 0.98;
  var USER_GESTURE_ACTIVATED = false; // Флаг активации user gesture для autoplay
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
  }

  // Активация user gesture для разблокировки autoplay (особенно важно для Telegram WebView)
  function activateUserGesture(){
    if (USER_GESTURE_ACTIVATED) return;
    USER_GESTURE_ACTIVATED = true;
    console.log('[snapSlider] User gesture activated');
    // При активации сразу запускаем видео в активных слайдах активных кейсов
    try {
      var activeCases = qsa(document, '.cases-grid__item.active, .case.active');
      if (activeCases && activeCases.length > 0){
        each(activeCases, function(caseEl){
          var activeSlides = qsa(caseEl, '.story-track-wrapper__slide.active');
          if (activeSlides && activeSlides.length > 0){
            each(activeSlides, function(slide){
              var videos = qsa(slide, '.slide-inner__video-block video, video');
              if (videos && videos.length > 0){
                each(videos, function(video){
                  try {
                    if (!video || typeof video.play !== 'function') return;
                    // Проверяем состояние загрузки - пропускаем если загружается
                    var isFetching = video.dataset && video.dataset.fetching === 'true';
                    if (isFetching) return;
                    
                    var p = video.play();
                    if (p && p.catch){
                      p.catch(function(err){
                        // Не логируем ожидаемые ошибки при активации
                        if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
                        console.error('[snapSlider] Error activating video playback:', err);
                      });
                    }
                  } catch(err){
                    console.error('[snapSlider] Error in activateUserGesture video play:', err);
                  }
                });
              }
            });
          }
          // Также активируем talking-head видео
          try {
            var talkingVideo = getTalkingHeadVideo(caseEl);
            if (talkingVideo && typeof talkingVideo.play === 'function'){
              var isFetching = talkingVideo.dataset && talkingVideo.dataset.fetching === 'true';
              if (!isFetching){
                var pt = talkingVideo.play();
                if (pt && pt.catch){
                  pt.catch(function(err){
                    // Не логируем ожидаемые ошибки при активации
                    if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
                    console.error('[snapSlider] Error activating talking-head playback:', err);
                  });
                }
              }
            }
          } catch(err){
            console.error('[snapSlider] Error in activateUserGesture talking-head:', err);
          }
        });
      }
    } catch(err){
      console.error('[snapSlider] Error in activateUserGesture:', err);
    }
  }

  // Здесь только базовое управление воспроизведением: play/pause и сброс времени.
  function playVideos(slideEl){
    if (!slideEl) return;
    // Если user gesture ещё не активирован, пытаемся активировать
    if (!USER_GESTURE_ACTIVATED){
      activateUserGesture();
    }
    var videos = qsa(slideEl, '.slide-inner__video-block video, video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      try {
        if (!video || typeof video.play !== 'function') return;
        
        // Проверяем, загружается ли видео (если есть атрибут fetching или нет loaded)
        var isFetching = video.dataset && video.dataset.fetching === 'true';
        var isLoaded = video.dataset && video.dataset.loaded === 'true';
        var hasSource = video.readyState > 0 || (video.src || (video.querySelector && video.querySelector('source')));
        
        // Если видео загружается через lazy loader, ждем завершения загрузки
        if (isFetching || (!isLoaded && hasSource)){
          var tryPlayWhenReady = function(){
            if (video.dataset && video.dataset.fetching === 'true'){
              setTimeout(tryPlayWhenReady, 100);
              return;
            }
            try {
              if (video.readyState >= 2 && !video.paused) return; // Уже играет или почти готово
              var p = video.play();
              if (p && p.catch){
                p.catch(function(err){
                  // AbortError ожидаем во время загрузки - не логируем
                  if (err && err.name === 'AbortError') return;
                  // NotAllowedError - user gesture еще не активирован
                  if (err && err.name === 'NotAllowedError'){
                    if (!USER_GESTURE_ACTIVATED){
                      activateUserGesture();
                      // Повторная попытка после небольшой задержки
                      setTimeout(function(){
                        try {
                          var p2 = video.play();
                          if (p2 && p2.catch) p2.catch(function(){});
                        } catch(_){}
                      }, 100);
                    }
                    return;
                  }
                  console.error('[snapSlider] Error in playVideos - video.play() rejected:', err);
                });
              }
            } catch(_){}
          };
          setTimeout(tryPlayWhenReady, 100);
          return;
        }
        
        // Если видео готово, пытаемся сразу запустить
        if (video.readyState >= 2 || !hasSource){
          var p = video.play();
          if (p && p.catch){
            p.catch(function(err){
              // AbortError ожидаем если видео перезагружается - не логируем
              if (err && err.name === 'AbortError') return;
              // NotAllowedError - пробуем активировать user gesture и повторить
              if (err && err.name === 'NotAllowedError'){
                if (!USER_GESTURE_ACTIVATED){
                  activateUserGesture();
                  setTimeout(function(){
                    try {
                      var p2 = video.play();
                      if (p2 && p2.catch) p2.catch(function(){});
                    } catch(_){}
                  }, 100);
                }
                return;
              }
              console.error('[snapSlider] Error in playVideos - video.play() rejected:', err);
            });
          }
        }
      } catch(err){
        console.error('[snapSlider] Error in playVideos:', err);
      }
    });
  }

  function pauseAndResetVideos(slideEl){
    if (!slideEl) return;
    var videos = qsa(slideEl, '.slide-inner__video-block video, video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      try {
        if (video && typeof video.pause === 'function') video.pause();
      } catch(err){
        console.error('[snapSlider] Error in pauseAndResetVideos - pause:', err);
      }
      try {
        if (typeof video.currentTime === 'number') video.currentTime = 0;
      } catch(err){
        console.error('[snapSlider] Error in pauseAndResetVideos - currentTime:', err);
      }
    });
  }

  function pauseAndResetVideosInElement(rootEl){
    if (!rootEl) return;
    var videos = qsa(rootEl, 'video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      try {
        if (video && typeof video.pause === 'function') video.pause();
      } catch(err){
        console.error('[snapSlider] Error in pauseAndResetVideosInElement - pause:', err);
      }
      // talking-head: не сбрасываем время, только пауза
      var isTalking = false;
      try {
        isTalking = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head__video'));
      } catch(err){
        console.error('[snapSlider] Error in pauseAndResetVideosInElement - closest check:', err);
      }
      if (!isTalking){
        try {
          if (typeof video.currentTime === 'number') video.currentTime = 0;
        } catch(err){
          console.error('[snapSlider] Error in pauseAndResetVideosInElement - currentTime:', err);
        }
      }
    });
  }

  // Пауза всех видео без сброса времени (используем при выходе .cases-grid из зоны)
  function pauseAllVideosInElement(rootEl){
    if (!rootEl) return;
    var videos = qsa(rootEl, 'video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      try {
        if (video && typeof video.pause === 'function') video.pause();
      } catch(err){
        console.error('[snapSlider] Error in pauseAllVideosInElement:', err);
      }
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
    try {
      // Проверяем, загружается ли видео
      var isFetching = v.dataset && v.dataset.fetching === 'true';
      var isLoaded = v.dataset && v.dataset.loaded === 'true';
      var hasSource = v.readyState > 0 || (v.src || (v.querySelector && v.querySelector('source')));
      
      // Если видео загружается, ждем завершения
      if (isFetching || (!isLoaded && hasSource)){
        var tryPlayWhenReady = function(){
          if (v.dataset && v.dataset.fetching === 'true'){
            setTimeout(tryPlayWhenReady, 100);
            return;
          }
          try {
            if (v.readyState >= 2 && !v.paused) return;
            var p = v.play();
            if (p && p.catch){
              p.catch(function(err){
                if (err && err.name === 'AbortError') return;
                if (err && err.name === 'NotAllowedError'){
                  if (!USER_GESTURE_ACTIVATED){
                    activateUserGesture();
                    setTimeout(function(){
                      try {
                        var p2 = v.play();
                        if (p2 && p2.catch) p2.catch(function(){});
                      } catch(_){}
                    }, 100);
                  }
                  return;
                }
                console.error('[snapSlider] Error in playTalkingHead - video.play() rejected:', err);
              });
            }
          } catch(_){}
        };
        setTimeout(tryPlayWhenReady, 100);
        return;
      }
      
      // Если видео готово
      if (v.readyState >= 2 || !hasSource){
        var p = v.play();
        if (p && p.catch){
          p.catch(function(err){
            if (err && err.name === 'AbortError') return;
            if (err && err.name === 'NotAllowedError'){
              if (!USER_GESTURE_ACTIVATED){
                activateUserGesture();
                setTimeout(function(){
                  try {
                    var p2 = v.play();
                    if (p2 && p2.catch) p2.catch(function(){});
                  } catch(_){}
                }, 100);
              }
              return;
            }
            console.error('[snapSlider] Error in playTalkingHead - video.play() rejected:', err);
          });
        }
      }
    } catch(err){
      console.error('[snapSlider] Error in playTalkingHead:', err);
    }
  }
  function pauseTalkingHead(root){
    var v = getTalkingHeadVideo(root);
    if (v){
      try {
        v.pause();
      } catch(err){
        console.error('[snapSlider] Error in pauseTalkingHead:', err);
      }
    }
  }

  // Гарантированный старт talking-head после загрузки метаданных, если кейс активен
  function ensureTalkingHeadAutoPlay(caseEl){
    try {
      var v = getTalkingHeadVideo(caseEl);
      if (!v) return;
      var onMeta = function(){
        try {
          if (caseEl.classList && caseEl.classList.contains('active')){
            playTalkingHead(caseEl);
          }
        } catch(err){
          console.error('[snapSlider] Error in ensureTalkingHeadAutoPlay - onMeta:', err);
        }
      };
      try {
        v.addEventListener('loadedmetadata', onMeta, { once: true });
      } catch(err){
        console.error('[snapSlider] Error in ensureTalkingHeadAutoPlay - addEventListener:', err);
      }
    } catch(err){
      console.error('[snapSlider] Error in ensureTalkingHeadAutoPlay:', err);
    }
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
    } catch(err){
      console.error('[snapSlider] Error in scrollToSlide - state management:', err);
    }
    try {
      target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    } catch(err){
      try {
        wrapperEl.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
      } catch(err2){
        try {
          wrapperEl.scrollLeft = target.offsetLeft;
        } catch(err3){
          console.error('[snapSlider] Error in scrollToSlide - all scroll methods failed:', err3, err2, err);
        }
      }
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
        try {
          if(v.__progressHandler){ v.removeEventListener('timeupdate', v.__progressHandler); v.__progressHandler = null; }
        } catch(err){
          console.error('[snapSlider] Error in detachHandlers - removeEventListener timeupdate:', err);
        }
        try {
          if(v.__metaHandler){ v.removeEventListener('loadedmetadata', v.__metaHandler); v.__metaHandler = null; }
        } catch(err){
          console.error('[snapSlider] Error in detachHandlers - removeEventListener loadedmetadata:', err);
        }
        try {
          if(v.__endedHandler){ v.removeEventListener('ended', v.__endedHandler); v.__endedHandler = null; }
        } catch(err){
          console.error('[snapSlider] Error in detachHandlers - removeEventListener ended:', err);
        }
        // загрузочные обработчики не используются здесь
        if (v.__rafProgressId){
          try {
            cancelAnimationFrame(v.__rafProgressId);
          } catch(err){
            console.error('[snapSlider] Error in detachHandlers - cancelAnimationFrame:', err);
          }
          v.__rafProgressId = null;
        }
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
            } catch(err){
              console.error('[snapSlider] Error in __metaHandler - playVideos:', err);
            }
          };
          video.__endedHandler = function(){
            if (fill) {
              try {
                fill.style.transform = 'scaleX(1)';
              } catch(err){
                console.error('[snapSlider] Error in __endedHandler - fill transform:', err);
              }
            }
            try {
              var st = wrapperEl.__snapState || {};
              if (!st.isUserInteracting && !st.autoScrollLock){
                var nextIndex = (idx + 1) < slides.length ? (idx + 1) : 0;
                scrollToSlide(wrapperEl, slides, nextIndex);
              }
            } catch(err){
              console.error('[snapSlider] Error in __endedHandler - scrollToSlide:', err);
            }
          };
          try {
            video.addEventListener('timeupdate', video.__progressHandler);
          } catch(err){
            console.error('[snapSlider] Error in updateWrapperPlayback - addEventListener timeupdate:', err);
          }
          try {
            video.addEventListener('loadedmetadata', video.__metaHandler, { once: true });
          } catch(err){
            console.error('[snapSlider] Error in updateWrapperPlayback - addEventListener loadedmetadata:', err);
          }
          try {
            video.addEventListener('ended', video.__endedHandler, { once: true });
          } catch(err){
            console.error('[snapSlider] Error in updateWrapperPlayback - addEventListener ended:', err);
          }
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
    var firstScrollHappened = false;

    function updateActive(){
      // При первом скролле активируем user gesture (если ещё не активирован)
      if (!firstScrollHappened && !USER_GESTURE_ACTIVATED){
        firstScrollHappened = true;
        activateUserGesture();
      }
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
        // Если активный кейс не изменился — ничего не делаем, чтобы избежать дёрганий
        if (best === lastActiveCase) return;

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

        // Переопределяем active для слайда внутри каждого wrapper по центру
        var wrappersInCase = qsa(best, '.story-track-wrapper');
        each(wrappersInCase, function(w){
          var activeSlide = null;
          try {
            activeSlide = setActiveSlideInWrapperByCenter(w);
          } catch(err){
            console.error('[snapSlider] Error in updateActive - setActiveSlideInWrapperByCenter:', err);
          }
          try {
            updateWrapperPlayback(w);
          } catch(err){
            console.error('[snapSlider] Error in updateActive - updateWrapperPlayback:', err);
          }
          if (activeSlide) {
            try {
              playVideos(activeSlide);
            } catch(err){
              console.error('[snapSlider] Error in updateActive - playVideos:', err);
            }
          }
        });

        // Запускаем видео только в активных слайдах внутри активного кейса
        var activeSlidesInCase = qsa(best, '.story-track-wrapper__slide.active');
        each(activeSlidesInCase, function(s){
          try {
            playVideos(s);
          } catch(err){
            console.error('[snapSlider] Error in updateActive - playVideos for active slide:', err);
          }
        });

        lastActiveCase = best;
      }
    }

    function onScroll(){
      // Активируем user gesture при первом скролле
      if (!USER_GESTURE_ACTIVATED){
        activateUserGesture();
      }
      if (rafId) return;
      rafId = requestAnimationFrame(updateActive);
      if (settleTimer) { clearTimeout(settleTimer); }
      settleTimer = setTimeout(updateActive, 140); // даём snap «досесть»
    }

    scroller.addEventListener('scroll', onScroll, { passive:true });
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
            if (slide === bestSlide){
              try {
                slide.classList.add('active');
              } catch(err){
                console.error('[snapSlider] Error in setupActiveObserver - classList.add:', err);
              }
            } else {
              try {
                slide.classList.remove('active');
              } catch(err){
                console.error('[snapSlider] Error in setupActiveObserver - classList.remove:', err);
              }
            }
          });
          try {
            updateWrapperPlayback(wrapperEl);
          } catch(err){
            console.error('[snapSlider] Error in setupActiveObserver - updateWrapperPlayback:', err);
          }
          // После присвоения active — запускаем видео в активном слайде
          try {
            playVideos(bestSlide);
          } catch(err){
            console.error('[snapSlider] Error in setupActiveObserver - playVideos:', err);
          }
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
          try {
            el.classList.add('active');
          } catch(err){
            console.error('[snapSlider] Error in initializeActiveCasePlaybackOnce - classList.add:', err);
          }
          try {
            playTalkingHead(el);
          } catch(err){
            console.error('[snapSlider] Error in initializeActiveCasePlaybackOnce - playTalkingHead:', err);
          }
          try {
            ensureTalkingHeadAutoPlay(el);
          } catch(err){
            console.error('[snapSlider] Error in initializeActiveCasePlaybackOnce - ensureTalkingHeadAutoPlay:', err);
          }
        } else {
          try {
            el.classList.remove('active');
          } catch(err){
            console.error('[snapSlider] Error in initializeActiveCasePlaybackOnce - classList.remove:', err);
          }
          try {
            pauseTalkingHead(el);
          } catch(err){
            console.error('[snapSlider] Error in initializeActiveCasePlaybackOnce - pauseTalkingHead:', err);
          }
          try {
            pauseAndResetVideosInElement(el);
          } catch(err){
            console.error('[snapSlider] Error in initializeActiveCasePlaybackOnce - pauseAndResetVideosInElement:', err);
          }
        }
      });

      // Для каждого wrapper внутри активного кейса — выбрать слайд по центру, обновить прогресс, запустить активный
      var wrappers = qsa(activeCase, '.story-track-wrapper');
      each(wrappers, function(w){
        var slide = null;
        try {
          slide = setActiveSlideInWrapperByCenter(w);
        } catch(err){
          console.error('[snapSlider] Error in initializeActiveCasePlaybackOnce - setActiveSlideInWrapperByCenter:', err);
        }
        try {
          updateWrapperPlayback(w);
        } catch(err){
          console.error('[snapSlider] Error in initializeActiveCasePlaybackOnce - updateWrapperPlayback:', err);
        }
        if (slide){
          try {
            playVideos(slide);
          } catch(err){
            console.error('[snapSlider] Error in initializeActiveCasePlaybackOnce - playVideos:', err);
          }
        }
      });

      // Дополнительно запустить все уже активные слайды в активном кейсе
      var activeSlides = qsa(activeCase, '.story-track-wrapper__slide.active');
      each(activeSlides, function(s){
        try {
          playVideos(s);
        } catch(err){
          console.error('[snapSlider] Error in initializeActiveCasePlaybackOnce - playVideos for active slide:', err);
        }
      });
    } catch(err){
      console.error('[snapSlider] Error in initializeActiveCasePlaybackOnce:', err);
    }
  }

  // Инициализация всего snap-слайдера
  function initSnapSlider(){
    // Активируем user gesture при первом touchstart/touchmove/click для разблокировки autoplay
    try {
      var activateOnGesture = function(){
        if (!USER_GESTURE_ACTIVATED){
          activateUserGesture();
        }
      };
      // Обрабатываем touchstart и touchmove (свайпы) для Telegram WebView
      document.addEventListener('touchstart', activateOnGesture, { passive: true, once: true });
      document.addEventListener('touchmove', activateOnGesture, { passive: true, once: true });
      // Также обрабатываем click на случай, если touch не сработал
      document.addEventListener('click', activateOnGesture, { passive: true, once: true });
    } catch(err){
      console.error('[snapSlider] Error in initSnapSlider - setup user gesture handlers:', err);
    }

    var wrappers = qsa(document, '.story-track-wrapper');
    if (!wrappers || !wrappers.length) return;
    each(wrappers, function(wrapper){
      var slides = qsa(wrapper, '.story-track-wrapper__slide');
      if (!slides || !slides.length) return;

      // Строим прогресс, если он ещё не создан
      if (!qs(wrapper, '.story-progress')){
        try {
          buildProgress(wrapper, slides.length);
        } catch(err){
          console.error('[snapSlider] Error in initSnapSlider - buildProgress:', err);
        }
      }

      // Синхронизируем длительности сегментов с длительностями видео
      try {
        syncProgressDurations(wrapper);
      } catch(err){
        console.error('[snapSlider] Error in initSnapSlider - syncProgressDurations:', err);
      }

      // Запускаем наблюдатель за активным слайдом
      try {
        setupActiveObserver(wrapper);
      } catch(err){
        console.error('[snapSlider] Error in initSnapSlider - setupActiveObserver:', err);
      }

      // Обновляем при изменении размеров окна
      try {
        window.addEventListener('resize', function(){
          try {
            updateWrapperPlayback(wrapper);
          } catch(err){
            console.error('[snapSlider] Error in initSnapSlider - resize handler:', err);
          }
        }, { passive: true });
        window.addEventListener('orientationchange', function(){
          try {
            updateWrapperPlayback(wrapper);
          } catch(err){
            console.error('[snapSlider] Error in initSnapSlider - orientationchange handler:', err);
          }
        }, { passive: true });
      } catch(err){
        console.error('[snapSlider] Error in initSnapSlider - window event listeners:', err);
      }

      // Отслеживаем пользовательские свайпы/прокрутки внутри wrapper, чтобы не перебивать их автопереходами
      try {
        var st = wrapper.__snapState || (wrapper.__snapState = {});
        var onDown = function(){
          // Активируем user gesture при первом touch в wrapper
          if (!USER_GESTURE_ACTIVATED){
            activateUserGesture();
          }
          st.isUserInteracting = true; if (st._uiTimer) clearTimeout(st._uiTimer);
        };
        var onUp = function(){ if (st._uiTimer) clearTimeout(st._uiTimer); st._uiTimer = setTimeout(function(){ st.isUserInteracting = false; }, 300); };
        var onScrollEvt = function(){
          // Активируем user gesture при первом scroll в wrapper
          if (!USER_GESTURE_ACTIVATED){
            activateUserGesture();
          }
          st.isUserInteracting = true;
          if (st._uiTimer) clearTimeout(st._uiTimer);
          st._uiTimer = setTimeout(function(){ st.isUserInteracting = false; }, 150);
        };
        wrapper.addEventListener('pointerdown', onDown, { passive: true });
        wrapper.addEventListener('pointerup', onUp, { passive: true });
        wrapper.addEventListener('pointercancel', onUp, { passive: true });
        wrapper.addEventListener('touchstart', onDown, { passive: true });
        wrapper.addEventListener('touchmove', function(){
          // Также активируем при touchmove для надежности
          if (!USER_GESTURE_ACTIVATED){
            activateUserGesture();
          }
        }, { passive: true });
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
