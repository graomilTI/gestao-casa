(async function () {
  const ctx = await initAuthenticatedPage('financeiro');
  if (!ctx) return;
  const { household, session } = ctx;

  let categories = [];
  let transactions = [];

  const monthInput = document.getElementById('filter-month');
  const typeSelect = document.getElementById('filter-type');
  const categorySelect = document.getElementById('filter-category');
  const tableContainer = document.getElementById('transactions-table');

  const now = new Date();
  monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  monthInput.addEventListener('change', loadTransactions);
  typeSelect.addEventListener('change', renderTransactions);
  categorySelect.addEventListener('change', renderTransactions);

  await loadCategories();
  await loadTransactions();
  wireTransactionModal();
  wireCategoryModal();
  openTransactionFromQueryParams();

  // Abre o modal de novo lançamento pré-preenchido quando vindo da identificação
  // de comprovante (comprovante.html?categoria=...&tipo=despesa&descricao=...)
  function openTransactionFromQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const categoria = params.get('categoria');
    const tipo = params.get('tipo');
    const descricao = params.get('descricao');
    if (!categoria && !tipo && !descricao) return;

    openTransactionModal(null);
    if (tipo) document.getElementById('transaction-type').value = tipo;
    if (categoria) document.getElementById('transaction-category').value = categoria;
    if (descricao) document.getElementById('transaction-description').value = descricao;

    window.history.replaceState({}, '', 'financeiro.html');
  }

  // ---------------- Categorias ----------------
  async function loadCategories() {
    const { data, error } = await window.supabaseClient
      .from('finance_categories')
      .select('*')
      .eq('household_id', household.id)
      .order('name', { ascending: true });

    if (error) {
      console.error(error);
      return;
    }
    categories = data || [];

    categorySelect.innerHTML =
      '<option value="">Todas</option>' +
      categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.type})</option>`).join('');

    const transactionCategorySelect = document.getElementById('transaction-category');
    transactionCategorySelect.innerHTML =
      '<option value="">Sem categoria</option>' +
      categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.type})</option>`).join('');
  }

  function wireCategoryModal() {
    const modal = document.getElementById('modal-category');
    const form = document.getElementById('category-form');
    const alertBox = document.getElementById('category-modal-alert');

    document.getElementById('btn-new-category').addEventListener('click', () => {
      form.reset();
      clearAlert(alertBox);
      modal.classList.remove('hidden');
    });
    document.getElementById('btn-cancel-category').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(alertBox);
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const payload = {
        household_id: household.id,
        name: document.getElementById('category-name').value.trim(),
        type: document.getElementById('category-type').value,
        color: document.getElementById('category-color').value,
      };

      const { error } = await window.supabaseClient.from('finance_categories').insert(payload);
      submitBtn.disabled = false;
      if (error) {
        showAlert(alertBox, error.message, 'error');
        return;
      }
      modal.classList.add('hidden');
      await loadCategories();
      renderTransactions();
    });
  }

  // ---------------- Lançamentos ----------------
  async function loadTransactions() {
    const [year, month] = monthInput.value.split('-').map(Number);
    const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
    const end = new Date(year, month, 0).toISOString().slice(0, 10);

    tableContainer.innerHTML = `<div class="empty-state">Carregando…</div>`;

    const { data, error } = await window.supabaseClient
      .from('finance_transactions')
      .select('*, finance_categories(name, color)')
      .eq('household_id', household.id)
      .gte('occurred_on', start)
      .lte('occurred_on', end)
      .order('occurred_on', { ascending: false });

    if (error) {
      tableContainer.innerHTML = `<div class="empty-state">Erro ao carregar lançamentos: ${escapeHtml(error.message)}</div>`;
      return;
    }
    transactions = data || [];
    updateSummary();
    renderTransactions();
  }

  function updateSummary() {
    let receitas = 0;
    let despesas = 0;
    transactions.forEach((t) => {
      if (t.type === 'receita') receitas += Number(t.amount);
      else despesas += Number(t.amount);
    });
    const saldo = receitas - despesas;
    document.getElementById('stat-receitas').textContent = formatCurrency(receitas);
    document.getElementById('stat-despesas').textContent = formatCurrency(despesas);
    const saldoCard = document.getElementById('stat-saldo-card');
    saldoCard.classList.remove('positive', 'negative');
    saldoCard.classList.add(saldo >= 0 ? 'positive' : 'negative');
    document.getElementById('stat-saldo').textContent = formatCurrency(saldo);
  }

  function renderTransactions() {
    const typeFilter = typeSelect.value;
    const categoryFilter = categorySelect.value;

    const filtered = transactions.filter((t) => {
      if (typeFilter && t.type !== typeFilter) return false;
      if (categoryFilter && t.category_id !== categoryFilter) return false;
      return true;
    });

    if (filtered.length === 0) {
      tableContainer.innerHTML = `<div class="empty-state">Nenhum lançamento encontrado para este filtro.</div>`;
      return;
    }

    tableContainer.innerHTML = `
      <table>
        <thead>
          <tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th></th></tr>
        </thead>
        <tbody>
          ${filtered
            .map(
              (t) => `
            <tr>
              <td>${formatDate(t.occurred_on)}</td>
              <td>${escapeHtml(t.description)}${t.notes ? `<div style="font-size:0.78rem; color:var(--color-muted);">${escapeHtml(t.notes)}</div>` : ''}</td>
              <td>${t.finance_categories ? escapeHtml(t.finance_categories.name) : '—'}</td>
              <td class="amount-${t.type}">${t.type === 'receita' ? '+' : '-'} ${formatCurrency(t.amount)}</td>
              <td>
                <button class="btn secondary small" data-edit="${t.id}">Editar</button>
                <button class="btn danger small" data-delete="${t.id}">Excluir</button>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`;

    tableContainer.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => openTransactionModal(btn.dataset.edit))
    );
    tableContainer.querySelectorAll('[data-delete]').forEach((btn) =>
      btn.addEventListener('click', () => deleteTransaction(btn.dataset.delete))
    );
  }

  function wireTransactionModal() {
    const modal = document.getElementById('modal-transaction');
    const form = document.getElementById('transaction-form');
    const alertBox = document.getElementById('transaction-modal-alert');

    document.getElementById('btn-new-transaction').addEventListener('click', () => openTransactionModal(null));
    document.getElementById('btn-cancel-transaction').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(alertBox);
      const submitBtn = document.getElementById('btn-save-transaction');
      submitBtn.disabled = true;

      const id = document.getElementById('transaction-id').value;
      const payload = {
        household_id: household.id,
        created_by: session.user.id,
        description: document.getElementById('transaction-description').value.trim(),
        type: document.getElementById('transaction-type').value,
        amount: Number(document.getElementById('transaction-amount').value),
        category_id: document.getElementById('transaction-category').value || null,
        occurred_on: document.getElementById('transaction-date').value,
        notes: document.getElementById('transaction-notes').value.trim() || null,
      };

      let error;
      if (id) {
        delete payload.created_by;
        ({ error } = await window.supabaseClient.from('finance_transactions').update(payload).eq('id', id));
      } else {
        ({ error } = await window.supabaseClient.from('finance_transactions').insert(payload));
      }

      submitBtn.disabled = false;
      if (error) {
        showAlert(alertBox, error.message, 'error');
        return;
      }
      modal.classList.add('hidden');
      await loadTransactions();
    });
  }

  function openTransactionModal(id) {
    const modal = document.getElementById('modal-transaction');
    const form = document.getElementById('transaction-form');
    const alertBox = document.getElementById('transaction-modal-alert');
    form.reset();
    clearAlert(alertBox);

    if (id) {
      const t = transactions.find((x) => x.id === id);
      document.getElementById('transaction-modal-title').textContent = 'Editar lançamento';
      document.getElementById('transaction-id').value = t.id;
      document.getElementById('transaction-description').value = t.description;
      document.getElementById('transaction-type').value = t.type;
      document.getElementById('transaction-amount').value = t.amount;
      document.getElementById('transaction-category').value = t.category_id || '';
      document.getElementById('transaction-date').value = t.occurred_on;
      document.getElementById('transaction-notes').value = t.notes || '';
    } else {
      document.getElementById('transaction-modal-title').textContent = 'Novo lançamento';
      document.getElementById('transaction-id').value = '';
      document.getElementById('transaction-date').value = new Date().toISOString().slice(0, 10);
    }

    modal.classList.remove('hidden');
  }

  async function deleteTransaction(id) {
    if (!confirm('Excluir este lançamento?')) return;
    const { error } = await window.supabaseClient.from('finance_transactions').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadTransactions();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
})();
