(function () {
    function urlB64ToUint8Array(b64) {
        var pad = '='.repeat((4 - b64.length % 4) % 4);
        var b64u = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
        var raw = atob(b64u);
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        return arr;
    }

    function updateNotifyUI() {
        var active = localStorage.getItem('notifyActive') === '1';
        var t = localStorage.getItem('notifyTime') || '21:00';
        var track = document.getElementById('notifyTrack');
        var dot = document.getElementById('notifyDot');
        var timeRow = document.getElementById('notifyTimeRow');
        var timeInput = document.getElementById('notifyTime');
        if (track) track.style.background = active ? '#34c759' : '#e5e5ea';
        if (dot) dot.style.left = active ? '22px' : '2px';
        if (timeRow) timeRow.style.display = active ? 'flex' : 'none';
        if (timeInput) timeInput.value = t;
    }

    window.handleToggleClick = async function () {
        var active = localStorage.getItem('notifyActive') === '1';
        if (active) {
            try {
                var reg = await navigator.serviceWorker.ready;
                var sub = await reg.pushManager.getSubscription();
                if (sub) {
                    await fetch('/api/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
                    await sub.unsubscribe();
                }
            } catch (e) { console.warn(e); }
            localStorage.setItem('notifyActive', '0');
            updateNotifyUI();
            return;
        }
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            alert('HTTPS(ngrok 등)로 접속해주세요.');
            return;
        }
        var perm = await Notification.requestPermission();
        if (perm !== 'granted') { alert('알림 권한이 필요합니다.'); return; }
        try {
            var timeVal = (document.getElementById('notifyTime') || {}).value || '21:00';
            var parts = timeVal.split(':');
            var resp = await fetch('/api/vapid-public-key');
            var keyData = await resp.json();
            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(keyData.key) });
            var subJson = sub.toJSON();
            subJson.notify_hour = parseInt(parts[0]);
            subJson.notify_minute = parseInt(parts[1]);
            var r = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subJson) });
            if (r.ok) {
                localStorage.setItem('notifyActive', '1');
                localStorage.setItem('notifyTime', timeVal);
                updateNotifyUI();
            } else { alert('서버 오류가 발생했습니다.'); }
        } catch (e) { alert('오류: ' + e.message); }
    };

    window.handleTimeChange = async function () {
        var timeVal = document.getElementById('notifyTime').value;
        if (!timeVal) return;
        localStorage.setItem('notifyTime', timeVal);
        if (localStorage.getItem('notifyActive') !== '1') return;
        try {
            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.getSubscription();
            if (sub) {
                var parts = timeVal.split(':');
                var subJson = sub.toJSON();
                subJson.notify_hour = parseInt(parts[0]);
                subJson.notify_minute = parseInt(parts[1]);
                await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subJson) });
            }
        } catch (e) { console.warn(e); }
    };

    document.addEventListener('DOMContentLoaded', updateNotifyUI);
})();
