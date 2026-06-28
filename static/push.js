(function () {
    function urlB64ToUint8Array(b64) {
        var pad = '='.repeat((4 - b64.length % 4) % 4);
        var b64u = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
        var raw = atob(b64u);
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        return arr;
    }

    function _setToggleUI(trackId, dotId, timeRowId, timeId, active, t) {
        var track = document.getElementById(trackId);
        var dot = document.getElementById(dotId);
        var timeRow = document.getElementById(timeRowId);
        var timeInput = document.getElementById(timeId);
        if (track) track.style.background = active ? '#34c759' : '#e5e5ea';
        if (dot) dot.style.left = active ? '22px' : '2px';
        if (timeRow) timeRow.style.display = active ? 'flex' : 'none';
        if (timeInput) timeInput.value = t;
    }

    function updateNotifyUI() {
        var active = localStorage.getItem('notifyActive') === '1';
        var t = localStorage.getItem('notifyTime') || '21:00';
        _setToggleUI('notifyTrack', 'notifyDot', 'notifyTimeRow', 'notifyTime', active, t);
        _setToggleUI('notifySheetTrack', 'notifySheetDot', 'notifySheetTimeRow', 'notifySheetTime', active, t);
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
            alert('HTTPS로 접속해주세요.');
            return;
        }
        var perm = await Notification.requestPermission();
        if (perm !== 'granted') { alert('알림 권한이 필요합니다.'); return; }
        try {
            var timeVal = localStorage.getItem('notifyTime') || '21:00';
            var parts = timeVal.split(':');
            var resp = await fetch('/api/vapid-public-key');
            var keyData = await resp.json();
            var reg = await navigator.serviceWorker.ready;
            var existing = await reg.pushManager.getSubscription();
            if (existing) await existing.unsubscribe();
            var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(keyData.key) });
            var subJson = sub.toJSON();
            subJson.notify_hour = parseInt(parts[0]);
            subJson.notify_minute = parseInt(parts[1]);
            var r = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subJson) });
            if (r.ok) {
                localStorage.setItem('notifyActive', '1');
                updateNotifyUI();
            } else { alert('서버 오류가 발생했습니다.'); }
        } catch (e) { alert('오류: ' + e.message); }
    };

    window.handleTimeChange = async function () {
        var active = document.activeElement;
        var timeVal = (active && active.type === 'time') ? active.value
            : ((document.getElementById('notifySheetTime') || {}).value
            || (document.getElementById('notifyTime') || {}).value
            || '21:00');
        if (!timeVal) return;
        localStorage.setItem('notifyTime', timeVal);
        updateNotifyUI();
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

    function _createNotifySheet() {
        if (document.getElementById('notifySheet')) return;
        var sheet = document.createElement('div');
        sheet.id = 'notifySheet';
        sheet.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:2000;align-items:flex-end;justify-content:center;opacity:0;transition:opacity 0.25s ease;';
        sheet.innerHTML =
            '<div id="notifySheetPanel" style="background:white;border-radius:20px 20px 0 0;width:100%;padding:20px 16px 44px;transform:translateY(100%);transition:transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94);">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">'
          + '<span style="font-weight:700;font-size:1rem;color:#1c1c1e;">알림 설정</span>'
          + '<button onclick="closeNotifySheet()" style="background:none;border:none;font-size:1.5rem;color:#aaa;line-height:1;padding:0 4px;">&times;</button>'
          + '</div>'
          + '<div style="background:#f7f7f7;border-radius:12px;overflow:hidden;">'
          + '<div style="display:flex;align-items:center;padding:14px 16px;">'
          + '<div style="width:30px;height:30px;background:linear-gradient(135deg,#b088f9,#7baff0);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="bi bi-bell-fill" style="font-size:0.82rem;color:white;"></i></div>'
          + '<span style="flex:1;margin-left:12px;font-size:0.95rem;color:#1c1c1e;font-weight:500;">알림</span>'
          + '<div id="notifySheetToggle" onclick="handleToggleClick()" style="position:relative;width:51px;height:31px;cursor:pointer;flex-shrink:0;">'
          + '<div id="notifySheetTrack" style="width:51px;height:31px;background:#e5e5ea;border-radius:16px;transition:background 0.3s;"></div>'
          + '<div id="notifySheetDot" style="position:absolute;top:2px;left:2px;width:27px;height:27px;background:white;border-radius:50%;box-shadow:0 2px 5px rgba(0,0,0,0.25);transition:left 0.25s cubic-bezier(0.34,1.56,0.64,1);"></div>'
          + '</div></div>'
          + '<div id="notifySheetTimeRow" style="display:none;border-top:1px solid #ebebeb;padding:14px 16px;align-items:center;">'
          + '<div style="width:30px;height:30px;background:#f0eeff;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="bi bi-clock" style="font-size:0.82rem;color:#b088f9;"></i></div>'
          + '<span style="flex:1;margin-left:12px;font-size:0.95rem;color:#1c1c1e;">알림 시간</span>'
          + '<input type="time" id="notifySheetTime" value="21:00" onchange="handleTimeChange()" style="border:none;background:transparent;color:#b088f9;font-size:0.95rem;font-weight:600;outline:none;cursor:pointer;min-width:95px;text-align:right;">'
          + '</div></div></div>';
        sheet.addEventListener('click', function (e) { if (e.target === sheet) closeNotifySheet(); });
        document.body.appendChild(sheet);
    }

    window.openNotifySheet = function () {
        _createNotifySheet();
        updateNotifyUI();
        var sheet = document.getElementById('notifySheet');
        var panel = document.getElementById('notifySheetPanel');
        sheet.style.display = 'flex';
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                sheet.style.opacity = '1';
                panel.style.transform = 'translateY(0)';
            });
        });
    };

    window.closeNotifySheet = function () {
        var sheet = document.getElementById('notifySheet');
        var panel = document.getElementById('notifySheetPanel');
        if (!sheet) return;
        sheet.style.opacity = '0';
        if (panel) panel.style.transform = 'translateY(100%)';
        setTimeout(function () { sheet.style.display = 'none'; }, 320);
    };

    document.addEventListener('DOMContentLoaded', function () {
        updateNotifyUI();
        _createNotifySheet();
    });
})();
