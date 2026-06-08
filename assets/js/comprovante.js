(async function () {
  const ctx = await initAuthenticatedPage('comprovante');
  if (!ctx) return;
  const { household, session } = ctx;

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js';
  }

  const FUNCTION_URL = `${window.SUPABASE_CONFIG.url}/functions/v1/identificar-comprovante`;

  const alertBox = document.getElementById('comprovante-alert');
  const idleView = document.getElementById('comprovante-idle');
  const loadingView = document.getElementById('comprovante-loading');
  const loadingLabel = document.getElementById('comprovante-loading-label');
  const resultView = document.getElementById('comprovante-result');
  const fileInput = document.getElementById('comprovante-file');

  let despesaCategories = [];
  let lastResult = null;

  await loadDespesaCategories();
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) processFile(file);
  });

  document.getElementById('btn-novo-comprovante').addEventListener('click', resetView);
  document.getElementById('btn-lancar-despesa').addEventListener('click', () => {
    if (!lastResult) return;
    const params = new URLSearchParams({ tipo: 'despesa' });
    if (lastResult.categoria_id) params.set('categoria', lastResult.categoria_id);
    if (lastResult.categoria_nome) params.set('descricao', lastResult.categoria_nome);
    window.location.href = `financeiro.html?${params.toString()}`;
  });

  // Se a página foi aberta via "Compartilhar" do celular (Web Share Target), busca o arquivo no cache do SW
  const SHARE_CACHE = 'gestao-casa-shared-file';
  const SHARED_FILE_KEY = '/shared-comprovante';

  if (new URLSearchParams(window.location.search).get('shared') === '1' && 'caches' in window) {
    try {
      const cache = await caches.open(SHARE_CACHE);
      const cached = await cache.match(SHARED_FILE_KEY);
      if (cached) {
        const blob = await cached.blob();
        const name = decodeURIComponent(cached.headers.get('X-File-Name') || 'comprovante.pdf');
        await cache.delete(SHARED_FILE_KEY);
        const file = new File([blob], name, { type: blob.type || 'application/pdf' });
        await processFile(file);
      }
    } catch (err) {
      console.warn('Falha ao recuperar comprovante compartilhado:', err);
    }
  }

  async function loadDespesaCategories() {
    const { data, error } = await window.supabaseClient
      .from('finance_categories')
      .select('id, name')
      .eq('household_id', household.id)
      .eq('type', 'despesa')
      .order('name', { ascending: true });

    if (error) {
      console.error(error);
      return;
    }
    despesaCategories = data || [];
  }

  async function processFile(file) {
    clearAlert(alertBox);
    lastResult = null;

    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showAlert(alertBox, 'Envie o comprovante em formato PDF.', 'error');
      return;
    }

    showLoading('Lendo o comprovante…');

    let texto;
    try {
      texto = await extractPdfText(file);
    } catch (err) {
      console.error(err);
      showAlert(alertBox, 'Não foi possível ler o PDF. Verifique se o arquivo não está corrompido ou protegido por senha.', 'error');
      showIdle();
      return;
    }

    if (!texto || texto.trim().length < 5) {
      showAlert(alertBox, 'Não encontramos texto nesse PDF (pode ser uma imagem digitalizada). Tente um comprovante gerado pelo app do banco.', 'error');
      showIdle();
      return;
    }

    showLoading('Identificando o tipo de despesa…');

    try {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          texto,
          categorias: despesaCategories.map((c) => ({ id: c.id, name: c.name })),
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);

      lastResult = body.resultado;
      showResult(lastResult);
    } catch (err) {
      console.error(err);
      showAlert(alertBox, `Não foi possível identificar o tipo de despesa: ${err.message}`, 'error');
      showIdle();
    }
  }

  async function extractPdfText(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    let texto = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      texto += content.items.map((item) => item.str).join(' ') + '\n';
    }
    return texto.trim();
  }

  function showIdle() {
    idleView.classList.remove('hidden');
    loadingView.classList.add('hidden');
    resultView.classList.add('hidden');
    fileInput.value = '';
  }

  function showLoading(label) {
    loadingLabel.textContent = label;
    idleView.classList.add('hidden');
    loadingView.classList.remove('hidden');
    resultView.classList.add('hidden');
  }

  function showResult(resultado) {
    const nome = resultado.categoria_nome || 'Não identificado';
    document.getElementById('result-categoria').textContent = nome;

    const existente = resultado.categoria_id
      ? despesaCategories.some((c) => c.id === resultado.categoria_id)
      : false;
    const motivo = resultado.motivo || '';
    document.getElementById('result-motivo').textContent = existente
      ? motivo
      : `${motivo ? motivo + ' ' : ''}Nenhuma categoria cadastrada combina exatamente — esta é uma sugestão de nome.`;

    idleView.classList.add('hidden');
    loadingView.classList.add('hidden');
    resultView.classList.remove('hidden');
  }

  function resetView() {
    clearAlert(alertBox);
    lastResult = null;
    showIdle();
  }
})();
