// Funções compartilhadas pelas páginas autenticadas (sidebar, sessão, casa atual, helpers)

const PAGES = [
  { id: 'dashboard', href: 'dashboard.html', label: 'Início', icon: '🏠' },
  { id: 'financeiro', href: 'financeiro.html', label: 'Financeiro', icon: '💰' },
  { id: 'agenda', href: 'agenda.html', label: 'Agenda', icon: '📅' },
  { id: 'tarefas', href: 'tarefas.html', label: 'Tarefas', icon: '✅' },
  { id: 'rotina', href: 'rotina.html', label: 'Rotina familiar', icon: '🔄' },
  { id: 'comprovante', href: 'comprovante.html', label: 'Comprovante', icon: '📎' },
];

const MEMBER_COLORS = ['#6366f1', '#ec4899', '#16a34a', '#d97706', '#0ea5e9', '#9333ea', '#dc2626', '#0d9488'];

async function requireSession() {
  const { data, error } = await window.supabaseClient.auth.getSession();
  if (error || !data.session) {
    window.location.href = 'index.html';
    return null;
  }
  return data.session;
}

// Carrega a "casa" do usuário (primeira em que ele é membro).
// Se ainda não tiver nenhuma, redireciona para a tela de configuração.
async function loadHousehold(session) {
  const userId = session.user.id;
  const { data: memberships, error } = await window.supabaseClient
    .from('household_members')
    .select('*, households(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error(error);
    return null;
  }

  if (!memberships || memberships.length === 0) {
    window.location.href = 'setup.html';
    return null;
  }

  const membership = memberships[0];
  const household = membership.households;

  const { data: members } = await window.supabaseClient
    .from('household_members')
    .select('*')
    .eq('household_id', household.id)
    .order('joined_at', { ascending: true });

  return { household, member: membership, members: members || [] };
}

function renderSidebar(activeId, household) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  nav.innerHTML = PAGES.map(
    (p) => `<a class="nav-link ${p.id === activeId ? 'active' : ''}" href="${p.href}">
      <span>${p.icon}</span><span>${p.label}</span>
    </a>`
  ).join('');

  const nameEl = document.getElementById('household-name');
  if (nameEl && household) {
    nameEl.textContent = `${household.name} · código: ${household.invite_code}`;
  }

  ensureNotifBell();
}

// Cria (uma única vez) o sino de avisos no topo da barra lateral.
// O conteúdo é populado e mantido em dia por notifications.js.
function ensureNotifBell() {
  if (document.getElementById('notif-bell')) return;
  const nameEl = document.getElementById('household-name');
  if (!nameEl) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'notif-bell-wrapper';
  wrapper.innerHTML = `
    <button class="notif-bell" id="notif-bell" type="button" aria-label="Avisos de lançamentos">
      <span>🔔</span>
      <span>Avisos</span>
      <span class="notif-badge hidden" id="notif-badge">0</span>
    </button>
    <div class="notif-dropdown hidden" id="notif-dropdown">
      <div class="notif-dropdown-header">Avisos de despesas lançadas</div>
      <div class="notif-list" id="notif-list">
        <div class="empty-state">Nenhum aviso ainda.</div>
      </div>
    </div>`;
  nameEl.insertAdjacentElement('afterend', wrapper);
}

function wireLogout() {
  const btn = document.getElementById('btn-logout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await window.supabaseClient.auth.signOut();
    window.location.href = 'index.html';
  });
}

// Inicializa uma página autenticada: valida sessão, carrega casa, monta sidebar/logout.
async function initAuthenticatedPage(activeId) {
  const session = await requireSession();
  if (!session) return null;
  const ctx = await loadHousehold(session);
  if (!ctx) return null;
  renderSidebar(activeId, ctx.household);
  wireLogout();
  const fullCtx = { session, ...ctx };
  if (window.initNotifications) window.initNotifications(fullCtx);
  return fullCtx;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR');
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function showAlert(container, message, type = 'info') {
  if (!container) return;
  container.innerHTML = `<div class="alert ${type}">${message}</div>`;
}

function clearAlert(container) {
  if (container) container.innerHTML = '';
}

function memberLabel(members, memberId) {
  const m = members.find((x) => x.id === memberId);
  if (!m) return '<span class="member-chip">Sem responsável</span>';
  return `<span class="member-chip"><span class="member-dot" style="background:${m.color}"></span>${m.display_name}</span>`;
}

// Registra o service worker do PWA (presente em todas as páginas via app.js)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Falha ao registrar service worker:', err));
  });
}
