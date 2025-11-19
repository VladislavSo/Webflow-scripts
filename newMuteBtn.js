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

  function applySoundStateToCase(caseEl){
    var videos = findCaseVideos(caseEl);
    if (!videos || !videos.length) return;
    // звук доступен только когда слайд активен
    if (!caseEl.classList.contains('active')){
      videos.forEach(function(v){ try { v.muted = true; } catch(_){ } });
      return;
    }
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
        try { if (v.paused) v.play().catch(function(){}); } catch(_){ }
      });
    } else {
      videos.forEach(function(v){ try { v.muted = true; } catch(_){ } });
    }
  }

  function applySoundStateToActiveCases(){
    var activeCases = $all('.cases-grid__item.active');
    activeCases.forEach(applySoundStateToCase);
  }

  function onMuteButtonClick(ev){
    try{ ev.preventDefault(); ev.stopPropagation(); }catch(_){ }
    var btn = ev.currentTarget;
    var caseEl = getCaseItem(btn);
    var activeCase = caseEl && caseEl.classList.contains('active') ? caseEl : ($all('.cases-grid__item.active')[0] || null);

    if (!activeCase) return;

    // Проверяем текущее состояние флага
    var currentSoundOn = window.CasesAudio.soundOn;

    if (currentSoundOn) {
      // soundOn = true -> меняем на false
      window.CasesAudio.soundOn = false;

      // Находим talking head видео
      var thVideo = activeCase.querySelector('.cases-grid__item__container__wrap__talking-head__video video');
      
      if (thVideo) {
        // Есть talking head: добавляем muted
        try {
          thVideo.muted = true;
          thVideo.setAttribute('muted', '');
        } catch(_) {}
      } else {
        // Нет talking head: добавляем muted первому видео index 0 .story-track-wrapper__slide
        try {
          var storyWrapper = activeCase.querySelector('.story-slider .story-track-wrapper');
          if (storyWrapper) {
            var slides = storyWrapper.querySelectorAll('.story-track-wrapper__slide');
            if (slides && slides.length > 0) {
              var firstSlideVideos = slides[0].querySelectorAll('video');
              if (firstSlideVideos && firstSlideVideos.length > 0) {
                for (var i = 0; i < firstSlideVideos.length; i++) {
                  try {
                    firstSlideVideos[i].muted = true;
                    firstSlideVideos[i].setAttribute('muted', '');
                  } catch(_) {}
                }
              }
            }
          }
        } catch(_) {}
      }
    } else {
      // soundOn = false -> меняем на true
      window.CasesAudio.soundOn = true;

      // Находим talking head видео
      var thVideo2 = activeCase.querySelector('.cases-grid__item__container__wrap__talking-head__video video');
      
      if (thVideo2) {
        // Есть talking head: ставим на паузу, удаляем muted, сбрасываем currentTime, вызываем play
        try {
          thVideo2.pause();
          thVideo2.muted = false;
          thVideo2.removeAttribute('muted');
          thVideo2.currentTime = 0;
          thVideo2.play().catch(function(){});
        } catch(_) {}
      } else {
        // Нет talking head: первое видео index 0 .story-track-wrapper__slide ставим на паузу, удаляем muted, сбрасываем currentTime, вызываем play
        try {
          var storyWrapper2 = activeCase.querySelector('.story-slider .story-track-wrapper');
          if (storyWrapper2) {
            var slides2 = storyWrapper2.querySelectorAll('.story-track-wrapper__slide');
            if (slides2 && slides2.length > 0) {
              var firstSlideVideos2 = slides2[0].querySelectorAll('video');
              if (firstSlideVideos2 && firstSlideVideos2.length > 0) {
                for (var j = 0; j < firstSlideVideos2.length; j++) {
                  try {
                    firstSlideVideos2[j].pause();
                    firstSlideVideos2[j].muted = false;
                    firstSlideVideos2[j].removeAttribute('muted');
                    firstSlideVideos2[j].currentTime = 0;
                    firstSlideVideos2[j].play().catch(function(){});
                  } catch(_) {}
                }
              }
            }
          }
        } catch(_) {}
      }
    }

    // синхронизируем все кнопки
    setButtonIconsStateForAll(window.CasesAudio.soundOn);
    
    // Если есть функция applySoundSettingsToCase в mobVideoLazy.js, вызываем её для применения настроек ко всем видео
    // Это обеспечит правильное применение muted ко всем остальным видео в кейсе
    if (typeof window !== 'undefined' && window.applySoundSettingsToCase) {
      try {
        window.applySoundSettingsToCase(activeCase);
      } catch(_) {}
    }
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
    // Логика управления звуком при смене кейса теперь обрабатывается в mobVideoLazy.js
    // Оставляем только базовую обработку для неактивных кейсов
    var items = $all('.cases-grid__item');
    var obs = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        var item = m.target;
        var wasActive = (m.oldValue || '').split(/\s+/).indexOf('active') !== -1;
        var isActive = item.classList.contains('active');
        if (wasActive && !isActive){
          // Слайд потерял active: вернуть muted для всех видео в кейсе
          var videos = findCaseVideos(item);
          videos.forEach(function(v){ try { v.muted = true; } catch(_){ } });
        }
        // Когда кейс становится активным, звуковые настройки применяются в mobVideoLazy.js
      });
    });
    items.forEach(function(item){
      obs.observe(item, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      initButtons();
      setButtonIconsStateForAll(!!window.CasesAudio.soundOn);
      initMutationForCases();
    });
  } else {
    initButtons();
    setButtonIconsStateForAll(!!window.CasesAudio.soundOn);
    initMutationForCases();
  }
})();
