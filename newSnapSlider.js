(function(){
  if (!window.matchMedia || !window.matchMedia('(max-width: 479px)').matches) return;
  // Утилиты
  var PROGRESS_ADVANCE_THRESHOLD = 0.98;
  function qs(root, sel){ return (root||document).querySelector ? (root||document).querySelector(sel) : null; }
  function qsa(root, sel){ return (root||document).querySelectorAll ? (root||document).querySelectorAll(sel) : []; }
  function each(list, cb){ if(!list) return; (list.forEach ? list.forEach(cb) : Array.prototype.forEach.call(list, cb)); }

  // Глобальный флаг onSound для управления звуком видео (по умолчанию false)
  var onSound = false;

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

  // Здесь только базовое управление воспроизведением: play/pause и сброс времени.
  function playVideos(slideEl){
    if (!slideEl) return;
    var videos = qsa(slideEl, '.slide-inner__video-block video, video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      try { if (video && typeof video.play === 'function') { var p = video.play(); if (p && p.catch) p.catch(function(){}); } } catch(_){ }
    });
  }

  function pauseAndResetVideos(slideEl){
    if (!slideEl) return;
    var videos = qsa(slideEl, '.slide-inner__video-block video, video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      var isTalking = false;
      try { isTalking = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head__video')); } catch(__){}
      if (isTalking) return;
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

  // Вспомогательные функции для работы с видео (создание source, загрузка, проверка готовности)
  function hasVideoSource(video){
    if (!video) return false;
    try {
      // Проверяем наличие source элемента или src атрибута
      var hasSourceEl = video.querySelector && video.querySelector('source') !== null;
      var hasSrc = !!(video.src && video.src.length > 0);
      return hasSourceEl || hasSrc;
    } catch(_){ return false; }
  }

  function isVideoReady(video){
    if (!video) return false;
    try {
      if (!hasVideoSource(video)) return false;
      // Проверяем readyState (HAVE_FUTURE_DATA = 3, HAVE_ENOUGH_DATA = 4)
      return video.readyState >= 3;
    } catch(_){ return false; }
  }

  function createSourceFromAttributes(video, isTalkingHead){
    if (!video) return false;
    try {
      // Проверяем флаг, что source уже был создан
      if (video.__snapSliderSourceCreated) {
        console.log('[snapSlider] Source уже был создан ранее для этого видео, пропускаем', video);
        return false;
      }

      // Если source уже есть в DOM, помечаем и пропускаем
      if (hasVideoSource(video)) {
        console.log('[snapSlider] Видео уже имеет source в DOM, помечаем как созданное', video);
        video.__snapSliderSourceCreated = true;
        return false;
      }

      // Для talking head используем mob-data-src, для остальных - data-src
      var srcAttr = null;
      if (isTalkingHead) {
        srcAttr = video.getAttribute ? video.getAttribute('mob-data-src') : null;
        if (!srcAttr && video.dataset && video.dataset.mobSrc) {
          srcAttr = video.dataset.mobSrc;
        }
      } else {
        srcAttr = video.getAttribute ? video.getAttribute('data-src') : null;
        if (!srcAttr && video.dataset && video.dataset.src) {
          srcAttr = video.dataset.src;
        }
      }

      if (!srcAttr || !srcAttr.length) {
        console.log('[snapSlider] Видео не имеет атрибута ' + (isTalkingHead ? 'mob-data-src' : 'data-src'), video);
        return false;
      }

      console.log('[snapSlider] Создаем source для видео из атрибута:', srcAttr, video);
      
      // Создаем source элемент
      var source = document.createElement('source');
      source.src = srcAttr;
      source.type = 'video/mp4';
      
      // Добавляем source в video
      video.appendChild(source);
      
      // Помечаем, что source был создан
      video.__snapSliderSourceCreated = true;
      
      console.log('[snapSlider] Source создан и добавлен в видео', video);
      return true;
    } catch(e){ 
      console.error('[snapSlider] Ошибка при создании source для видео', e);
      return false;
    }
  }

  function loadVideoIfNeeded(video){
    if (!video) return;
    try {
      // Проверяем флаг, что load уже был вызван
      if (video.__snapSliderLoadCalled) {
        console.log('[snapSlider] load() уже был вызван ранее для этого видео, пропускаем', video);
        return;
      }

      if (hasVideoSource(video)) {
        console.log('[snapSlider] Видео имеет source, вызываем load()', video);
        video.load();
        // Помечаем, что load был вызван
        video.__snapSliderLoadCalled = true;
      } else {
        console.log('[snapSlider] Видео не имеет source, пропускаем load', video);
      }
    } catch(e){ 
      console.error('[snapSlider] Ошибка при вызове load() для видео', e);
    }
  }

  // Получаем все видео в кейсе (story-track + talking-head)
  function getAllCaseVideos(caseEl){
    if (!caseEl) return [];
    var videos = [];
    try {
      // Видео из story-track-wrapper
      var wrappers = qsa(caseEl, '.story-track-wrapper');
      each(wrappers, function(wrapper){
        var wrapperVideos = qsa(wrapper, 'video');
        each(wrapperVideos, function(v){ videos.push(v); });
      });
      // Talking-head видео
      var talkingHeadVideos = qsa(caseEl, '.cases-grid__item__container__wrap__talking-head video');
      each(talkingHeadVideos, function(v){ videos.push(v); });
      // Убираем дубликаты
      return Array.from(new Set(videos));
    } catch(_){ return []; }
  }

  // Получаем talking-head видео из кейса
  function getTalkingHeadVideos(caseEl){
    if (!caseEl) return [];
    try {
      return qsa(caseEl, '.cases-grid__item__container__wrap__talking-head video');
    } catch(_){ return []; }
  }

  // Получаем видео из активного слайда в кейсе
  function getActiveSlideVideos(caseEl){
    if (!caseEl) return [];
    var videos = [];
    try {
      var activeSlides = qsa(caseEl, '.story-track-wrapper__slide.active');
      each(activeSlides, function(slide){
        var slideVideos = qsa(slide, 'video');
        each(slideVideos, function(v){ videos.push(v); });
      });
      return Array.from(new Set(videos));
    } catch(_){ return []; }
  }

  // Получаем видео из первого слайда в кейсе
  function getFirstSlideVideos(caseEl){
    if (!caseEl) return [];
    var videos = [];
    try {
      var wrappers = qsa(caseEl, '.story-track-wrapper');
      each(wrappers, function(wrapper){
        var slides = qsa(wrapper, '.story-track-wrapper__slide');
        if (slides && slides.length > 0){
          var firstSlide = slides[0];
          var slideVideos = qsa(firstSlide, 'video');
          each(slideVideos, function(v){ videos.push(v); });
        }
      });
      // Убираем дубликаты
      return Array.from(new Set(videos));
    } catch(_){ return []; }
  }

  // Функция для безопасного запуска видео с повторными попытками
  // Соответствует политике автозапуска WebKit/Safari:
  // - Видео может автозапускаться только если оно muted и имеет playsinline
  // - После первого пользовательского взаимодействия можно запускать видео со звуком
  function safePlayVideo(video, retries, delay){
    if (!video) return;
    retries = retries || 3;
    delay = delay || 300;
    
    try {
      console.log('[snapSlider] Попытка запуска видео', video);
      
      // Устанавливаем атрибуты согласно политике WebKit для автозапуска
      try {
        // playsinline обязателен для iOS Safari
        if (!video.hasAttribute('playsinline')){
          video.setAttribute('playsinline', '');
          console.log('[snapSlider] Установлен атрибут playsinline для видео', video);
        }
        
        // webkit-playsinline для обратной совместимости со старыми версиями iOS
        if (!video.hasAttribute('webkit-playsinline')){
          video.setAttribute('webkit-playsinline', '');
          console.log('[snapSlider] Установлен атрибут webkit-playsinline для видео', video);
        }
        
        // Для автозапуска без пользовательского взаимодействия видео должно быть muted
        // Проверяем, был ли звук явно включен пользователем через window.CasesAudio.soundOn
        var soundWasEnabledByUser = typeof window !== 'undefined' && 
                                     window.CasesAudio && 
                                     window.CasesAudio.soundOn === true;
        
        // Проверяем наличие атрибута muted в HTML (не только свойство muted)
        var hasMutedAttr = video.hasAttribute('muted');
        var wasExplicitlyUnmuted = video.__snapSliderWasExplicitlyUnmuted;
        
        // Если звук был включен пользователем или видео было явно размучено, не меняем muted
        // Если атрибута muted нет и звук не был включен пользователем, устанавливаем muted для автозапуска
        if (!soundWasEnabledByUser && !wasExplicitlyUnmuted && !hasMutedAttr){
          video.muted = true;
          video.setAttribute('muted', '');
          console.log('[snapSlider] Установлен muted для автозапуска видео (политика WebKit)', video);
        } else if (hasMutedAttr){
          // Убеждаемся, что свойство muted соответствует атрибуту
          if (video.muted !== true){
            video.muted = true;
            console.log('[snapSlider] Синхронизировано muted=true с атрибутом muted', video);
          }
        } else if (soundWasEnabledByUser || wasExplicitlyUnmuted){
          // Если звук был включен пользователем, не устанавливаем muted
          console.log('[snapSlider] Звук был включен пользователем, не устанавливаем muted', video);
        }
      } catch(e){ 
        console.warn('[snapSlider] Ошибка при установке атрибутов для автозапуска:', e);
      }
      
      var p = video.play();
      if (p && typeof p.then === 'function'){
        p.then(function(){
          console.log('[snapSlider] Видео успешно запущено', video);
        }).catch(function(error){
          var errorName = error ? (error.name || '') : '';
          var isNotAllowed = errorName === 'NotAllowedError' || 
                            (error && error.message && error.message.indexOf('not allowed') !== -1);
          
          if (isNotAllowed){
            // NotAllowedError означает, что браузер блокирует автозапуск согласно политике автозапуска
            // Это нормальное поведение для видео без пользовательского взаимодействия
            // Не повторяем попытки для этой ошибки - они бесполезны до первого взаимодействия
            console.warn('[snapSlider] Браузер блокирует автозапуск видео (NotAllowedError). Видео запустится после пользовательского взаимодействия.', {
              video: video,
              error: errorName,
              policy: 'WebKit Autoplay Policy: видео может автозапускаться только если muted и имеет playsinline, либо после пользовательского взаимодействия'
            });
            // Помечаем видео, чтобы не пытаться запускать его снова автоматически
            try { video.__snapSliderAutoplayBlocked = true; } catch(_){}
            return;
          }
          
          console.warn('[snapSlider] Ошибка play видео (попытка ' + (4 - retries) + '):', error, video);
          if (retries > 0){
            // Повторяем попытку через delay только для других ошибок
            setTimeout(function(){
              safePlayVideo(video, retries - 1, delay);
            }, delay);
          } else {
            console.error('[snapSlider] Не удалось запустить видео после всех попыток', video);
          }
        });
      }
    } catch(e){
      var errorName = e ? (e.name || '') : '';
      var isNotAllowed = errorName === 'NotAllowedError' || 
                        (e && e.message && e.message.indexOf('not allowed') !== -1);
      
      if (isNotAllowed){
        console.warn('[snapSlider] Браузер блокирует автозапуск видео (NotAllowedError). Видео запустится после пользовательского взаимодействия.', {
          video: video,
          error: errorName,
          policy: 'WebKit Autoplay Policy: видео может автозапускаться только если muted и имеет playsinline, либо после пользовательского взаимодействия'
        });
        try { video.__snapSliderAutoplayBlocked = true; } catch(_){}
        return;
      }
      
      console.error('[snapSlider] Исключение при вызове play():', e, video);
      if (retries > 0){
        setTimeout(function(){
          safePlayVideo(video, retries - 1, delay);
        }, delay);
      }
    }
  }

  // Создание source элементов для видео в соседних кейсах (index-1 и index+1)
  function createSourceForAdjacentCases(activeCaseEl){
    if (!activeCaseEl) return;
    
    try {
      // Находим все кейсы
      var scroller = (document && document.querySelector) ? document.querySelector('.main-section') : null;
      if (!scroller) return;
      var allCases = scroller.querySelectorAll ? scroller.querySelectorAll('.cases-grid__item, .case') : null;
      if (!allCases || !allCases.length) return;
      
      // Преобразуем NodeList в массив для удобства работы
      var casesArray = Array.prototype.slice.call(allCases);
      
      // Находим индекс активного кейса
      var activeIndex = casesArray.indexOf(activeCaseEl);
      if (activeIndex === -1) return;
      
      console.log('[snapSlider] Создание source элементов для соседних кейсов', {
        activeIndex: activeIndex,
        totalCases: casesArray.length
      });
      
      // Обрабатываем соседние кейсы (index-1 и index+1)
      var adjacentIndices = [activeIndex - 1, activeIndex + 1];
      
      each(adjacentIndices, function(adjIndex){
        // Проверяем, что индекс валидный
        if (adjIndex < 0 || adjIndex >= casesArray.length) return;
        
        var adjacentCase = casesArray[adjIndex];
        if (!adjacentCase) return;
        
        console.log('[snapSlider] Обработка соседнего кейса (index ' + adjIndex + ')', adjacentCase);
        
        // Находим все видео в соседнем кейсе
        var adjacentVideos = getAllCaseVideos(adjacentCase);
        var adjacentTalkingHeadVideos = getTalkingHeadVideos(adjacentCase);
        
        // Создаем source для talking head видео (используем mob-data-src)
        each(adjacentTalkingHeadVideos, function(video){
          if (!video) return;
          var created = createSourceFromAttributes(video, true);
          if (created) {
            console.log('[snapSlider] Source создан для talking head видео в соседнем кейсе (index ' + adjIndex + ')', video);
            // Не вызываем load() для соседних кейсов - только создаем source для предзагрузки
          }
        });
        
        // Создаем source для остальных видео (используем data-src)
        each(adjacentVideos, function(video){
          if (!video) return;
          // Пропускаем talking head, так как они уже обработаны
          var isTalking = false;
          try { isTalking = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head__video')); } catch(__){}
          if (!isTalking) {
            var created = createSourceFromAttributes(video, false);
            if (created) {
              console.log('[snapSlider] Source создан для видео в соседнем кейсе (index ' + adjIndex + ')', video);
              // Не вызываем load() для соседних кейсов - только создаем source для предзагрузки
            }
          }
        });
      });
    } catch(e){
      console.warn('[snapSlider] Ошибка при создании source для соседних кейсов:', e);
    }
  }

  // Обработка смены активного кейса
  function handleActiveCaseChange(newCaseEl){
    if (!newCaseEl) return;
    console.log('[snapSlider] Обработка смены активного кейса', newCaseEl);
    
    // 1. Находим все видео и talking head в новом кейсе
    var allVideos = getAllCaseVideos(newCaseEl);
    var talkingHeadVideos = getTalkingHeadVideos(newCaseEl);
    console.log('[snapSlider] Найдено видео в кейсе:', {
      total: allVideos.length,
      talkingHead: talkingHeadVideos.length,
      all: allVideos
    });

    // 1.3. Сбрасываем currentTime = 0 для talking head при включенном звуке
    if (onSound && talkingHeadVideos && talkingHeadVideos.length > 0){
      each(talkingHeadVideos, function(video){
        if (!video) return;
        try {
          video.currentTime = 0;
          console.log('[snapSlider] Сброшен currentTime = 0 для talking head при смене активного кейса (звук включен)', video);
        } catch(e){
          console.warn('[snapSlider] Ошибка при сбросе currentTime для talking head при смене кейса:', e, video);
        }
      });
    }

    // 1.5. Создаем source элементы из атрибутов data-src и mob-data-src
    console.log('[snapSlider] Создание source элементов для видео');
    
    // Для talking head используем mob-data-src
    each(talkingHeadVideos, function(video){
      var created = createSourceFromAttributes(video, true);
      if (created) {
        console.log('[snapSlider] Source создан для talking head видео', video);
        // Вызываем load сразу после создания source
        loadVideoIfNeeded(video);
      } else if (hasVideoSource(video)) {
        // Если source уже был, вызываем load (с проверкой флага внутри)
        loadVideoIfNeeded(video);
      }
    });
    
    // Для остальных видео используем data-src
    each(allVideos, function(video){
      // Пропускаем talking head, так как они уже обработаны
      var isTalking = false;
      try { isTalking = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head__video')); } catch(__){}
      if (!isTalking) {
        var created = createSourceFromAttributes(video, false);
        if (created) {
          console.log('[snapSlider] Source создан для видео', video);
          // Вызываем load сразу после создания source
          loadVideoIfNeeded(video);
        } else if (hasVideoSource(video)) {
          // Если source уже был, вызываем load (с проверкой флага внутри)
          loadVideoIfNeeded(video);
        }
      }
    });
    
    // 1.6. Создаем source элементы для соседних кейсов (index-1 и index+1) для предзагрузки
    createSourceForAdjacentCases(newCaseEl);

    // 3. Через 100мс проверяем готовность talking head и активного слайда
    setTimeout(function(){
      console.log('[snapSlider] Проверка готовности видео через 100мс');
      
      var activeSlideVideos = getActiveSlideVideos(newCaseEl);
      var videosToCheck = [];
      
      // Добавляем talking head видео
      each(talkingHeadVideos, function(v){ videosToCheck.push(v); });
      // Добавляем видео активного слайда
      each(activeSlideVideos, function(v){ videosToCheck.push(v); });
      
      // Убираем дубликаты
      videosToCheck = Array.from(new Set(videosToCheck));
      
      console.log('[snapSlider] Видео для проверки готовности:', {
        talkingHead: talkingHeadVideos.length,
        activeSlide: activeSlideVideos.length,
        total: videosToCheck.length
      });

      var allReady = true;
      each(videosToCheck, function(video){
        var ready = isVideoReady(video);
        console.log('[snapSlider] Видео готово:', ready, video);
        if (!ready) allReady = false;
      });

      if (!allReady){
        console.log('[snapSlider] Не все видео готовы, повторяем проверку через 200мс');
        // Повторяем проверку через 200мс
        setTimeout(function(){
          console.log('[snapSlider] Повторная проверка готовности видео через 200мс');
          
          var allReadyRetry = true;
          each(videosToCheck, function(video){
            var ready = isVideoReady(video);
            console.log('[snapSlider] Видео готово (повторная проверка):', ready, video);
            if (!ready) allReadyRetry = false;
          });

          if (allReadyRetry){
            console.log('[snapSlider] Все видео готовы, вызываем play()');
            // 4. Когда проверка пройдена, вызываем play
            each(talkingHeadVideos, function(video){
              try {
                if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function'){
                  var p = video.play();
                  if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play talking head:', e); });
                }
              } catch(e){ console.error('[snapSlider] Ошибка play talking head:', e); }
            });
            each(activeSlideVideos, function(video){
              try {
                if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function'){
                  var p = video.play();
                  if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); });
                }
              } catch(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); }
            });
          } else {
            console.log('[snapSlider] Видео все еще не готовы после повторной проверки');
            // Пытаемся запустить даже если не все готовы
            each(talkingHeadVideos, function(video){
              try {
                if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function'){
                  var p = video.play();
                  if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play talking head:', e); });
                }
              } catch(e){ console.error('[snapSlider] Ошибка play talking head:', e); }
            });
            each(activeSlideVideos, function(video){
              try {
                if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function'){
                  var p = video.play();
                  if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); });
                }
              } catch(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); }
            });
          }
        }, 200);
      } else {
        console.log('[snapSlider] Все видео готовы сразу, вызываем play()');
        // 4. Когда проверка пройдена, вызываем play
        each(talkingHeadVideos, function(video){
          try {
            if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function'){
              var p = video.play();
              if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play talking head:', e); });
            }
          } catch(e){ console.error('[snapSlider] Ошибка play talking head:', e); }
        });
        each(activeSlideVideos, function(video){
          try {
            if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function'){
              var p = video.play();
              if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); });
            }
          } catch(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); }
        });
      }
    }, 100);
  }

  // Обработка смены активного слайда
  function handleActiveSlideChange(slideEl, caseEl){
    if (!slideEl || !caseEl) return;
    console.log('[snapSlider] Обработка смены активного слайда', slideEl);
    
    var activeSlideVideos = qsa(slideEl, 'video');
    if (!activeSlideVideos || !activeSlideVideos.length){
      console.log('[snapSlider] В активном слайде нет видео');
      return;
    }
    
    console.log('[snapSlider] Найдено видео в активном слайде:', activeSlideVideos.length);

    // 1. Создаем source элементы из атрибутов data-src для видео в активном слайде
    console.log('[snapSlider] Создание source элементов для видео активного слайда');
    each(activeSlideVideos, function(video){
      var created = createSourceFromAttributes(video, false);
      if (created) {
        console.log('[snapSlider] Source создан для видео активного слайда', video);
        // Вызываем load после создания source
        loadVideoIfNeeded(video);
      } else if (hasVideoSource(video)) {
        // Если source уже был, вызываем load (с проверкой флага внутри)
        loadVideoIfNeeded(video);
      }
    });

    // 2. Проверяем готовность видео
    function checkAndPlay(){
      console.log('[snapSlider] Проверка готовности видео активного слайда');
      
      var allReady = true;
      each(activeSlideVideos, function(video){
        var ready = isVideoReady(video);
        console.log('[snapSlider] Видео активного слайда готово:', ready, video);
        if (!ready) allReady = false;
      });

      if (!allReady){
        console.log('[snapSlider] Видео активного слайда не готовы, повторяем проверку через 100мс');
        // Повторяем проверку через 100мс
        setTimeout(checkAndPlay, 100);
      } else {
        console.log('[snapSlider] Все видео активного слайда готовы, вызываем play()');
        // 2. Когда проверка пройдена, вызываем play
        each(activeSlideVideos, function(video){
          try {
            if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function'){
              var p = video.play();
              if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); });
            }
          } catch(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); }
        });
      }
    }

    checkAndPlay();
  }

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

  // Получить слайд внутри wrapper по близости к центру wrapper (без установки active)
  function getSlideByCenter(wrapperEl){
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
    return best;
  }

  // Установить active для слайда внутри wrapper по центру (единоразово при смене кейса)
  function setActiveSlideInWrapperByCenter(wrapperEl){
    if (!wrapperEl) return null;
    var slides = qsa(wrapperEl, '.story-track-wrapper__slide');
    if (!slides || !slides.length) return null;
    var best = getSlideByCenter(wrapperEl);
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
  function playTalkingHead(root){ var v = getTalkingHeadVideo(root); if (v){ try { var p=v.play(); if (p&&p.catch) p.catch(function(){}); } catch(_){ } } }
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
              // Автопереход по 98%: переключаемся на следующий слайд, если его нет - на первый, если всего 1 слайд - ничего не делаем
              try {
                if (p >= PROGRESS_ADVANCE_THRESHOLD && !slide.__progressAdvancedOnce){
                  slide.__progressAdvancedOnce = true;
                  var st = wrapperEl.__snapState || {};
                  if (!st.isUserInteracting && !st.autoScrollLock && slides.length > 1){
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
            // Автопереход по 98%: переключаемся на следующий слайд, если его нет - на первый, если всего 1 слайд - ничего не делаем
            try {
              if (p >= PROGRESS_ADVANCE_THRESHOLD && !slide.__progressAdvancedOnce){
                slide.__progressAdvancedOnce = true;
                var st = wrapperEl.__snapState || {};
                if (!st.isUserInteracting && !st.autoScrollLock && slides.length > 1){
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
            // Автопереход по ended отключен - active определяет только IntersectionObserver
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

        // Единоразово устанавливаем active для слайда по центру каждого wrapper при смене кейса
        // Дальше IntersectionObserver будет управлять active
        var wrappersInCase = qsa(best, '.story-track-wrapper');
        each(wrappersInCase, function(w){
          try { setActiveSlideInWrapperByCenter(w); } catch(_){ }
          try { updateWrapperPlayback(w); } catch(_){ }
        });

        // Обрабатываем смену активного кейса (загрузка и воспроизведение видео)
        try { handleActiveCaseChange(best); } catch(e){ console.error('[snapSlider] Ошибка при обработке смены кейса:', e); }

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
    var lastActiveSlide = null; // Запоминаем последний активный слайд

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
          // Проверяем, изменился ли активный слайд
          var slideChanged = (bestSlide !== lastActiveSlide);
          
          if (slideChanged){
          each(slides, function(slide){
            if (slide === bestSlide){ try { slide.classList.add('active'); } catch(_){ } }
            else { try { slide.classList.remove('active'); } catch(_){ } }
          });
            lastActiveSlide = bestSlide;
          updateWrapperPlayback(wrapperEl);
            // Обрабатываем смену активного слайда только если он действительно изменился
            try { handleActiveSlideChange(bestSlide, caseEl); } catch(e){ console.error('[snapSlider] Ошибка при обработке смены слайда:', e); }
          } else {
            // Если слайд не изменился, только обновляем playback (без вызова handleActiveSlideChange)
            updateWrapperPlayback(wrapperEl);
          }
        }
      }
    }, { root: wrapperEl, threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] });

    each(slides, function(slide){ io.observe(slide); });

    // Начальная инициализация
    setTimeout(function(){ 
      // Устанавливаем начальный активный слайд
      var initialActive = qs(wrapperEl, '.story-track-wrapper__slide.active');
      if (initialActive) {
        lastActiveSlide = initialActive;
      }
      updateWrapperPlayback(wrapperEl); 
    }, 0);
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

      // Единоразово устанавливаем active для слайда по центру каждого wrapper при начальной инициализации
      // Дальше IntersectionObserver будет управлять active
      var wrappers = qsa(activeCase, '.story-track-wrapper');
      each(wrappers, function(w){
        try { setActiveSlideInWrapperByCenter(w); } catch(_){ }
        try { updateWrapperPlayback(w); } catch(_){ }
      });

      // Обрабатываем начальную загрузку и воспроизведение для активного кейса
      try { handleActiveCaseChange(activeCase); } catch(e){ console.error('[snapSlider] Ошибка при начальной обработке кейса:', e); }
    } catch(_){ }
  }

  // Инициализация всего snap-слайдера
  function initSnapSlider(){
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

    // Управление звуком через .action-bar__mute-btn
    (function(){
      // Используем общий флаг onSound из области видимости IIFE

      // Функция для обновления иконок во всех .action-bar__mute-btn
      function updateMuteButtonsIcons(soundOn){
        var muteButtons = qsa(document, '.action-bar__mute-btn');
        each(muteButtons, function(btn){
          if (!btn) return;
          var icons = qsa(btn, '.action-bar__mute-btn__icon');
          if (icons && icons.length >= 2){
            var firstIcon = icons[0];
            var secondIcon = icons[1];
            
            if (soundOn){
              // onSound = true: убираем active у первого, добавляем второму
              try { firstIcon.classList.remove('active'); } catch(_){}
              try { secondIcon.classList.add('active'); } catch(_){}
            } else {
              // onSound = false: добавляем active первому, убираем у второго
              try { firstIcon.classList.add('active'); } catch(_){}
              try { secondIcon.classList.remove('active'); } catch(_){}
            }
          }
        });
      }

      // Функция для управления звуком видео в кейсах
      function applySoundToVideos(soundOn){
        var allCases = qsa(document, '.cases-grid__item, .case');
        if (!allCases || !allCases.length) return;

        each(allCases, function(caseEl){
          if (!caseEl) return;

          var talkingHeadVideos = getTalkingHeadVideos(caseEl);
          var hasTalkingHead = talkingHeadVideos && talkingHeadVideos.length > 0;
          var muteButton = qs(caseEl, '.action-bar__mute-btn');
          var hasMuteButton = !!muteButton;

          var videosToControl = [];

          // 1. Если есть talking head - то только у него
          if (hasTalkingHead){
            videosToControl = talkingHeadVideos;
          }
          // 2. Если talking head нет и есть .action-bar__mute-btn, то только у видео в первом слайде
          else if (!hasTalkingHead && hasMuteButton){
            videosToControl = getFirstSlideVideos(caseEl);
          }
          // 3. Если talking head нет и нет .action-bar__mute-btn, то пропускаем
          // (videosToControl остается пустым)

          // Применяем звук к найденным видео
          each(videosToControl, function(video){
            if (!video) return;
            try {
              video.muted = !soundOn;
              console.log('[snapSlider] Установлен muted =', !soundOn, 'для видео', video, '(onSound =', soundOn + ')');
              
              // Сбрасываем currentTime = 0 для talking head при включении звука
              if (soundOn && hasTalkingHead){
                // Проверяем, что это talking head видео
                var isTalkingHeadVideo = false;
                try {
                  isTalkingHeadVideo = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head'));
                } catch(_){}
                
                if (isTalkingHeadVideo){
                  try {
                    video.currentTime = 0;
                    console.log('[snapSlider] Сброшен currentTime = 0 для talking head видео при включении звука', video);
                  } catch(e){
                    console.warn('[snapSlider] Ошибка при сбросе currentTime для talking head:', e, video);
                  }
                }
              }
            } catch(e){
              console.warn('[snapSlider] Ошибка при установке muted для видео:', e, video);
            }
          });
        });
      }

      // Обработчик клика по .action-bar__mute-btn
      function handleMuteButtonClick(ev){
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch(_){}

        // Переключаем флаг
        onSound = !onSound;
        console.log('[snapSlider] Переключение звука: onSound =', onSound);

        // Обновляем иконки во всех .action-bar__mute-btn
        updateMuteButtonsIcons(onSound);

        // Применяем звук к видео в кейсах
        applySoundToVideos(onSound);
      }

      // Инициализация обработчиков для всех .action-bar__mute-btn
      function initMuteButtons(){
        var muteButtons = qsa(document, '.action-bar__mute-btn');
        if (!muteButtons || !muteButtons.length) return;

        console.log('[snapSlider] Инициализация обработчиков для .action-bar__mute-btn:', muteButtons.length);

        each(muteButtons, function(btn){
          if (!btn) return;
          // Удаляем старый обработчик, если был
          try { btn.removeEventListener('click', handleMuteButtonClick); } catch(_){}
          // Добавляем новый обработчик
          try { btn.addEventListener('click', handleMuteButtonClick); } catch(_){}
        });

        // Инициализируем иконки согласно начальному состоянию onSound = false
        updateMuteButtonsIcons(false);
      }

      // Инициализируем при загрузке DOM
      if (document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', initMuteButtons, { once: true });
      } else {
        initMuteButtons();
      }
    })();

    // Обработчик первого пользовательского взаимодействия для снятия блокировки автозапуска
    // После первого взаимодействия браузер разрешает запуск видео (включая со звуком)
    function onFirstUserInteraction(){
      console.log('[snapSlider] Первое пользовательское взаимодействие, снимаем блокировку автозапуска (политика WebKit)');
      
      // Снимаем флаг блокировки со всех видео в активном кейсе и пытаемся запустить
      var activeCase = qs(document, '.cases-grid__item.active, .case.active');
      if (activeCase){
        var allVideos = getAllCaseVideos(activeCase);
        each(allVideos, function(video){
          if (!video) return;
          
          // Снимаем блокировку, если она была установлена
          if (video.__snapSliderAutoplayBlocked){
            console.log('[snapSlider] Снимаем блокировку автозапуска для видео', video);
            try { video.__snapSliderAutoplayBlocked = false; } catch(_){}
          }
          
          // Пытаемся запустить видео, если оно готово и на паузе
          // После первого взаимодействия можно запускать видео (включая со звуком, если window.CasesAudio.soundOn === true)
          if (video.paused && isVideoReady(video)){
            console.log('[snapSlider] Попытка запуска видео после пользовательского взаимодействия', {
              video: video,
              muted: video.muted,
              hasPlaysinline: video.hasAttribute('playsinline'),
              soundOn: typeof window !== 'undefined' && window.CasesAudio && window.CasesAudio.soundOn
            });
            try {
              // После первого взаимодействия можно запускать видео (включая со звуком)
              // Но не меняем muted автоматически - оставляем как есть (управляется через window.CasesAudio.soundOn)
              var p = video.play();
              if (p && typeof p.then === 'function'){
                p.then(function(){
                  console.log('[snapSlider] Видео успешно запущено после пользовательского взаимодействия', video);
                }).catch(function(e){
                  console.error('[snapSlider] Ошибка play после взаимодействия:', e, video);
                });
              }
            } catch(e){
              console.error('[snapSlider] Исключение при play после взаимодействия:', e, video);
            }
          }
        });
      }
    }

    // Отслеживаем первое пользовательское взаимодействие
    try {
      var interactionHappened = false;
      function markInteraction(){
        if (interactionHappened) return;
        interactionHappened = true;
        onFirstUserInteraction();
      }
      document.addEventListener('touchstart', markInteraction, { once: true, passive: true });
      document.addEventListener('click', markInteraction, { once: true, passive: true });
      document.addEventListener('scroll', markInteraction, { once: true, passive: true });
      var scroller = qs(document, '.main-section');
      if (scroller){
        scroller.addEventListener('touchstart', markInteraction, { once: true, passive: true });
        scroller.addEventListener('scroll', markInteraction, { once: true, passive: true });
      }
    } catch(_){}

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
                  
                  // Скролл списка к элементу с классом -card-style (единожды при открытии)
                  try {
                    var listItems = qsa(listOpen, '.main-container__stack-wrap__wrapper__list__item');
                    var cardStyleItem = null;
                    var cardStyleIndex = -1;
                    
                    // Находим элемент с классом, заканчивающимся на -card-style
                    each(listItems, function(item, idx){
                      if (!item || !item.classList) return;
                      var classList = item.classList;
                      for (var i = 0; i < classList.length; i++){
                        if (classList[i] && classList[i].indexOf('-card-style') !== -1){
                          cardStyleItem = item;
                          cardStyleIndex = idx;
                          return;
                        }
                      }
                    });
                    
                    if (cardStyleItem && cardStyleIndex >= 0 && listItems.length > 0){
                      // Вычисляем высоту одного элемента
                      var firstItem = listItems[0];
                      var itemHeight = 0;
                      try {
                        var rect = firstItem.getBoundingClientRect();
                        itemHeight = rect.height || 0;
                      } catch(_){}
                      
                      // Применяем формулу: высота * (index - 1) + 6 * (index - 1)
                      var scrollValue = itemHeight * (cardStyleIndex - 1) + 6 * (cardStyleIndex - 1);
                      if (scrollValue < 0) scrollValue = 0;
                      
                      // Применяем скролл к списку
                      try {
                        listOpen.scrollTop = scrollValue;
                        console.log('[snapSlider] Применен скролл списка при открытии стека:', {
                          cardStyleIndex: cardStyleIndex,
                          itemHeight: itemHeight,
                          scrollValue: scrollValue
                        });
                      } catch(e){
                        console.warn('[snapSlider] Ошибка при применении скролла списка:', e);
                      }
                    }
                  } catch(e){
                    console.warn('[snapSlider] Ошибка при вычислении скролла списка:', e);
                  }
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
        
        // При клике по навигации снимаем блокировку автозапуска для видео в активном кейсе
        // Клик считается пользовательским взаимодействием, поэтому браузер разрешит автозапуск
        var allVideos = getAllCaseVideos(caseEl);
        each(allVideos, function(video){
          if (video && video.__snapSliderAutoplayBlocked){
            console.log('[snapSlider] Снимаем блокировку автозапуска при клике по навигации (пользовательское взаимодействие)', video);
            try { video.__snapSliderAutoplayBlocked = false; } catch(_){}
          }
        });
        var wrapper = qs(caseEl, '.story-track-wrapper');
        if (!wrapper) return;
        var slides = qsa(wrapper, '.story-track-wrapper__slide');
        if (!slides || !slides.length) return;
        
        // Определяем текущий активный слайд (определен IntersectionObserver)
        var curIdx = getActiveSlideIndex(wrapper);
        if (curIdx === -1){
          // Если нет активного, используем слайд по центру для расчета следующего
          var centerSlide = getSlideByCenter(wrapper);
          curIdx = centerSlide ? Array.prototype.indexOf.call(slides, centerSlide) : 0;
          if (curIdx < 0) curIdx = 0;
        }
        
        var nextIdx = curIdx;
        if (isRight) { nextIdx = (curIdx + 1) < slides.length ? (curIdx + 1) : 0; }
        else if (isLeft) { nextIdx = (curIdx - 1) >= 0 ? (curIdx - 1) : (slides.length - 1); }

        // НЕ устанавливаем active вручную - это сделает IntersectionObserver после прокрутки
        // Просто прокручиваем к целевому слайду
        try { scrollToSlide(wrapper, slides, nextIdx, { forceIgnoreUser: true }); } catch(_){ }
        // Обновляем playback (IntersectionObserver установит active и вызовет handleActiveSlideChange)
        try { updateWrapperPlayback(wrapper); } catch(_){ }
      });
    } catch(_){ }
  }

  if (typeof document !== 'undefined'){
    function initAndStartVideos(){
        initSnapSlider();
        // Начальная синхронизация проигрывания для активного кейса
        initializeActiveCasePlaybackOnce();
      
      // Дополнительная попытка запуска видео после полной загрузки страницы
      // Это помогает на мобильных устройствах, где автозапуск может быть заблокирован
      if (typeof window !== 'undefined'){
        window.addEventListener('load', function(){
          console.log('[snapSlider] Страница полностью загружена, пытаемся запустить видео');
          setTimeout(function(){
            var activeCase = qs(document, '.cases-grid__item.active, .case.active');
            if (activeCase){
              var talkingHeadVideos = getTalkingHeadVideos(activeCase);
              var activeSlideVideos = getActiveSlideVideos(activeCase);
              
              each(talkingHeadVideos, function(video){
                if (video && video.paused && isVideoReady(video) && !video.__snapSliderAutoplayBlocked){
                  console.log('[snapSlider] Попытка запуска talking head после загрузки страницы', video);
                  safePlayVideo(video, 3, 300);
                }
              });
              
              each(activeSlideVideos, function(video){
                if (video && video.paused && isVideoReady(video) && !video.__snapSliderAutoplayBlocked){
                  console.log('[snapSlider] Попытка запуска видео активного слайда после загрузки страницы', video);
                  safePlayVideo(video, 3, 300);
                }
              });
            }
          }, 500);
      }, { once: true });
      }
    }
    
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', initAndStartVideos, { once: true });
    } else {
      initAndStartVideos();
    }
  }
})();
