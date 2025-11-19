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
                console.log('[snapSlider] Запуск talking head видео', video);
                var p = video.play();
                if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play talking head:', e); });
              } catch(e){ console.error('[snapSlider] Ошибка play talking head:', e); }
            });
            each(activeSlideVideos, function(video){
              try {
                console.log('[snapSlider] Запуск видео активного слайда', video);
                var p = video.play();
                if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); });
              } catch(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); }
            });
          } else {
            console.log('[snapSlider] Видео все еще не готовы после повторной проверки');
          }
        }, 200);
      } else {
        console.log('[snapSlider] Все видео готовы сразу, вызываем play()');
        // 4. Когда проверка пройдена, вызываем play
        each(talkingHeadVideos, function(video){
          try {
            console.log('[snapSlider] Запуск talking head видео', video);
            var p = video.play();
            if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play talking head:', e); });
          } catch(e){ console.error('[snapSlider] Ошибка play talking head:', e); }
        });
        each(activeSlideVideos, function(video){
          try {
            console.log('[snapSlider] Запуск видео активного слайда', video);
            var p = video.play();
            if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); });
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
            console.log('[snapSlider] Запуск видео активного слайда', video);
            var p = video.play();
            if (p && p.catch) p.catch(function(e){ console.error('[snapSlider] Ошибка play активного слайда:', e); });
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

  // Получить слайд внутри wrapper по близости к центру wrapper (без установки active - это делает только IntersectionObserver)
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
              // автопереход по 98% отключен - active определяет только IntersectionObserver
              // Автопереход может конфликтовать с IntersectionObserver
              if (!video.paused && !video.ended){ video.__rafProgressId = requestAnimationFrame(rafFn); } else { video.__rafProgressId = null; }
            };
            video.__rafProgressId = requestAnimationFrame(rafFn);
          };

          video.__progressHandler = function(){
            var dur = (isFinite(video.duration) && video.duration > 0) ? video.duration : 0;
            var ct = Math.max(0, video.currentTime || 0);
            var p = dur > 0 ? Math.min(1, ct / dur) : 0;
            if (fill) { try { fill.style.transform = 'scaleX(' + p + ')'; } catch(_){ } }
            // Автопереход по 98% отключен - active определяет только IntersectionObserver
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

        // Обновляем playback для каждого wrapper (active определит IntersectionObserver)
        var wrappersInCase = qsa(best, '.story-track-wrapper');
        each(wrappersInCase, function(w){
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
          // Обрабатываем смену активного слайда (проверка готовности и воспроизведение)
          try { handleActiveSlideChange(bestSlide, caseEl); } catch(e){ console.error('[snapSlider] Ошибка при обработке смены слайда:', e); }
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

      // Для каждого wrapper внутри активного кейса — обновить прогресс (active определит IntersectionObserver)
      var wrappers = qsa(activeCase, '.story-track-wrapper');
      each(wrappers, function(w){
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
