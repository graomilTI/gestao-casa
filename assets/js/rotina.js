(async function () {
  const ctx = await initAuthenticatedPage('rotina');
  if (!ctx) return;
  const { household, session, member, members } = ctx;

  const WEEKDAYS = [
    { value: 0, label: 'Dom' },
    { value: 1, label: 'Seg' },
    { value: 2, label: 'Ter' },
    { value: 3, label: 'Qua' },
    { value: 4, label: 'Qui' },
    { value: 5, label: 'Sex' },
    { value: 6, label: 'Sáb' },
  ];

  const today = new Date();
  const todayStr = toDateStr(today);
  const todayWeekday = today.getDay();

  let activities = [];
  let checks = [];

  const dateLabel = today.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  document.getElementById('routine-date').textContent = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  const activityAssignedSelect = document.getElementById('activity-assigned');
  activityAssignedSelect.innerHTML =
    '<option value="">Toda a família</option>' +
    members.map((m) => `<option value="${m.id}">${escapeHtml(m.display_name)}</option>`).join('');

  wireActivityModal();
  await loadActivities();

  async function loadActivities() {
    const { data, error } = await window.supabaseClient
      .from('routine_activities')
      .select('*')
      .eq('household_id', household.id)
      .eq('active', true)
      .order('time_of_day', { ascending: true, nullsFirst: false });

    if (error) {
      console.error(error);
      return;
    }
    activities = data || [];
    renderAllActivities();
    await loadChecks();
  }

  async function loadChecks() {
    const { data, error } = await window.supabaseClient
      .from('routine_checks')
      .select('*')
      .eq('household_id', household.id)
      .eq('check_date', todayStr);

    if (error) {
      console.error(error);
      return;
    }
    checks = data || [];
    renderList();
  }

  function renderList() {
    const todays = activities.filter((a) => (a.weekdays || []).includes(todayWeekday));
    const list = document.getElementById('routine-list');

    if (todays.length === 0) {
      list.innerHTML = `<div class="empty-state">Nenhuma atividade programada para hoje. Toque em "+ Nova atividade" para começar.</div>`;
      updateProgress(0, 0);
      return;
    }

    list.innerHTML = todays.map(activityHtml).join('');

    list.querySelectorAll('[data-toggle]').forEach((input) =>
      input.addEventListener('change', () => toggleCheck(input.dataset.toggle, input.checked))
    );
    list.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => openActivityModal(btn.dataset.edit))
    );

    updateProgress(todays.filter((a) => isChecked(a.id)).length, todays.length);
  }

  function activityHtml(a) {
    const checked = isChecked(a.id);
    return `
      <div class="routine-item ${checked ? 'done' : ''}">
        <input type="checkbox" class="routine-checkbox" data-toggle="${a.id}" ${checked ? 'checked' : ''} />
        <div class="body">
          <h4>${a.time_of_day ? formatTime(a.time_of_day) + ' · ' : ''}${escapeHtml(a.title)}</h4>
          ${a.description ? `<p>${escapeHtml(a.description)}</p>` : ''}
          ${memberLabel(members, a.assigned_to)}
        </div>
        <div class="actions">
          <button class="btn secondary small" data-edit="${a.id}">Editar</button>
        </div>
      </div>`;
  }

  function renderAllActivities() {
    const container = document.getElementById('routine-all-list');

    if (activities.length === 0) {
      container.innerHTML = '<div class="empty-state">Nenhuma atividade cadastrada ainda.</div>';
      return;
    }

    container.innerHTML = activities.map(allActivityHtml).join('');
    container.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => openActivityModal(btn.dataset.edit))
    );
  }

  function allActivityHtml(a) {
    const days = a.weekdays || [];
    const badges = WEEKDAYS.map(
      (d) => `<span class="weekday-pill small ${days.includes(d.value) ? 'active' : ''}">${d.label}</span>`
    ).join('');
    return `
      <div class="routine-item">
        <div class="body">
          <h4>${a.time_of_day ? formatTime(a.time_of_day) + ' · ' : ''}${escapeHtml(a.title)}</h4>
          ${a.description ? `<p>${escapeHtml(a.description)}</p>` : ''}
          <div class="weekday-picker" style="margin-bottom:8px;">${badges}</div>
          ${memberLabel(members, a.assigned_to)}
        </div>
        <div class="actions">
          <button class="btn secondary small" data-edit="${a.id}">Editar</button>
        </div>
      </div>`;
  }

  function isChecked(activityId) {
    return checks.some((c) => c.activity_id === activityId);
  }

  function updateProgress(done, total) {
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    document.getElementById('routine-progress-bar').style.width = `${pct}%`;
    document.getElementById('routine-progress-label').textContent =
      total === 0 ? 'Nenhuma atividade hoje' : `${done} de ${total} concluídas hoje`;
  }

  async function toggleCheck(activityId, checked) {
    if (checked) {
      const { error } = await window.supabaseClient.from('routine_checks').insert({
        activity_id: activityId,
        household_id: household.id,
        check_date: todayStr,
        checked_by: member.id,
      });
      if (error) alert(error.message);
    } else {
      const { error } = await window.supabaseClient
        .from('routine_checks')
        .delete()
        .eq('activity_id', activityId)
        .eq('check_date', todayStr);
      if (error) alert(error.message);
    }
    await loadChecks();
  }

  function wireActivityModal() {
    const modal = document.getElementById('modal-activity');
    const form = document.getElementById('activity-form');
    const alertBox = document.getElementById('activity-modal-alert');
    const deleteBtn = document.getElementById('btn-delete-activity');

    document.getElementById('btn-new-activity').addEventListener('click', () => openActivityModal(null));
    document.getElementById('btn-cancel-activity').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(alertBox);
      const submitBtn = document.getElementById('btn-save-activity');
      submitBtn.disabled = true;

      const weekdays = getSelectedWeekdays();
      if (weekdays.length === 0) {
        showAlert(alertBox, 'Selecione ao menos um dia da semana.', 'error');
        submitBtn.disabled = false;
        return;
      }

      const id = document.getElementById('activity-id').value;
      const payload = {
        household_id: household.id,
        created_by: session.user.id,
        title: document.getElementById('activity-title').value.trim(),
        description: document.getElementById('activity-description').value.trim() || null,
        assigned_to: document.getElementById('activity-assigned').value || null,
        time_of_day: document.getElementById('activity-time').value || null,
        weekdays,
      };

      let error;
      if (id) {
        delete payload.created_by;
        ({ error } = await window.supabaseClient.from('routine_activities').update(payload).eq('id', id));
      } else {
        ({ error } = await window.supabaseClient.from('routine_activities').insert(payload));
      }

      submitBtn.disabled = false;
      if (error) {
        showAlert(alertBox, error.message, 'error');
        return;
      }
      modal.classList.add('hidden');
      await loadActivities();
    });

    deleteBtn.addEventListener('click', async () => {
      const id = document.getElementById('activity-id').value;
      if (!id || !confirm('Excluir esta atividade da rotina?')) return;
      const { error } = await window.supabaseClient.from('routine_activities').delete().eq('id', id);
      if (error) {
        showAlert(alertBox, error.message, 'error');
        return;
      }
      modal.classList.add('hidden');
      await loadActivities();
    });
  }

  function openActivityModal(id) {
    const modal = document.getElementById('modal-activity');
    const form = document.getElementById('activity-form');
    const alertBox = document.getElementById('activity-modal-alert');
    const deleteBtn = document.getElementById('btn-delete-activity');
    form.reset();
    clearAlert(alertBox);

    if (id) {
      const a = activities.find((x) => x.id === id);
      document.getElementById('activity-modal-title').textContent = 'Editar atividade';
      document.getElementById('activity-id').value = a.id;
      document.getElementById('activity-title').value = a.title;
      document.getElementById('activity-description').value = a.description || '';
      document.getElementById('activity-assigned').value = a.assigned_to || '';
      document.getElementById('activity-time').value = a.time_of_day ? a.time_of_day.slice(0, 5) : '';
      renderWeekdayPicker(a.weekdays || []);
      deleteBtn.classList.remove('hidden');
    } else {
      document.getElementById('activity-modal-title').textContent = 'Nova atividade';
      document.getElementById('activity-id').value = '';
      renderWeekdayPicker([0, 1, 2, 3, 4, 5, 6]);
      deleteBtn.classList.add('hidden');
    }

    modal.classList.remove('hidden');
  }

  function renderWeekdayPicker(selected) {
    const container = document.getElementById('activity-weekdays');
    container.innerHTML = WEEKDAYS.map(
      (d) => `<label class="weekday-pill ${selected.includes(d.value) ? 'active' : ''}">
        <input type="checkbox" value="${d.value}" ${selected.includes(d.value) ? 'checked' : ''} />
        <span>${d.label}</span>
      </label>`
    ).join('');

    container.querySelectorAll('input').forEach((input) =>
      input.addEventListener('change', () => {
        input.closest('.weekday-pill').classList.toggle('active', input.checked);
      })
    );
  }

  function getSelectedWeekdays() {
    return Array.from(document.querySelectorAll('#activity-weekdays input:checked')).map((i) => Number(i.value));
  }

  function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatTime(t) {
    return t ? t.slice(0, 5) : '';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
})();
