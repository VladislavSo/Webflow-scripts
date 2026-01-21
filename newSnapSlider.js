(function(){
  if (!window.matchMedia || !window.matchMedia('(max-width: 479px)').matches) return;
  var PROGRESS_ADVANCE_THRESHOLD = 0.98;
  function qs(root, sel){ return (root||document).querySelector ? (root||document).querySelector(sel) : null; }
  function qsa(root, sel){ return (root||document).querySelectorAll ? (root||document).querySelectorAll(sel) : []; }
  function each(list, cb){ if(!list) return; (list.forEach ? list.forEach(cb) : Array.prototype.forEach.call(list, cb)); }

  var onSound = false;

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

  function playVideos(slideEl){
    if (!slideEl) return;
    var videos = qsa(slideEl, '.slide-inner__video-block video, video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      try { if (video && typeof video.play === 'function' && isVideoInActiveContext(video)) { var p = video.play(); if (p && p.catch) p.catch(function(){}); } } catch(_){ }
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
      var isTalking = false;
      try { isTalking = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head__video')); } catch(__){}
      if (!isTalking){
        try { if (typeof video.currentTime === 'number') video.currentTime = 0; } catch(_){ }
      }
    });
  }

  function pauseAllVideosInElement(rootEl){
    if (!rootEl) return;
    var videos = qsa(rootEl, 'video');
    if (!videos || !videos.length) return;
    each(videos, function(video){
      try { if (video && typeof video.pause === 'function') video.pause(); } catch(_){ }
    });
  }

  function hasVideoSource(video){
    if (!video) return false;
    try {
      var hasSourceEl = video.querySelector && video.querySelector('source') !== null;
      var hasSrc = !!(video.src && video.src.length > 0);
      return hasSourceEl || hasSrc;
    } catch(_){ return false; }
  }

  function isVideoReady(video){
    if (!video) return false;
    try {
      if (!hasVideoSource(video)) return false;
      return video.readyState >= 3;
    } catch(_){ return false; }
  }

  function createSourceFromAttributes(video, isTalkingHead){
    if (!video) return false;
    try {
      if (video.__snapSliderSourceCreated) {
        return false;
      }

      if (hasVideoSource(video)) {
        video.__snapSliderSourceCreated = true;
        return false;
      }

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
        return false;
      }

      var source = document.createElement('source');
      source.src = srcAttr;
      source.type = 'video/mp4';
      
      video.appendChild(source);
      
      video.__snapSliderSourceCreated = true;
      
      return true;
    } catch(e){ 
      return false;
    }
  }

  function loadVideoIfNeeded(video){
    if (!video) return;
    try {
      if (video.__snapSliderLoadCalled) {
        return;
      }

      if (hasVideoSource(video)) {
        video.load();
        video.__snapSliderLoadCalled = true;
      }
    } catch(e){ 
    }
  }

  function getAllCaseVideos(caseEl){
    if (!caseEl) return [];
    var videos = [];
    try {
      var wrappers = qsa(caseEl, '.story-track-wrapper');
      each(wrappers, function(wrapper){
        var wrapperVideos = qsa(wrapper, 'video');
        each(wrapperVideos, function(v){ videos.push(v); });
      });
      var talkingHeadVideos = qsa(caseEl, '.cases-grid__item__container__wrap__talking-head video');
      each(talkingHeadVideos, function(v){ videos.push(v); });
      return Array.from(new Set(videos));
    } catch(_){ return []; }
  }

  function getTalkingHeadVideos(caseEl){
    if (!caseEl) return [];
    try {
      return qsa(caseEl, '.cases-grid__item__container__wrap__talking-head video');
    } catch(_){ return []; }
  }

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
      return Array.from(new Set(videos));
    } catch(_){ return []; }
  }

  function safePlayVideo(video, retries, delay){
    if (!video) return;
    retries = retries || 3;
    delay = delay || 300;
    
    try {
      if (!isVideoInActiveContext(video)) return;
      try {
        if (!video.hasAttribute('playsinline')){
          video.setAttribute('playsinline', '');
        }
        
        if (!video.hasAttribute('webkit-playsinline')){
          video.setAttribute('webkit-playsinline', '');
        }
        
        var soundWasEnabledByUser = typeof window !== 'undefined' && 
                                     window.CasesAudio && 
                                     window.CasesAudio.soundOn === true;
        
        var hasMutedAttr = video.hasAttribute('muted');
        var wasExplicitlyUnmuted = video.__snapSliderWasExplicitlyUnmuted;
        
        if (!soundWasEnabledByUser && !wasExplicitlyUnmuted && !hasMutedAttr){
          video.muted = true;
          video.setAttribute('muted', '');
        } else if (hasMutedAttr){
          if (video.muted !== true){
            video.muted = true;
          }
        }
      } catch(e){ 
      }
      
      var p = video.play();
      if (p && typeof p.then === 'function'){
        p.then(function(){
        }).catch(function(error){
          var errorName = error ? (error.name || '') : '';
          var isNotAllowed = errorName === 'NotAllowedError' || 
                            (error && error.message && error.message.indexOf('not allowed') !== -1);
          
          if (isNotAllowed){
            try { video.__snapSliderAutoplayBlocked = true; } catch(_){}
            return;
          }
          
          if (retries > 0){
            setTimeout(function(){
              safePlayVideo(video, retries - 1, delay);
            }, delay);
          }
        });
      }
    } catch(e){
      var errorName = e ? (e.name || '') : '';
      var isNotAllowed = errorName === 'NotAllowedError' || 
                        (e && e.message && e.message.indexOf('not allowed') !== -1);
      
      if (isNotAllowed){
        try { video.__snapSliderAutoplayBlocked = true; } catch(_){}
        return;
      }
      
      if (retries > 0){
        setTimeout(function(){
          safePlayVideo(video, retries - 1, delay);
        }, delay);
      }
    }
  }

  function createSourceForAdjacentCases(activeCaseEl){
    if (!activeCaseEl) return;
    
    try {
      var scroller = (document && document.querySelector) ? document.querySelector('.main-section') : null;
      if (!scroller) return;
      var allCases = scroller.querySelectorAll ? scroller.querySelectorAll('.cases-grid__item, .case') : null;
      if (!allCases || !allCases.length) return;
      
      var casesArray = Array.prototype.slice.call(allCases);
      
      var activeIndex = casesArray.indexOf(activeCaseEl);
      if (activeIndex === -1) return;
      
      var adjacentIndices = [activeIndex - 1, activeIndex + 1];
      
      each(adjacentIndices, function(adjIndex){
        if (adjIndex < 0 || adjIndex >= casesArray.length) return;
        
        var adjacentCase = casesArray[adjIndex];
        if (!adjacentCase) return;
        
        var adjacentVideos = getAllCaseVideos(adjacentCase);
        var adjacentTalkingHeadVideos = getTalkingHeadVideos(adjacentCase);
        
        each(adjacentTalkingHeadVideos, function(video){
          if (!video) return;
          var created = createSourceFromAttributes(video, true);
        });
        
        each(adjacentVideos, function(video){
          if (!video) return;
          var isTalking = false;
          try { isTalking = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head__video')); } catch(__){}
          if (!isTalking) {
            var created = createSourceFromAttributes(video, false);
          }
        });
      });
    } catch(e){
    }
  }

  function handleActiveCaseChange(newCaseEl){
    if (!newCaseEl) return;
    
    var allVideos = getAllCaseVideos(newCaseEl);
    var talkingHeadVideos = getTalkingHeadVideos(newCaseEl);

    if (onSound && talkingHeadVideos && talkingHeadVideos.length > 0){
      each(talkingHeadVideos, function(video){
        if (!video) return;
        try {
          video.currentTime = 0;
        } catch(e){
        }
      });
    }
    
    each(talkingHeadVideos, function(video){
      var created = createSourceFromAttributes(video, true);
      if (created) {
        loadVideoIfNeeded(video);
      } else if (hasVideoSource(video)) {
        loadVideoIfNeeded(video);
      }
    });
    
    each(allVideos, function(video){
      var isTalking = false;
      try { isTalking = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head__video')); } catch(__){}
      if (!isTalking) {
        var created = createSourceFromAttributes(video, false);
        if (created) {
          loadVideoIfNeeded(video);
        } else if (hasVideoSource(video)) {
          loadVideoIfNeeded(video);
        }
      }
    });
    
    createSourceForAdjacentCases(newCaseEl);

    setTimeout(function(){
      if (!isCaseActiveAndEligible(newCaseEl)) return;
      var activeSlideVideos = getActiveSlideVideos(newCaseEl);
      var videosToCheck = [];
      
      each(talkingHeadVideos, function(v){ videosToCheck.push(v); });
      each(activeSlideVideos, function(v){ videosToCheck.push(v); });
      
      videosToCheck = Array.from(new Set(videosToCheck));

      var allReady = true;
      each(videosToCheck, function(video){
        var ready = isVideoReady(video);
        if (!ready) allReady = false;
      });

      if (!allReady){
        setTimeout(function(){
          if (!isCaseActiveAndEligible(newCaseEl)) return;
          var allReadyRetry = true;
          each(videosToCheck, function(video){
            var ready = isVideoReady(video);
            if (!ready) allReadyRetry = false;
          });

          if (allReadyRetry){
            each(talkingHeadVideos, function(video){
              try {
                if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function' && isVideoInActiveContext(video)){
                  var p = video.play();
                  if (p && p.catch) p.catch(function(e){});
                }
              } catch(e){}
            });
            each(activeSlideVideos, function(video){
              try {
                if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function' && isVideoInActiveContext(video)){
                  var p = video.play();
                  if (p && p.catch) p.catch(function(e){});
                }
              } catch(e){}
            });
          } else {
            each(talkingHeadVideos, function(video){
              try {
                if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function' && isVideoInActiveContext(video)){
                  var p = video.play();
                  if (p && p.catch) p.catch(function(e){});
                }
              } catch(e){}
            });
            each(activeSlideVideos, function(video){
              try {
                if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function' && isVideoInActiveContext(video)){
                  var p = video.play();
                  if (p && p.catch) p.catch(function(e){});
                }
              } catch(e){}
            });
          }
        }, 200);
      } else {
        each(talkingHeadVideos, function(video){
          try {
            if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function' && isVideoInActiveContext(video)){
              var p = video.play();
              if (p && p.catch) p.catch(function(e){});
            }
          } catch(e){}
        });
        each(activeSlideVideos, function(video){
          try {
            if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function' && isVideoInActiveContext(video)){
              var p = video.play();
              if (p && p.catch) p.catch(function(e){});
            }
          } catch(e){}
        });
      }
    }, 100);
  }

  function handleActiveSlideChange(slideEl, caseEl){
    if (!slideEl || !caseEl) return;
    
    var activeSlideVideos = qsa(slideEl, 'video');
    if (!activeSlideVideos || !activeSlideVideos.length){
      return;
    }
    
    each(activeSlideVideos, function(video){
      var created = createSourceFromAttributes(video, false);
      if (created) {
        loadVideoIfNeeded(video);
      } else if (hasVideoSource(video)) {
        loadVideoIfNeeded(video);
      }
    });

    function checkAndPlay(){
      if (!isCaseActiveAndEligible(caseEl)) return;
      var allReady = true;
      each(activeSlideVideos, function(video){
        var ready = isVideoReady(video);
        if (!ready) allReady = false;
      });

      if (!allReady){
        setTimeout(checkAndPlay, 100);
      } else {
        each(activeSlideVideos, function(video){
          try {
            if (video && !video.__snapSliderAutoplayBlocked && typeof video.play === 'function' && isVideoInActiveContext(video)){
              var p = video.play();
              if (p && p.catch) p.catch(function(e){});
            }
          } catch(e){}
        });
      }
    }

    checkAndPlay();
  }

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

  function isEligibleBySelector(selector){
    var el = qs(document, selector);
    if (!el) return false;
    var r = el.getBoundingClientRect();
    var vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : ((document.documentElement && document.documentElement.clientHeight) ? document.documentElement.clientHeight : 0);
    var m = 2;
    return (r.top <= 0 + m) && (r.bottom >= vh - m);
  }

  function isCasesGridEligible(){
    return isEligibleBySelector('.cases-grid');
  }

  function isMainContainerEligible(){
    return isEligibleBySelector('.main-container');
  }

  function isCaseActiveAndEligible(caseEl){
    try {
      if (!caseEl || !caseEl.classList || !caseEl.classList.contains('active')) return false;
      return isMainContainerEligible();
    } catch(_){ return false; }
  }

  function isVideoInActiveContext(video){
    if (!video) return false;
    try {
      var caseEl = video.closest ? video.closest('.cases-grid__item, .case') : null;
      if (!isCaseActiveAndEligible(caseEl)) return false;
      var slideEl = video.closest ? video.closest('.story-track-wrapper__slide') : null;
      if (slideEl && !(slideEl.classList && slideEl.classList.contains('active'))) return false;
      return true;
    } catch(_){ return false; }
  }

  function setCasesGridInProgress(_ignored){
    var grid = qs(document, '.cases-grid');
    var container = qs(document, '.main-container');
    var contEligible = isMainContainerEligible();
    var gridEligible = isCasesGridEligible();
    try { if (container){ if (contEligible) container.classList.add('in-progress'); else container.classList.remove('in-progress'); } } catch(_){ }
    try { if (grid){ if (gridEligible) grid.classList.add('state-view'); else grid.classList.remove('state-view'); } } catch(_){ }
  }

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

  function extractBrandKeyFromCase(el){
    try {
      var id = el && (el.id || (el.getAttribute ? el.getAttribute('id') : null));
      if (!id) return null;
      return id.replace(/-case$/i, '');
    } catch(_){ return null; }
  }

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

  function getTalkingHeadVideo(root){ return qs(root, '.cases-grid__item__container__wrap__talking-head__video video'); }
  function playTalkingHead(root){ var v = getTalkingHeadVideo(root); if (v && isVideoInActiveContext(v)){ try { var p=v.play(); if (p&&p.catch) p.catch(function(){}); } catch(_){ } } }
  function pauseTalkingHead(root){ var v = getTalkingHeadVideo(root); if (v){ try { v.pause(); } catch(_){ } } }

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

      var beforeTop = scroller.scrollTop || 0;
      var scrRect = scroller.getBoundingClientRect();
      var tgtRect = caseEl.getBoundingClientRect();
      var targetTopWithin = (tgtRect.top - scrRect.top) + beforeTop;
      var desiredTop = Math.max(0, targetTopWithin);

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
      each(items, function(el, idx){ try { el.style.opacity = (idx === currentIndex) ? '1' : '0'; } catch(_){ } });
    }
  }

  function getActiveSlideIndex(wrapperEl){
    var slides = qsa(wrapperEl, '.story-track-wrapper__slide');
    if (!slides || !slides.length) return -1;
    for (var i=0; i<slides.length; i++){
      if (slides[i].classList && slides[i].classList.contains('active')) return i;
    }
    return -1;
  }

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

  function updateWrapperPlayback(wrapperEl){
    if (!wrapperEl) return;
    var slides = qsa(wrapperEl, '.story-track-wrapper__slide');
    var fills = qsa(wrapperEl, '.story-progress__fill');
    if (!slides || !slides.length) return;

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
        if (v.__rafProgressId){ try { cancelAnimationFrame(v.__rafProgressId); } catch(_){ } v.__rafProgressId = null; }
      }

      if (idx !== activeIdx || !caseIsActive){
        detachHandlers(video);
        if (fill) { try { fill.style.transform = 'scaleX(0)'; } catch(_){ } }
        try { pauseAndResetVideos(slide); } catch(_){ }
        try { delete slide.__progressAdvancedOnce; } catch(_){ }
      } else {
        if (video){
          detachHandlers(video);
          var startRafIfNeeded = function(){
            if (video.__rafProgressId) return;
            var rafFn = function(){
              var dur = (isFinite(video.duration) && video.duration > 0) ? video.duration : 0;
              var ct = Math.max(0, video.currentTime || 0);
              var p = dur > 0 ? Math.min(1, ct / dur) : 0;
              if (fill) { try { fill.style.transform = 'scaleX(' + p + ')'; } catch(_){ } }
              try {
                if (p >= PROGRESS_ADVANCE_THRESHOLD && !slide.__progressAdvancedOnce && caseIsActive && isCaseActiveAndEligible(caseEl)){
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
            try {
              if (p >= PROGRESS_ADVANCE_THRESHOLD && !slide.__progressAdvancedOnce && caseIsActive && isCaseActiveAndEligible(caseEl)){
                slide.__progressAdvancedOnce = true;
                var st = wrapperEl.__snapState || {};
                if (!st.isUserInteracting && !st.autoScrollLock && slides.length > 1){
                  var nextIndex = (idx + 1) < slides.length ? (idx + 1) : 0;
                  scrollToSlide(wrapperEl, slides, nextIndex);
                }
              }
            } catch(_){ }
            startRafIfNeeded();
          };
          video.__metaHandler = function(){
            if (video.__progressHandler) video.__progressHandler();
            try {
              if (idx === activeIdx && caseIsActive) { playVideos(slide); }
            } catch(_){ }
          };
          video.__endedHandler = function(){
            if (fill) { try { fill.style.transform = 'scaleX(1)'; } catch(_){ } }
          };
          try { video.addEventListener('timeupdate', video.__progressHandler); } catch(_){ }
          try { video.addEventListener('loadedmetadata', video.__metaHandler, { once: true }); } catch(_){ }
          try { video.addEventListener('ended', video.__endedHandler, { once: true }); } catch(_){ }
        }
      }
    });

    if (fills && activeIdx >= 0){
      for (var f=0; f<fills.length; f++){
        if (f < activeIdx){ try { fills[f].style.transform = 'scaleX(1)'; } catch(_){ }
                          } else if (f > activeIdx){ try { fills[f].style.transform = 'scaleX(0)'; } catch(_){ }
                                                   }
      }
    }
  }

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
      var eligible = isMainContainerEligible();
      setCasesGridInProgress(eligible);
      if (!eligible){
        lastEligibility = false;
        pauseAllVideosInElement(document);
        return;
      }
      if (lastEligibility === false){
        var activeCase = qs(document, '.cases-grid__item.active, .case.active');
        if (activeCase){
          var wrappersInCase0 = qsa(activeCase, '.story-track-wrapper');
          each(wrappersInCase0, function(w){ try { updateWrapperPlayback(w); } catch(_){ } });
          var activeSlides = qsa(activeCase, '.story-track-wrapper__slide.active');
          if (activeSlides && activeSlides.length){ each(activeSlides, function(s){ try { playVideos(s); } catch(_){ } }); }
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
        if (best === lastActiveCase) return;

        (items.forEach ? items.forEach : Array.prototype.forEach).call(items, function(el){
          if (el === best) { el.classList.add('active'); playTalkingHead(el); try { ensureTalkingHeadAutoPlay(el); } catch(_){ } }
          else { el.classList.remove('active'); pauseTalkingHead(el); }
        });

        try {
          var brandKey = extractBrandKeyFromCase(best);
          setStackMiniViewCurrent(brandKey);
          updateStackOpacityByCurrent();
        } catch(_){ }

        (items.forEach ? items.forEach : Array.prototype.forEach).call(items, function(el){
          if (!el.classList || el.classList.contains('active')) return;
          var nonActiveSlides = qsa(el, '.story-track-wrapper__slide.active');
          (nonActiveSlides.forEach ? nonActiveSlides.forEach : Array.prototype.forEach).call(nonActiveSlides, function(s){
            try { s.classList.remove('active'); } catch(_){ }
          });
        });

        (items.forEach ? items.forEach : Array.prototype.forEach).call(items, function(el){
          if (!el.classList || el.classList.contains('active')) return;
          pauseAndResetVideosInElement(el);
        });

        var wrappersInCase = qsa(best, '.story-track-wrapper');
        each(wrappersInCase, function(w){
          try { setActiveSlideInWrapperByCenter(w); } catch(_){ }
          try { updateWrapperPlayback(w); } catch(_){ }
        });

        try { handleActiveCaseChange(best); } catch(e){}

        lastActiveCase = best;
      }
    }

    function onScroll(){
      if (rafId) return;
      rafId = requestAnimationFrame(updateActive);
      if (settleTimer) { clearTimeout(settleTimer); }
      settleTimer = setTimeout(updateActive, 140);
    }

    scroller.addEventListener('scroll', onScroll, { passive:true });
    window.addEventListener('resize', onScroll, { passive:true });
    window.addEventListener('orientationchange', onScroll, { passive:true });
    updateActive();
  }

  function setupActiveObserver(wrapperEl){
    if (!wrapperEl) return;
    var slides = qsa(wrapperEl, '.story-track-wrapper__slide');
    if (!slides || !slides.length) return;

    var ratios = new Map();
    var ACTIVE_THRESHOLD = 0.6;
    var lastActiveSlide = null;

    var io = new IntersectionObserver(function(entries){
      each(entries, function(entry){
        ratios.set(entry.target, entry.intersectionRatio || 0);
      });

      var bestSlide = null; var bestRatio = 0;
      each(slides, function(slide){
        var r = ratios.get(slide) || 0;
        if (r > bestRatio){ bestRatio = r; bestSlide = slide; }
      });

      if (bestSlide && bestRatio >= ACTIVE_THRESHOLD){
        var caseEl = wrapperEl.closest ? wrapperEl.closest('.cases-grid__item, .case') : null;
        var caseIsActive = !!(caseEl && caseEl.classList && caseEl.classList.contains('active'));
        if (caseIsActive){
          var slideChanged = (bestSlide !== lastActiveSlide);
          
          if (slideChanged){
          each(slides, function(slide){
            if (slide === bestSlide){ try { slide.classList.add('active'); } catch(_){ } }
            else { try { slide.classList.remove('active'); } catch(_){ } }
          });
            lastActiveSlide = bestSlide;
          updateWrapperPlayback(wrapperEl);
            try { handleActiveSlideChange(bestSlide, caseEl); } catch(e){}
          } else {
            updateWrapperPlayback(wrapperEl);
          }
        }
      }
    }, { root: wrapperEl, threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] });

    each(slides, function(slide){ io.observe(slide); });

    setTimeout(function(){ 
      var initialActive = qs(wrapperEl, '.story-track-wrapper__slide.active');
      if (initialActive) {
        lastActiveSlide = initialActive;
      }
      updateWrapperPlayback(wrapperEl); 
    }, 0);
  }

  function initializeActiveCasePlaybackOnce(){
    try {
      var scroller = qs(document, '.main-section');
      var cases = scroller ? qsa(scroller, '.cases-grid__item, .case') : qsa(document, '.cases-grid__item, .case');
      if (!cases || !cases.length) return;
      var activeCase = qs(document, '.cases-grid__item.active, .case.active');
      if (!activeCase) return;

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

      var wrappers = qsa(activeCase, '.story-track-wrapper');
      each(wrappers, function(w){
        try { setActiveSlideInWrapperByCenter(w); } catch(_){ }
        try { updateWrapperPlayback(w); } catch(_){ }
      });

      try { handleActiveCaseChange(activeCase); } catch(e){}
    } catch(_){ }
  }

  function initSnapSlider(){
    var wrappers = qsa(document, '.story-track-wrapper');
    if (!wrappers || !wrappers.length) return;
    each(wrappers, function(wrapper){
      var slides = qsa(wrapper, '.story-track-wrapper__slide');
      if (!slides || !slides.length) return;

      if (!qs(wrapper, '.story-progress')){
        try { buildProgress(wrapper, slides.length); } catch(_){ }
      }

      syncProgressDurations(wrapper);

      setupActiveObserver(wrapper);

      try {
        window.addEventListener('resize', function(){ updateWrapperPlayback(wrapper); }, { passive: true });
        window.addEventListener('orientationchange', function(){ updateWrapperPlayback(wrapper); }, { passive: true });
      } catch(_){ }

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

    try { initializeStackZIndex(); } catch(_){ }

    setupCasesActiveOnScrollSnap();

    (function(){
      function updateMuteButtonsIcons(soundOn){
        var muteButtons = qsa(document, '.action-bar__mute-btn');
        each(muteButtons, function(btn){
          if (!btn) return;
          var icons = qsa(btn, '.action-bar__mute-btn__icon');
          if (icons && icons.length >= 2){
            var firstIcon = icons[0];
            var secondIcon = icons[1];
            
            if (soundOn){
              try { firstIcon.classList.remove('active'); } catch(_){}
              try { secondIcon.classList.add('active'); } catch(_){}
            } else {
              try { firstIcon.classList.add('active'); } catch(_){}
              try { secondIcon.classList.remove('active'); } catch(_){}
            }
          }
        });
      }

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

          if (hasTalkingHead){
            videosToControl = talkingHeadVideos;
          }
          else if (!hasTalkingHead && hasMuteButton){
            videosToControl = getFirstSlideVideos(caseEl);
          }

          each(videosToControl, function(video){
            if (!video) return;
            try {
              video.muted = !soundOn;
              
              if (soundOn && hasTalkingHead){
                var isTalkingHeadVideo = false;
                try {
                  isTalkingHeadVideo = !!(video.closest && video.closest('.cases-grid__item__container__wrap__talking-head'));
                } catch(_){}
                
                if (isTalkingHeadVideo){
                  try {
                    video.currentTime = 0;
                  } catch(e){
                  }
                }
              }
            } catch(e){
            }
          });
        });
      }

      function handleMuteButtonClick(ev){
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch(_){}

        onSound = !onSound;

        updateMuteButtonsIcons(onSound);

        applySoundToVideos(onSound);
      }

      function initMuteButtons(){
        var muteButtons = qsa(document, '.action-bar__mute-btn');
        if (!muteButtons || !muteButtons.length) return;

        each(muteButtons, function(btn){
          if (!btn) return;
          try { btn.removeEventListener('click', handleMuteButtonClick); } catch(_){}
          try { btn.addEventListener('click', handleMuteButtonClick); } catch(_){}
        });

        updateMuteButtonsIcons(false);
      }

      if (document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', initMuteButtons, { once: true });
      } else {
        initMuteButtons();
      }
    })();

    function onFirstUserInteraction(){
      var activeCase = qs(document, '.cases-grid__item.active, .case.active');
      if (activeCase){
        var allVideos = getAllCaseVideos(activeCase);
        each(allVideos, function(video){
          if (!video) return;
          
          if (video.__snapSliderAutoplayBlocked){
            try { video.__snapSliderAutoplayBlocked = false; } catch(_){}
          }
          
          if (video.paused && isVideoReady(video) && isVideoInActiveContext(video)){
            try {
              var p = video.play();
              if (p && typeof p.then === 'function'){
                p.then(function(){
                }).catch(function(e){
                });
              }
            } catch(e){
            }
          }
        });
      }
    }

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

    try {
      document.addEventListener('click', function(ev){
        var target = ev.target;
        if (!target) return;
        var stackItem = target.closest ? target.closest('.main-container__stack-wrap__wrapper__list__item') : null;
        var collectionItem = target.closest ? target.closest('.collection-item') : null;
        if (stackItem || collectionItem){
          if (stackItem){
            try {
              ev.preventDefault();
              ev.stopPropagation();
            } catch(_){}
          }
          var container = getStackContainer();
          if (container){
            var isOpen = container.classList.contains('open-stack');
            if (!isOpen){
              const header = document.getElementById('header');
              header.style.zIndex = '9';
              container.classList.add('open-stack');
              try {
                var activeCaseEl = qs(document, '.cases-grid__item.active, .case.active');
                var brandKeyOpen = extractBrandKeyFromCase(activeCaseEl);
                var listOpen = getStackList();
                if (brandKeyOpen && listOpen){
                  var currentElOpen = qs(listOpen, '.main-container__stack-wrap__wrapper__list__item.current');
                  if (!currentElOpen){ setStackMiniViewCurrent(brandKeyOpen); currentElOpen = qs(listOpen, '.main-container__stack-wrap__wrapper__list__item.current'); }
                  if (currentElOpen){ clearStackCardStyles(); currentElOpen.classList.add(brandKeyOpen + '-card-style'); }
                  
                  try {
                    var listItems = qsa(listOpen, '.main-container__stack-wrap__wrapper__list__item');
                    var cardStyleItem = null;
                    var cardStyleIndex = -1;
                    
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
                      var firstItem = listItems[0];
                      var itemHeight = 0;
                      try {
                        var rect = firstItem.getBoundingClientRect();
                        itemHeight = rect.height || 0;
                      } catch(_){}
                      
                      var scrollValue = itemHeight * (cardStyleIndex - 1) + 6 * (cardStyleIndex - 1);
                      if (scrollValue < 0) scrollValue = 0;
                      
                      try {
                        listOpen.scrollTop = scrollValue;
                      } catch(e){
                      }
                    }
                  } catch(e){
                  }
                }
              } catch(_){ }
              try { updateStackOpacityByCurrent(); } catch(_){ }
              try {
                var collectionWrappers = qsa(document, '.collection-wrapper');
                each(collectionWrappers, function(el){ try { el.style.opacity = '0'; } catch(_){ } });
              } catch(_){ }
              return;
            }
            var isCurrent = stackItem.classList && stackItem.classList.contains('current');
            if (isCurrent){
              try {
                var link = stackItem.querySelector ? stackItem.querySelector('a[href]') : null;
                if (link && link.href){ window.open(link.href, '_blank', 'noopener'); }
              } catch(_){ }
              return;
            }
            try {
              const header = document.getElementById('header');
              header.style.zIndex = '14';
              container.classList.remove('open-stack');
              clearStackCardStyles();
              updateStackOpacityByCurrent();
              var brandKeyItem = extractBrandKeyFromStackItem(stackItem);
              scrollToCaseByBrand(brandKeyItem, { instant: true });
              if (brandKeyItem){
                try {
                  var caseElTarget = document.getElementById(brandKeyItem + '-case') || qs(document, '#' + brandKeyItem + '-case');
                  if (caseElTarget){
                    var scroller2 = qs(document, '.main-section');
                    var cases = scroller2 ? qsa(scroller2, '.cases-grid__item, .case') : qsa(document, '.cases-grid__item, .case');
                    each(cases, function(el){ if (el === caseElTarget) { try { el.classList.add('active'); playTalkingHead(el); } catch(__){} } else { try { el.classList.remove('active'); pauseTalkingHead(el); } catch(__){} } });
                  }
                  var listAll = getStackList();
                  if (listAll){
                    var targetItem = qs(listAll, '[brand-data="' + brandKeyItem + '-mini-view"]') || (listAll.querySelector ? listAll.querySelector('[brand-data$="-mini-view"][brand-data^="' + brandKeyItem + '"]') : null);
                    if (targetItem){
                      var currents = qsa(listAll, '.current');
                      each(currents, function(el){ try { el.classList.remove('current'); } catch(__){} });
                      try { targetItem.classList.add('current'); } catch(__){}
                    }
                  }
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
          try {
            updateStackOpacityByCurrent();
            clearStackCardStyles();
          } catch(_){ }
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
        if (!caseEl || !caseEl.classList || !caseEl.classList.contains('active')) return;
        
        var allVideos = getAllCaseVideos(caseEl);
        each(allVideos, function(video){
          if (video && video.__snapSliderAutoplayBlocked){
            try { video.__snapSliderAutoplayBlocked = false; } catch(_){}
          }
        });
        var wrapper = qs(caseEl, '.story-track-wrapper');
        if (!wrapper) return;
        var slides = qsa(wrapper, '.story-track-wrapper__slide');
        if (!slides || !slides.length) return;
        
        var curIdx = getActiveSlideIndex(wrapper);
        if (curIdx === -1){
          var centerSlide = getSlideByCenter(wrapper);
          curIdx = centerSlide ? Array.prototype.indexOf.call(slides, centerSlide) : 0;
          if (curIdx < 0) curIdx = 0;
        }
        
        var nextIdx = curIdx;
        if (isRight) { nextIdx = (curIdx + 1) < slides.length ? (curIdx + 1) : 0; }
        else if (isLeft) { nextIdx = (curIdx - 1) >= 0 ? (curIdx - 1) : (slides.length - 1); }

        try { scrollToSlide(wrapper, slides, nextIdx, { forceIgnoreUser: true }); } catch(_){ }
        try { updateWrapperPlayback(wrapper); } catch(_){ }
      });
    } catch(_){ }
  }

  if (typeof document !== 'undefined'){
    function initAndStartVideos(){
        initSnapSlider();
        initializeActiveCasePlaybackOnce();
      
      if (typeof window !== 'undefined'){
        window.addEventListener('load', function(){
          setTimeout(function(){
            var activeCase = qs(document, '.cases-grid__item.active, .case.active');
            if (activeCase){
              var talkingHeadVideos = getTalkingHeadVideos(activeCase);
              var activeSlideVideos = getActiveSlideVideos(activeCase);
              
              each(talkingHeadVideos, function(video){
                if (video && video.paused && isVideoReady(video) && !video.__snapSliderAutoplayBlocked && isVideoInActiveContext(video)){
                  safePlayVideo(video, 3, 300);
                }
              });
              
              each(activeSlideVideos, function(video){
                if (video && video.paused && isVideoReady(video) && !video.__snapSliderAutoplayBlocked && isVideoInActiveContext(video)){
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
