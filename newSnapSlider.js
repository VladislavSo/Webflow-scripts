(function(){
  if (!window.matchMedia || !window.matchMedia('(max-width: 479px)').matches) return;
  
  // Инициализация глобального объекта для управления звуком
  if (!window.CasesAudio || !window.CasesAudio.initMuteHandlers) {
    window.CasesAudio = window.CasesAudio || {};
    window.CasesAudio.soundOn = !!window.CasesAudio.soundOn; // глобальный флаг: был клик и снят muted
    window.CasesAudio.initMuteHandlers = true;
    // При клике по mute/unmute, если в кейсе есть talking-head видео,
    // сбрасываем currentTime только для этих видео (одноразово)
    window.CasesAudio.resetOnlyTheseOnce = null;
  }
  
  // Утилиты
  var PROGRESS_ADVANCE_THRESHOLD = 0.98;
  function qs(root, sel){ return (root||document).querySelector ? (root||document).querySelector(sel) : null; }
  function qsa(root, sel){ return (root||document).querySelectorAll ? (root||document).querySelectorAll(sel) : []; }
  function each(list, cb){ if(!list) return; (list.forEach ? list.forEach(cb) : Array.prototype.forEach.call(list, cb)); }
  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

  // Кеш для хранения информации о загруженных видео
  var loadCache = new Map();

  // Простая детекция iOS Safari
  var ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  var isIOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);

  // Получить ID элемента .cases-grid__item
  function getItemId(item){
    if (!item) return null;
    try {
      return item.id || (item.getAttribute ? item.getAttribute('id') : null) || null;
    } catch(_) {
      return null;
    }
  }

  // Найти все видео в .story-track-wrapper в любой глубине вложенности
  function getStoryTrackVideos(item){
    if (!item) return [];
    try {
      var storyWrapper = qs(item, '.story-track-wrapper');
      if (!storyWrapper) return [];
      return qsa(storyWrapper, 'video');
    } catch(_) {
      return [];
    }
  }

  // Найти видео в .cases-grid__item__container__wrap__talking-head в любой глубине
  function getTalkingHeadVideos(item){
    if (!item) return [];
    try {
      var talkingHead = qs(item, '.cases-grid__item__container__wrap__talking-head');
      if (!talkingHead) return [];
      return qsa(talkingHead, 'video');
    } catch(_) {
      return [];
    }
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

  // Пауза всех видео в активном слайде (для предыдущего активного)
  function pauseVideosInActiveSlide(slideEl){
    if (!slideEl) return;
    var videos = qsa(slideEl, 'video');
    each(videos, function(video){
      try { if (video && typeof video.pause === 'function') video.pause(); } catch(_){ }
    });
  }

  // Проверка готовности видео: есть source и было загружено
  function isVideoReady(video){
    if (!video) return false;
    try {
      // Проверяем наличие источника
      var hasSource = !!(video.src || (video.querySelector && video.querySelector('source')));
      if (!hasSource) return false;
      // Проверяем, что видео загружено (dataset.loaded === 'true')
      var isLoaded = !!(video.dataset && video.dataset.loaded === 'true');
      if (!isLoaded) return false;
      // Проверяем, что видео готово к воспроизведению (readyState >= 2)
      return video.readyState >= 2;
    } catch(_){
      return false;
    }
  }
  
  // Загрузить источник видео (если нужно) и вызвать load(), ждем готовности
  function loadVideoSource(video){
    if (!video) return Promise.resolve();
    
    // Проверяем, загружено ли видео уже
    if (video.dataset && video.dataset.loaded === 'true') {
      return Promise.resolve();
    }
    
    // Проверяем, есть ли уже источник
    if (video.src || (video.querySelector && video.querySelector('source'))) {
      // Если источник есть, но видео еще не готово - ждем готовности без вызова load()
      return new Promise(function(resolve){
        if (video.readyState >= 2) {
          if (video.dataset) video.dataset.loaded = 'true';
          resolve();
        } else {
          var resolved = false;
          var timeoutId = setTimeout(function(){
            if (!resolved) {
              resolved = true;
              resolve();
            }
          }, 10000);
          var onCanPlay = function(){
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              if (video.dataset) video.dataset.loaded = 'true';
              resolve();
            }
          };
          video.addEventListener('canplay', onCanPlay, { once: true });
          video.addEventListener('error', onCanPlay, { once: true });
        }
      });
    }

    // Получаем URL из атрибутов
    var mobAttr = typeof video.getAttribute === 'function' ? video.getAttribute('mob-data-src') : null;
    var dataAttr = video.dataset ? video.dataset.src : null;
    var dataSrcAttr = mobAttr || dataAttr;
    
    if (!dataSrcAttr) {
      return Promise.resolve();
    }

    // Если уже загружено - не пересоздаем
    if (video.dataset && video.dataset.loaded === 'true') {
      return Promise.resolve();
    }

    if (video.dataset && video.dataset.fetching === 'true') {
      // Ждем завершения загрузки
      return new Promise(function(resolve){
        var checkLoaded = function(){
          if (video.dataset && video.dataset.loaded === 'true') {
            resolve();
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
      });
    }

    if (video.dataset) video.dataset.fetching = 'true';
    var url = dataSrcAttr;

    // Если источник кросс-доменный — подключаем напрямую
    try {
      var urlObj = new URL(url, window.location.href);
      var sameOrigin = urlObj.origin === window.location.origin;
      if (!sameOrigin) {
        var source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = 'metadata';
        try {
          video.load();
        } catch(e) {}
        // Ждем готовности
        return new Promise(function(resolve){
          if (video.readyState >= 2) {
            if (video.dataset) video.dataset.loaded = 'true';
            try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
            resolve();
          } else {
            var resolved = false;
            var timeoutId = setTimeout(function(){
              if (!resolved) {
                resolved = true;
                try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
                resolve();
              }
            }, 10000);
            var onCanPlay = function(){
              if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                if (video.dataset) video.dataset.loaded = 'true';
                try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
                resolve();
              }
            };
            video.addEventListener('canplay', onCanPlay, { once: true });
            video.addEventListener('error', onCanPlay, { once: true });
          }
        });
      }
    } catch (_) {
      // В случае ошибок парсинга URL — подключаем напрямую
      var source = document.createElement('source');
      source.src = url;
      source.type = 'video/mp4';
      video.appendChild(source);
      video.preload = isIOS ? 'metadata' : 'auto';
      try {
        video.load();
      } catch(e) {}
      // Ждем готовности
      return new Promise(function(resolve){
        if (video.readyState >= 2) {
          if (video.dataset) video.dataset.loaded = 'true';
          try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
          resolve();
        } else {
          var onCanPlay = function(){ 
            if (video.dataset) video.dataset.loaded = 'true';
            try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
            resolve(); 
          };
          video.addEventListener('canplay', onCanPlay, { once: true });
          video.addEventListener('error', onCanPlay, { once: true });
        }
      });
    }

    // Пытаемся загрузить через fetch
    return new Promise(function(resolve){
      fetch(url, { credentials: 'omit', cache: 'default' }).then(function(response){
        if (!response.ok) throw new Error('Failed to fetch video');
        return response.blob();
      }).then(function(blob){
        var blobUrl = URL.createObjectURL(blob);
        var source = document.createElement('source');
        source.src = blobUrl;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.preload = isIOS ? 'metadata' : 'auto';
        try {
          video.load();
        } catch(e) {}
        // Ждем готовности
        return new Promise(function(resolveInner){
          if (video.readyState >= 2) {
            if (video.dataset) {
              video.dataset.loaded = 'true';
              video.dataset.blobUrl = blobUrl;
            }
            try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
            resolveInner();
          } else {
            var onCanPlay = function(){ 
              if (video.dataset) {
                video.dataset.loaded = 'true';
                video.dataset.blobUrl = blobUrl;
              }
              try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
              resolveInner(); 
            };
            video.addEventListener('canplay', onCanPlay, { once: true });
            video.addEventListener('error', onCanPlay, { once: true });
          }
        });
      }).then(function(){
        resolve();
      }).catch(function(e){
        // Фолбэк: подключаем источник напрямую
        try {
          var source = document.createElement('source');
          source.src = url;
          source.type = 'video/mp4';
          video.appendChild(source);
          video.preload = 'metadata';
          try {
            video.load();
          } catch(err) {}
          // Ждем готовности
          var resolveFallback = function(){
            if (video.dataset) video.dataset.loaded = 'true';
            try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
            resolve();
          };
          if (video.readyState >= 2) {
            resolveFallback();
          } else {
            var resolved = false;
            var timeoutId = setTimeout(function(){
              if (!resolved) {
                resolved = true;
                resolveFallback();
              }
            }, 10000);
            var onCanPlay = function(){
              if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                resolveFallback();
              }
            };
            video.addEventListener('canplay', onCanPlay, { once: true });
            video.addEventListener('error', onCanPlay, { once: true });
          }
        } catch (_) {
          try { if (video.dataset) delete video.dataset.fetching; } catch(_) {}
          resolve();
        }
      });
    });
  }

  // Ожидание загрузки видео (если оно еще загружается)
  function waitForVideoLoad(video){
    if (!video) return Promise.resolve();
    return new Promise(function(resolve){
      // Если видео уже загружено - сразу возвращаемся
      if (video.dataset && video.dataset.loaded === 'true' && video.readyState >= 2) {
        resolve();
        return;
      }
      
      // Если видео еще загружается (fetching) - ждем завершения
      if (video.dataset && video.dataset.fetching === 'true') {
        var checkLoaded = function(){
          if (video.dataset && video.dataset.loaded === 'true' && video.readyState >= 2) {
            resolve();
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
        return;
      }
      
      // Если источник есть, но видео еще не готово - ждем canplay
      var hasSource = !!(video.src || (video.querySelector && video.querySelector('source')));
      if (hasSource) {
        if (video.readyState >= 2) {
          resolve();
        } else {
          var resolved = false;
          var timeoutId = setTimeout(function(){
            if (!resolved) {
              resolved = true;
              resolve();
            }
          }, 5000);
          var onCanPlay = function(){
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              resolve();
            }
          };
          video.addEventListener('canplay', onCanPlay, { once: true });
          video.addEventListener('error', onCanPlay, { once: true });
        }
      } else {
        // Нет источника - пытаемся загрузить
        loadVideoSource(video).then(function(){
          resolve();
        }).catch(function(){
          resolve();
        });
      }
    });
  }

  // Безопасный запуск видео: проверяем готовность перед play
  // Всегда запускаем с muted=true, затем пытаемся снять muted если звук включен
  function safePlayVideo(video, shouldUnmute){
    if (!video || !video.paused) return;
    try {
      var soundOn = !!(window.CasesAudio && window.CasesAudio.soundOn);
      var targetMuted = !shouldUnmute; // Если shouldUnmute=true, то muted=false, иначе muted=true

      // Логирование попытки запуска
      var videoInfo = '';
      try {
        var src = video.src || (video.querySelector && video.querySelector('source') && video.querySelector('source').src) || 'no source';
        var isTalkingHead = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head__video'));
        videoInfo = isTalkingHead ? 'talking-head' : 'slide video';
        console.log('[snapSlider] Пытаемся запустить видео:', videoInfo, src);
      } catch(_){}

      // Сохраняем желаемое состояние muted для применения после запуска
      var desiredMuted = targetMuted;

      // ВСЕГДА запускаем с muted=true для автоплея (браузер разрешает это)
      var originalMuted = video.muted;
      try { video.muted = true; } catch(_){ }

      // Функция для попытки снять muted после успешного запуска
      var tryUnmuteAfterPlay = function(playPromise){
        if (!playPromise || !playPromise.then) return;
        playPromise.then(function(){
          // Видео успешно запустилось, пытаемся снять muted если нужно
          if (!desiredMuted && soundOn){
            try {
              video.muted = false;
            } catch(err){
              // Оставляем muted=true, если браузер блокирует
            }
          }
        }).catch(function(err){
          // Если play() не удался, выводим ошибку
          console.error('[snapSlider] Ошибка при запуске видео:', videoInfo, err);
          try { video.muted = originalMuted; } catch(_){ }
        });
      };

      // Проверяем готовность видео и загружаем если нужно
      if (!isVideoReady(video)){
        // Сначала загружаем источник видео, затем ждем готовности
        loadVideoSource(video).then(function(){
          // Ждем завершения загрузки видео
          return waitForVideoLoad(video);
        }).then(function(){
          // Видео загружено - запускаем
          try {
            var p = video.play();
            tryUnmuteAfterPlay(p);
          } catch(err){
            console.error('[snapSlider] Ошибка при вызове play():', videoInfo, err);
            try { video.muted = originalMuted; } catch(_){ }
          }
        }).catch(function(err){
          console.error('[snapSlider] Ошибка при загрузке/ожидании видео:', videoInfo, err);
        });
      } else {
        // Видео готово - сразу запускаем
        var p = video.play();
        tryUnmuteAfterPlay(p);
      }
    } catch(err){
      console.error('[snapSlider] Ошибка в safePlayVideo:', err);
    }
  }

  // Получить кейс из элемента
  function getCaseItem(el){
    try { return el.closest ? el.closest('.cases-grid__item') : null; } catch(_) { return null; }
  }

  // Найти все видео в кейсе
  function findCaseVideos(caseEl){
    if (!caseEl) return [];
    try {
      var list = caseEl.querySelectorAll ? caseEl.querySelectorAll('.cases-grid__item__container video, .cases-grid__item__container__wrap__talking-head__video video, .story-track-wrapper video') : [];
      return Array.prototype.slice.call(list);
    } catch(_) { return []; }
  }

  // Внутри кнопки два икон-элемента. По индексу 0 — mute, по индексу 1 — unmute
  function setButtonIconsState(btn, soundOn){
    try{
      var icons = btn.querySelectorAll ? btn.querySelectorAll('.action-bar__mute-btn__icon, .cases-grid__item__container__wrap__talking-head__btn__icon') : [];
      if (!icons || icons.length < 2) return;
      icons = Array.prototype.slice.call(icons);
      each(icons, function(icon){ try { icon.classList.remove('active'); } catch(_){} });
      var index = soundOn ? 1 : 0;
      if (icons[index]) { try { icons[index].classList.add('active'); } catch(_){} }
    }catch(_){ }
  }

  function setButtonIconsStateForAll(soundOn){
    var buttons = $all('.action-bar__mute-btn, .cases-grid__item__container__wrap__talking-head__mute-btn');
    each(buttons, function(btn){ setButtonIconsState(btn, soundOn); });
  }

  // Проверка наличия кнопки mute в активном кейсе
  function checkMuteButtonAndUpdateFlag(caseEl){
    if (!caseEl) {
      // Если caseEl не передан, ищем активный кейс
      var activeCase = qs(document, '.cases-grid__item.active');
      if (!activeCase) return;
      caseEl = activeCase;
    }
    var hasMuteButton = !!(caseEl.querySelector && caseEl.querySelector('.action-bar__mute-btn'));
    if (!hasMuteButton){
      // Если кнопки нет - глобальный флаг всегда muted
      if (window.CasesAudio) window.CasesAudio.soundOn = false;
    }
  }

  // СТАРАЯ ЛОГИКА ПРИМЕНЕНИЯ СОСТОЯНИЯ ЗВУКА (ЗАКОММЕНТИРОВАНА)
  /*
  function applySoundStateToCase(caseEl){
    var videos = findCaseVideos(caseEl);
    if (!videos || !videos.length) return;
    // звук доступен только когда слайд активен
    if (!caseEl.classList || !caseEl.classList.contains('active')){
      each(videos, function(v){ try { v.muted = true; } catch(_){ } });
      return;
    }
    // Проверяем наличие кнопки mute перед применением состояния
    checkMuteButtonAndUpdateFlag(caseEl);
    if (window.CasesAudio && window.CasesAudio.soundOn){
      var listToReset = window.CasesAudio.resetOnlyTheseOnce;
      each(videos, function(v){
        try { v.muted = false; } catch(_){ }
        if (listToReset){
          var found = false;
          try {
            for (var i = 0; i < listToReset.length; i++) {
              if (listToReset[i] === v) {
                found = true;
                break;
              }
            }
          } catch(_){}
          if (found){
            try { v.currentTime = 0; } catch(_){ }
          }
        } else {
          try { v.currentTime = 0; } catch(_){ }
        }
        try { v.volume = 1; } catch(_){ }
      });
    } else {
      each(videos, function(v){ try { v.muted = true; } catch(_){ } });
    }
  }

  function applySoundStateToActiveCases(){
    var activeCases = $all('.cases-grid__item.active');
    each(activeCases, function(caseEl){ applySoundStateToCase(caseEl); });
  }

  function playVideosOnMute(caseEl){
    if (!caseEl || !caseEl.classList || !caseEl.classList.contains('active')) return;
    try {
      var soundOn = !!(window.CasesAudio && window.CasesAudio.soundOn);
      // Ищем talking-head видео
      var talkingHeadVideo = getTalkingHeadVideo(caseEl);
      if (talkingHeadVideo){
        // Если есть talking-head - запускаем его с учетом звука
        safePlayVideo(talkingHeadVideo, soundOn);
      } else {
        // Если нет talking-head - запускаем видео в активном слайде с учетом звука
        var activeSlides = qsa(caseEl, '.story-track-wrapper__slide.active');
        if (activeSlides && activeSlides.length){
          each(activeSlides, function(slide){
            var videos = qsa(slide, 'video');
            each(videos, function(video){
              safePlayVideo(video, soundOn);
            });
          });
        }
      }
    } catch(_){ }
  }
  */

  // Обработчик клика по кнопке mute
  function onMuteButtonClick(ev){
    try{ ev.preventDefault(); ev.stopPropagation(); }catch(_){ }
    var btn = ev.currentTarget;
    var caseEl = getCaseItem(btn);
    var activeCase = qs(document, '.cases-grid__item.active');
    if (!activeCase) return;

    // Переключаем глобальный флаг
    var newSoundOn = !window.CasesAudio.soundOn;
    window.CasesAudio.soundOn = newSoundOn;

    // Синхронизируем все кнопки
    setButtonIconsStateForAll(newSoundOn);

    if (newSoundOn === false){
      // Если soundOn стал false - добавляем muted
      var talkingHeadVideo = getTalkingHeadVideo(activeCase);
      if (talkingHeadVideo){
        try {
          if (!talkingHeadVideo.muted) talkingHeadVideo.muted = true;
        } catch(_){}
      } else {
        // Если talking-head нет - добавляем muted первому видео index 0
        var firstWrapper = qs(activeCase, '.story-track-wrapper');
        if (firstWrapper){
          var allSlides = qsa(firstWrapper, '.story-track-wrapper__slide');
          if (allSlides && allSlides.length > 0){
            var firstSlide = allSlides[0]; // Первый слайд по индексу 0
            var firstVideo = qs(firstSlide, 'video');
            if (firstVideo){
              try {
                if (!firstVideo.muted) firstVideo.muted = true;
              } catch(_){}
            }
          }
        }
      }
    } else {
      // Если soundOn стал true
      var talkingHeadVideo = getTalkingHeadVideo(activeCase);
      if (talkingHeadVideo){
        // Если есть talking-head - пауза, удалить muted, currentTime=0, play
        try {
          talkingHeadVideo.pause();
          if (talkingHeadVideo.muted) talkingHeadVideo.muted = false;
          if (typeof talkingHeadVideo.currentTime === 'number') talkingHeadVideo.currentTime = 0;
          talkingHeadVideo.play().catch(function(err){
            console.error('[snapSlider] Ошибка при запуске talking-head после unmute:', err);
          });
        } catch(err){
          console.error('[snapSlider] Ошибка при обработке talking-head после unmute:', err);
        }
      } else {
        // Если talking-head нет - первое видео index 0: пауза, удалить muted, currentTime=0, play
        var firstWrapper = qs(activeCase, '.story-track-wrapper');
        if (firstWrapper){
          var allSlides = qsa(firstWrapper, '.story-track-wrapper__slide');
          if (allSlides && allSlides.length > 0){
            var firstSlide = allSlides[0]; // Первый слайд по индексу 0
            var firstVideo = qs(firstSlide, 'video');
            if (firstVideo){
              try {
                firstVideo.pause();
                if (firstVideo.muted) firstVideo.muted = false;
                if (typeof firstVideo.currentTime === 'number') firstVideo.currentTime = 0;
                firstVideo.play().catch(function(err){
                  console.error('[snapSlider] Ошибка при запуске первого видео после unmute:', err);
                });
              } catch(err){
                console.error('[snapSlider] Ошибка при обработке первого видео после unmute:', err);
              }
            }
          }
        }
      }
    }
  }

  // СТАРАЯ ЛОГИКА ОБРАБОТЧИКА MUTE (ЗАКОММЕНТИРОВАНА)
  /*
  function onMuteButtonClick(ev){
    try{ ev.preventDefault(); ev.stopPropagation(); }catch(_){ }
    var btn = ev.currentTarget;
    var caseEl = getCaseItem(btn);

    // переключаем глобальный флаг
    window.CasesAudio.soundOn = !window.CasesAudio.soundOn;

    // синхронизируем все кнопки
    setButtonIconsStateForAll(window.CasesAudio.soundOn);

    // применяем к ближайшему кейсу (если активен) и ко всем активным
    // Если в кейсе есть talking-head видео — сбросить currentTime только им (одноразово)
    if (caseEl){
      try{
        var thVideos = qsa(caseEl, '.cases-grid__item__container__wrap__talking-head__video video');
        if (thVideos && thVideos.length){
          window.CasesAudio.resetOnlyTheseOnce = Array.prototype.slice.call(thVideos);
        }
      }catch(_){ }
    }
    if (caseEl) applySoundStateToCase(caseEl);
    applySoundStateToActiveCases();
    
    // Запускаем видео после применения состояния звука для всех активных кейсов
    var activeCases = $all('.cases-grid__item.active');
    each(activeCases, function(activeCase){
      playVideosOnMute(activeCase);
    });
    
    // Очистить одноразовый список после применения ко всем активным
    window.CasesAudio.resetOnlyTheseOnce = null;
  }
  */

  // Инициализация кнопок mute
  function initButtons(){
    var buttons = $all('.action-bar__mute-btn, .cases-grid__item__container__wrap__talking-head__mute-btn');
    each(buttons, function(btn){
      try {
        btn.removeEventListener('click', onMuteButtonClick, false);
      } catch(_){}
      try {
        btn.addEventListener('click', onMuteButtonClick, false);
        setButtonIconsState(btn, !!window.CasesAudio.soundOn);
      } catch(_){}
    });
  }

  // MutationObserver для отслеживания изменения active у кейсов (СТАРАЯ ЛОГИКА - ЗАКОММЕНТИРОВАНА)
  /*
  function initMutationForCases(){
    var items = $all('.cases-grid__item');
    var obs = new MutationObserver(function(mutations){
      each(mutations, function(m){
        var item = m.target;
        if (!item || !item.classList || !item.classList.contains('cases-grid__item')) return;
        var wasActive = (m.oldValue || '').split(/\s+/).indexOf('active') !== -1;
        var isActive = item.classList.contains('active');
        if (!wasActive && isActive){
          // Слайд стал активным: проверяем наличие кнопки mute и обновляем флаг
          checkMuteButtonAndUpdateFlag(item);
          // Если глобально включен звук, запускаем с начала; иначе оставляем muted
          applySoundStateToCase(item);
        } else if (wasActive && !isActive){
          // Слайд потерял active: вернуть muted для всех видео в кейсе
          var videos = findCaseVideos(item);
          each(videos, function(v){ try { v.muted = true; } catch(_){ } });
        }
      });
    });
    each(items, function(item){
      try {
        obs.observe(item, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
      } catch(_){}
    });
  }
  */

  // Загрузить видео для активного элемента
  function loadVideosForItem(item){
    if (!item) return;
    var itemId = getItemId(item);
    if (!itemId) {
      return;
    }

    // Проверяем кеш - если запись есть, значит все видео уже загружены
    if (loadCache.has(itemId)) {
      return; // Все уже загружено
    }

    // Находим все видео в .story-track-wrapper
    var storyTrackVideos = getStoryTrackVideos(item);
    
    // Загружаем видео из story-track-wrapper (только load, без play - play управляется через snapSlider)
    if (storyTrackVideos.length > 0) {
      for (var i = 0; i < storyTrackVideos.length; i++) {
        loadVideoSource(storyTrackVideos[i]).catch(function(){});
      }
    }

    // Проверяем наличие talking-head
    var talkingHead = qs(item, '.cases-grid__item__container__wrap__talking-head');
    if (talkingHead) {
      var talkingHeadVideos = getTalkingHeadVideos(item);
      if (talkingHeadVideos.length > 0) {
        // Для всех talking-head видео: только load (запуск управляется через snapSlider.js)
        for (var j = 0; j < talkingHeadVideos.length; j++) {
          loadVideoSource(talkingHeadVideos[j]).catch(function(){});
        }
      }
    }

    // Сохраняем в кеш - отмечаем, что для этого элемента видео загружены
    loadCache.set(itemId, true);
  }

  // Проверка готовности видео: есть source и readyState >= 2
  function isVideoReadyToPlay(video){
    if (!video) return false;
    try {
      var hasSource = !!(video.src || (video.querySelector && video.querySelector('source')));
      if (!hasSource) return false;
      return video.readyState >= 2;
    } catch(_){
      return false;
    }
  }

  // Ожидание готовности видео с повторными проверками
  function waitForVideoReady(video, interval, maxAttempts){
    if (!video) return Promise.resolve(false);
    interval = interval || 100;
    maxAttempts = maxAttempts || 50; // максимум 50 попыток
    
    return new Promise(function(resolve){
      var attempts = 0;
      var checkReady = function(){
        attempts++;
        if (isVideoReadyToPlay(video)){
          resolve(true);
        } else if (attempts >= maxAttempts){
          resolve(false);
        } else {
          setTimeout(checkReady, interval);
        }
      };
      setTimeout(checkReady, interval);
    });
  }

  // Установка muted для видео в кейсе согласно soundOn
  function setMutedStateForCase(caseEl){
    if (!caseEl) return;
    var soundOn = !!(window.CasesAudio && window.CasesAudio.soundOn);
    var talkingHeadVideo = getTalkingHeadVideo(caseEl);
    var hasTalkingHead = !!talkingHeadVideo;
    
    if (soundOn === false){
      // Если soundOn false - добавляем muted всем видео в кейсе
      var allVideos = findCaseVideos(caseEl);
      each(allVideos, function(video){
        try {
          if (!video.muted) video.muted = true;
        } catch(_){}
      });
    } else {
      // Если soundOn true
      if (hasTalkingHead){
        // Если есть talking-head - удаляем muted только у него, остальным добавляем
        try {
          if (talkingHeadVideo.muted) talkingHeadVideo.muted = false;
        } catch(_){}
        var allVideos = findCaseVideos(caseEl);
        each(allVideos, function(video){
          if (video !== talkingHeadVideo){
            try {
              if (!video.muted) video.muted = true;
            } catch(_){}
          }
        });
      } else {
        // Если talking-head нет - удаляем muted у первого видео в первом слайде (index 0)
        var firstWrapper = qs(caseEl, '.story-track-wrapper');
        if (firstWrapper){
          var allSlides = qsa(firstWrapper, '.story-track-wrapper__slide');
          if (allSlides && allSlides.length > 0){
            var firstSlide = allSlides[0]; // Первый слайд по индексу 0
            var firstVideo = qs(firstSlide, 'video');
            if (firstVideo){
              try {
                if (firstVideo.muted) firstVideo.muted = false;
              } catch(_){}
            }
            // Остальным видео добавляем muted
            var allVideos = findCaseVideos(caseEl);
            each(allVideos, function(video){
              if (video !== firstVideo){
                try {
                  if (!video.muted) video.muted = true;
                } catch(_){}
              }
            });
          }
        }
      }
    }
  }

  // Запуск видео при смене активного кейса
  function playVideosOnCaseChange(caseEl, previousCaseEl){
    if (!caseEl) return;
    
    // Ставим на паузу видео в предыдущем активном слайде предыдущего кейса
    if (previousCaseEl){
      var previousActiveSlides = qsa(previousCaseEl, '.story-track-wrapper__slide.active');
      each(previousActiveSlides, function(previousSlide){
        try {
          pauseVideosInActiveSlide(previousSlide);
        } catch(_){}
      });
    }
    
    // 1. Находим все видео и talking head
    var talkingHeadVideo = getTalkingHeadVideo(caseEl);
    var allVideos = findCaseVideos(caseEl);
    
    // 2. Вызываем load для всех видео
    each(allVideos, function(video){
      loadVideoSource(video).catch(function(){});
    });
    
    // 3. Устанавливаем muted согласно soundOn
    setMutedStateForCase(caseEl);
    
    // 4. Через 100мс начинаем проверять готовность
    setTimeout(function(){
      var checkAndPlay = function(){
        if (talkingHeadVideo){
          // Если есть talking-head - проверяем только его готовность
          var talkingHeadReady = isVideoReadyToPlay(talkingHeadVideo);
          if (talkingHeadReady){
            // 5. Когда проверка пройдена - вызываем play для talking-head
            try {
              talkingHeadVideo.play().catch(function(err){
                console.error('[snapSlider] Ошибка при запуске talking-head:', err);
              });
            } catch(err){
              console.error('[snapSlider] Ошибка при вызове play() для talking-head:', err);
            }
          } else {
            // Повторяем проверку через 200мс
            setTimeout(checkAndPlay, 200);
          }
        } else {
          // Если нет talking-head - проверяем готовность видео в активном слайде
          var activeSlide = qs(caseEl, '.story-track-wrapper__slide.active');
          var activeSlideVideo = activeSlide ? (qs(activeSlide, 'video')) : null;
          if (activeSlideVideo){
            var activeSlideReady = isVideoReadyToPlay(activeSlideVideo);
            if (activeSlideReady){
              // 5. Когда проверка пройдена - вызываем play для видео в активном слайде
              try {
                activeSlideVideo.play().catch(function(err){
                  console.error('[snapSlider] Ошибка при запуске видео в активном слайде:', err);
                });
              } catch(err){
                console.error('[snapSlider] Ошибка при вызове play() для видео в активном слайде:', err);
              }
            } else {
              // Повторяем проверку через 200мс
              setTimeout(checkAndPlay, 200);
            }
          }
        }
      };
      checkAndPlay();
    }, 100);
  }

  // Запуск видео при смене активного слайда
  function playVideosOnSlideChange(slideEl, caseEl){
    if (!slideEl || !caseEl) return;
    
    // Ставим на паузу видео в предыдущем активном слайде
    var wrapper = slideEl.closest ? slideEl.closest('.story-track-wrapper') : null;
    if (wrapper){
      var previousActiveSlide = qs(wrapper, '.story-track-wrapper__slide.active');
      if (previousActiveSlide && previousActiveSlide !== slideEl){
        try {
          pauseVideosInActiveSlide(previousActiveSlide);
        } catch(_){}
      }
    }
    
    var video = qs(slideEl, 'video');
    if (!video) return;
    
    // 1. Проверяем готовность
    var checkAndPlay = function(){
      if (isVideoReadyToPlay(video)){
        // 2. Когда проверка пройдена - вызываем play
        try {
          video.play().catch(function(err){
            console.error('[snapSlider] Ошибка при запуске видео в слайде:', err);
          });
        } catch(err){
          console.error('[snapSlider] Ошибка при вызове play() для видео в слайде:', err);
        }
      } else {
        // Повторяем проверку через 100мс
        setTimeout(checkAndPlay, 100);
      }
    };
    checkAndPlay();
  }

  // УПРАВЛЕНИЕ ВОСПРОИЗВЕДЕНИЕМ С УЧЕТОМ ФЛАГА ЗВУКА (СТАРАЯ ЛОГИКА - ЗАКОММЕНТИРОВАНА)
  /*
  function playVideosWithSoundControl(caseEl){
    if (!caseEl) return;
    
    // Проверяем наличие кнопки mute перед применением состояния
    checkMuteButtonAndUpdateFlag(caseEl);
    
    var soundOn = !!(window.CasesAudio && window.CasesAudio.soundOn);
    var talkingHeadVideo = getTalkingHeadVideo(caseEl);
    var hasTalkingHead = !!talkingHeadVideo;
    
    // Логирование контекста запуска
    try {
      var caseId = caseEl.id || 'unknown';
      console.log('[snapSlider] Запуск видео для кейса:', caseId, 'soundOn:', soundOn, 'hasTalkingHead:', hasTalkingHead);
    } catch(_){}
    
    // Если есть talking-head - управляем muted только для него
    if (hasTalkingHead){
      try {
        safePlayVideo(talkingHeadVideo, soundOn); // Передаем shouldUnmute=soundOn
      } catch(err){
        console.error('[snapSlider] Ошибка при запуске talking-head:', err);
      }
      
      // Все остальные видео в активных слайдах остаются muted
      var activeSlides = qsa(caseEl, '.story-track-wrapper__slide.active');
      each(activeSlides, function(slide){
        var videos = qsa(slide, 'video');
        each(videos, function(video){
          safePlayVideo(video, false); // Всегда muted для видео в слайдах, если есть talking-head
        });
      });
    } else {
      // Если talking-head нет - управляем muted для всех видео в активном слайде
      var activeSlides = qsa(caseEl, '.story-track-wrapper__slide.active');
      each(activeSlides, function(slide){
        var videos = qsa(slide, 'video');
        each(videos, function(video){
          safePlayVideo(video, soundOn); // Передаем shouldUnmute=soundOn
        });
      });
    }
  }
  */


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
  function pauseTalkingHead(root){ 
    if (!root) return;
    // Не ставим на паузу talking-head в активном кейсе
    var isActive = !!(root.classList && root.classList.contains('active'));
    if (isActive) return;
    var v = getTalkingHeadVideo(root); 
    if (v){ 
      try { 
        // Проверяем, что видео не в активном кейсе (дополнительная проверка)
        var caseEl = v.closest ? v.closest('.cases-grid__item, .case') : null;
        if (caseEl && caseEl.classList && caseEl.classList.contains('active')) return;
        v.pause(); 
      } catch(_){ } 
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
            // После появления метаданных у активного слайда в активном кейсе — запустим воспроизведение (СТАРАЯ ЛОГИКА - ЗАКОММЕНТИРОВАНА)
            /*
            try {
              if (idx === activeIdx && caseIsActive) { playVideosWithSoundControl(caseEl); }
            } catch(_){ }
            */
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
        // Вне активной зоны — не меняем active
        return;
      }
      // Вернулись в активную зону после паузы — синхронизируем и запускаем активный слайд
      if (lastEligibility === false){
        var activeCase = qs(document, '.cases-grid__item.active, .case.active');
        if (activeCase){
          var wrappersInCase0 = qsa(activeCase, '.story-track-wrapper');
          each(wrappersInCase0, function(w){ try { updateWrapperPlayback(w); } catch(_){ } });
          // Запускаем видео при возврате в активную зону (предыдущего кейса нет, т.к. это возврат в активную зону)
          try { playVideosOnCaseChange(activeCase, null); } catch(_){ }
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

        // Логирование смены кейса
        try {
          var prevCaseId = lastActiveCase ? (lastActiveCase.id || 'unknown') : 'none';
          var newCaseId = best.id || 'unknown';
          console.log('[snapSlider] Смена активного кейса:', prevCaseId, '->', newCaseId);
        } catch(_){}

        // Ставим на паузу talking-head в предыдущем активном кейсе
        if (lastActiveCase) {
          try { pauseTalkingHead(lastActiveCase); } catch(_){ }
        }

        (items.forEach ? items.forEach : Array.prototype.forEach).call(items, function(el){
          if (el === best) { 
            el.classList.add('active'); 
            // Запускаем видео при смене активного кейса (передаем предыдущий кейс)
            try { playVideosOnCaseChange(el, lastActiveCase); } catch(_){ } 
          }
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

        // Переопределяем active для слайда внутри каждого wrapper по центру
        var wrappersInCase = qsa(best, '.story-track-wrapper');
        each(wrappersInCase, function(w){
          var activeSlide = null;
          try { activeSlide = setActiveSlideInWrapperByCenter(w); } catch(_){ }
          try { updateWrapperPlayback(w); } catch(_){ }
        });

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
          // Находим предыдущий активный слайд и ставим на паузу (пауза уже выполняется внутри playVideosOnSlideChange)
          var previousActiveSlide = qs(wrapperEl, '.story-track-wrapper__slide.active');
          if (previousActiveSlide && previousActiveSlide !== bestSlide) {
            try {
              console.log('[snapSlider] Смена активного слайда (IntersectionObserver): предыдущий -> новый');
              // Пауза уже выполняется внутри playVideosOnSlideChange, но делаем и здесь для надежности
              pauseVideosInActiveSlide(previousActiveSlide);
            } catch(_){ }
          }

          each(slides, function(slide){
            if (slide === bestSlide){ 
              try { slide.classList.add('active'); } catch(_){ }
              // Запускаем видео при смене активного слайда (внутри функции уже ставится пауза предыдущему)
              try { playVideosOnSlideChange(slide, caseEl); } catch(_){ }
            }
            else { try { slide.classList.remove('active'); } catch(_){ } }
          });
          updateWrapperPlayback(wrapperEl);
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

      // Снимаем active с остальных кейсов, ставим паузу talking-head
      (cases.forEach ? cases.forEach : Array.prototype.forEach).call(cases, function(el){
        if (el === activeCase){
          try { el.classList.add('active'); } catch(_){ }
        } else {
          try { el.classList.remove('active'); } catch(_){ }
          try { pauseTalkingHead(el); } catch(_){ }
        }
      });

      // Для каждого wrapper внутри активного кейса — выбрать слайд по центру, обновить прогресс
      var wrappers = qsa(activeCase, '.story-track-wrapper');
      each(wrappers, function(w){
        var slide = null;
        try { slide = setActiveSlideInWrapperByCenter(w); } catch(_){ }
        try { updateWrapperPlayback(w); } catch(_){ }
      });

      // Запускаем видео при инициализации активного кейса (предыдущего кейса нет при инициализации)
      try { playVideosOnCaseChange(activeCase, null); } catch(_){ }
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
                    each(cases, function(el){ 
                      if (el === caseElTarget) { 
                        try { 
                          // Находим предыдущий активный кейс перед изменением
                          var previousCase = qs(document, '.cases-grid__item.active, .case.active');
                          if (previousCase === el) previousCase = null; // Если кликнули по уже активному кейсу
                          el.classList.add('active'); 
                          // Запускаем видео при смене активного кейса (клик по стеку)
                          try { playVideosOnCaseChange(el, previousCase); } catch(__){} 
                        } catch(__){} 
                      } else { 
                        try { el.classList.remove('active'); pauseTalkingHead(el); } catch(__){} 
                      } 
                    });
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

        // Логирование смены слайда
        console.log('[snapSlider] Смена активного слайда (клик):', curIdx, '->', nextIdx, isRight ? '(вправо)' : '(влево)');

        // Ставим на паузу видео в текущем активном слайде
        if (curIdx >= 0 && slides[curIdx]) {
          try { pauseVideosInActiveSlide(slides[curIdx]); } catch(_){ }
        }

        // Ставим active на целевой, снимаем с остальных
        (slides.forEach ? slides.forEach : Array.prototype.forEach).call(slides, function(s, i){
          if (i === nextIdx) { try { s.classList.add('active'); } catch(_){ } }
          else { try { s.classList.remove('active'); } catch(_){ } }
        });

        // Прокручиваем к целевому и обновляем прогресс/воспроизведение
        try { scrollToSlide(wrapper, slides, nextIdx, { forceIgnoreUser: true }); } catch(_){ }
        try { updateWrapperPlayback(wrapper); } catch(_){ }
        // Запускаем видео при смене активного слайда (клик)
        if (slides[nextIdx]) {
          try { playVideosOnSlideChange(slides[nextIdx], caseEl); } catch(_){ }
        }
        // Даем snap «досесть» и синхронизируем active и воспроизведение по центру
        try {
          setTimeout(function(){
            try {
              var previousActive = qs(wrapper, '.story-track-wrapper__slide.active');
              var actual = setActiveSlideInWrapperByCenter(wrapper);
              // Если активный слайд изменился, ставим на паузу предыдущий
              if (previousActive && actual && previousActive !== actual) {
                try {
                  console.log('[snapSlider] Смена активного слайда (синхронизация после snap): предыдущий -> новый');
                  pauseVideosInActiveSlide(previousActive);
                } catch(__){}
              }
              updateWrapperPlayback(wrapper);
              // Запускаем видео при синхронизации после snap
              if (actual) {
                try { playVideosOnSlideChange(actual, caseEl); } catch(__){}
              }
            } catch(__){}
          }, 160);
        } catch(__){}
      });
    } catch(_){ }
  }

  if (typeof document !== 'undefined'){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', function(){
        // Проверяем наличие кнопки mute при инициализации
        checkMuteButtonAndUpdateFlag();
        initButtons();
        setButtonIconsStateForAll(!!window.CasesAudio.soundOn);
        // initMutationForCases(); // СТАРАЯ ЛОГИКА - ЗАКОММЕНТИРОВАНА
        initSnapSlider();
        // Начальная синхронизация проигрывания для активного кейса
        initializeActiveCasePlaybackOnce();
      }, { once: true });
    } else {
      // Проверяем наличие кнопки mute при инициализации
      checkMuteButtonAndUpdateFlag();
      initButtons();
      setButtonIconsStateForAll(!!window.CasesAudio.soundOn);
      // initMutationForCases(); // СТАРАЯ ЛОГИКА - ЗАКОММЕНТИРОВАНА
      initSnapSlider();
      // Начальная синхронизация проигрывания для активного кейса
      initializeActiveCasePlaybackOnce();
    }
  }
})();
