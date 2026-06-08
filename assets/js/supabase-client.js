// Inicializa o cliente Supabase a partir de window.SUPABASE_CONFIG (definido em config.js)
(function () {
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg || !cfg.url || !cfg.anonKey || cfg.url.includes('SEU-PROJETO')) {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.innerHTML = `
        <div class="auth-page">
          <div class="auth-card">
            <h1>Configuração necessária</h1>
            <p class="subtitle">
              Crie o arquivo <code>assets/js/config.js</code> a partir de
              <code>assets/js/config.example.js</code> e preencha com a URL e a
              chave anônima (anon key) do seu projeto Supabase.
            </p>
          </div>
        </div>`;
    });
    throw new Error('SUPABASE_CONFIG não configurado. Veja assets/js/config.example.js');
  }

  window.supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
})();
