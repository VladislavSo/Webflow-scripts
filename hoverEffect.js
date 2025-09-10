  document.addEventListener("DOMContentLoaded", () => {
    if (!window.matchMedia('(min-width: 480px)').matches) return;

    const items = document.querySelectorAll(".main-container__stack-wrap__wrapper__list__item");

    items.forEach(item => {
      if (!item.classList.contains("card-style")) {
        item.addEventListener("mouseenter", () => {
          item.style.backgroundColor = "#1d1d1d";
        });

        item.addEventListener("mouseleave", () => {
          item.style.backgroundColor = "";
        });
      }
    });
  });