// Avisos de lançamentos de despesa: sino na barra lateral + notificação do PWA.
// Sempre que alguém da casa lança uma despesa, um trigger no banco grava um
// registro em `finance_notifications`; aqui escutamos isso em tempo real
// (Supabase Realtime), atualizamos o sino para todos os outros membros e,
// se a permissão estiver concedida, mostramos uma notificação do sistema.

(function () {
  // Chave pública VAPID — é segura para ficar no código (a privada fica só no servidor)
  const VAPID_PUBLIC_KEY = 'BP89pAS6oWZX4fokSjawJ1eik2qZKfAR4U-Gow7BROd8G0d-mbLIJv-4XmY0v400U7ljYtrdz51Ag1nqLTW1_Os';

  let ctx = null;
  let notifications = [];
  let readIds = new Set();
  let wired = false;

  window.initNotifications = async function (pageCtx) {
    if (!pageCtx) return;
    ctx = pageCtx;

    await loadNotifications();
    wireUI();
    subscribeRealtime();

    if ('Notification' in window && Notification.permission === 'granted') {
      ensurePushSubscription();
    }
  };

  async function loadNotifications() {
    const { household, member } = ctx;

    const { data: notifs, error } = await window.supabaseClient
      .from('finance_notifications')
      .select('*')
      .eq('household_id', household.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error(error);
      return;
    }
    notifications = notifs || [];

    const ids = notifications.map((n) => n.id);
    readIds = new Set();
    if (ids.length) {
      const { data: reads } = await window.supabaseClient
        .from('finance_notification_reads')
        .select('notification_id')
        .eq('member_id', member.id)
        .in('notification_id', ids);
      readIds = new Set((reads || []).map((r) => r.notification_id));
    }

    renderList();
    updateBadge();
  }

  function isMine(n) {
    return n.created_by === ctx.session.user.id;
  }

  function unreadNotifications() {
    return notifications.filter((n) => !isMine(n) && !readIds.has(n.id));
  }

  function updateBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const count = unreadNotifications().length;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.toggle('hidden', count === 0);
  }

  function renderList() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (notifications.length === 0) {
      list.innerHTML = '<div class="empty-state">Nenhum aviso ainda.</div>';
      return;
    }
    list.innerHTML = notifications.map(notifHtml).join('');
  }

  function notifHtml(n) {
    const mine = isMine(n);
    const unread = !mine && !readIds.has(n.id);
    const quem = mine ? 'Você' : memberName(n.created_by);
    const categoria = n.category_name || 'Sem categoria';
    return `
      <div class="notif-item ${unread ? 'unread' : ''}">
        <div class="notif-item-title">💸 ${escapeHtml(quem)} lançou uma despesa</div>
        <div class="notif-item-body">${escapeHtml(categoria)} · <strong>${formatCurrency(n.amount)}</strong></div>
        ${n.description ? `<div class="notif-item-desc">${escapeHtml(n.description)}</div>` : ''}
        <div class="notif-item-time">${formatDateTime(n.created_at)}</div>
      </div>`;
  }

  function memberName(userId) {
    const m = (ctx.members || []).find((x) => x.user_id === userId);
    return m ? m.display_name : 'Alguém da casa';
  }

  function wireUI() {
    if (wired) return;
    wired = true;

    const bell = document.getElementById('notif-bell');
    const dropdown = document.getElementById('notif-dropdown');
    if (!bell || !dropdown) return;

    bell.addEventListener('click', async (e) => {
      e.stopPropagation();
      const opening = dropdown.classList.contains('hidden');
      dropdown.classList.toggle('hidden', !opening);
      if (opening) {
        if ('Notification' in window && Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') ensurePushSubscription();
        } else if ('Notification' in window && Notification.permission === 'granted') {
          ensurePushSubscription();
        }
        await markVisibleAsRead();
      }
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && e.target !== bell) {
        dropdown.classList.add('hidden');
      }
    });
  }

  async function markVisibleAsRead() {
    const toMark = unreadNotifications();
    if (toMark.length === 0) return;

    const rows = toMark.map((n) => ({ notification_id: n.id, member_id: ctx.member.id }));
    const { error } = await window.supabaseClient
      .from('finance_notification_reads')
      .upsert(rows, { onConflict: 'notification_id,member_id', ignoreDuplicates: true });

    if (error) {
      console.error(error);
      return;
    }
    toMark.forEach((n) => readIds.add(n.id));
    renderList();
    updateBadge();
  }

  function subscribeRealtime() {
    window.supabaseClient
      .channel(`finance-notifications-${ctx.household.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'finance_notifications',
          filter: `household_id=eq.${ctx.household.id}`,
        },
        (payload) => {
          const n = payload.new;
          if (notifications.some((x) => x.id === n.id)) return;
          notifications = [n, ...notifications].slice(0, 30);
          renderList();
          updateBadge();
          if (n.created_by !== ctx.session.user.id) {
            showSystemNotification(n);
          }
        }
      )
      .subscribe();
  }

  function showSystemNotification(n) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const quem = memberName(n.created_by);
    const categoria = n.category_name || 'Sem categoria';
    const title = `💸 ${quem} lançou ${formatCurrency(n.amount)}`;
    const bodyParts = [categoria];
    if (n.description) bodyParts.push(n.description);
    const options = {
      body: bodyParts.join(' · '),
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      tag: `finance-notif-${n.id}`,
    };

    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options)).catch(() => new Notification(title, options));
    } else {
      new Notification(title, options);
    }
  }

  // Registra este dispositivo para receber notificações do sistema mesmo
  // com o app fechado (Web Push) e salva a inscrição no Supabase.
  async function ensurePushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!ctx || !ctx.household || !ctx.member) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      await savePushSubscription(subscription);
    } catch (err) {
      console.warn('Não foi possível registrar notificações push:', err);
    }
  }

  async function savePushSubscription(subscription) {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys) return;

    const { error } = await window.supabaseClient.from('push_subscriptions').upsert(
      {
        household_id: ctx.household.id,
        member_id: ctx.member.id,
        user_id: ctx.session.user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth_key: json.keys.auth,
      },
      { onConflict: 'endpoint' }
    );
    if (error) console.error('Falha ao salvar inscrição push:', error);
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
    return output;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
})();
