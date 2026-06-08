(async function () {
  const ctx = await initAuthenticatedPage('dashboard');
  if (!ctx) return;
  const { household, member, members } = ctx;

  document.getElementById('greeting').textContent = `Olá, ${member.display_name}! 👋`;
  document.getElementById('today-label').textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  await Promise.all([loadFinanceSummary(), loadUpcomingEvents(), loadPendingTasks(members), loadRecentTransactions()]);

  async function loadFinanceSummary() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const { data, error } = await window.supabaseClient
      .from('finance_transactions')
      .select('amount, type')
      .eq('household_id', household.id)
      .gte('occurred_on', start)
      .lte('occurred_on', end);

    if (error) {
      console.error(error);
      return;
    }

    let receitas = 0;
    let despesas = 0;
    (data || []).forEach((t) => {
      if (t.type === 'receita') receitas += Number(t.amount);
      else despesas += Number(t.amount);
    });
    const saldo = receitas - despesas;

    document.getElementById('stat-receitas').textContent = formatCurrency(receitas);
    document.getElementById('stat-despesas').textContent = formatCurrency(despesas);
    const saldoEl = document.getElementById('stat-saldo');
    saldoEl.textContent = formatCurrency(saldo);
    document.getElementById('stat-saldo-card').classList.add(saldo >= 0 ? 'positive' : 'negative');
  }

  async function loadUpcomingEvents() {
    const container = document.getElementById('upcoming-events');
    const nowIso = new Date().toISOString();

    const { data, error } = await window.supabaseClient
      .from('agenda_events')
      .select('*')
      .eq('household_id', household.id)
      .gte('start_at', nowIso)
      .order('start_at', { ascending: true })
      .limit(5);

    if (error) {
      container.innerHTML = `<div class="empty-state">Não foi possível carregar a agenda.</div>`;
      return;
    }
    if (!data || data.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhum evento agendado.</div>`;
      return;
    }

    container.innerHTML = data
      .map(
        (ev) => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--color-border);">
          <span class="member-dot" style="background:${ev.color}"></span>
          <div style="flex:1;">
            <div style="font-weight:600; font-size:0.9rem;">${escapeHtml(ev.title)}</div>
            <div style="font-size:0.78rem; color:var(--color-muted);">${formatDateTime(ev.start_at)}${ev.location ? ' · ' + escapeHtml(ev.location) : ''}</div>
          </div>
        </div>`
      )
      .join('');
  }

  async function loadPendingTasks(members) {
    const container = document.getElementById('pending-tasks');

    const { data, error } = await window.supabaseClient
      .from('tasks')
      .select('*')
      .eq('household_id', household.id)
      .neq('status', 'concluida')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(6);

    if (error) {
      container.innerHTML = `<div class="empty-state">Não foi possível carregar as tarefas.</div>`;
      return;
    }
    if (!data || data.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhuma tarefa pendente. 🎉</div>`;
      return;
    }

    container.innerHTML = data
      .map(
        (t) => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--color-border);">
          <span class="badge ${t.status}">${statusLabel(t.status)}</span>
          <div style="flex:1;">
            <div style="font-weight:600; font-size:0.9rem;">${escapeHtml(t.title)}</div>
            <div style="font-size:0.78rem; color:var(--color-muted);">
              ${memberLabel(members, t.assigned_to)}${t.due_date ? ' · prazo ' + formatDate(t.due_date) : ''}
            </div>
          </div>
        </div>`
      )
      .join('');
  }

  async function loadRecentTransactions() {
    const container = document.getElementById('recent-transactions');

    const { data, error } = await window.supabaseClient
      .from('finance_transactions')
      .select('*, finance_categories(name, color)')
      .eq('household_id', household.id)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) {
      container.innerHTML = `<div class="empty-state">Não foi possível carregar os lançamentos.</div>`;
      return;
    }
    if (!data || data.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhum lançamento registrado ainda.</div>`;
      return;
    }

    container.innerHTML = `
      <table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead>
        <tbody>
          ${data
            .map(
              (t) => `
            <tr>
              <td>${formatDate(t.occurred_on)}</td>
              <td>${escapeHtml(t.description)}</td>
              <td>${t.finance_categories ? escapeHtml(t.finance_categories.name) : '—'}</td>
              <td class="amount-${t.type}">${t.type === 'receita' ? '+' : '-'} ${formatCurrency(t.amount)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  }

  function statusLabel(status) {
    return { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' }[status] || status;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
})();
