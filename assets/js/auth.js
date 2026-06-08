// Lógica da página de login / cadastro (index.html)

(async function () {
  const { data } = await window.supabaseClient.auth.getSession();
  if (data.session) {
    window.location.href = 'dashboard.html';
    return;
  }

  const form = document.getElementById('auth-form');
  const alertBox = document.getElementById('auth-alert');
  const submitBtn = document.getElementById('auth-submit');
  const toggleLink = document.getElementById('auth-toggle-link');
  const toggleText = document.getElementById('auth-toggle-text');
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const nameField = document.getElementById('field-name');

  let mode = 'login'; // ou 'cadastro'

  function applyMode() {
    if (mode === 'login') {
      title.textContent = 'Entrar';
      subtitle.textContent = 'Acesse o sistema de gestão da sua casa.';
      submitBtn.textContent = 'Entrar';
      toggleText.textContent = 'Ainda não tem conta?';
      toggleLink.textContent = 'Cadastre-se';
      nameField.classList.add('hidden');
      nameField.querySelector('input').required = false;
    } else {
      title.textContent = 'Criar conta';
      subtitle.textContent = 'Crie sua conta para começar a organizar sua casa.';
      submitBtn.textContent = 'Cadastrar';
      toggleText.textContent = 'Já tem conta?';
      toggleLink.textContent = 'Entrar';
      nameField.classList.remove('hidden');
      nameField.querySelector('input').required = true;
    }
    clearAlert(alertBox);
  }

  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    mode = mode === 'login' ? 'cadastro' : 'login';
    applyMode();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertBox);
    submitBtn.disabled = true;

    const email = document.getElementById('field-email').value.trim();
    const password = document.getElementById('field-password').value;
    const name = document.getElementById('field-name-input').value.trim();

    try {
      if (mode === 'login') {
        const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = 'dashboard.html';
      } else {
        const { data: signUpData, error } = await window.supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { display_name: name } },
        });
        if (error) throw error;

        if (signUpData.session) {
          window.location.href = 'setup.html';
        } else {
          showAlert(
            alertBox,
            'Cadastro realizado! Verifique seu e-mail para confirmar a conta e depois faça login.',
            'success'
          );
          mode = 'login';
          applyMode();
        }
      }
    } catch (err) {
      showAlert(alertBox, traduzErro(err.message), 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  function traduzErro(msg) {
    const map = {
      'Invalid login credentials': 'E-mail ou senha inválidos.',
      'User already registered': 'Este e-mail já está cadastrado.',
      'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres.',
      'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
    };
    return map[msg] || msg;
  }

  applyMode();
})();
