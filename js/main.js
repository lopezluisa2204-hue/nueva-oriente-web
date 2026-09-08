// Número de WhatsApp del negocio (solo dígitos, con código de país)
// ⚠️ Verificar que este número tenga el formato correcto antes de publicar.
const WHATSAPP_NUMBER = "573058881165"; // TODO: verificar, tiene 11 dígitos después del +57 (lo usual son 10)

function buildWhatsAppLink(message) {
  const text = encodeURIComponent(message || "Hola, quiero más información sobre sus propiedades.");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

// Asigna los enlaces de WhatsApp a todos los botones dentro de un contenedor
// (document por defecto). Se puede volver a llamar sobre contenido agregado
// dinámicamente después de cargar la página (por ejemplo, tras pintar el
// catálogo o la ficha de una propiedad desde data/properties.json).
function attachWaLinks(root) {
  (root || document).querySelectorAll("[data-wa]").forEach((el) => {
    const customMsg = el.getAttribute("data-wa-msg");
    el.setAttribute("href", buildWhatsAppLink(customMsg));
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener");
  });
}

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPrice(n) {
  n = parseInt(n || 0, 10);
  if (isNaN(n)) return "$ 0";
  return "$ " + n.toLocaleString("es-CO");
}

// Carga el catálogo de propiedades desde data/properties.json.
// Ese archivo es el que edita el panel de administrador (/admin) —
// agregar, quitar o modificar una propiedad ahí actualiza el sitio
// automáticamente, sin tocar código.
async function loadProperties() {
  const res = await fetch("data/properties.json", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar el catálogo de propiedades");
  const data = await res.json();
  // El panel de administrador (Decap CMS) guarda la lista dentro de la
  // clave "items". Se admite también un array plano por compatibilidad.
  return Array.isArray(data) ? data : (data.items || []);
}

// Categorías fijas del menú "Propiedades" (Lotes, Casas, Apartamentos, Fincas, Bodegas).
const CATEGORIAS = [
  { valor: "Lote", etiqueta: "Lotes" },
  { valor: "Casa", etiqueta: "Casas" },
  { valor: "Apartamento", etiqueta: "Apartamentos" },
  { valor: "Finca", etiqueta: "Fincas" },
  { valor: "Bodega", etiqueta: "Bodegas" },
];

// Pinta los botones de filtro ("Todas", "Lotes", "Casas"...) sobre el catálogo,
// y deja el catálogo filtrado según cuál esté activo.
function renderFilterPills(properties) {
  const wrap = document.getElementById("filterPills");
  if (!wrap) return properties;

  const params = new URLSearchParams(location.search);
  const activa = params.get("categoria") || "";

  const pills = [{ valor: "", etiqueta: "Todas" }, ...CATEGORIAS];
  wrap.innerHTML = pills.map((c) => `
    <button type="button" class="filter-pill${c.valor === activa ? " active" : ""}" data-categoria="${escapeHtml(c.valor)}">
      ${escapeHtml(c.etiqueta)}
    </button>`).join("");

  wrap.querySelectorAll(".filter-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const categoria = btn.getAttribute("data-categoria");
      const url = new URL(location.href);
      if (categoria) url.searchParams.set("categoria", categoria);
      else url.searchParams.delete("categoria");
      history.replaceState(null, "", url);
      renderCatalog(properties);
    });
  });

  return activa ? properties.filter((p) => p.categoria === activa) : properties;
}

// Pinta las tarjetas del catálogo en index.html dentro de #propertyGrid.
// Aplica el filtro de categoría activo (menú desplegable o botones de arriba).
function renderCatalog(allProperties) {
  const grid = document.getElementById("propertyGrid");
  if (!grid) return;

  const properties = renderFilterPills(allProperties);

  if (!properties.length) {
    grid.innerHTML = '<p style="color:var(--text-soft);">No hay propiedades en esta categoría por ahora.</p>';
    return;
  }

  grid.innerHTML = properties.map((p) => {
    const cover = (p.fotos && p.fotos[0]) || "";
    const href = `propiedad.html?id=${encodeURIComponent(p.slug)}`;
    return `
      <article class="property-card">
        <a href="${href}">
          <div class="property-photo">
            <img src="${escapeHtml(cover)}" alt="${escapeHtml(p.titulo)}">
          </div>
        </a>
        <div class="property-body">
          <span class="property-tag">${escapeHtml(p.tag || "CASA EN VENTA")}</span>
          <a href="${href}"><h3 class="property-price">${formatPrice(p.precio)}</h3></a>
          <p class="property-loc">${escapeHtml(p.ubicacion)}</p>
          <div class="property-specs">
            <span>${escapeHtml(p.habitaciones)} hab.</span>
            <span>${escapeHtml(p.banos)} baños</span>
            <span>${escapeHtml(p.area)}</span>
          </div>
          <a href="${href}" class="property-link">Ver ficha completa</a>
        </div>
      </article>`;
  }).join("");
}

