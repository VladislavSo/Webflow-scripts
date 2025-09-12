document.addEventListener("DOMContentLoaded", () => {
  const preloader = document.querySelector(".preloader-wrapper");
  const logotype = document.querySelector(".preloader-wrapper__logotype");
  const progressBar = document.querySelector(".preloader-wrapper__progress-bar");
  const progressFill = document.querySelector(".preloader-wrapper__progress-bar__fill");

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

      setTimeout(() => {
        preloader.style.transition = "opacity 0.3s ease";
        preloader.style.opacity = "0";

        setTimeout(() => {
          preloader.style.display = "none";
          document.body.style.overflow = ""; // Разблокируем скролл
        }, 300);
      }, 300);
    }, { once: true });
  });
});