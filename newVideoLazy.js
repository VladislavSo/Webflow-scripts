(function(){
  if (!window.matchMedia || !window.matchMedia('(min-width: 480px)').matches) return;

  function qs(root, sel){ return (root||document).querySelector ? (root||document).querySelector(sel) : null; }
  function qsa(root, sel){ return (root||document).querySelectorAll ? (root||document).querySelectorAll(sel) : []; }
  function each(list, cb){ if(!list) return; (list.forEach ? list.forEach(cb) : Array.prototype.forEach.call(list, cb)); }
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
      if (video.__videoLazySourceCreated) {
        return false;
      }

      if (hasVideoSource(video)) {
        video.__videoLazySourceCreated = true;
        return false;
      }

      var srcAttr = video.getAttribute ? video.getAttribute('data-src') : null;
      if (!srcAttr && video.dataset && video.dataset.src) {
        srcAttr = video.dataset.src;
      }

      if (!srcAttr || !srcAttr.length) {
        return false;
      }

      var source = document.createElement('source');
      source.src = srcAttr;
      source.type = 'video/mp4';

      video.appendChild(source);

      video.__videoLazySourceCreated = true;

      return true;
    } catch(e){
      return false;
    }
  }

  function loadVideoIfNeeded(video){
    if (!video) return;
    try {
      if (video.__videoLazyLoadCalled) {
        return;
      }
      if (hasVideoSource(video)) {
        video.load();
        video.__videoLazyLoadCalled = true;
      }
    } catch(e){
    }
  }

  function getAllCaseVideos(caseEl){
    if (!caseEl) return [];
    var videos = [];
    try {
      var container = qs(caseEl, '.cases-grid__item__container');
      if (container) {
        var containerVideos = qsa(container, 'video');
        each(containerVideos, function(v){ videos.push(v); });
      }
      var talkingHeadVideos = getTalkingHeadVideos(caseEl);
      each(talkingHeadVideos, function(v){ videos.push(v); });
      return Array.from(new Set(videos));
    } catch(_){ return []; }
  }

  function getTalkingHeadVideos(caseEl){
    if (!caseEl) return [];
    try {
      var container = qs(caseEl, '.cases-grid__item__container');
      if (!container) return [];
      var talkingHeadContainer = qs(container, '.cases-grid__item__container__wrap__talking-head');
      if (talkingHeadContainer) {
        return qsa(talkingHeadContainer, 'video');
      }
      return [];
    } catch(_){ return []; }
  }

  function getPlaybandVideos(caseEl){
    if (!caseEl) return [];
    var videos = [];
    try {
      var container = qs(caseEl, '.cases-grid__item__container');
      if (!container) return [];

      var allVideos = qsa(container, 'video');

      each(allVideos, function(video){
        if (!video) return;

        var isInTalkingHead = false;
        try {
          var talkingHeadContainer = video.closest ? video.closest('.cases-grid__item__container__wrap__talking-head') : null;
          if (talkingHeadContainer) {
            isInTalkingHead = true;
          } else {
            var parent = video.parentElement;
            while (parent && parent !== container) {
              if (parent.classList && parent.classList.contains('cases-grid__item__container__wrap__talking-head')) {
                isInTalkingHead = true;
                break;
              }
              parent = parent.parentElement;
            }
          }
        } catch(_){}

        if (!isInTalkingHead) {
          videos.push(video);
        }
      });

      return videos;
    } catch(_){ return []; }
  }

  function handleActiveCaseChange(newCaseEl){
    if (!newCaseEl) return;

    var allVideos = getAllCaseVideos(newCaseEl);
    var talkingHeadVideos = getTalkingHeadVideos(newCaseEl);

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
      try { 
        isTalking = talkingHeadVideos.indexOf(video) !== -1;
        if (!isTalking) {
          var talkingHeadContainer = video.closest ? video.closest('.cases-grid__item__container__wrap__talking-head') : null;
          if (talkingHeadContainer) {
            isTalking = true;
          } else {
            var parent = video.parentElement;
            var container = qs(newCaseEl, '.cases-grid__item__container');
            while (parent && parent !== container && parent !== newCaseEl) {
              if (parent.classList && parent.classList.contains('cases-grid__item__container__wrap__talking-head')) {
                isTalking = true;
                break;
              }
              parent = parent.parentElement;
            }
          }
        }
      } catch(__){}

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
      var videosToCheck = [];

      each(talkingHeadVideos, function(v){ videosToCheck.push(v); });
      each(allVideos, function(v){ 
        if (talkingHeadVideos.indexOf(v) === -1) {
          videosToCheck.push(v); 
        }
      });
      
      videosToCheck = Array.from(new Set(videosToCheck));

      var allReady = true;
      each(videosToCheck, function(video){
        var ready = isVideoReady(video);
        if (!ready) allReady = false;
      });

      if (!allReady){
        setTimeout(function(){
          var allReadyRetry = true;
          each(videosToCheck, function(video){
            var ready = isVideoReady(video);
            if (!ready) allReadyRetry = false;
          });
        }, 200);
      }
    }, 100);
  }

  function createSourceForAdjacentCases(activeCaseEl){
    if (!activeCaseEl) return;

    try {
      var scroller = (document && document.querySelector) ? document.querySelector('.main-section') : null;
      if (!scroller) {
        scroller = document;
      }
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
          if (created) {
          }
        });

        each(adjacentVideos, function(video){
          if (!video) return;
          var isTalking = false;
          try { 
            isTalking = adjacentTalkingHeadVideos.indexOf(video) !== -1;
            if (!isTalking) {
              var talkingHeadContainer = video.closest ? video.closest('.cases-grid__item__container__wrap__talking-head') : null;
              if (talkingHeadContainer) {
                isTalking = true;
              } else {
                var parent = video.parentElement;
                var container = qs(adjacentCase, '.cases-grid__item__container');
                while (parent && parent !== container && parent !== adjacentCase) {
                  if (parent.classList && parent.classList.contains('cases-grid__item__container__wrap__talking-head')) {
                    isTalking = true;
                    break;
                  }
                  parent = parent.parentElement;
                }
              }
            }
          } catch(__){}

          if (!isTalking) {
            var created = createSourceFromAttributes(video, false);
            if (created) {
            }
          }
        });
      });
    } catch(e){
    }
  }

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

          var videoCenterY = rect.top + (rect.height / 2);
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
        each(playbandVideos, function(video){
          if (video && typeof video.pause === 'function') video.pause();
        });
        return;
      }

      var overlappingVideos = [];
      var anyOverlapping = false;

      each(playbandVideos, function(video){
        if (!video) return;
        var isOverlapping = isOverlappingPlayband(video);

        if (isOverlapping) {
          anyOverlapping = true;
          overlappingVideos.push(video);
          if (video.paused && typeof video.play === 'function') {
            var p = video.play();
            if (p && p.catch) p.catch(function(){});
          }
        } else {
          if (typeof video.pause === 'function') video.pause();
        }
      });

      if (!anyOverlapping && playbandVideos.length > 0) {
        var closestVideo = findClosestVideoToPlayband(playbandVideos);
        if (closestVideo) {
          if (closestVideo.paused && typeof closestVideo.play === 'function') {
            var p = closestVideo.play();
            if (p && p.catch) p.catch(function(){});
          }
        }
      }
    } catch(e){
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
    }
  }

  function playTalkingHeadVideos(caseEl){
    if (!caseEl) return;
    try {
      var talkingHeadVideos = getTalkingHeadVideos(caseEl);
      each(talkingHeadVideos, function(video){
        if (!video) return;
        if (video.paused && typeof video.play === 'function') {
          var p = video.play();
          if (p && p.catch) p.catch(function(e){
          });
        }
      });
    } catch(e){
    }
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
    } catch(e){
    }
  }

  function setupActiveCaseObserver(){
    if (typeof MutationObserver === 'undefined') {
      return;
    }

    var lastActiveCase = null;

    function handleActiveCaseChangeWrapper(newActiveCase){
      if (!newActiveCase || newActiveCase === lastActiveCase) return;
      if (lastActiveCase) {
        detachPlayband(lastActiveCase);
      }
      
      lastActiveCase = newActiveCase;

      try {
        handleActiveCaseChange(newActiveCase);
        attachPlaybandToItem(newActiveCase);
        playTalkingHeadVideos(newActiveCase);
      } catch(e){
      }
    }

    var observer = new MutationObserver(function(mutations){
      mutations.forEach(function(mutation){
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') return;

        var target = mutation.target;
        if (!target) return;

        var isCase = false;
        try {
          isCase = target.classList && (
            target.classList.contains('cases-grid__item') ||
            target.classList.contains('case')
          );
        } catch(_){}

        if (!isCase) return;

        var wasActive = false;
        try {
          var oldValue = mutation.oldValue || '';
          wasActive = oldValue.split(/\s+/).indexOf('active') !== -1;
        } catch(_){}

        var isActive = false;
        try {
          isActive = target.classList && target.classList.contains('active');
        } catch(_){}

        if (!wasActive && isActive){
          handleActiveCaseChangeWrapper(target);
        } else if (wasActive && !isActive){
          pauseTalkingHeadVideos(target);
          detachPlayband(target);
        }
      });
    });

    var scroller = qs(document, '.main-section') || document.body || document;
    var items = scroller.querySelectorAll ? scroller.querySelectorAll('.cases-grid__item, .case') : null;

    if (!items || !items.length) {
      return;
    }

    each(items, function(item){
      try {
        observer.observe(item, {
          attributes: true,
          attributeFilter: ['class'],
          attributeOldValue: true
        });
      } catch(e){
      }
    });

    var initialActiveCase = qs(document, '.cases-grid__item.active, .case.active');
    if (initialActiveCase){
      handleActiveCaseChangeWrapper(initialActiveCase);
      attachPlaybandToItem(initialActiveCase);
    }
  }

  function initVideoLazy(){
    setupActiveCaseObserver();
    var activeCase = qs(document, '.cases-grid__item.active, .case.active');
    if (activeCase){
      try {
        handleActiveCaseChange(activeCase);
        attachPlaybandToItem(activeCase);
        playTalkingHeadVideos(activeCase);
      } catch(e){
      }
    }
  }

  if (typeof document !== 'undefined'){
    function initAndStart(){
      initVideoLazy();
    }
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', initAndStart, { once: true });
    } else {
      initAndStart();
    }

    function enablePlaybandAfterLoad(){
      if (playbandActiveItem && playbandVideos.length > 0){
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
