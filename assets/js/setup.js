// Lógica da página de configuração inicial: criar uma casa nova ou entrar em uma existente via código de convite

(async function () {
  const session = await requireSession();
  if (!session) return;

  // Se o usuário já tem uma casa, vai direto para o dashboard
  const { data: memberships } = await window.supabaseClient
    .from('household_members')
    .select('id')
    .eq('user_id', session.user.id)
    .limit(1);
  if (memberships && memberships.length > 0) {
    window.location.href = 'dashboard.html';
    return;
  }

  const alertBox = document.getElementById('setup-alert');
  const displayName =
    session.user.user_metadata?.display_name || session.user.email.split('@')[0];

  // ---- Criar nova casa ----
  const createForm = document.getElementById('create-household-form');
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertBox);
    const btn = createForm.querySelector('button[type="submit"]');
    btn.disabled = true;

    const name = document.getElementById('new-household-name').value.trim();
    const myName = document.getElementById('new-household-display-name').value.trim() || displayName;

    try {
      const { error } = await window.supabaseClient.rpc('create_household', {
        p_name: name,
        p_display_name: myName,
      });
      if (error) throw error;

      window.location.href = 'dashboard.html';
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      btn.disabled = false;
    }
  });

  // ---- Entrar em casa existente via código de convite ----
  const joinForm = document.getElementById('join-household-form');
  joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertBox);
    const btn = joinForm.querySelector('button[type="submit"]');
    btn.disabled = true;

    const code = document.getElementById('invite-code').value.trim().toLowerCase();
    const myName = document.getElementById('join-household-display-name').value.trim() || displayName;

    try {
      const { error } = await window.supabaseClient.rpc('join_household', {
        p_invite_code: code,
        p_display_name: myName,
      });
      if (error) throw error;

      window.location.href = 'dashboard.html';
    } catch (err) {
      showAlert(alertBox, err.message, 'error');
      btn.disabled = false;
    }
  });

  document.getElementById('new-household-display-name').value = displayName;
  document.getElementById('join-household-display-name').value = displayName;

  document.getElementById('btn-logout-setup').addEventListener('click', async () => {
    await window.supabaseClient.auth.signOut();
    window.location.href = 'index.html';
  });
})();
