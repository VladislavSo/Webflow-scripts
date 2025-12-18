try { if ("scrollRestoration" in history) { history.scrollRestoration = "manual"; } } catch (_) {}

window.addEventListener("pageshow", () => {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
});

document.addEventListener("DOMContentLoaded", () => {
  try { if ("scrollRestoration" in history) { history.scrollRestoration = "manual"; } } catch (_) {}
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  const preloader = document.querySelector(".preloader-wrapper");
  const logotype = document.querySelector(".preloader-wrapper__logotype");
  const progressBar = document.querySelector(".preloader-wrapper__progress-bar");
  const progressFill = document.querySelector(".preloader-wrapper__progress-bar__fill");

  if (!preloader || !logotype || !progressBar || !progressFill) return;

  document.body.style.overflow = "hidden";

  requestAnimationFrame(() => {
    logotype.style.transform = "translateY(0)";
    logotype.style.opacity = "1";
    progressBar.style.opacity = "1";
  });

  progressFill.style.transition = "width 5s linear";
  progressFill.style.width = "80%";

  window.addEventListener("load", () => {
    progressFill.style.transition = "width 0.5s ease";
    progressFill.style.width = "100%";

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
          document.body.style.overflow = "";
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        }, 300);
      }, 300);
    }, { once: true });
  });
});
