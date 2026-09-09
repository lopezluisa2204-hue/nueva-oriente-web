// Carrusel de "Servicios": rota automáticamente entre las tarjetas para que
// la sección no crezca en vertical a medida que se agregan más servicios.
// Usa scroll nativo con snap (funciona con swipe en celular) y controla el
// autoplay, las flechas y los puntos con JS.
(function () {
  function initServicesCarousel() {
    const track = document.getElementById("servicesTrack");
    const prevBtn = document.getElementById("servicesPrev");
    const nextBtn = document.getElementById("servicesNext");
    const dotsWrap = document.getElementById("servicesDots");
    if (!track || !dotsWrap) return;

    const cards = Array.from(track.children);
    if (cards.length === 0) return;

    // Un punto por tarjeta.
    cards.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", "Ir al servicio " + (i + 1));
      dot.addEventListener("click", () => goTo(i, true));
      dotsWrap.appendChild(dot);
    });
    const dots = Array.from(dotsWrap.children);

    let current = 0;
    let autoplayTimer = null;

    function cardsPerView() {
      const cardWidth = cards[0].getBoundingClientRect().width;
      if (!cardWidth) return 1;
      return Math.max(1, Math.round(track.clientWidth / cardWidth));
    }

    function updateActiveDot() {
      const perView = cardsPerView();
      // La tarjeta "activa" es la más cercana al borde izquierdo visible.
      let closest = 0;
      let closestDist = Infinity;
      cards.forEach((card, i) => {
        const dist = Math.abs(card.offsetLeft - track.scrollLeft);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      current = closest;
      dots.forEach((d, i) => d.classList.toggle("active", i === closest));
    }

    function goTo(index, userInitiated) {
      const clamped = (index + cards.length) % cards.length;
      track.scrollTo({ left: cards[clamped].offsetLeft, behavior: "smooth" });
      current = clamped;
      if (userInitiated) restartAutoplay();
    }

    function next() {
      const perView = cardsPerView();
      goTo(current + perView >= cards.length ? 0 : current + perView);
    }

    function startAutoplay() {
      stopAutoplay();
      autoplayTimer = setInterval(next, 4500);
    }
    function stopAutoplay() {
      if (autoplayTimer) clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
    function restartAutoplay() {
      stopAutoplay();
      startAutoplay();
    }

    if (prevBtn) prevBtn.addEventListener("click", () => goTo(current - cardsPerView(), true));
    if (nextBtn) nextBtn.addEventListener("click", () => goTo(current + cardsPerView(), true));

    track.addEventListener("mouseenter", stopAutoplay);
    track.addEventListener("mouseleave", startAutoplay);
    track.addEventListener("touchstart", stopAutoplay, { passive: true });
    track.addEventListener("touchend", startAutoplay, { passive: true });

    let scrollTimeout;
    track.addEventListener("scroll", () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateActiveDot, 100);
    });

    window.addEventListener("resize", () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateActiveDot, 150);
    });

    updateActiveDot();
    startAutoplay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initServicesCarousel);
  } else {
    initServicesCarousel();
  }
})();
