(function(){
  // Проверка медиа-запроса для десктопа (min-width: 480px)
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  // Утилиты
  function qs(root, sel){ return (root||document).querySelector ? (root||document).querySelector(sel) : null; }
  function qsa(root, sel){ return (root||document).querySelectorAll ? (root||document).querySelectorAll(sel) : []; }
  function each(list, cb){ if(!list) return; (list.forEach ? list.forEach(cb) : Array.prototype.forEach.call(list, cb)); }

  // 1. Проверка наличия source
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

  // 2. Создание source из атрибутов
  function createSourceFromAttributes(video, isTalkingHead){
    if (!video) return false;
    try {
      // Проверяем флаг, что source уже был создан
      if (video.__videoLazySourceCreated) {
        return false;
      }

      // Если source уже есть в DOM, помечаем и пропускаем
      if (hasVideoSource(video)) {
        video.__videoLazySourceCreated = true;
        return false;
      }

      // Для всех видео (включая talking-head) используем data-src
      var srcAttr = video.getAttribute ? video.getAttribute('data-src') : null;
      if (!srcAttr && video.dataset && video.dataset.src) {
        srcAttr = video.dataset.src;
      }

      if (!srcAttr || !srcAttr.length) {
        return false;
      }
      
      // Создаем source элемент
      var source = document.createElement('source');
      source.src = srcAttr;
      source.type = 'video/mp4';
      
      // Добавляем source в video
      video.appendChild(source);
      
      // Помечаем, что source был создан
      video.__videoLazySourceCreated = true;
      
      return true;
    } catch(e){ 
      return false;
    }
  }

  // 3. Вызов load()
  function loadVideoIfNeeded(video){
    if (!video) return;
    try {
      // Проверяем флаг, что load уже был вызван
      if (video.__videoLazyLoadCalled) {
        return;
      }

      if (hasVideoSource(video)) {
        video.load();
        // Помечаем, что load был вызван
        video.__videoLazyLoadCalled = true;
      }
    } catch(e){}
  }

  // 4. Получение видео
  // Получаем все видео в кейсе (.cases-grid__item__container + talking-head)
  function getAllCaseVideos(caseEl){
    if (!caseEl) return [];
    var videos = [];
    try {
      // Находим .cases-grid__item__container внутри кейса
      var container = qs(caseEl, '.cases-grid__item__container');
      if (container) {
        // Ищем все видео внутри контейнера (разной глубины вложенности)
        var containerVideos = qsa(container, 'video');
        each(containerVideos, function(v){ videos.push(v); });
      }
      
      // Talking-head видео (находится там же)
      var talkingHeadVideos = getTalkingHeadVideos(caseEl);
      each(talkingHeadVideos, function(v){ videos.push(v); });
      
      // Убираем дубликаты
      return Array.from(new Set(videos));
    } catch(_){ return []; }
  }

  // Получаем talking-head видео из кейса
  function getTalkingHeadVideos(caseEl){
    if (!caseEl) return [];
    try {
      // Talking-head находится в .cases-grid__item__container
      var container = qs(caseEl, '.cases-grid__item__container');
      if (!container) return [];
      // Ищем talking-head видео (может быть разной глубины вложенности)
      return qsa(container, '.talking-head video, [class*="talking-head"] video, video[class*="talking"]');
    } catch(_){ return []; }
  }

  // Получаем видео для playband (исключая talking-head)
  function getPlaybandVideos(caseEl){
    if (!caseEl) return [];
    var videos = [];
    try {
      var container = qs(caseEl, '.cases-grid__item__container');
      if (!container) return [];
      
      var allVideos = qsa(container, 'video');
      var talkingHeadVideos = getTalkingHeadVideos(caseEl);
      
      each(allVideos, function(video){
        // Проверяем, не является ли видео talking-head
        var isTalking = false;
        try {
          isTalking = talkingHeadVideos.indexOf(video) !== -1;
          if (!isTalking) {
            // Дополнительная проверка через closest
            var parent = video.parentElement;
            while (parent && parent !== container) {
              if (parent.classList && (
                parent.classList.contains('talking-head') || 
                parent.className.indexOf('talking-head') !== -1 ||
                parent.className.indexOf('talking') !== -1
              )) {
                isTalking = true;
                break;
              }
              parent = parent.parentElement;
            }
          }
        } catch(_){}
        
        if (!isTalking) {
          videos.push(video);
        }
      });
      
      return videos;
    } catch(_){ return []; }
  }

  // 5. Загрузка при смене активного кейса
  function handleActiveCaseChange(newCaseEl){
    if (!newCaseEl) return;
    
    // Находим все видео и talking head в новом кейсе
    var allVideos = getAllCaseVideos(newCaseEl);
    var talkingHeadVideos = getTalkingHeadVideos(newCaseEl);

    // Создаем source элементы из атрибутов data-src
    
    // Для talking head используем data-src
    each(talkingHeadVideos, function(video){
      var created = createSourceFromAttributes(video, true);
      if (created) {
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
      try { 
        isTalking = talkingHeadVideos.indexOf(video) !== -1;
        // Дополнительная проверка по классам/селекторам
        if (!isTalking) {
          var parent = video.parentElement;
          while (parent && parent !== newCaseEl) {
            if (parent.classList && (
              parent.classList.contains('talking-head') || 
              parent.className.indexOf('talking-head') !== -1 ||
              parent.className.indexOf('talking') !== -1
            )) {
              isTalking = true;
              break;
            }
            parent = parent.parentElement;
          }
        }
      } catch(__){}
      
      if (!isTalking) {
        var created = createSourceFromAttributes(video, false);
        if (created) {
          // Вызываем load сразу после создания source
          loadVideoIfNeeded(video);
        } else if (hasVideoSource(video)) {
          // Если source уже был, вызываем load (с проверкой флага внутри)
          loadVideoIfNeeded(video);
        }
      }
    });
    
    // Создаем source элементы для соседних кейсов (index-1 и index+1) для предзагрузки
    createSourceForAdjacentCases(newCaseEl);

    // Через 100мс проверяем готовность
    setTimeout(function(){
      var videosToCheck = [];
      
      // Добавляем talking head видео
      each(talkingHeadVideos, function(v){ videosToCheck.push(v); });
      // Добавляем остальные видео
      each(allVideos, function(v){ 
        if (talkingHeadVideos.indexOf(v) === -1) {
          videosToCheck.push(v); 
        }
      });
      
      // Убираем дубликаты
      videosToCheck = Array.from(new Set(videosToCheck));

      var allReady = true;
      each(videosToCheck, function(video){
        var ready = isVideoReady(video);
        if (!ready) allReady = false;
      });

      if (!allReady){
        // Повторяем проверку через 200мс
        setTimeout(function(){
          var allReadyRetry = true;
          each(videosToCheck, function(video){
            var ready = isVideoReady(video);
            if (!ready) allReadyRetry = false;
          });

          if (allReadyRetry){
            // Запускаем talking head видео после готовности (независимо от playband)
            playTalkingHeadVideos(newCaseEl);
          }
        }, 200);
      } else {
        // Запускаем talking head видео после готовности (независимо от playband)
        playTalkingHeadVideos(newCaseEl);
      }
    }, 100);
    
    // Запускаем talking head видео сразу (независимо от готовности и playband)
    playTalkingHeadVideos(newCaseEl);
  }

  // 6. Предзагрузка соседних кейсов
  function createSourceForAdjacentCases(activeCaseEl){
    if (!activeCaseEl) return;
    
    try {
      // Находим все кейсы
      var scroller = (document && document.querySelector) ? document.querySelector('.main-section') : null;
      if (!scroller) {
        // Если нет .main-section, ищем напрямую
        scroller = document;
      }
      var allCases = scroller.querySelectorAll ? scroller.querySelectorAll('.cases-grid__item, .case') : null;
      if (!allCases || !allCases.length) return;
      
      // Преобразуем NodeList в массив для удобства работы
      var casesArray = Array.prototype.slice.call(allCases);
      
      // Находим индекс активного кейса
      var activeIndex = casesArray.indexOf(activeCaseEl);
      if (activeIndex === -1) return;
      
      // Обрабатываем соседние кейсы (index-1 и index+1)
      var adjacentIndices = [activeIndex - 1, activeIndex + 1];
      
      each(adjacentIndices, function(adjIndex){
        // Проверяем, что индекс валидный
        if (adjIndex < 0 || adjIndex >= casesArray.length) return;
        
        var adjacentCase = casesArray[adjIndex];
        if (!adjacentCase) return;
        
        // Находим все видео в соседнем кейсе
        var adjacentVideos = getAllCaseVideos(adjacentCase);
        var adjacentTalkingHeadVideos = getTalkingHeadVideos(adjacentCase);
        
        // Создаем source для talking head видео (используем data-src)
        each(adjacentTalkingHeadVideos, function(video){
          if (!video) return;
          createSourceFromAttributes(video, true);
          // Не вызываем load() для соседних кейсов - только создаем source для предзагрузки
        });
        
        // Создаем source для остальных видео (используем data-src)
        each(adjacentVideos, function(video){
          if (!video) return;
          // Пропускаем talking head, так как они уже обработаны
          var isTalking = false;
          try { 
            isTalking = adjacentTalkingHeadVideos.indexOf(video) !== -1;
            if (!isTalking) {
              var parent = video.parentElement;
              while (parent && parent !== adjacentCase) {
                if (parent.classList && (
                  parent.classList.contains('talking-head') || 
                  parent.className.indexOf('talking-head') !== -1 ||
                  parent.className.indexOf('talking') !== -1
                )) {
                  isTalking = true;
                  break;
                }
                parent = parent.parentElement;
              }
            }
          } catch(__){}
          
          if (!isTalking) {
            createSourceFromAttributes(video, false);
            // Не вызываем load() для соседних кейсов - только создаем source для предзагрузки
          }
        });
      });
    } catch(e){}
  }

  // Логика полосы play/pause (playband)
  var playbandEl = null;
  var playbandActiveItem = null;
  var playbandVideos = [];
  var playbandRafPending = false;

  function ensurePlayband(){
    if (playbandEl && document.body && document.body.contains(playbandEl)) return playbandEl;
    try {
      var el = document.createElement('div');
      el.id = 'cases-playband-observer';
      el.setAttribute('aria-hidden', 'true');
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.right = '0';
      el.style.height = '0.5625rem';
      el.style.top = '27vh';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '2147483647';
      el.style.background = 'transparent';
      if (document.body) {
        document.body.appendChild(el);
      }
      return playbandEl = el;
    } catch(_){ return null; }
  }

  function isOverlappingPlayband(element){
    if (!playbandEl || !element) return false;
    try {
      var bandRect = playbandEl.getBoundingClientRect();
      var rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && 
             (rect.bottom > bandRect.top) && (rect.top < bandRect.bottom);
    } catch(_){ return false; }
  }

  // Находит ближайшее видео к playband
  function findClosestVideoToPlayband(videos){
    if (!playbandEl || !videos || !videos.length) return null;
    try {
      var bandRect = playbandEl.getBoundingClientRect();
      var bandCenterY = bandRect.top + (bandRect.height / 2);
      
      var closestVideo = null;
      var minDistance = Infinity;
      
      each(videos, function(video){
        if (!video) return;
        try {
          var rect = video.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          
          // Вычисляем центр видео по вертикали
          var videoCenterY = rect.top + (rect.height / 2);
          
          // Вычисляем расстояние от центра playband до центра видео
          var distance = Math.abs(videoCenterY - bandCenterY);
          
          if (distance < minDistance){
            minDistance = distance;
            closestVideo = video;
          }
        } catch(_){}
      });
      
      return closestVideo;
    } catch(_){ return null; }
  }

  // Проверяет, является ли видео talking head
  function isTalkingHeadVideo(video, caseEl){
    if (!video || !caseEl) return false;
    try {
      var talkingHeadVideos = getTalkingHeadVideos(caseEl);
      if (talkingHeadVideos.indexOf(video) !== -1) return true;
      
      // Дополнительная проверка через closest
      var container = qs(caseEl, '.cases-grid__item__container');
      if (container) {
        var parent = video.parentElement;
        while (parent && parent !== container) {
          if (parent.classList && (
            parent.classList.contains('talking-head') || 
            parent.className.indexOf('talking-head') !== -1 ||
            parent.className.indexOf('talking') !== -1
          )) {
            return true;
          }
          parent = parent.parentElement;
        }
      }
      return false;
    } catch(_){ return false; }
  }

  // Управление talking head видео (независимо от playband)
  function playTalkingHeadVideos(caseEl){
    if (!caseEl) return;
    try {
      var talkingHeadVideos = getTalkingHeadVideos(caseEl);
      each(talkingHeadVideos, function(video){
        if (!video) return;
        if (video.paused && typeof video.play === 'function') {
          var p = video.play();
          if (p && p.catch) p.catch(function(){});
        }
      });
    } catch(e){}
  }

  function pauseTalkingHeadVideos(caseEl){
    if (!caseEl) return;
    try {
      var talkingHeadVideos = getTalkingHeadVideos(caseEl);
      each(talkingHeadVideos, function(video){
        if (!video) return;
        if (typeof video.pause === 'function') {
          video.pause();
        }
      });
    } catch(e){}
  }

  function updatePlaybandPlayback(){
    if (!playbandActiveItem) return;
    try {
      var isActive = playbandActiveItem.classList && playbandActiveItem.classList.contains('active');
      if (!isActive) {
        // Если кейс не активен, ставим все на паузу (кроме talking head)
        each(playbandVideos, function(video){
          if (!video) return;
          // Дополнительная проверка: пропускаем talking head
          if (isTalkingHeadVideo(video, playbandActiveItem)) return;
          if (typeof video.pause === 'function') video.pause();
        });
        return;
      }

      var overlappingVideos = [];
      var anyOverlapping = false;
      
      // Сначала проверяем пересечения с playband
      each(playbandVideos, function(video){
        if (!video) return;
        
        // Дополнительная защита: пропускаем talking head видео
        if (isTalkingHeadVideo(video, playbandActiveItem)) {
          return;
        }
        
        var isOverlapping = isOverlappingPlayband(video);
        
        if (isOverlapping) {
          anyOverlapping = true;
          overlappingVideos.push(video);
          // Запускаем пересекающиеся видео
          if (video.paused && typeof video.play === 'function') {
            var p = video.play();
            if (p && p.catch) p.catch(function(){});
          }
        } else {
          // Ставим на паузу непересекающиеся видео
          if (typeof video.pause === 'function') video.pause();
        }
      });
      
      // Если ни одно видео не пересекается с playband, находим ближайшее
      if (!anyOverlapping && playbandVideos.length > 0) {
        // Фильтруем talking head из списка для поиска ближайшего
        var nonTalkingVideos = [];
        each(playbandVideos, function(video){
          if (!video) return;
          if (!isTalkingHeadVideo(video, playbandActiveItem)) {
            nonTalkingVideos.push(video);
          }
        });
        
        if (nonTalkingVideos.length > 0) {
          var closestVideo = findClosestVideoToPlayband(nonTalkingVideos);
          if (closestVideo) {
            if (closestVideo.paused && typeof closestVideo.play === 'function') {
              var p = closestVideo.play();
              if (p && p.catch) p.catch(function(){});
            }
          }
        }
      }
    } catch(e){}
  }

  function onScrollOrResize(){
    if (playbandRafPending) return;
    playbandRafPending = true;
    requestAnimationFrame(function(){
      playbandRafPending = false;
      updatePlaybandPlayback();
    });
  }

  function attachPlaybandToItem(item){
    if (!item) return;
    try {
      ensurePlayband();
      if (playbandActiveItem && playbandActiveItem !== item) {
        detachPlayband();
      }
      playbandActiveItem = item;
      playbandVideos = getPlaybandVideos(item);
      
      if (window.addEventListener) {
        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize, { passive: true });
      }
      updatePlaybandPlayback();
    } catch(e){}
  }

  function detachPlayband(itemLosingActive){
    if (!playbandActiveItem || (itemLosingActive && itemLosingActive !== playbandActiveItem)) return;
    try {
      if (window.removeEventListener) {
        window.removeEventListener('scroll', onScrollOrResize);
        window.removeEventListener('resize', onScrollOrResize);
      }
      // Ставим на паузу все видео playband (talking head не затрагиваем, они управляются отдельно)
      each(playbandVideos, function(video){
        if (!video) return;
        // Пропускаем talking head - они управляются отдельно
        if (isTalkingHeadVideo(video, playbandActiveItem)) return;
        if (typeof video.pause === 'function') video.pause();
      });
      playbandActiveItem = null;
      playbandVideos = [];
    } catch(e){}
  }

  // Определение активного кейса по MutationObserver на смену класса active
  function setupActiveCaseObserver(){
    if (typeof MutationObserver === 'undefined') {
      return;
    }

    var lastActiveCase = null;

    // Функция обработки смены активного кейса
    function handleActiveCaseChangeWrapper(newActiveCase){
      if (!newActiveCase || newActiveCase === lastActiveCase) return;
      
      // Отвязываем playband от предыдущего кейса и останавливаем talking head
      if (lastActiveCase) {
        pauseTalkingHeadVideos(lastActiveCase);
        detachPlayband(lastActiveCase);
      }
      
      lastActiveCase = newActiveCase;
      
      // Обрабатываем смену активного кейса
      try { 
        handleActiveCaseChange(newActiveCase); 
        // Привязываем playband к новому активному кейсу
        attachPlaybandToItem(newActiveCase);
      } catch(e){}
    }

    // Создаем MutationObserver для отслеживания изменений класса active
    var observer = new MutationObserver(function(mutations){
      mutations.forEach(function(mutation){
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') return;
        
        var target = mutation.target;
        if (!target) return;
        
        // Проверяем, является ли элемент кейсом
        var isCase = false;
        try {
          isCase = target.classList && (
            target.classList.contains('cases-grid__item') || 
            target.classList.contains('case')
          );
        } catch(_){}
        
        if (!isCase) return;
        
        // Получаем старое значение класса
        var wasActive = false;
        try {
          var oldValue = mutation.oldValue || '';
          wasActive = oldValue.split(/\s+/).indexOf('active') !== -1;
        } catch(_){}
        
        // Проверяем текущее состояние
        var isActive = false;
        try {
          isActive = target.classList && target.classList.contains('active');
        } catch(_){}
        
        if (!wasActive && isActive){
          // Класс active добавлен
          handleActiveCaseChangeWrapper(target);
        } else if (wasActive && !isActive){
          // Класс active удален
          pauseTalkingHeadVideos(target);
          detachPlayband(target);
        }
      });
    });

    // Находим контейнер с кейсами для наблюдения
    var scroller = qs(document, '.main-section') || document.body || document;
    var items = scroller.querySelectorAll ? scroller.querySelectorAll('.cases-grid__item, .case') : null;
    
    if (!items || !items.length) {
      return;
    }

    // Начинаем наблюдение за каждым кейсом
    each(items, function(item){
      try {
        observer.observe(item, {
          attributes: true,
          attributeFilter: ['class'],
          attributeOldValue: true
        });
      } catch(e){}
    });
    
    // Начальная проверка активного кейса
    var initialActiveCase = qs(document, '.cases-grid__item.active, .case.active');
    if (initialActiveCase){
      handleActiveCaseChangeWrapper(initialActiveCase);
      // Привязываем playband к начальному активному кейсу
      attachPlaybandToItem(initialActiveCase);
    }
  }

  // Инициализация
  function initVideoLazy(){
    // Настраиваем отслеживание активного кейса
    setupActiveCaseObserver();
    
    // Начальная обработка активного кейса, если он есть
    var activeCase = qs(document, '.cases-grid__item.active, .case.active');
    if (activeCase){
      try { 
        handleActiveCaseChange(activeCase);
        // Привязываем playband к начальному активному кейсу
        attachPlaybandToItem(activeCase);
      } catch(e){}
    }
  }

  // Запуск при готовности DOM
  if (typeof document !== 'undefined'){
    function initAndStart(){
      initVideoLazy();
    }
    
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', initAndStart, { once: true });
    } else {
      initAndStart();
    }

    // После полной загрузки страницы единоразово вызываем play через playband
    function enablePlaybandAfterLoad(){
      if (playbandActiveItem && playbandVideos.length > 0){
        // Небольшая задержка для гарантии готовности видео
        setTimeout(function(){
          updatePlaybandPlayback();
        }, 100);
      }
    }

    if (document.readyState === 'complete'){
      enablePlaybandAfterLoad();
    } else if (typeof window !== 'undefined'){
      window.addEventListener('load', enablePlaybandAfterLoad, { once: true });
    }
  }
})();
