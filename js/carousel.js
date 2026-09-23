// Carruseles del sitio: rotan automáticamente entre tarjetas/imágenes para
// que las secciones no crezcan en vertical a medida que se agregan más
// elementos. Usan scroll nativo con snap (funciona con swipe en celular) y
// controlan el autoplay, las flechas y los puntos con JS.
(function () {
  function createCarousel(opts) {
    const track = document.getElementById(opts.trackId);
    const prevBtn = document.getElementById(opts.prevId);
    const nextBtn = document.getElementById(opts.nextId);
    const dotsWrap = document.getElementById(opts.dotsId);
    if (!track || !dotsWrap) return;

    const cards = Array.from(track.children);
    if (cards.length === 0) return;

    // Un punto por elemento.
    cards.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", "Ir al elemento " + (i + 1));
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
      // El elemento "activo" es el más cercano al borde izquierdo visible.
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
      autoplayTimer = setInterval(next, opts.interval || 4500);
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

  function initCarousels() {
    createCarousel({
      trackId: "servicesTrack",
      prevId: "servicesPrev",
      nextId: "servicesNext",
      dotsId: "servicesDots",
      interval: 4500,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCarousels);
  } else {
    initCarousels();
  }
})();
