(function(){
  if (!window.matchMedia || !window.matchMedia('(max-width: 479px)').matches) return;
  // Утилиты
  var PROGRESS_ADVANCE_THRESHOLD = 0.98;
  function qs(root, sel){ return (root||document).querySelector ? (root||document).querySelector(sel) : null; }
  function qsa(root, sel){ return (root||document).querySelectorAll ? (root||document).querySelectorAll(sel) : []; }
  function each(list, cb){ if(!list) return; (list.forEach ? list.forEach(cb) : Array.prototype.forEach.call(list, cb)); }

  // Отслеживание пользовательских жестов для автовоспроизведения
  var userGestureState = {
    lastGestureTime: null,
    gestureWindowMs: 5000, // Окно жеста обычно 5 секунд, но может варьироваться
    gestureTypes: ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown', 'pointerup'],
    videosUnlocked: false, // Флаг того, что видео были разблокированы при первом жесте
    unlockInProgress: false // Флаг процесса разблокировки
  };

  // Разблокировка всех видео при первом жесте пользователя
  function unlockAllVideosOnFirstGesture(){
    if (userGestureState.videosUnlocked || userGestureState.unlockInProgress) return;
    
    userGestureState.unlockInProgress = true;
    
    try {
      var allVideos = qsa(document, 'video');
      if (!allVideos || !allVideos.length) {
        userGestureState.unlockInProgress = false;
        return;
      }
      
      console.log('[snapSlider] 🔓 Разблокировка всех видео при первом жесте пользователя. Всего видео:', allVideos.length);
      
      var unlockedCount = 0;
      var failedCount = 0;
      
      each(allVideos, function(video, idx){
                  try {
                    if (!video || typeof video.play !== 'function') return;
          
          // Сохраняем текущее состояние
          var wasPaused = video.paused;
          var wasMuted = video.muted;
          var currentTime = video.currentTime || 0;
          
          // Проверяем, должно ли это видео быть активным (в активном слайде активного кейса)
          var slideEl = video.closest ? video.closest('.story-track-wrapper__slide') : null;
          var isActiveSlide = !!(slideEl && slideEl.classList && slideEl.classList.contains('active'));
          var caseEl = slideEl ? (slideEl.closest ? slideEl.closest('.cases-grid__item, .case') : null) : null;
          if (!caseEl) {
            // Также проверяем talking-head видео, которые могут быть вне слайдов
            caseEl = video.closest ? video.closest('.cases-grid__item, .case') : null;
          }
          var isActiveCase = !!(caseEl && caseEl.classList && caseEl.classList.contains('active'));
          
          // Talking-head видео тоже должны играть если кейс активен
          var isTalkingHead = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head__video'));
          var shouldBePlaying = (isActiveSlide && isActiveCase) || (isTalkingHead && isActiveCase);
          
          // Убеждаемся что видео muted для автовоспроизведения (временно)
          var originalMuted = video.muted;
          if (!video.muted) {
            video.muted = true;
          }
          
          // Пытаемся запустить видео в контексте жеста
          var playPromise = video.play();
          
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(function(){
              // Видео успешно запущено и разблокировано
              try {
                unlockedCount++;
                video.__unlockedByGesture = true;
                
                if (shouldBePlaying) {
                  // Если видео должно воспроизводиться - оставляем его играть
                  // Не сбрасываем currentTime, чтобы видео продолжало с того места где было
                  // Восстанавливаем muted если нужно
                  if (!originalMuted) {
                    video.muted = originalMuted;
                  }
                  // Убеждаемся что видео не на паузе
                  if (video.paused) {
                    video.play().catch(function(){});
                  }
                  console.log('[snapSlider] ✅ Видео разблокировано и оставлено играть [' + unlockedCount + '/' + allVideos.length + ']:', {
                    src: video.src || video.currentSrc || 'no src',
                    index: idx + 1,
                    paused: video.paused
                  });
                } else {
                  // Если видео не должно воспроизводиться - ставим на паузу и восстанавливаем состояние
                  video.pause();
                  video.currentTime = currentTime; // Возвращаем на исходное время
                  if (!originalMuted) {
                    video.muted = originalMuted; // Восстанавливаем muted если был не muted
                  }
                  console.log('[snapSlider] ✅ Видео разблокировано и приостановлено [' + unlockedCount + '/' + allVideos.length + ']:', {
                    src: video.src || video.currentSrc || 'no src',
                    index: idx + 1
                  });
                }
              } catch(restoreErr){
                console.warn('[snapSlider] Ошибка при восстановлении состояния видео:', restoreErr);
              }
            }).catch(function(err){
              failedCount++;
              console.warn('[snapSlider] ⚠️ Не удалось разблокировать видео [' + failedCount + ']:', {
                src: video.src || video.currentSrc || 'no src',
                error: err ? (err.message || err.name) : 'Unknown',
                index: idx + 1
              });
            });
          } else {
            // Если play() не вернул Promise (старый браузер)
            try {
              unlockedCount++;
              video.__unlockedByGesture = true;
              
              if (!shouldBePlaying && !video.paused) {
                video.pause();
                video.currentTime = currentTime;
              }
              // Если должно быть активным - оставляем играть
            } catch(_){}
          }
        } catch(videoErr){
          failedCount++;
          console.warn('[snapSlider] Ошибка при обработке видео:', videoErr);
        }
      });
      
      // Устанавливаем флаг разблокировки после небольшой задержки, чтобы дать промисам выполниться
      setTimeout(function(){
        userGestureState.videosUnlocked = true;
        userGestureState.unlockInProgress = false;
        console.log('[snapSlider] ✅ Разблокировка завершена. Успешно:', unlockedCount, 'Ошибок:', failedCount);
      }, 500);
      
    } catch(err){
      console.error('[snapSlider] Ошибка при разблокировке видео:', err);
      userGestureState.unlockInProgress = false;
    }
  }

  // Инициализация отслеживания жестов
  function initUserGestureTracking(){
    try {
      // Приоритетный обработчик для touchstart - должен сработать ПЕРВЫМ до всех других обработчиков
      function handleFirstGesture(ev){
        var now = Date.now();
        var isFirstGesture = userGestureState.lastGestureTime === null;
        
        userGestureState.lastGestureTime = now;
        
        // При первом жесте - сразу разблокируем все видео
        if (isFirstGesture) {
          console.log('[snapSlider] 👆 Первый жест пользователя зафиксирован, разблокировка видео:', {
            type: ev.type,
            target: ev.target ? (ev.target.className || ev.target.tagName || ev.target.nodeName) : 'unknown',
            time: new Date(now).toISOString()
          });
          
          // Запускаем разблокировку сразу, без задержки
          unlockAllVideosOnFirstGesture();
        } else {
          console.log('[snapSlider] Пользовательский жест зафиксирован:', {
            type: ev.type,
            target: ev.target ? (ev.target.className || ev.target.tagName || ev.target.nodeName) : 'unknown',
            time: new Date(now).toISOString()
          });
        }
      }
      
      // Обработчики для всех типов жестов, но touchstart/pointerdown - с максимальным приоритетом (capture phase)
      // Используем capture: true чтобы перехватить ДО скролла/свайпа
      // Важно: используем passive: true чтобы не блокировать нативный скролл
      userGestureState.gestureTypes.forEach(function(type){
        // Capture: true обеспечивает приоритет, passive: true не блокирует скролл
        document.addEventListener(type, handleFirstGesture, { capture: true, passive: true });
      });
      
      // Дополнительно добавляем touchstart на window для максимального приоритета (если возможно)
      try {
        if (typeof window !== 'undefined' && window.addEventListener) {
          window.addEventListener('touchstart', handleFirstGesture, { capture: true, passive: true });
        }
      } catch(_){}
      
      // КРИТИЧНО: добавляем обработчики непосредственно на .main-section - основной скроллируемый контейнер
      // Это гарантирует перехват жестов ДО обработки скролла
      var mainSectionHandlersAttached = false;
      
      function attachToMainSection(){
        // Защита от повторного подключения
        if (mainSectionHandlersAttached) return true;
        
        var mainSection = qs(document, '.main-section');
        if (mainSection && mainSection.addEventListener) {
          mainSectionHandlersAttached = true;
          console.log('[snapSlider] Добавлены обработчики жестов на .main-section');
          
          // Приоритетные жесты для перехвата ДО скролла
          var priorityTypes = ['touchstart', 'pointerdown', 'mousedown'];
          priorityTypes.forEach(function(type){
            try {
              mainSection.addEventListener(type, handleFirstGesture, { capture: true, passive: true });
            } catch(_){}
          });
          
          // Остальные жесты тоже добавляем
          userGestureState.gestureTypes.forEach(function(type){
            if (priorityTypes.indexOf(type) === -1) {
              try {
                mainSection.addEventListener(type, handleFirstGesture, { capture: true, passive: true });
              } catch(_){}
            }
          });
          return true; // Успешно подключено
        }
        return false; // Элемент еще не найден
      }
      
      // Пытаемся подключить сразу
      if (!attachToMainSection()) {
        // Если .main-section еще не готов, пробуем с задержками
        setTimeout(function(){
          if (!attachToMainSection()) {
            setTimeout(function(){
              attachToMainSection();
            }, 150);
          }
        }, 50);
        
        // Также используем MutationObserver для динамически загружаемых элементов
        try {
          if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(function(mutations){
              if (!mainSectionHandlersAttached && attachToMainSection()) {
                observer.disconnect();
              }
            });
            
            observer.observe(document.body || document.documentElement, {
              childList: true,
              subtree: true
            });
            
            // Отключаем observer через 5 секунд если элемент не найден
            setTimeout(function(){
              observer.disconnect();
            }, 5000);
          }
        } catch(_){}
      }
      
    } catch(_){}
  }

  // Проверка, не истекло ли окно жеста
  function getUserGestureInfo(){
    var now = Date.now();
    var lastGesture = userGestureState.lastGestureTime;
    var timeSinceGesture = lastGesture ? (now - lastGesture) : null;
    var isGestureValid = lastGesture && timeSinceGesture !== null && timeSinceGesture <= userGestureState.gestureWindowMs;
    
    return {
      hasGesture: lastGesture !== null,
      timeSinceGesture: timeSinceGesture,
      isGestureValid: isGestureValid,
      lastGestureTime: lastGesture ? new Date(lastGesture).toISOString() : null,
      currentTime: new Date(now).toISOString()
    };
  }

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

  // Утилита для логирования ошибок воспроизведения видео
  function logVideoPlayError(video, context, error){
    try {
      var videoInfo = {
        src: video.src || video.currentSrc || 'no src',
        muted: video.muted,
        autoplay: video.autoplay || false,
        paused: video.paused,
        readyState: video.readyState,
        networkState: video.networkState,
        context: context || 'unknown'
      };
      
      var errorInfo = {
        name: error ? (error.name || 'Unknown') : 'Play Promise Rejected',
        message: error ? (error.message || 'No message') : 'Video play() promise was rejected by browser',
        code: error ? (error.code || 'N/A') : 'N/A'
      };
      
      // Получаем информацию о пользовательских жестах
      var gestureInfo = getUserGestureInfo();
      
      var mainMessage = errorInfo.name === 'NotAllowedError' || errorInfo.code === 20 
        ? 'Браузер блокирует автовоспроизведение (autoplay policy). Требуется взаимодействие пользователя.' 
        : errorInfo.message;
      
      // Дополнительная информация если окно жеста истекло
      if (gestureInfo.hasGesture && !gestureInfo.isGestureValid) {
        var secondsSince = gestureInfo.timeSinceGesture ? (gestureInfo.timeSinceGesture / 1000).toFixed(2) : 'N/A';
        mainMessage += ' [ОКНО ЖЕСТА ИСТЕКЛО: прошло ' + secondsSince + ' сек с последнего жеста, лимит ~5 сек]';
      } else if (!gestureInfo.hasGesture) {
        mainMessage += ' [ЖЕСТОВ ПОЛЬЗОВАТЕЛЯ НЕ ЗАФИКСИРОВАНО]';
      }
      
      // Проверяем статус разблокировки
      var isUnlocked = !!(video.__unlockedByGesture);
      if (isUnlocked && (errorInfo.name === 'NotAllowedError' || errorInfo.code === 20)) {
        mainMessage += ' [⚠️ Видео было разблокировано при первом жесте, но браузер всё равно блокирует]';
      }
      
      console.error('[snapSlider] Блокировка автовоспроизведения видео:', {
        'Ошибка': errorInfo,
        'Информация о видео': videoInfo,
        'Статус разблокировки': {
          'Видео разблокировано при первом жесте': isUnlocked,
          'Глобальная разблокировка активна': userGestureState.videosUnlocked
        },
        'Пользовательские жесты': {
          'Есть зафиксированные жесты': gestureInfo.hasGesture,
          'Время с последнего жеста': gestureInfo.timeSinceGesture ? (gestureInfo.timeSinceGesture / 1000).toFixed(2) + ' сек' : 'Нет данных',
          'Окно жеста валидно': gestureInfo.isGestureValid,
          'Время последнего жеста': gestureInfo.lastGestureTime || 'Нет данных',
          'Текущее время': gestureInfo.currentTime
        },
        'Причина': mainMessage,
        'Время': new Date().toISOString()
      });
      
      // Дополнительная диагностика
      if (video.muted === false) {
        console.warn('[snapSlider] Видео не muted - это может быть причиной блокировки. Попробуйте установить video.muted = true');
      }
      if (!video.paused) {
        console.info('[snapSlider] Видео уже воспроизводится');
      }
      if (gestureInfo.hasGesture && !gestureInfo.isGestureValid) {
        console.warn('[snapSlider] ⚠️ Окно пользовательского жеста истекло! Браузер блокирует автовоспроизведение после истечения "окна жеста" (обычно 5 секунд)');
      }
    } catch(logErr){
      console.error('[snapSlider] Ошибка при логировании:', logErr);
    }
  }

  // Здесь только базовое управление воспроизведением: play/pause и сброс времени.
  function playVideos(slideEl, context){
    if (!slideEl) return;
    var videos = qsa(slideEl, '.slide-inner__video-block video, video');
    if (!videos || !videos.length) return;
    var callContext = context || ('playVideos(' + (slideEl.className || 'unknown') + ')');
    each(videos, function(video, idx){
      try {
        if (video && typeof video.play === 'function') { 
              var p = video.play();
          if (p && typeof p.then === 'function') {
                p.then(function(){
              var gestureInfo = getUserGestureInfo();
              console.log('[snapSlider] Видео успешно запущено:', {
                src: video.src || video.currentSrc || 'no src',
                context: callContext + '[' + idx + ']',
                muted: video.muted,
                'Статус разблокировки': {
                  'Видео разблокировано': !!(video.__unlockedByGesture),
                  'Глобальная разблокировка': userGestureState.videosUnlocked
                },
                'Пользовательские жесты': {
                  'Есть жесты': gestureInfo.hasGesture,
                  'Время с последнего жеста': gestureInfo.timeSinceGesture ? (gestureInfo.timeSinceGesture / 1000).toFixed(2) + ' сек' : 'Нет данных',
                  'Окно жеста валидно': gestureInfo.isGestureValid
                }
              });
            }).catch(function(err){
              logVideoPlayError(video, callContext + '[' + idx + ']', err);
            });
          }
        }
      } catch(err){
        logVideoPlayError(video, callContext + '[' + idx + ']', err);
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
    if (v){ 
      try { 
            var p = v.play();
        if (p && typeof p.then === 'function') {
              p.then(function(){
            var gestureInfo = getUserGestureInfo();
            console.log('[snapSlider] Talking-head видео успешно запущено:', {
              src: v.src || v.currentSrc || 'no src',
              muted: v.muted,
              'Пользовательские жесты': {
                'Есть жесты': gestureInfo.hasGesture,
                'Время с последнего жеста': gestureInfo.timeSinceGesture ? (gestureInfo.timeSinceGesture / 1000).toFixed(2) + ' сек' : 'Нет данных',
                'Окно жеста валидно': gestureInfo.isGestureValid
              }
            });
          }).catch(function(err){
            logVideoPlayError(v, 'playTalkingHead', err);
          });
      }
    } catch(err){
        logVideoPlayError(v, 'playTalkingHead', err);
      } 
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
            playTalkingHead(caseEl);
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
              if (idx === activeIdx && caseIsActive) { playVideos(slide, 'updateWrapperPlayback.metaHandler[' + idx + ']'); }
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
          if (activeSlides && activeSlides.length){ each(activeSlides, function(s){ try { playVideos(s, 'setupCasesActiveOnScrollSnap.returnToZone'); } catch(_){ } }); }
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
          try { activeSlide = setActiveSlideInWrapperByCenter(w); } catch(_){ }
          try { updateWrapperPlayback(w); } catch(_){ }
          if (activeSlide) { try { playVideos(activeSlide, 'setupCasesActiveOnScrollSnap.setActiveByCenter'); } catch(_){ } }
        });

        // Запускаем видео только в активных слайдах внутри активного кейса
        var activeSlidesInCase = qsa(best, '.story-track-wrapper__slide.active');
        each(activeSlidesInCase, function(s){ try { playVideos(s, 'setupCasesActiveOnScrollSnap.activeSlides'); } catch(_){ } });

        lastActiveCase = best;
      }
    }

    function onScroll(){
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
            if (slide === bestSlide){ try { slide.classList.add('active'); } catch(_){ } }
            else { try { slide.classList.remove('active'); } catch(_){ } }
          });
          updateWrapperPlayback(wrapperEl);
          // После присвоения active — запускаем видео в активном слайде
          try { playVideos(bestSlide, 'setupActiveObserver.bestSlide'); } catch(_){ }
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
        if (slide){ try { playVideos(slide, 'initializeActiveCasePlaybackOnce.setActiveByCenter'); } catch(_){ } }
      });

      // Дополнительно запустить все уже активные слайды в активном кейсе
      var activeSlides = qsa(activeCase, '.story-track-wrapper__slide.active');
      each(activeSlides, function(s){ try { playVideos(s, 'initializeActiveCasePlaybackOnce.activeSlides'); } catch(_){ } });
    } catch(_){ }
  }

  // Разблокировка одного видео (для динамически добавляемых)
  function unlockSingleVideo(video){
    if (!video || video.__unlockedByGesture || typeof video.play !== 'function') return false;
    
    try {
      var wasPaused = video.paused;
      var originalMuted = video.muted;
      var currentTime = video.currentTime || 0;
      
      if (!video.muted) {
        video.muted = true;
      }
      
      var playPromise = video.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(function(){
          try {
            video.pause();
            video.currentTime = currentTime;
            if (!originalMuted) {
              video.muted = originalMuted;
            }
            video.__unlockedByGesture = true;
            return true;
          } catch(_){ return false; }
        }).catch(function(){ return false; });
      } else {
        if (!video.paused) {
          video.pause();
          video.currentTime = currentTime;
        }
        video.__unlockedByGesture = true;
        return true;
      }
    } catch(_){ return false; }
    return false;
  }

  // Глобальная установка обработчиков ошибок воспроизведения для всех видео
  function setupVideoErrorHandlers(){
    try {
            var allVideos = qsa(document, 'video');
            each(allVideos, function(video){
              // Если разблокировка уже выполнена, пытаемся разблокировать это видео тоже
              if (userGestureState.videosUnlocked && !video.__unlockedByGesture) {
                unlockSingleVideo(video);
              }
        // Логируем ошибки загрузки/воспроизведения
        if (!video.__errorHandlerAttached) {
          video.addEventListener('error', function(ev){
            var err = video.error;
            console.error('[snapSlider] Ошибка видео элемента:', {
              src: video.src || video.currentSrc || 'no src',
              error: err ? {
                code: err.code,
                message: err.message || 'Unknown video error'
              } : 'Unknown error',
              readyState: video.readyState,
              networkState: video.networkState,
              time: new Date().toISOString()
            });
          }, { passive: true });
          
          // Логируем когда видео заблокировано политикой автовоспроизведения
          video.addEventListener('play', function(){
            var gestureInfo = getUserGestureInfo();
            console.log('[snapSlider] Видео начало воспроизведение (событие play):', {
              src: video.src || video.currentSrc || 'no src',
              muted: video.muted,
              paused: video.paused,
              'Пользовательские жесты': {
                'Есть жесты': gestureInfo.hasGesture,
                'Время с последнего жеста': gestureInfo.timeSinceGesture ? (gestureInfo.timeSinceGesture / 1000).toFixed(2) + ' сек' : 'Нет данных',
                'Окно жеста валидно': gestureInfo.isGestureValid
              }
            });
          }, { passive: true });
          
          video.__errorHandlerAttached = true;
        }
      });
    } catch(_){}
  }

  // Инициализация всего snap-слайдера
  function initSnapSlider(){
    // Устанавливаем глобальные обработчики ошибок для видео
    setupVideoErrorHandlers();

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
        try { playVideos(slides[nextIdx], 'clickHandler.tapZone'); } catch(_){ }
        // Даем snap «досесть» и синхронизируем active и воспроизведение по центру
        try {
          setTimeout(function(){
            try {
              var actual = setActiveSlideInWrapperByCenter(wrapper);
              updateWrapperPlayback(wrapper);
              if (actual) { playVideos(actual, 'clickHandler.afterSettle'); }
            } catch(__){}
          }, 160);
        } catch(__){}
      });
    } catch(_){ }
  }

  if (typeof document !== 'undefined'){
    // Инициализируем отслеживание жестов как можно раньше
    initUserGestureTracking();
    
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
