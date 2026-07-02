(async function recoverPlnaDailyBackups() {
  const appOrigin = "https://plna.vercel.app";
  const importUrl = `${appOrigin}/local-daily-backup/import`;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  function parseJson(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function toText(value) {
    return typeof value === "string" ? value : "";
  }

  function toBoolean(value) {
    return value === true;
  }

  function toSortOrder(value, fallback) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  }

  function buildPayload() {
    const payload = {
      journals: [],
      todos: [],
      habitChecks: [],
    };

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || "";
      const value = localStorage.getItem(key) || "";

      const journalMatch = key.match(/^journal_(\d{4}-\d{2}-\d{2})$/);
      if (journalMatch) {
        const date = journalMatch[1];
        const parsed = parseJson(value);
        if (!parsed || typeof parsed !== "object") continue;

        const journal = {
          date,
          accomplishments: toText(parsed.accomplishments),
          to_improve: toText(parsed.to_improve),
          went_well: toText(parsed.went_well),
        };
        if (journal.accomplishments || journal.to_improve || journal.went_well) {
          payload.journals.push(journal);
        }
        continue;
      }

      const todosMatch = key.match(/^todos_(\d{4}-\d{2}-\d{2})$/);
      if (todosMatch) {
        const date = todosMatch[1];
        const parsed = parseJson(value);
        if (!Array.isArray(parsed)) continue;

        parsed.forEach((entry, entryIndex) => {
          if (!entry || typeof entry !== "object") return;
          const text = toText(entry.text).trim();
          if (!text) return;
          payload.todos.push({
            id: toText(entry.id) || undefined,
            date,
            text,
            completed: toBoolean(entry.completed),
            sort_order: toSortOrder(entry.sort_order, entryIndex),
            created_at: toText(entry.created_at) || undefined,
          });
        });
        continue;
      }

      const habitsMatch = key.match(/^habits_(\d{4}-\d{2}-\d{2})$/);
      if (habitsMatch) {
        const date = habitsMatch[1];
        const parsed = parseJson(value);
        if (!parsed || typeof parsed !== "object") continue;

        Object.entries(parsed).forEach(([habitNameEn, checked]) => {
          if (checked === true && habitNameEn.trim() && datePattern.test(date)) {
            payload.habitChecks.push({ date, habitNameEn: habitNameEn.trim() });
          }
        });
      }
    }

    return payload;
  }

  const payload = buildPayload();
  const total =
    payload.journals.length +
    payload.todos.length +
    payload.habitChecks.length;

  if (total === 0) {
    alert("PLNA: no local daily backups found on this origin.");
    return;
  }

  const transferId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const target = window.open(importUrl, "plna_daily_backup_import");
  if (!target) {
    alert("PLNA: popup was blocked. Allow popups for this page and run recovery again.");
    return;
  }

  let acknowledged = false;

  function sendPayload() {
    target.postMessage(
      {
        type: "plna:local-daily-backup-import",
        transferId,
        sourceOrigin: location.origin,
        payload,
      },
      appOrigin,
    );
  }

  function receiveAck(event) {
    if (event.origin !== appOrigin) return;
    if (!event.data || event.data.type !== "plna:local-daily-backup-imported") return;
    if (event.data.transferId !== transferId) return;

    acknowledged = true;
    window.removeEventListener("message", receiveAck);
    const imported = event.data.imported || {};
    localStorage.setItem(
      "plna_local_daily_backup_last_import_transfer",
      JSON.stringify({
        transferred_at: new Date().toISOString(),
        source_origin: location.origin,
        imported,
      }),
    );
    alert(
      `PLNA: moved ${imported.journals || 0} journals, ${imported.todos || 0} todos, ${imported.habitChecks || 0} habit checks to plna.vercel.app.`,
    );
  }

  window.addEventListener("message", receiveAck);
  sendPayload();
  const retry = window.setInterval(() => {
    if (acknowledged || target.closed) {
      window.clearInterval(retry);
      return;
    }
    sendPayload();
  }, 750);

  window.setTimeout(() => {
    if (acknowledged) return;
    window.clearInterval(retry);
    window.removeEventListener("message", receiveAck);
    alert("PLNA: opened the import page. If the dashboard did not update, run recovery again from this page.");
  }, 10000);
})();
