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
        console.log('[videoLazy] Source уже был создан ранее для этого видео, пропускаем', video);
        return false;
      }

      // Если source уже есть в DOM, помечаем и пропускаем
      if (hasVideoSource(video)) {
        console.log('[videoLazy] Видео уже имеет source в DOM, помечаем как созданное', video);
        video.__videoLazySourceCreated = true;
        return false;
      }

      // Для всех видео (включая talking-head) используем data-src
      var srcAttr = video.getAttribute ? video.getAttribute('data-src') : null;
      if (!srcAttr && video.dataset && video.dataset.src) {
        srcAttr = video.dataset.src;
      }

      if (!srcAttr || !srcAttr.length) {
        console.log('[videoLazy] Видео не имеет атрибута data-src', video);
        return false;
      }

      console.log('[videoLazy] Создаем source для видео из атрибута:', srcAttr, video);
      
      // Создаем source элемент
      var source = document.createElement('source');
      source.src = srcAttr;
      source.type = 'video/mp4';
      
      // Добавляем source в video
      video.appendChild(source);
      
      // Помечаем, что source был создан
      video.__videoLazySourceCreated = true;
      
      console.log('[videoLazy] Source создан и добавлен в видео', video);
      return true;
    } catch(e){ 
      console.error('[videoLazy] Ошибка при создании source для видео', e);
      return false;
    }
  }

  // 3. Вызов load()
  function loadVideoIfNeeded(video){
    if (!video) return;
    try {
      // Проверяем флаг, что load уже был вызван
      if (video.__videoLazyLoadCalled) {
        console.log('[videoLazy] load() уже был вызван ранее для этого видео, пропускаем', video);
        return;
      }

      if (hasVideoSource(video)) {
        console.log('[videoLazy] Видео имеет source, вызываем load()', video);
        video.load();
        // Помечаем, что load был вызван
        video.__videoLazyLoadCalled = true;
      } else {
        console.log('[videoLazy] Видео не имеет source, пропускаем load', video);
      }
    } catch(e){ 
      console.error('[videoLazy] Ошибка при вызове load() для видео', e);
    }
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

  // Функции для управления talking head видео
  function playTalkingHeadVideos(caseEl){
    if (!caseEl) return;
    try {
      var talkingHeadVideos = getTalkingHeadVideos(caseEl);
      each(talkingHeadVideos, function(video){
        if (!video) return;
        if (video.paused && typeof video.play === 'function') {
          console.log('[videoLazy] Запуск talking head видео', video);
          var p = video.play();
          if (p && p.catch) p.catch(function(e){
            console.warn('[videoLazy] Ошибка при запуске talking head видео:', e);
          });
        }
      });
    } catch(e){
      console.warn('[videoLazy] Ошибка при запуске talking head видео:', e);
    }
  }

  function pauseTalkingHeadVideos(caseEl){
    if (!caseEl) return;
    try {
      var talkingHeadVideos = getTalkingHeadVideos(caseEl);
      each(talkingHeadVideos, function(video){
        if (!video) return;
        if (typeof video.pause === 'function') {
          console.log('[videoLazy] Пауза talking head видео', video);
          video.pause();
        }
      });
    } catch(e){
      console.warn('[videoLazy] Ошибка при паузе talking head видео:', e);
    }
  }

  // 5. Загрузка при смене активного кейса
  function handleActiveCaseChange(newCaseEl){
    if (!newCaseEl) return;
    console.log('[videoLazy] Обработка смены активного кейса', newCaseEl);
    
    // Находим все видео и talking head в новом кейсе
    var allVideos = getAllCaseVideos(newCaseEl);
    var talkingHeadVideos = getTalkingHeadVideos(newCaseEl);
    console.log('[videoLazy] Найдено видео в кейсе:', {
      total: allVideos.length,
      talkingHead: talkingHeadVideos.length,
      all: allVideos
    });

    // Создаем source элементы из атрибутов data-src
    console.log('[videoLazy] Создание source элементов для видео');
    
    // Для talking head используем data-src
    each(talkingHeadVideos, function(video){
      var created = createSourceFromAttributes(video, true);
      if (created) {
        console.log('[videoLazy] Source создан для talking head видео', video);
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
          console.log('[videoLazy] Source создан для видео', video);
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
      console.log('[videoLazy] Проверка готовности видео через 100мс');
      
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
      
      console.log('[videoLazy] Видео для проверки готовности:', {
        talkingHead: talkingHeadVideos.length,
        other: allVideos.length - talkingHeadVideos.length,
        total: videosToCheck.length
      });

      var allReady = true;
      each(videosToCheck, function(video){
        var ready = isVideoReady(video);
        console.log('[videoLazy] Видео готово:', ready, video);
        if (!ready) allReady = false;
      });

      if (!allReady){
        console.log('[videoLazy] Не все видео готовы, повторяем проверку через 200мс');
        // Повторяем проверку через 200мс
        setTimeout(function(){
          console.log('[videoLazy] Повторная проверка готовности видео через 200мс');
          
          var allReadyRetry = true;
          each(videosToCheck, function(video){
            var ready = isVideoReady(video);
            console.log('[videoLazy] Видео готово (повторная проверка):', ready, video);
            if (!ready) allReadyRetry = false;
          });

          if (!allReadyRetry){
            console.log('[videoLazy] Видео все еще не готовы после повторной проверки');
          } else {
            console.log('[videoLazy] Все видео готовы после повторной проверки');
          }
          
          // Запускаем talking head видео после проверки готовности
          playTalkingHeadVideos(newCaseEl);
        }, 200);
      } else {
        console.log('[videoLazy] Все видео готовы сразу');
        // Запускаем talking head видео после проверки готовности
        playTalkingHeadVideos(newCaseEl);
      }
    }, 100);
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
      
      console.log('[videoLazy] Создание source элементов для соседних кейсов', {
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
        
        console.log('[videoLazy] Обработка соседнего кейса (index ' + adjIndex + ')', adjacentCase);
        
        // Находим все видео в соседнем кейсе
        var adjacentVideos = getAllCaseVideos(adjacentCase);
        var adjacentTalkingHeadVideos = getTalkingHeadVideos(adjacentCase);
        
        // Создаем source для talking head видео (используем data-src)
        each(adjacentTalkingHeadVideos, function(video){
          if (!video) return;
          var created = createSourceFromAttributes(video, true);
          if (created) {
            console.log('[videoLazy] Source создан для talking head видео в соседнем кейсе (index ' + adjIndex + ')', video);
            // Не вызываем load() для соседних кейсов - только создаем source для предзагрузки
          }
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
            var created = createSourceFromAttributes(video, false);
            if (created) {
              console.log('[videoLazy] Source создан для видео в соседнем кейсе (index ' + adjIndex + ')', video);
              // Не вызываем load() для соседних кейсов - только создаем source для предзагрузки
            }
          }
        });
      });
    } catch(e){
      console.warn('[videoLazy] Ошибка при создании source для соседних кейсов:', e);
    }
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

  function updatePlaybandPlayback(){
    if (!playbandActiveItem) return;
    try {
      var isActive = playbandActiveItem.classList && playbandActiveItem.classList.contains('active');
      if (!isActive) {
        // Если кейс не активен, ставим все на паузу
        each(playbandVideos, function(video){
          if (video && typeof video.pause === 'function') video.pause();
        });
        return;
      }

      var overlappingVideos = [];
      var anyOverlapping = false;
      
      // Сначала проверяем пересечения с playband
      each(playbandVideos, function(video){
        if (!video) return;
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
        var closestVideo = findClosestVideoToPlayband(playbandVideos);
        if (closestVideo) {
          console.log('[videoLazy] Ни одно видео не пересекается с playband, запускаем ближайшее', closestVideo);
          if (closestVideo.paused && typeof closestVideo.play === 'function') {
            var p = closestVideo.play();
            if (p && p.catch) p.catch(function(){});
          }
        }
      }
    } catch(e){
      console.warn('[videoLazy] Ошибка при обновлении playband playback:', e);
    }
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
    } catch(e){
      console.warn('[videoLazy] Ошибка при привязке playband к кейсу:', e);
    }
  }

  function detachPlayband(itemLosingActive){
    if (!playbandActiveItem || (itemLosingActive && itemLosingActive !== playbandActiveItem)) return;
    try {
      if (window.removeEventListener) {
        window.removeEventListener('scroll', onScrollOrResize);
        window.removeEventListener('resize', onScrollOrResize);
      }
      each(playbandVideos, function(video){
        if (video && typeof video.pause === 'function') video.pause();
      });
      playbandActiveItem = null;
      playbandVideos = [];
    } catch(e){
      console.warn('[videoLazy] Ошибка при отвязке playband:', e);
    }
  }

  // Определение активного кейса по MutationObserver на смену класса active
  function setupActiveCaseObserver(){
    if (typeof MutationObserver === 'undefined') {
      console.warn('[videoLazy] MutationObserver не поддерживается');
      return;
    }

    var lastActiveCase = null;

    // Функция обработки смены активного кейса
    function handleActiveCaseChangeWrapper(newActiveCase){
      if (!newActiveCase || newActiveCase === lastActiveCase) return;
      
      console.log('[videoLazy] Обнаружена смена активного кейса через MutationObserver', newActiveCase);
      
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
      } catch(e){ 
        console.error('[videoLazy] Ошибка при обработке смены кейса:', e); 
      }
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
      console.warn('[videoLazy] Не найдены элементы .cases-grid__item или .case');
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
      } catch(e){
        console.warn('[videoLazy] Ошибка при настройке наблюдения за кейсом:', e, item);
      }
    });

    console.log('[videoLazy] MutationObserver настроен для отслеживания класса active у кейсов', items.length);
    
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
    console.log('[videoLazy] Инициализация загрузки видео для десктопа');
    
    // Настраиваем отслеживание активного кейса
    setupActiveCaseObserver();
    
    // Начальная обработка активного кейса, если он есть
    var activeCase = qs(document, '.cases-grid__item.active, .case.active');
    if (activeCase){
      try { 
        handleActiveCaseChange(activeCase);
        // Привязываем playband к начальному активному кейсу
        attachPlaybandToItem(activeCase);
      } catch(e){ 
        console.error('[videoLazy] Ошибка при начальной обработке кейса:', e); 
      }
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
        console.log('[videoLazy] Единоразовый запуск видео через playband после загрузки страницы');
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
