(async function recoverPlnaDailyBackups() {
  const apiUrl = "https://plna.vercel.app/api/local-daily-backup/sync";
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

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    alert(`PLNA: backup sync failed (${result.source || response.status}).`);
    return;
  }

  localStorage.setItem(
    "plna_local_daily_backup_last_sync",
    JSON.stringify({
      synced_at: new Date().toISOString(),
      synced: result.synced,
      source_origin: location.origin,
    }),
  );

  alert(
    `PLNA: synced ${result.synced.journals} journals, ${result.synced.todos} todos, ${result.synced.habitLogs} habit logs.`,
  );
})();
