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
        var inp = document.getElementById('notifyTime');
        var btn = document.getElementById('notifyBtn');
        var status = document.getElementById('notifyStatus');
        if (inp) inp.value = t;
        if (btn) { btn.textContent = active ? '해제' : '설정'; btn.style.background = active ? '#aaa' : '#b088f9'; }
        if (status) status.textContent = active ? ('매일 ' + t + ' 알림 설정됨 ✅') : '';
    }

    window.toggleNotify = async function () {
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
            alert('이 브라우저는 푸시 알림을 지원하지 않아요.\nHTTPS(ngrok 등)로 접속해주세요.');
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

    document.addEventListener('DOMContentLoaded', updateNotifyUI);
})();
