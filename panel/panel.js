// Panel de administración a medida para Nueva Oriente.
//
// Usa el mismo inicio de sesión que ya existía (Netlify Identity) y, con
// ese usuario, habla directamente con GitHub a través de Git Gateway
// (el mismo puente que usaba el panel anterior por debajo). Así seguimos
// sin manejar contraseñas ni tokens: Netlify se encarga de eso.
//
// Todo el catálogo vive en data/properties.json y las fotos en la carpeta
// img/. Este panel simplemente lee y escribe esos mismos archivos.

(function () {
  "use strict";

  const OWNER = "lopezluisa2204-hue";
  const REPO = "nueva-oriente-web";
  const BRANCH = "main";
  const DATA_PATH = "data/properties.json";
  const CATEGORIAS = ["Casa", "Apartamento", "Lote", "Finca", "Bodega"];

  const apiRoot = () => `${location.origin}/.netlify/git/github`;

  // ---------- Estado en memoria ----------
  let catalog = { items: [], sha: null }; // catálogo cargado desde GitHub
  let current = null; // propiedad que se está editando (copia editable)
  let currentIsNew = false;
  let uploading = false;

  // ---------- Utilidades ----------
  function $(id) { return document.getElementById(id); }

  function toast(msg, type) {
    const el = $("toast");
    el.textContent = msg;
    el.className = "toast" + (type ? " toast-" + type : "");
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 4200);
  }

  function slugify(text) {
    return (text || "")
      .toString()
      .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita tildes
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function uniqueSlug(base) {
    let s = base || "propiedad";
    let n = 2;
    const taken = new Set(catalog.items.map((p) => p.slug));
    while (taken.has(s)) { s = `${base}-${n}`; n++; }
    return s;
  }

  function formatPrice(n) {
    const num = Number(n) || 0;
    return "$" + num.toLocaleString("es-CO");
  }

  function photoSrc(path) {
    if (!path) return "";
    const clean = String(path).replace(/^\/+/, "");
    return "/" + clean;
  }

  // Base64 <-> texto, a salvo de tildes/emojis (GitHub trabaja en base64 UTF-8).
  function utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  // ---------- Sesión (Netlify Identity) ----------
  async function getToken() {
    const user = netlifyIdentity.currentUser();
    if (!user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    // Forzamos refresco del token: uno cacheado puede quedar viejo y
    // Git Gateway es estricto con la fecha de expiración.
    return user.jwt(true);
  }

  // ---------- Llamadas a GitHub vía Git Gateway ----------
  async function gh(path, options) {
    const token = await getToken();
    const fullUrl = apiRoot() + path;
    const res = await fetch(fullUrl, {
      ...options,
      headers: {
        Authorization: "Bearer " + token,
        ...(options && options.headers),
      },
    });
    if (!res.ok) {
      let rawText = "";
      try { rawText = await res.text(); } catch (e) {}
      let detail = "";
      try { detail = JSON.parse(rawText).message || ""; } catch (e) {}
      console.error("[panel] fallo en", fullUrl, "status", res.status, "cuerpo:", rawText);
      const err = new Error(
        `${detail || "sin mensaje"} (status ${res.status}, url: ${fullUrl})`
      );
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async function loadCatalog() {
    const data = await gh(
      `/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${BRANCH}`,
      { method: "GET" }
    );
    const parsed = JSON.parse(b64ToUtf8(data.content));
    const items = Array.isArray(parsed) ? parsed : parsed.items || [];
    // Normaliza campos que pueden faltar para que el formulario no truene.
    items.forEach((p) => {
      if (!Array.isArray(p.fotos)) p.fotos = p.fotos ? [p.fotos] : [];
      if (!Array.isArray(p.descripcion)) {
        p.descripcion = p.descripcion ? [p.descripcion] : [];
      }
    });
    catalog = { items, sha: data.sha };
  }

  async function saveCatalogToGitHub(commitMessage) {
    const content = utf8ToB64(JSON.stringify({ items: catalog.items }, null, 2) + "\n");
    const body = {
      message: commitMessage || "Actualizar catálogo de propiedades (panel admin)",
      content,
      branch: BRANCH,
      sha: catalog.sha,
    };
    const res = await gh(`/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    catalog.sha = res.content.sha;
  }

  // ---------- Subida y compresión de fotos ----------
  function resizeImageFile(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
      img.src = url;
    });
  }

  async function compressUnder(file, maxBytes) {
    let dim = 1600, quality = 0.82;
    let blob = await resizeImageFile(file, dim, quality);
    let tries = 0;
    while (blob.size > maxBytes && tries < 4) {
      quality = Math.max(0.5, quality - 0.12);
      dim = Math.max(900, dim - 250);
      blob = await resizeImageFile(file, dim, quality);
      tries++;
    }
    return blob;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function uploadPhoto(file, slug) {
    const blob = await compressUnder(file, 900 * 1024);
    const base64 = await blobToBase64(blob);
    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const path = `img/${slug}/foto-${suffix}.jpg`;
    await gh(`/repos/${OWNER}/${REPO}/contents/${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Subir foto para ${slug} (panel admin)`,
        content: base64,
        branch: BRANCH,
      }),
    });
    return path;
  }

  // ---------- Vistas ----------
  function showList() {
    $("editView").hidden = true;
    $("listView").hidden = false;
    renderList();
  }

  function showEdit() {
    $("listView").hidden = true;
    $("editView").hidden = false;
  }

  function renderList() {
    const grid = $("propertyCards");
    const empty = $("listEmpty");
    $("propertyCount").textContent =
      catalog.items.length === 1 ? "1 propiedad" : `${catalog.items.length} propiedades`;
    grid.innerHTML = "";
    if (!catalog.items.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    catalog.items.forEach((p, idx) => {
      const card = document.createElement("div");
      card.className = "admin-card";
      const photo = p.fotos && p.fotos[0];
      card.innerHTML = `
        <div class="admin-card-photo ${photo ? "" : "no-photo"}">
          ${photo ? `<img src="${photoSrc(photo)}" alt="">` : "Sin foto"}
        </div>
        <div class="admin-card-body">
          <span class="admin-card-tag">${p.tag || p.categoria || ""}</span>
          <span class="admin-card-title">${p.titulo || "(sin título)"}</span>
          <span class="admin-card-loc">${p.ubicacion || ""}</span>
          <span class="admin-card-price">${formatPrice(p.precio)}</span>
        </div>
        <div class="admin-card-actions">
          <button class="btn btn-outline" data-edit="${idx}">Editar</button>
          <button class="btn btn-ghost" data-view="${idx}">Ver</button>
        </div>
      `;
      grid.appendChild(card);
    });
    grid.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openEdit(Number(btn.dataset.edit)));
    });
    grid.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = catalog.items[Number(btn.dataset.view)];
        window.open(`../propiedad.html?id=${encodeURIComponent(p.slug)}`, "_blank");
      });
    });
  }

  function blankProperty() {
    return {
      slug: "", categoria: "Casa", tag: "CASA EN VENTA", titulo: "",
      precio: "", ubicacion: "", habitaciones: "", banos: "", area: "",
      pisos: "", descripcion: [""], fotos: [], mensajeWa: "",
    };
  }

  function openEdit(index) {
    currentIsNew = index === null || index === undefined;
    current = currentIsNew ? blankProperty() : JSON.parse(JSON.stringify(catalog.items[index]));
    current._index = currentIsNew ? null : index;
    $("editTitle").textContent = currentIsNew ? "Nueva propiedad" : "Editar propiedad";
    $("deleteBtn").hidden = currentIsNew;
    fillForm(current);
    showEdit();
    window.scrollTo(0, 0);
  }

  function fillForm(p) {
    $("f_categoria").value = p.categoria || "Casa";
    $("f_tag").value = p.tag || "";
    $("f_titulo").value = p.titulo || "";
    $("f_precio").value = p.precio || "";
    $("f_ubicacion").value = p.ubicacion || "";
    $("f_slug").value = p.slug || "";
    $("f_mensajeWa").value = p.mensajeWa || "";
    $("f_habitaciones").value = p.habitaciones || "";
    $("f_banos").value = p.banos || "";
    $("f_area").value = p.area || "";
    $("f_pisos").value = p.pisos || "";
    renderDescripcion(p.descripcion.length ? p.descripcion : [""]);
    renderPhotos(p.fotos);
  }

  function renderDescripcion(parrafos) {
    const wrap = $("descripcionList");
    wrap.innerHTML = "";
    parrafos.forEach((texto, i) => {
      const row = document.createElement("div");
      row.className = "descripcion-item";
      row.innerHTML = `
        <textarea data-parrafo="${i}" placeholder="Párrafo ${i + 1}">${texto || ""}</textarea>
        <button type="button" class="remove-parrafo" data-remove="${i}" title="Eliminar párrafo">✕</button>
      `;
      wrap.appendChild(row);
    });
    wrap.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.remove);
        const vals = collectDescripcion();
        vals.splice(i, 1);
        renderDescripcion(vals.length ? vals : [""]);
      });
    });
  }

  function collectDescripcion() {
    return Array.from($("descripcionList").querySelectorAll("textarea")).map((t) => t.value);
  }

  function renderPhotos(fotos) {
    const grid = $("photoGrid");
    grid.innerHTML = "";
    fotos.forEach((path, i) => {
      const item = document.createElement("div");
      item.className = "photo-item" + (i === 0 ? " is-main" : "");
      item.innerHTML = `
        ${i === 0 ? '<span class="photo-badge">Principal</span>' : ""}
        <img src="${photoSrc(path)}" alt="">
        <div class="photo-actions">
          <button type="button" data-up="${i}" ${i === 0 ? "disabled" : ""} title="Subir">↑</button>
          <button type="button" data-down="${i}" ${i === fotos.length - 1 ? "disabled" : ""} title="Bajar">↓</button>
          <button type="button" data-del="${i}" title="Eliminar">✕</button>
        </div>
      `;
      grid.appendChild(item);
    });
    grid.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => movePhoto(Number(b.dataset.up), -1)));
    grid.querySelectorAll("[data-down]").forEach((b) => b.addEventListener("click", () => movePhoto(Number(b.dataset.down), 1)));
    grid.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => removePhoto(Number(b.dataset.del))));
  }

  function movePhoto(i, dir) {
    const arr = current.fotos;
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    renderPhotos(arr);
  }

  function removePhoto(i) {
    current.fotos.splice(i, 1);
    renderPhotos(current.fotos);
  }

  function addUploadingPlaceholder(label) {
    const grid = $("photoGrid");
    const el = document.createElement("div");
    el.className = "photo-item uploading";
    el.textContent = label;
    grid.appendChild(el);
    return el;
  }

  async function handleFileSelection(files) {
    if (!files || !files.length) return;
    let slug = $("f_slug").value.trim();
    if (!slug) {
      slug = uniqueSlug(slugify($("f_titulo").value) || "propiedad");
      $("f_slug").value = slug;
    }
    uploading = true;
    $("saveBtn").disabled = true;
    const progress = $("uploadProgress");
    progress.hidden = false;
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      progress.textContent = `Subiendo foto ${i + 1} de ${list.length}…`;
      const placeholder = addUploadingPlaceholder(`Subiendo ${i + 1}/${list.length}…`);
      try {
        const path = await uploadPhoto(list[i], slug);
        current.fotos.push(path);
        placeholder.remove();
        renderPhotos(current.fotos);
      } catch (err) {
        placeholder.remove();
        toast(`No se pudo subir una foto: ${err.message}`, "error");
      }
    }
    progress.hidden = true;
    progress.textContent = "";
    uploading = false;
    $("saveBtn").disabled = false;
  }

  // ---------- Guardar / eliminar ----------
  async function handleSubmit(e) {
    e.preventDefault();
    if (uploading) { toast("Espera a que terminen de subir las fotos.", "error"); return; }

    const titulo = $("f_titulo").value.trim();
    const ubicacion = $("f_ubicacion").value.trim();
    const precio = $("f_precio").value;
    let slug = $("f_slug").value.trim() || slugify(titulo);
    if (!titulo || !ubicacion || !precio) {
      toast("Completa título, ubicación y precio.", "error");
      return;
    }
    if (!slug) { toast("No se pudo generar el identificador (slug). Escribe un título.", "error"); return; }

    // Si es nueva y el slug ya existe, o quedó vacío, generamos uno único.
    const others = catalog.items.filter((_, i) => i !== current._index);
    if (others.some((p) => p.slug === slug)) {
      slug = uniqueSlug(slug);
    }

    const updated = {
      slug,
      categoria: $("f_categoria").value,
      tag: $("f_tag").value.trim(),
      titulo,
      precio: Number(precio),
      ubicacion,
      habitaciones: $("f_habitaciones").value.trim(),
      banos: $("f_banos").value.trim(),
      area: $("f_area").value.trim(),
      pisos: $("f_pisos").value.trim(),
      descripcion: collectDescripcion().map((t) => t.trim()).filter((t) => t.length),
      fotos: current.fotos,
      mensajeWa: $("f_mensajeWa").value.trim(),
    };

    $("saveBtn").disabled = true;
    $("saveBtn").textContent = "Guardando…";
    try {
      if (currentIsNew) {
        catalog.items.push(updated);
      } else {
        catalog.items[current._index] = updated;
      }
      await saveCatalogToGitHub(
        currentIsNew ? `Agregar propiedad: ${titulo}` : `Editar propiedad: ${titulo}`
      );
      toast("Cambios guardados.", "ok");
      showList();
    } catch (err) {
      if (err.status === 409) {
        toast("Alguien más actualizó el catálogo justo ahora. Recargando…", "error");
        await loadCatalog();
        showList();
      } else {
        toast("No se pudo guardar: " + err.message, "error");
      }
    } finally {
      $("saveBtn").disabled = false;
      $("saveBtn").textContent = "Guardar cambios";
    }
  }

  function openConfirm(text) {
    return new Promise((resolve) => {
      $("confirmText").textContent = text;
      $("confirmModal").hidden = false;
      const onOk = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };
      function cleanup() {
        $("confirmModal").hidden = true;
        $("confirmOk").removeEventListener("click", onOk);
        $("confirmCancel").removeEventListener("click", onCancel);
      }
      $("confirmOk").addEventListener("click", onOk);
      $("confirmCancel").addEventListener("click", onCancel);
    });
  }

  async function handleDelete() {
    if (currentIsNew || current._index === null) return;
    const ok = await openConfirm(
      `¿Eliminar "${current.titulo}" del catálogo? Las fotos no se borran de GitHub, solo se quita la propiedad del sitio.`
    );
    if (!ok) return;
    $("deleteBtn").disabled = true;
    try {
      catalog.items.splice(current._index, 1);
      await saveCatalogToGitHub(`Eliminar propiedad: ${current.titulo}`);
      toast("Propiedad eliminada.", "ok");
      showList();
    } catch (err) {
      toast("No se pudo eliminar: " + err.message, "error");
    } finally {
      $("deleteBtn").disabled = false;
    }
  }

  // ---------- Arranque ----------
  function initHandlers() {
    $("addPropertyBtn").addEventListener("click", () => openEdit(null));
    $("backBtn").addEventListener("click", showList);
    $("addParrafoBtn").addEventListener("click", () => {
      const vals = collectDescripcion();
      vals.push("");
      renderDescripcion(vals);
    });
    $("propertyForm").addEventListener("submit", handleSubmit);
    $("deleteBtn").addEventListener("click", handleDelete);
    $("photoInput").addEventListener("change", (e) => {
      handleFileSelection(e.target.files);
      e.target.value = "";
    });
    $("uploadDrop").addEventListener("dragover", (e) => e.preventDefault());
    $("uploadDrop").addEventListener("drop", (e) => {
      e.preventDefault();
      handleFileSelection(e.dataTransfer.files);
    });
    $("f_titulo").addEventListener("blur", () => {
      if (!$("f_slug").value.trim() && currentIsNew) {
        $("f_slug").value = uniqueSlug(slugify($("f_titulo").value));
      }
    });
    $("logoutBtn").addEventListener("click", () => netlifyIdentity.logout());
    $("loginBtn").addEventListener("click", () => netlifyIdentity.open());
  }

  async function bootApp(user) {
    $("loginScreen").hidden = true;
    $("appScreen").hidden = false;
    $("userEmail").textContent = user.email || "";
    $("listLoading").hidden = false;
    try {
      await loadCatalog();
      showList();
    } catch (err) {
      $("listLoading").textContent = "No se pudo cargar el catálogo: " + err.message;
      return;
    }
    $("listLoading").hidden = true;
  }

  document.addEventListener("DOMContentLoaded", () => {
    initHandlers();
    netlifyIdentity.on("init", (user) => {
      if (user) bootApp(user);
    });
    netlifyIdentity.on("login", (user) => {
      netlifyIdentity.close();
      bootApp(user);
    });
    netlifyIdentity.on("logout", () => {
      $("appScreen").hidden = true;
      $("loginScreen").hidden = false;
    });
    netlifyIdentity.init();
  });
})();
