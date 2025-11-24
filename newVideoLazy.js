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
        }, 200);
      } else {
        console.log('[videoLazy] Все видео готовы сразу');
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
      
      lastActiveCase = newActiveCase;
      
      // Обрабатываем смену активного кейса
      try { 
        handleActiveCaseChange(newActiveCase); 
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
        
        // Проверяем, добавлен ли класс active
        var hasActive = false;
        try {
          hasActive = target.classList && target.classList.contains('active');
        } catch(_){}
        
        if (hasActive){
          handleActiveCaseChangeWrapper(target);
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
          attributeFilter: ['class']
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
      try { handleActiveCaseChange(activeCase); } catch(e){ 
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
  }
})();
