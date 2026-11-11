(() => {
  "use strict";
  const db = window.tixoSupabase;
  const $ = id => document.getElementById(id);
  const status = message => { $("adminStatus").textContent = message; };
  const state = message => { $("adminState").textContent = message; };

  if (!db) {
    status("Панель недоступна: Supabase не подключён.");
    return;
  }

  let admin = false;

  async function verifySession() {
    const { data, error } = await db.auth.getUser();
    const user = !error ? data.user : null;
    admin = !!(user && user.app_metadata && user.app_metadata.role === "admin");
    $("adminLoginForm").hidden = admin;
    $("adminTools").hidden = !admin;
    state(admin ? "администратор" : (user ? "нет прав" : "не авторизован"));
    if (admin) {
      $("adminState").className = "tag good";
      status("Вход выполнен. Новые события сохраняются черновиками.");
      await Promise.all([loadEvents(), loadCameras()]);
    } else {
      $("adminState").className = "tag";
      if (user) status("У аккаунта нет роли admin в Supabase app_metadata.");
    }
  }

  function addText(parent, tag, value, className) {
    const node = document.createElement(tag);
    node.textContent = value == null ? "" : String(value);
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }

  async function loadEvents() {
    if (!admin) return;
    const root = $("adminEventList");
    root.replaceChildren();
    const { data, error } = await db.from("city_events")
      .select("id,title,description,category,importance,source_url,occurred_at,is_public,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) {
      addText(root, "div", "Не удалось загрузить события: " + error.message, "empty");
      return;
    }
    if (!data || !data.length) {
      addText(root, "div", "Событий пока нет. Создай первый черновик выше.", "empty");
      return;
    }
    data.forEach(item => {
      const card = document.createElement("div");
      card.className = "item";
      const top = document.createElement("div");
      top.className = "item-top";
      addText(top, "strong", item.title, "item-title");
      addText(top, "span", item.is_public ? "опубликовано" : "черновик", item.is_public ? "tag good" : "tag warn");
      card.appendChild(top);
      addText(card, "div", (item.category || "прочее") + " · " + (item.importance || "normal"), "hint");
      if (item.description) addText(card, "div", item.description, "hint");
      if (item.occurred_at) addText(card, "div", new Date(item.occurred_at).toLocaleString("ru-RU"), "hint");
      if (item.source_url) {
        const link = document.createElement("a");
        link.href = item.source_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Открыть первоисточник ↗";
        card.appendChild(link);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn";
      button.textContent = item.is_public ? "Снять с публикации" : "Опубликовать";
      button.addEventListener("click", async () => {
        button.disabled = true;
        const { error: updateError } = await db.from("city_events")
          .update({ is_public: !item.is_public }).eq("id", item.id);
        if (updateError) {
          status("Не удалось изменить статус: " + updateError.message);
          button.disabled = false;
          return;
        }
        status(item.is_public ? "Событие снято с публикации." : "Событие опубликовано.");
        await loadEvents();
      });
      card.appendChild(button);
      root.appendChild(card);
    });
  }

  async function loadCameras() {
    if (!admin) return;
    const root = $("adminCameraList");
    root.replaceChildren();
    const { data, error } = await db.from("cameras")
      .select("id,name,address,source_url,status,is_public,latitude,longitude")
      .order("created_at", { ascending: false }).limit(100);
    if (error) { addText(root, "div", "Не удалось загрузить камеры: " + error.message, "empty"); return; }
    if (!data || !data.length) { addText(root, "div", "Каталог камер пока пуст.", "empty"); return; }
    data.forEach(camera => {
      const card = document.createElement("div");
      card.className = "item";
      const top = document.createElement("div");
      top.className = "item-top";
      addText(top, "strong", camera.name, "item-title");
      addText(top, "span", camera.is_public ? "публично" : "скрыто", camera.is_public ? "tag good" : "tag warn");
      card.appendChild(top);
      addText(card, "div", (camera.status || "unknown") + " · " + (camera.address || "адрес не указан"), "hint");
      const link = document.createElement("a");
      link.href = camera.source_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Открыть источник ↗";
      card.appendChild(link);
      const controls = document.createElement("div");
      controls.className = "admin-actions";
      const statusSelect = document.createElement("select");
      statusSelect.className = "btn";
      ["unknown", "online", "offline"].forEach(value => {
        const option = document.createElement("option");
        option.value = value; option.textContent = value; option.selected = camera.status === value;
        statusSelect.appendChild(option);
      });
      const save = document.createElement("button");
      save.type = "button"; save.className = "btn"; save.textContent = "Сохранить статус";
      save.addEventListener("click", async () => {
        save.disabled = true;
        const { error: updateError } = await db.from("cameras").update({ status: statusSelect.value }).eq("id", camera.id);
        status(updateError ? "Ошибка статуса: " + updateError.message : "Статус камеры обновлён.");
        save.disabled = false;
        if (!updateError) await loadCameras();
      });
      const publish = document.createElement("button");
      publish.type = "button"; publish.className = "btn";
      publish.textContent = camera.is_public ? "Скрыть" : "Опубликовать";
      publish.addEventListener("click", async () => {
        publish.disabled = true;
        const { error: updateError } = await db.from("cameras").update({ is_public: !camera.is_public }).eq("id", camera.id);
        status(updateError ? "Ошибка публикации: " + updateError.message : "Публичность камеры изменена.");
        if (!updateError) { await loadCameras(); } else publish.disabled = false;
      });
      controls.append(statusSelect, save, publish);
      card.appendChild(controls);
      root.appendChild(card);
    });
  }

  $("cameraForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!admin) { status("Сначала войди как администратор."); return; }
    let source;
    try { source = new URL($("cameraSource").value.trim()); }
    catch (_) { status("Укажи корректную ссылку источника."); return; }
    if (source.protocol !== "https:") { status("Разрешены только HTTPS-ссылки."); return; }
    const latText = $("cameraLat").value.trim(), lonText = $("cameraLon").value.trim();
    if (!!latText !== !!lonText) { status("Для точки на карте нужны обе координаты."); return; }
    const payload = {
      name: $("cameraName").value.trim(),
      address: $("cameraAddress").value.trim() || null,
      source_url: source.href,
      latitude: latText ? Number(latText) : null,
      longitude: lonText ? Number(lonText) : null,
      status: $("cameraStatus").value,
      is_public: $("cameraPublic").checked
    };
    if (!payload.name || (latText && (!Number.isFinite(payload.latitude) || Math.abs(payload.latitude)>90 || !Number.isFinite(payload.longitude) || Math.abs(payload.longitude)>180))) {
      status("Проверь название и координаты."); return;
    }
    const { error } = await db.from("cameras").insert(payload);
    if (error) { status("Не удалось добавить камеру: " + error.message); return; }
    $("cameraForm").reset();
    status("Камера добавлена.");
    await loadCameras();
  });

  $("adminLoginForm").addEventListener("submit", async event => {
    event.preventDefault();
    status("Проверяем доступ…");
    const { error } = await db.auth.signInWithPassword({
      email: $("adminEmail").value.trim(),
      password: $("adminPassword").value
    });
    if (error) {
      status("Ошибка входа: " + error.message);
      return;
    }
    await verifySession();
    if (!admin) {
      await db.auth.signOut();
      status("Вход запрещён: аккаунту не назначена роль admin.");
    }
  });

  $("eventForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!admin) {
      status("Сначала войди как администратор.");
      return;
    }
    let sourceUrl;
    try {
      sourceUrl = new URL($("eventSource").value.trim());
    } catch (_) {
      status("Укажи корректную ссылку на первоисточник.");
      return;
    }
    if (sourceUrl.protocol !== "https:") {
      status("Для первоисточника разрешены только HTTPS-ссылки.");
      return;
    }
    const localTime = $("eventOccurredAt").value;
    const payload = {
      title: $("eventTitle").value.trim(),
      description: $("eventDescription").value.trim() || null,
      category: $("eventCategory").value.trim(),
      importance: $("eventImportance").value,
      source_url: sourceUrl.href,
      occurred_at: localTime ? new Date(localTime).toISOString() : null,
      is_public: false
    };
    if (!payload.title || !payload.category) {
      status("Заполни заголовок и категорию.");
      return;
    }
    const { error } = await db.from("city_events").insert(payload);
    if (error) {
      status("Не удалось сохранить черновик: " + error.message);
      return;
    }
    $("eventForm").reset();
    status("Черновик сохранён. Проверь источник перед публикацией.");
    await loadEvents();
  });

  $("adminLogout").addEventListener("click", async () => {
    const { error } = await db.auth.signOut();
    admin = false;
    await verifySession();
    status(error ? "Ошибка выхода: " + error.message : "Вы вышли из панели.");
  });

  verifySession();
})();