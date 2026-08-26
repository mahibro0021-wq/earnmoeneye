const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const initData = tg?.initData || '';

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => { el.className = 'toast ' + type; }, 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'error');
  return data;
}

// ---------- access gate ----------
(async function init() {
  try {
    const qs = new URLSearchParams({ initData, action: 'check' });
    await api('/api/admin?' + qs.toString());
    document.getElementById('app').style.display = 'block';
    document.getElementById('lockScreen').style.display = 'none';
    loadTasks();
    loadWithdraws('pending');
  } catch (e) {
    document.getElementById('lockScreen').style.display = 'block';
  }
})();

// ---------- section tabs ----------
document.querySelectorAll('.admin-tabs')[0].querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs')[0].querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.getElementById('s-' + btn.dataset.s).classList.add('active');
  });
});

// ---------- tasks ----------
document.getElementById('createTaskBtn').addEventListener('click', async () => {
  const title = document.getElementById('taskTitle').value.trim();
  const description = document.getElementById('taskDesc').value.trim();
  const link = document.getElementById('taskLink').value.trim();
  const channelUsername = document.getElementById('taskChannel').value.trim();
  const reward = document.getElementById('taskReward').value;
  const type = document.getElementById('taskType').value;

  if (!title || !link || !reward) { toast('সব ফিল্ড পূরণ করুন', 'error'); return; }

  try {
    await api('/api/admin', { method: 'POST', body: { initData, action: 'create_task', title, description, link, channelUsername, reward, type } });
    toast('✅ Task যোগ হয়েছে', 'success');
    ['taskTitle','taskDesc','taskLink','taskChannel','taskReward'].forEach(id => document.getElementById(id).value = '');
    loadTasks();
  } catch (e) {
    toast('Task যোগ করা যায়নি', 'error');
  }
});

async function loadTasks() {
  try {
    const qs = new URLSearchParams({ initData, action: 'list_tasks' });
    const data = await api('/api/admin?' + qs.toString());
    const list = document.getElementById('taskListAdmin');
    list.innerHTML = data.tasks.map(t => `
      <div class="task-row">
        <div class="row-line"><b>${escapeHtml(t.title)}</b><span>+৳${t.reward}</span></div>
        <div style="color:var(--text-muted)">${escapeHtml(t.description || '')}</div>
        <div style="color:var(--text-muted);margin-top:4px">Type: ${t.type} • ${t.active ? '🟢 Active' : '⚪ Disabled'}</div>
        <div class="row-actions">
          <button class="btn-toggle" data-id="${t._id}" data-active="${t.active}">${t.active ? 'Disable' : 'Enable'}</button>
          <button class="btn-reject" data-del="${t._id}">Delete</button>
        </div>
      </div>
    `).join('') || '<div class="empty-state">কোনো task নেই</div>';

    list.querySelectorAll('.btn-toggle').forEach(b => b.addEventListener('click', async () => {
      await api('/api/admin', { method: 'POST', body: { initData, action: 'toggle_task', taskId: b.dataset.id, active: b.dataset.active !== 'true' } });
      loadTasks();
    }));
    list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this task?')) return;
      await api('/api/admin', { method: 'POST', body: { initData, action: 'delete_task', taskId: b.dataset.del } });
      loadTasks();
    }));
  } catch (e) { console.error(e); }
}

// ---------- withdraws ----------
document.querySelectorAll('.admin-tabs')[1].querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs')[1].querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadWithdraws(btn.dataset.wstatus);
  });
});

async function loadWithdraws(status) {
  try {
    const qs = new URLSearchParams({ initData, action: 'list_withdraws', status });
    const data = await api('/api/admin?' + qs.toString());
    const list = document.getElementById('withdrawListAdmin');
    list.innerHTML = data.withdraws.map(w => `
      <div class="withdraw-row">
        <div class="row-line"><b>${escapeHtml(w.displayName)}</b><span>৳${w.amount}</span></div>
        <div style="color:var(--text-muted)">${w.method.toUpperCase()} • ${escapeHtml(w.accountNumber)}</div>
        <div style="color:var(--text-muted)">UID: ${w.telegramId}</div>
        ${status === 'pending' ? `
          <div class="row-actions">
            <button class="btn-approve" data-approve="${w._id}">Approve</button>
            <button class="btn-reject" data-reject="${w._id}">Reject</button>
          </div>` : ''}
      </div>
    `).join('') || '<div class="empty-state">কিছু নেই</div>';

    list.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
      await api('/api/admin', { method: 'POST', body: { initData, action: 'approve_withdraw', withdrawId: b.dataset.approve } });
      toast('✅ Approved', 'success');
      loadWithdraws('pending');
    }));
    list.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
      const reason = prompt('Reject reason (optional):') || '';
      await api('/api/admin', { method: 'POST', body: { initData, action: 'reject_withdraw', withdrawId: b.dataset.reject, reason } });
      toast('❌ Rejected', 'success');
      loadWithdraws('pending');
    }));
  } catch (e) { console.error(e); }
}

// ---------- users ----------
document.getElementById('userSearchBtn').addEventListener('click', async () => {
  const q = document.getElementById('userSearchInput').value.trim();
  if (!q) return;
  try {
    const qs = new URLSearchParams({ initData, action: 'search_user', q });
    const data = await api('/api/admin?' + qs.toString());
    const u = data.user;
    document.getElementById('userResult').innerHTML = `
      <div class="task-row">
        <div class="row-line"><b>${escapeHtml(u.firstName || '')} ${escapeHtml(u.lastName || '')}</b><span>UID: ${u.telegramId}</span></div>
        <div>Username: @${escapeHtml(u.username || 'নেই')}</div>
        <div>Balance: ৳${Number(u.balance).toFixed(2)}</div>
        <div>Ads watched (total): ${u.adsWatchedTotal || 0}</div>
        <div>Referrals: ${u.referralsCount || 0}</div>
        <div>Withdrawals approved: ${data.withdrawCount} (মোট ৳${data.totalPaid})</div>
      </div>
    `;
  } catch (e) {
    document.getElementById('userResult').innerHTML = `<div class="empty-state">ইউজার পাওয়া যায়নি</div>`;
  }
});

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
