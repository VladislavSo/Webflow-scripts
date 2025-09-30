// Режим ручного восстановления позиции скролла — как можно раньше
try { if ("scrollRestoration" in history) { history.scrollRestoration = "manual"; } } catch (_) {}

// При возврате из bfcache и на показ страницы — закрепляем top=0
window.addEventListener("pageshow", () => {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
});

document.addEventListener("DOMContentLoaded", () => {
  // Всегда стартуем со скроллом в самый верх
  try { if ("scrollRestoration" in history) { history.scrollRestoration = "manual"; } } catch (_) {}
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  const preloader = document.querySelector(".preloader-wrapper");
  const logotype = document.querySelector(".preloader-wrapper__logotype");
  const progressBar = document.querySelector(".preloader-wrapper__progress-bar");
  const progressFill = document.querySelector(".preloader-wrapper__progress-bar__fill");
  const cookiesBlock = document.querySelector(".preloader-wrapper__cookies-block");
  const cookiesBtn = document.querySelector(".preloader-wrapper__cookies-block__btn");

  if (!preloader || !logotype || !progressBar || !progressFill) return;

  // Блокируем скролл по умолчанию
  document.body.style.overflow = "hidden";

  // Появление логотипа и прогресс-бара
  requestAnimationFrame(() => {
    logotype.style.transform = "translateY(0)";
    logotype.style.opacity = "1";
    progressBar.style.opacity = "1";
  });

  // Запуск анимации "загрузки" до 80% за 5с
  progressFill.style.transition = "width 5s linear";
  progressFill.style.width = "80%";

  // Когда DOM загружен — ускоряем до 100%
  window.addEventListener("load", () => {
    progressFill.style.transition = "width 0.5s ease";
    progressFill.style.width = "100%";

    // После окончания анимации скрываем элементы
    progressFill.addEventListener("transitionend", () => {
      progressBar.style.transition = "opacity 0.3s ease";
      logotype.style.transition = "opacity 0.3s ease";
      progressBar.style.opacity = "0";
      logotype.style.opacity = "0";

      // Через 300 мс показываем блок cookies
      setTimeout(() => {
        if (cookiesBlock) {
          cookiesBlock.style.transition = "opacity 0.3s ease";
          cookiesBlock.style.opacity = "1";
          cookiesBlock.style.pointerEvents = "auto";
        }
      }, 300);

      // Функция продолжения скрытия прелоадера (как было раньше)
      const proceedToHidePreloader = () => {
        setTimeout(() => {
          preloader.style.transition = "opacity 0.3s ease";
          preloader.style.opacity = "0";

          setTimeout(() => {
            preloader.style.display = "none";
            document.body.style.overflow = ""; // Разблокируем скролл
            // Дополнительно закрепим положение в самом верху после скрытия прелоадера
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
          }, 300);
        }, 300);
      };

      // По клику на кнопку скрываем cookies и продолжаем, иначе — автопродолжение
      if (cookiesBtn && cookiesBlock) {
        cookiesBtn.addEventListener("click", () => {
          cookiesBlock.style.transition = "opacity 0.3s ease";
          cookiesBlock.style.opacity = "0";
          cookiesBlock.style.pointerEvents = "none";
          proceedToHidePreloader();
        }, { once: true });
      } else {
        proceedToHidePreloader();
      }
    }, { once: true });
  });
});
