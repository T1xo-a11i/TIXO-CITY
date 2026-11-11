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
      await loadEvents();
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