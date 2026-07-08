document.addEventListener('DOMContentLoaded', async () => {
  try {
    const r = await fetch('/api/config');
    const d = await r.json();
    document.getElementById('webhook').value = d.webhook || '';
    document.getElementById('pushTime').value = d.pushTime || '06:30';
    document.getElementById('userName').value = d.userName || '';
    document.getElementById('birthDate').value = d.birthDate || '';
    document.getElementById('birthTime').value = d.birthTime || '';
    document.getElementById('gender').value = d.gender || 'male';
    document.getElementById('location').value = d.location || '';
    if (d.birthDate) {
      const b = d.bazi || {};
      document.getElementById('bazi-info').innerHTML = 'Year: ' + (b.yearGZ || 'N/A') + '  Month: ' + (b.monthGZ || 'N/A') + '  Day: ' + (b.dayGZ || 'N/A') + '  Hour: ' + (b.timeGZ || 'N/A');
    }
  } catch (e) { console.error(e); }
});

async function testDingTalk() {
  try {
    const r = await fetch('/api/test-dingtalk');
    const d = await r.json();
    showStatus(d.ok ? 'ok' : 'err', d.ok ? 'DingTalk OK!' : 'Error: ' + d.msg);
  } catch (e) { showStatus('err', e.message); }
}

async function saveConfig() {
  const data = {
    webhook: document.getElementById('webhook').value,
    pushTime: document.getElementById('pushTime').value,
    userName: document.getElementById('userName').value,
    birthDate: document.getElementById('birthDate').value,
    birthTime: document.getElementById('birthTime').value,
    gender: document.getElementById('gender').value,
    location: document.getElementById('location').value
  };
  try {
    const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const d = await r.json();
    showStatus(d.ok ? 'ok' : 'err', d.ok ? 'Saved!' : 'Error: ' + d.msg);
    if (d.ok) await loadConfig();
  } catch (e) { showStatus('err', e.message); }
}

async function manualPush() {
  try {
    showStatus('', '');
    const r = await fetch('/api/push', { method: 'POST' });
    const d = await r.json();
    showStatus(d.ok ? 'ok' : 'err', d.ok ? 'Push sent!' : 'Error: ' + d.msg);
  } catch (e) { showStatus('err', e.message); }
}

function showStatus(type, msg) {
  const el = document.getElementById('status');
  el.className = type;
  el.textContent = msg;
  el.style.display = type ? 'block' : 'none';
}
