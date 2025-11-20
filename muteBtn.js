(function(){
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;
  if (window.CasesAudio && window.CasesAudio.initMuteHandlers) return;
  window.CasesAudio = window.CasesAudio || {};
  window.CasesAudio.soundOn = !!window.CasesAudio.soundOn;
  window.CasesAudio.initMuteHandlers = true;
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
    window.CasesAudio.soundOn = !window.CasesAudio.soundOn;
    setButtonIconsStateForAll(window.CasesAudio.soundOn);

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
          applySoundStateToCase(item);
        } else if (wasActive && !isActive){
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