// Pinta la ficha completa de una propiedad en propiedad.html,
// usando el parámetro ?id= de la URL para buscarla en el catálogo.
function renderDetail(properties) {
  const wrap = document.getElementById("propertyDetail");
  if (!wrap) return;

  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const p = properties.find((item) => String(item.slug) === String(id));

  if (!p) {
    wrap.innerHTML = `
      <p class="breadcrumb"><a href="index.html">Inicio</a> / Propiedad no encontrada</p>
      <h1>Esta propiedad ya no está disponible</h1>
      <p style="color:var(--text-soft);margin-top:10px;">
        Puede que haya sido retirada del catálogo.
        <a href="index.html#propiedades">Ver las propiedades disponibles</a>.
      </p>`;
    return;
  }

  document.title = `${p.titulo} — Nueva Oriente`;

  const fotos = p.fotos && p.fotos.length ? p.fotos : [""];
  const cover = fotos[0];
  const sec1 = fotos[1] || fotos[0];
  const sec2 = fotos[2] || fotos[1] || fotos[0];
  const restantes = fotos.slice(1);
  const mensajeAttr = escapeHtml(p.mensajeWa || `Hola, quiero más información sobre ${p.titulo}.`);

  const descHtml = (p.descripcion && p.descripcion.length ? p.descripcion : ["Descripción pendiente."])
    .map((linea) => `<p>${escapeHtml(linea)}</p>`).join("\n");

  const masFotosHtml = restantes.map((f) =>
    `<div class="property-photo"><img src="${escapeHtml(f)}" alt="${escapeHtml(p.titulo)}"></div>`
  ).join("\n");

  wrap.innerHTML = `
    <p class="breadcrumb"><a href="index.html">Inicio</a> / <a href="index.html#propiedades">Propiedades</a> / ${escapeHtml(p.titulo)}</p>

    <div class="detail-head">
      <div>
        <h1>${escapeHtml(p.titulo)}</h1>
        <p style="color:var(--text-soft);margin-top:6px;">${escapeHtml(p.ubicacion)}</p>
      </div>
      <div class="detail-price">${formatPrice(p.precio)}</div>
    </div>

    <div class="gallery">
      <div class="gallery-main"><img src="${escapeHtml(cover)}" alt="${escapeHtml(p.titulo)}"></div>
      <img src="${escapeHtml(sec1)}" alt="${escapeHtml(p.titulo)}">
      <img src="${escapeHtml(sec2)}" alt="${escapeHtml(p.titulo)}">
    </div>

    <div class="detail-layout">
      <div>
        <div class="spec-list">
          <div><span class="num">${escapeHtml(p.habitaciones)}</span><span class="label">Habitaciones</span></div>
          <div><span class="num">${escapeHtml(p.banos)}</span><span class="label">Baños</span></div>
          <div><span class="num">${escapeHtml(p.area)}</span><span class="label">Área construida</span></div>
          <div><span class="num">${escapeHtml(p.pisos)}</span><span class="label">Pisos</span></div>
        </div>

        <div class="detail-desc">
          <h2>Descripción</h2>
          ${descHtml}

          <h2 style="margin-top:32px;">Más fotos</h2>
          <div class="property-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));">
            ${masFotosHtml}
          </div>
        </div>
      </div>

      <aside class="contact-box">
        <h3>¿Te interesa esta propiedad?</h3>
        <p>Escríbeme directo y te cuento todos los detalles, o coordinamos una visita.</p>
        <a href="#" class="btn btn-whatsapp" data-wa data-wa-msg="${mensajeAttr}">Preguntar por esta propiedad</a>
        <a href="index.html#propiedades" class="btn btn-brass" style="border-color:#4A5064;color:#F4F1EA;">Ver otras propiedades</a>
      </aside>
    </div>

    <a href="#" class="wa-float" data-wa data-wa-msg="${mensajeAttr}" aria-label="Escribir por WhatsApp">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.36 5.07L2 22l5.06-1.33A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.6 0-3.1-.42-4.4-1.16l-.32-.18-3.02.79.8-2.94-.2-.32A7.94 7.94 0 014 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8zm4.4-5.6c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.17-.7-.62-1.18-1.39-1.32-1.63-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.43-.58 1.63-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z"/></svg>
    </a>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  // Botones de WhatsApp que ya existen en el HTML estático (header, hero, footer, etc.)
  attachWaLinks();

  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav-links");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  // Catálogo y/o ficha de propiedad, si la página los tiene.
  const needsCatalog = document.getElementById("propertyGrid");
  const needsDetail = document.getElementById("propertyDetail");
  if (needsCatalog || needsDetail) {
    try {
      const properties = await loadProperties();
      if (needsCatalog) renderCatalog(properties);
      if (needsDetail) renderDetail(properties);
    } catch (err) {
      console.error(err);
      const target = needsDetail || needsCatalog;
      if (target) target.innerHTML = '<p style="color:var(--text-soft);">No se pudo cargar la información. Intenta de nuevo más tarde.</p>';
    }
    // Los botones de WhatsApp que se acaban de insertar dinámicamente
    // (tarjetas, botón de la ficha, flotante) necesitan su enlace también.
    attachWaLinks();
  }

  initLightbox();
});

// Galería con zoom: funciona en las fotos de la ficha de una propiedad
// (galería principal + sección "Más fotos"). No afecta las tarjetas del catálogo.
function initLightbox() {
  const imgs = Array.from(document.querySelectorAll(".gallery img, .detail-desc .property-grid img"));
  if (imgs.length === 0) return;

  let overlay = document.querySelector(".lightbox-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
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

    overlay.querySelector(".lightbox-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", (e) => {
      if (!overlay.classList.contains("open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(current - 1);
      if (e.key === "ArrowRight") show(current + 1);
    });
  }

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

  overlay.querySelector(".lightbox-prev").onclick = () => show(current - 1);
  overlay.querySelector(".lightbox-next").onclick = () => show(current + 1);
  overlayImg.onclick = () => overlayImg.classList.toggle("zoomed");

  imgs.forEach((img, i) => {
    img.style.cursor = "zoom-in";
    img.addEventListener("click", (e) => {
      e.preventDefault();
      open(i);
    });
  });
}
