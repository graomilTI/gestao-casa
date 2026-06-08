(async function () {
  const ctx = await initAuthenticatedPage('agenda');
  if (!ctx) return;
  const { household, session } = ctx;

  const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let cursor = new Date();
  cursor.setDate(1);
  let selectedDate = startOfDay(new Date());
  let monthEvents = [];

  document.getElementById('calendar-weekdays').innerHTML = WEEKDAYS.map(
    (d) => `<div class="calendar-weekday">${d}</div>`
  ).join('');

  document.getElementById('btn-prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('btn-next-month').addEventListener('click', () => changeMonth(1));
  document.getElementById('btn-today').addEventListener('click', () => {
    cursor = new Date();
    cursor.setDate(1);
    selectedDate = startOfDay(new Date());
    renderAll();
  });

  wireEventModal();
  await renderAll();

  function changeMonth(delta) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    renderAll();
  }

  async function renderAll() {
    await loadMonthEvents();
    renderCalendar();
    renderDayEvents();
  }

  async function loadMonthEvents() {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    // amplia a janela para cobrir os dias de outros meses exibidos na grade
    start.setDate(start.getDate() - 7);
    end.setDate(end.getDate() + 7);

    const { data, error } = await window.supabaseClient
      .from('agenda_events')
      .select('*')
      .eq('household_id', household.id)
      .gte('start_at', start.toISOString())
      .lte('start_at', end.toISOString())
      .order('start_at', { ascending: true });

    if (error) {
      console.error(error);
      monthEvents = [];
      return;
    }
    monthEvents = data || [];
  }

  function renderCalendar() {
    document.getElementById('calendar-title').textContent = cursor.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });

    const grid = document.getElementById('calendar-grid');
    const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = firstDay.getDay();
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - startOffset);

    const today = startOfDay(new Date());
    const cells = [];

    for (let i = 0; i < 42; i++) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + i);
      const dayKey = startOfDay(day).getTime();
      const isOutside = day.getMonth() !== cursor.getMonth();
      const isToday = dayKey === today.getTime();
      const isSelected = dayKey === selectedDate.getTime();

      const eventsForDay = monthEvents.filter((ev) => startOfDay(new Date(ev.start_at)).getTime() === dayKey);

      cells.push(`
        <div class="calendar-day ${isOutside ? 'outside' : ''} ${isToday ? 'today' : ''}"
             style="${isSelected ? 'box-shadow: 0 0 0 2px var(--color-primary);' : ''}"
             data-date="${dayKey}">
          <div class="day-number">${day.getDate()}</div>
          ${eventsForDay
            .slice(0, 3)
            .map((ev) => `<div class="calendar-event" style="background:${ev.color}">${escapeHtml(ev.title)}</div>`)
            .join('')}
          ${eventsForDay.length > 3 ? `<div style="font-size:0.7rem; color:var(--color-muted);">+${eventsForDay.length - 3} mais</div>` : ''}
        </div>`);
    }

    grid.innerHTML = cells.join('');
    grid.querySelectorAll('[data-date]').forEach((cell) => {
      cell.addEventListener('click', () => {
        selectedDate = new Date(Number(cell.dataset.date));
        renderCalendar();
        renderDayEvents();
      });
    });
  }

  function renderDayEvents() {
    const title = document.getElementById('day-events-title');
    const list = document.getElementById('day-events-list');

    title.textContent = `Eventos em ${selectedDate.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })}`;

    const dayKey = selectedDate.getTime();
    const events = monthEvents.filter((ev) => startOfDay(new Date(ev.start_at)).getTime() === dayKey);

    if (events.length === 0) {
      list.innerHTML = `<div class="empty-state">Nenhum evento neste dia.</div>`;
      return;
    }

    list.innerHTML = events
      .map(
        (ev) => `
      <div style="display:flex; align-items:flex-start; gap:12px; padding:10px 0; border-bottom:1px solid var(--color-border);">
        <span class="member-dot" style="background:${ev.color}; margin-top:5px;"></span>
        <div style="flex:1;">
          <div style="font-weight:600;">${escapeHtml(ev.title)}</div>
          <div style="font-size:0.8rem; color:var(--color-muted);">
            ${formatDateTime(ev.start_at)}${ev.end_at ? ' até ' + formatDateTime(ev.end_at) : ''}
            ${ev.location ? ' · ' + escapeHtml(ev.location) : ''}
          </div>
          ${ev.description ? `<div style="font-size:0.84rem; margin-top:4px;">${escapeHtml(ev.description)}</div>` : ''}
        </div>
        <button class="btn secondary small" data-edit="${ev.id}">Editar</button>
      </div>`
      )
      .join('');

    list.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => openEventModal(btn.dataset.edit))
    );
  }

  function wireEventModal() {
    const modal = document.getElementById('modal-event');
    const form = document.getElementById('event-form');
    const alertBox = document.getElementById('event-modal-alert');
    const deleteBtn = document.getElementById('btn-delete-event');

    document.getElementById('btn-new-event').addEventListener('click', () => openEventModal(null));
    document.getElementById('btn-cancel-event').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(alertBox);
      const submitBtn = document.getElementById('btn-save-event');
      submitBtn.disabled = true;

      const id = document.getElementById('event-id').value;
      const startVal = document.getElementById('event-start').value;
      const endVal = document.getElementById('event-end').value;

      const payload = {
        household_id: household.id,
        created_by: session.user.id,
        title: document.getElementById('event-title').value.trim(),
        description: document.getElementById('event-description').value.trim() || null,
        location: document.getElementById('event-location').value.trim() || null,
        color: document.getElementById('event-color').value,
        start_at: new Date(startVal).toISOString(),
        end_at: endVal ? new Date(endVal).toISOString() : null,
      };

      let error;
      if (id) {
        delete payload.created_by;
        ({ error } = await window.supabaseClient.from('agenda_events').update(payload).eq('id', id));
      } else {
        ({ error } = await window.supabaseClient.from('agenda_events').insert(payload));
      }

      submitBtn.disabled = false;
      if (error) {
        showAlert(alertBox, error.message, 'error');
        return;
      }
      modal.classList.add('hidden');
      selectedDate = startOfDay(new Date(startVal));
      cursor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      await renderAll();
    });

    deleteBtn.addEventListener('click', async () => {
      const id = document.getElementById('event-id').value;
      if (!id || !confirm('Excluir este evento?')) return;
      const { error } = await window.supabaseClient.from('agenda_events').delete().eq('id', id);
      if (error) {
        showAlert(alertBox, error.message, 'error');
        return;
      }
      modal.classList.add('hidden');
      await renderAll();
    });
  }

  function openEventModal(id) {
    const modal = document.getElementById('modal-event');
    const form = document.getElementById('event-form');
    const alertBox = document.getElementById('event-modal-alert');
    const deleteBtn = document.getElementById('btn-delete-event');
    form.reset();
    clearAlert(alertBox);

    if (id) {
      const ev = monthEvents.find((x) => x.id === id);
      document.getElementById('event-modal-title').textContent = 'Editar evento';
      document.getElementById('event-id').value = ev.id;
      document.getElementById('event-title').value = ev.title;
      document.getElementById('event-start').value = toLocalInputValue(ev.start_at);
      document.getElementById('event-end').value = ev.end_at ? toLocalInputValue(ev.end_at) : '';
      document.getElementById('event-location').value = ev.location || '';
      document.getElementById('event-color').value = ev.color;
      document.getElementById('event-description').value = ev.description || '';
      deleteBtn.classList.remove('hidden');
    } else {
      document.getElementById('event-modal-title').textContent = 'Novo evento';
      document.getElementById('event-id').value = '';
      const base = new Date(selectedDate);
      base.setHours(9, 0, 0, 0);
      document.getElementById('event-start').value = toLocalInputValue(base.toISOString());
      deleteBtn.classList.add('hidden');
    }

    modal.classList.remove('hidden');
  }

  function toLocalInputValue(isoStr) {
    const d = new Date(isoStr);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
})();
