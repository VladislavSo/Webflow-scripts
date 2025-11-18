(function(){
  'use strict';
  if (window.CasesAudio && window.CasesAudio.initMuteHandlers) return;
  window.CasesAudio = window.CasesAudio || {};
  window.CasesAudio.soundOn = !!window.CasesAudio.soundOn; // глобальный флаг: был клик и снят muted
  window.CasesAudio.initMuteHandlers = true;
  // При клике по mute/unmute, если в кейсе есть talking-head видео,
  // сбрасываем currentTime только для этих видео (одноразово)
  window.CasesAudio.resetOnlyTheseOnce = null;

  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

  function getCaseItem(el){
    try { return el.closest('.cases-grid__item') || null; } catch(_) { return null; }
  }

  function findCaseVideos(caseEl){
    if (!caseEl) return [];
    try {
      var list = caseEl.querySelectorAll('.cases-grid__item__container video, .cases-grid__item__container__wrap__talking-head__video video, .story-track-wrapper video');
      return Array.prototype.slice.call(list);
    } catch(_) { return []; }
  }

  // Внутри кнопки два икон-элемента. По индексу 0 — mute, по индексу 1 — unmute
  function setButtonIconsState(btn, soundOn){
    try{
      var icons = btn.querySelectorAll('.action-bar__mute-btn__icon, .cases-grid__item__container__wrap__talking-head__btn__icon');
      if (!icons || icons.length < 2) return;
      icons = Array.prototype.slice.call(icons);
      icons.forEach(function(icon){ icon.classList.remove('active'); });
      var index = soundOn ? 1 : 0;
      if (icons[index]) icons[index].classList.add('active');
    }catch(_){ }
  }

  function setButtonIconsStateForAll(soundOn){
    var buttons = $all('.action-bar__mute-btn, .cases-grid__item__container__wrap__talking-head__mute-btn');
    buttons.forEach(function(btn){ setButtonIconsState(btn, soundOn); });
  }

  // Проверка наличия кнопки mute в активном кейсе
  function checkMuteButtonAndUpdateFlag(){
    var activeCase = document.querySelector('.cases-grid__item.active');
    if (!activeCase) return;
    var hasMuteButton = !!(activeCase.querySelector && activeCase.querySelector('.action-bar__mute-btn'));
    if (!hasMuteButton){
      // Если кнопки нет - глобальный флаг всегда muted
      window.CasesAudio.soundOn = false;
    }
  }

  function applySoundStateToCase(caseEl){
    var videos = findCaseVideos(caseEl);
    if (!videos || !videos.length) return;
    // звук доступен только когда слайд активен
    if (!caseEl.classList.contains('active')){
      videos.forEach(function(v){ try { v.muted = true; } catch(_){ } });
      return;
    }
    // Проверяем наличие кнопки mute перед применением состояния
    checkMuteButtonAndUpdateFlag();
    if (window.CasesAudio.soundOn){
      var listToReset = window.CasesAudio.resetOnlyTheseOnce;
      videos.forEach(function(v){
        try { v.muted = false; } catch(_){ }
        if (listToReset){
          if (listToReset.indexOf(v) !== -1){
            try { v.currentTime = 0; } catch(_){ }
          }
        } else {
          try { v.currentTime = 0; } catch(_){ }
        }
        try { v.volume = 1; } catch(_){ }
      });
    } else {
      videos.forEach(function(v){ try { v.muted = true; } catch(_){ } });
    }
  }

  function applySoundStateToActiveCases(){
    var activeCases = $all('.cases-grid__item.active');
    activeCases.forEach(applySoundStateToCase);
  }

  // Проверка готовности видео: есть source и был вызван load
  function isVideoReady(video){
    if (!video) return false;
    try {
      var hasSource = !!(video.src || (video.querySelector && video.querySelector('source')));
      if (!hasSource) return false;
      return video.readyState >= 2;
    } catch(_){
      return false;
    }
  }

  // Безопасный запуск видео: проверяем готовность перед play
  function safePlayVideo(video){
    if (!video || !video.paused) return;
    try {
      // Логирование
      var hasSource = !!(video.src || (video.querySelector && video.querySelector('source')));
      var soundOn = !!(window.CasesAudio && window.CasesAudio.soundOn);
      var isMuted = video.muted;
      console.log('[muteBtn] safePlayVideo:', {
        hasSource: hasSource,
        soundOn: soundOn,
        muted: isMuted,
        willCallPlay: true
      });

      if (!isVideoReady(video)){
        if (!video.src && (!video.querySelector || !video.querySelector('source'))){
          var mobAttr = typeof video.getAttribute === 'function' ? video.getAttribute('mob-data-src') : null;
          var dataAttr = video.dataset ? video.dataset.src : null;
          var dataSrcAttr = mobAttr || dataAttr;
          if (dataSrcAttr){
            var source = document.createElement('source');
            source.src = dataSrcAttr;
            source.type = 'video/mp4';
            video.appendChild(source);
            console.log('[muteBtn] Created source from attributes:', dataSrcAttr);
          }
        }
        try { video.load(); } catch(_){ }
        var resolved = false;
        var timeoutId = setTimeout(function(){
          if (!resolved){
            resolved = true;
            try {
              var finalMuted = video.muted;
              console.log('[muteBtn] play() called (timeout)', {
                muted: finalMuted,
                soundOn: !!(window.CasesAudio && window.CasesAudio.soundOn)
              });
              var p = video.play();
              if (p && p.catch) p.catch(function(){});
            } catch(_){ }
          }
        }, 5000);
        var onCanPlay = function(){
          if (!resolved){
            resolved = true;
            clearTimeout(timeoutId);
            try {
              var finalMuted = video.muted;
              console.log('[muteBtn] play() called (canplay)', {
                muted: finalMuted,
                soundOn: !!(window.CasesAudio && window.CasesAudio.soundOn)
              });
              var p = video.play();
              if (p && p.catch) p.catch(function(){});
            } catch(_){ }
          }
        };
        video.addEventListener('canplay', onCanPlay, { once: true });
        video.addEventListener('error', onCanPlay, { once: true });
      } else {
        var finalMuted = video.muted;
        console.log('[muteBtn] play() called (ready)', {
          muted: finalMuted,
          soundOn: !!(window.CasesAudio && window.CasesAudio.soundOn)
        });
        var p = video.play();
        if (p && p.catch) p.catch(function(){});
      }
    } catch(_){ }
  }

  // Запустить видео: talking-head если есть, иначе видео в активном слайде
  function playVideosOnMute(caseEl){
    if (!caseEl || !caseEl.classList.contains('active')) return;
    try {
      // Ищем talking-head видео
      var talkingHeadVideo = caseEl.querySelector('.cases-grid__item__container__wrap__talking-head__video video');
      if (talkingHeadVideo){
        // Если есть talking-head - запускаем его
        safePlayVideo(talkingHeadVideo);
      } else {
        // Если нет talking-head - запускаем видео в активном слайде
        var activeSlides = caseEl.querySelectorAll('.story-track-wrapper__slide.active');
        if (activeSlides && activeSlides.length){
          for (var i = 0; i < activeSlides.length; i++){
            var videos = activeSlides[i].querySelectorAll('video');
            if (videos && videos.length){
              for (var j = 0; j < videos.length; j++){
                safePlayVideo(videos[j]);
              }
            }
          }
        }
      }
    } catch(_){ }
  }

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
        var thVideos = caseEl.querySelectorAll('.cases-grid__item__container__wrap__talking-head__video video');
        thVideos = Array.prototype.slice.call(thVideos || []);
        if (thVideos.length){
          window.CasesAudio.resetOnlyTheseOnce = thVideos;
        }
      }catch(_){ }
    }
    if (caseEl) applySoundStateToCase(caseEl);
    applySoundStateToActiveCases();
    
    // Запускаем видео после применения состояния звука для всех активных кейсов
    var activeCases = $all('.cases-grid__item.active');
    activeCases.forEach(function(activeCase){
      playVideosOnMute(activeCase);
    });
    
    // Очистить одноразовый список после применения ко всем активным
    window.CasesAudio.resetOnlyTheseOnce = null;
  }

  function initButtons(){
    var buttons = $all('.action-bar__mute-btn, .cases-grid__item__container__wrap__talking-head__mute-btn');
    buttons.forEach(function(btn){
      btn.removeEventListener('click', onMuteButtonClick, false);
      btn.addEventListener('click', onMuteButtonClick, false);
      setButtonIconsState(btn, !!window.CasesAudio.soundOn);
    });
  }

  function initMutationForCases(){
    var items = $all('.cases-grid__item');
    var obs = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        var item = m.target;
        var wasActive = (m.oldValue || '').split(/\s+/).indexOf('active') !== -1;
        var isActive = item.classList.contains('active');
        if (!wasActive && isActive){
          // Слайд стал активным: проверяем наличие кнопки mute и обновляем флаг
          checkMuteButtonAndUpdateFlag();
          // Если глобально включен звук, запускаем с начала; иначе оставляем muted
          applySoundStateToCase(item);
        } else if (wasActive && !isActive){
          // Слайд потерял active: вернуть muted для всех видео в кейсе
          var videos = findCaseVideos(item);
          videos.forEach(function(v){ try { v.muted = true; } catch(_){ } });
        }
      });
    });
    items.forEach(function(item){
      obs.observe(item, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      // Проверяем наличие кнопки mute при инициализации
      checkMuteButtonAndUpdateFlag();
      initButtons();
      setButtonIconsStateForAll(!!window.CasesAudio.soundOn);
      initMutationForCases();
    });
  } else {
    // Проверяем наличие кнопки mute при инициализации
    checkMuteButtonAndUpdateFlag();
    initButtons();
    setButtonIconsStateForAll(!!window.CasesAudio.soundOn);
    initMutationForCases();
  }
})();
