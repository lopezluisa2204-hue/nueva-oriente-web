// Número de WhatsApp del negocio (solo dígitos, con código de país)
// ⚠️ Verificar que este número tenga el formato correcto antes de publicar.
const WHATSAPP_NUMBER = "573058881165"; // TODO: verificar, tiene 11 dígitos después del +57 (lo usual son 10)

function buildWhatsAppLink(message) {
  const text = encodeURIComponent(message || "Hola, quiero más información sobre sus propiedades.");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

// Asigna automáticamente los enlaces a todos los botones de WhatsApp de la página
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-wa]").forEach((el) => {
    const customMsg = el.getAttribute("data-wa-msg");
    el.setAttribute("href", buildWhatsAppLink(customMsg));
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener");
  });

    const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav-links");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  initLightbox();
});

// Galería con zoom: funciona en las fotos de la ficha de una propiedad
// (galería principal + sección "Más fotos"). No afecta las tarjetas del catálogo.
function initLightbox() {
  const imgs = Array.from(document.querySelectorAll(".gallery img, .detail-desc .property-grid img"));
  if (imgs.length === 0) return;

  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Cerrar">&times;</button>
    <button class="lightbox-nav lightbox-prev" aria-label="Foto anterior">&#10094;</button>
    <div class="lightbox-img-wrap"><img src="" alt=""></div>
    <button class="lightbox-nav lightbox-next" aria-label="Foto siguiente">&#10095;</button>
    <div class="lightbox-counter"></div>
    <div class="lightbox-hint">Clic en la foto para hacer zoom</div>
  `;
  document.body.appendChild(overlay);

  const overlayImg = overlay.querySelector("img");
  const counter = overlay.querySelector(".lightbox-counter");
  let current = 0;

  function show(i) {
    current = (i + imgs.length) % imgs.length;
    overlayImg.src = imgs[current].src;
    overlayImg.alt = imgs[current].alt || "";
    overlayImg.classList.remove("zoomed");
    counter.textContent = `${current + 1} / ${imgs.length}`;
  }

  function open(i) {
    show(i);
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function close() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  imgs.forEach((img, i) => {
    img.style.cursor = "zoom-in";
    img.addEventListener("click", (e) => {
      e.preventDefault();
      open(i);
    });
  });

  overlay.querySelector(".lightbox-close").addEventListener("click", close);
  overlay.querySelector(".lightbox-prev").addEventListener("click", () => show(current - 1));
  overlay.querySelector(".lightbox-next").addEventListener("click", () => show(current + 1));
  overlayImg.addEventListener("click", () => overlayImg.classList.toggle("zoomed"));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  document.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });
}
