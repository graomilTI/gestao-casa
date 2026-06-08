(async function () {
  const ctx = await initAuthenticatedPage('tarefas');
  if (!ctx) return;
  const { household, session, members } = ctx;

  const STATUSES = ['pendente', 'em_andamento', 'concluida'];
  const STATUS_LABELS = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' };

  let tasks = [];

  const filterMember = document.getElementById('filter-member');
  filterMember.innerHTML =
    '<option value="">Todos os responsáveis</option>' +
    members.map((m) => `<option value="${m.id}">${escapeHtml(m.display_name)}</option>`).join('');
  filterMember.addEventListener('change', renderBoard);

  const taskAssignedSelect = document.getElementById('task-assigned');
  taskAssignedSelect.innerHTML =
    '<option value="">Sem responsável</option>' +
    members.map((m) => `<option value="${m.id}">${escapeHtml(m.display_name)}</option>`).join('');

  wireTaskModal();
  await loadTasks();

  async function loadTasks() {
    const { data, error } = await window.supabaseClient
      .from('tasks')
      .select('*')
      .eq('household_id', household.id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    tasks = data || [];
    renderBoard();
  }

  function renderBoard() {
    const memberFilter = filterMember.value;
    const filtered = memberFilter ? tasks.filter((t) => t.assigned_to === memberFilter) : tasks;

    STATUSES.forEach((status) => {
      const column = document.getElementById(`column-${status}`);
      const items = filtered.filter((t) => t.status === status);
      document.getElementById(`count-${status}`).textContent = items.length;

      if (items.length === 0) {
        column.innerHTML = `<div class="empty-state">Nenhuma tarefa aqui.</div>`;
        return;
      }

      column.innerHTML = items.map((t) => taskCardHtml(t, status)).join('');

      column.querySelectorAll('[data-edit]').forEach((btn) =>
        btn.addEventListener('click', () => openTaskModal(btn.dataset.edit))
      );
      column.querySelectorAll('[data-move]').forEach((btn) =>
        btn.addEventListener('click', () => moveTask(btn.dataset.move, btn.dataset.to))
      );
    });
  }

  function taskCardHtml(t, status) {
    const moves = [];
    if (status === 'pendente') moves.push({ to: 'em_andamento', label: 'Iniciar →' });
    if (status === 'em_andamento') {
      moves.push({ to: 'pendente', label: '← Pendente' });
      moves.push({ to: 'concluida', label: 'Concluir →' });
    }
    if (status === 'concluida') moves.push({ to: 'em_andamento', label: '← Reabrir' });

    return `
      <div class="task-card">
        <div class="meta" style="margin-bottom:6px;">
          <span class="badge ${t.priority}">${t.priority === 'alta' ? 'Alta prioridade' : t.priority === 'baixa' ? 'Baixa prioridade' : 'Prioridade normal'}</span>
          ${t.recurrence !== 'nenhuma' ? `<span class="badge normal">↻ ${recurrenceLabel(t.recurrence)}</span>` : ''}
        </div>
        <h4>${escapeHtml(t.title)}</h4>
        ${t.description ? `<p>${escapeHtml(t.description)}</p>` : ''}
        <div class="meta">
          ${memberLabel(members, t.assigned_to)}
          <span>${t.due_date ? 'prazo ' + formatDate(t.due_date) : 'sem prazo'}</span>
        </div>
        <div class="actions">
          ${moves.map((m) => `<button class="btn secondary small" data-move="${t.id}" data-to="${m.to}">${m.label}</button>`).join('')}
          <button class="btn secondary small" data-edit="${t.id}">Editar</button>
        </div>
      </div>`;
  }

  async function moveTask(id, to) {
    const payload = { status: to, completed_at: to === 'concluida' ? new Date().toISOString() : null };
    const { error } = await window.supabaseClient.from('tasks').update(payload).eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadTasks();
  }

  function wireTaskModal() {
    const modal = document.getElementById('modal-task');
    const form = document.getElementById('task-form');
    const alertBox = document.getElementById('task-modal-alert');
    const deleteBtn = document.getElementById('btn-delete-task');

    document.getElementById('btn-new-task').addEventListener('click', () => openTaskModal(null));
    document.getElementById('btn-cancel-task').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(alertBox);
      const submitBtn = document.getElementById('btn-save-task');
      submitBtn.disabled = true;

      const id = document.getElementById('task-id').value;
      const payload = {
        household_id: household.id,
        created_by: session.user.id,
        title: document.getElementById('task-title').value.trim(),
        description: document.getElementById('task-description').value.trim() || null,
        assigned_to: document.getElementById('task-assigned').value || null,
        priority: document.getElementById('task-priority').value,
        due_date: document.getElementById('task-due-date').value || null,
        recurrence: document.getElementById('task-recurrence').value,
      };

      let error;
      if (id) {
        delete payload.created_by;
        ({ error } = await window.supabaseClient.from('tasks').update(payload).eq('id', id));
      } else {
        ({ error } = await window.supabaseClient.from('tasks').insert(payload));
      }

      submitBtn.disabled = false;
      if (error) {
        showAlert(alertBox, error.message, 'error');
        return;
      }
      modal.classList.add('hidden');
      await loadTasks();
    });

    deleteBtn.addEventListener('click', async () => {
      const id = document.getElementById('task-id').value;
      if (!id || !confirm('Excluir esta tarefa?')) return;
      const { error } = await window.supabaseClient.from('tasks').delete().eq('id', id);
      if (error) {
        showAlert(alertBox, error.message, 'error');
        return;
      }
      modal.classList.add('hidden');
      await loadTasks();
    });
  }

  function openTaskModal(id) {
    const modal = document.getElementById('modal-task');
    const form = document.getElementById('task-form');
    const alertBox = document.getElementById('task-modal-alert');
    const deleteBtn = document.getElementById('btn-delete-task');
    form.reset();
    clearAlert(alertBox);

    if (id) {
      const t = tasks.find((x) => x.id === id);
      document.getElementById('task-modal-title').textContent = 'Editar tarefa';
      document.getElementById('task-id').value = t.id;
      document.getElementById('task-title').value = t.title;
      document.getElementById('task-description').value = t.description || '';
      document.getElementById('task-assigned').value = t.assigned_to || '';
      document.getElementById('task-priority').value = t.priority;
      document.getElementById('task-due-date').value = t.due_date || '';
      document.getElementById('task-recurrence').value = t.recurrence;
      deleteBtn.classList.remove('hidden');
    } else {
      document.getElementById('task-modal-title').textContent = 'Nova tarefa';
      document.getElementById('task-id').value = '';
      deleteBtn.classList.add('hidden');
    }

    modal.classList.remove('hidden');
  }

  function recurrenceLabel(r) {
    return { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' }[r] || r;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
})();
