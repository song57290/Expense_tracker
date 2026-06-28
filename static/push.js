(function () {
    function urlB64ToUint8Array(b64) {
        var pad = '='.repeat((4 - b64.length % 4) % 4);
        var b64u = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
        var raw = atob(b64u);
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        return arr;
    }

    function _formatDisplayTime(t) {
        var parts = (t || '21:00').split(':');
        var h = parseInt(parts[0]) || 0;
        var m = parseInt(parts[1]) || 0;
        var ampm = h >= 12 ? '오후' : '오전';
        var h12 = h % 12 || 12;
        return ampm + ' ' + h12 + ':' + (m < 10 ? '0' : '') + m;
    }

    function _updatePickerUI(t) {
        var parts = (t || '21:00').split(':');
        var h24 = parseInt(parts[0]) || 0;
        var m = parseInt(parts[1]) || 0;
        var ispm = h24 >= 12;
        var h12 = h24 % 12 || 12;
        var amBtn = document.getElementById('tpAmBtn');
        var pmBtn = document.getElementById('tpPmBtn');
        if (amBtn) {
            amBtn.style.background = !ispm ? 'linear-gradient(135deg,#b088f9,#7baff0)' : '#efefef';
            amBtn.style.color = !ispm ? 'white' : '#888';
            amBtn.style.boxShadow = !ispm ? '0 2px 10px rgba(176,136,249,0.35)' : 'none';
        }
        if (pmBtn) {
            pmBtn.style.background = ispm ? 'linear-gradient(135deg,#b088f9,#7baff0)' : '#efefef';
            pmBtn.style.color = ispm ? 'white' : '#888';
            pmBtn.style.boxShadow = ispm ? '0 2px 10px rgba(176,136,249,0.35)' : 'none';
        }
        var hourEl = document.getElementById('tpHour');
        var minEl = document.getElementById('tpMinute');
        if (hourEl) hourEl.textContent = h12;
        if (minEl) minEl.textContent = m < 10 ? '0' + m : '' + m;
    }

    function _setToggleUI(trackId, dotId, timeRowId, active) {
        var track = document.getElementById(trackId);
        var dot = document.getElementById(dotId);
        var timeRow = document.getElementById(timeRowId);
        if (track) track.style.background = active ? '#34c759' : '#e5e5ea';
        if (dot) dot.style.left = active ? '22px' : '2px';
        if (timeRow) {
            timeRow.style.display = active ? 'flex' : 'none';
            if (!active) {
                var picker = document.getElementById('notifySheetTimePicker');
                var chev = document.getElementById('tpChevron');
                if (picker) picker.style.display = 'none';
                if (chev) chev.style.transform = '';
            }
        }
    }

    function _applyTime(newT) {
        localStorage.setItem('notifyTime', newT);
        var display = document.getElementById('notifySheetTimeDisplay');
        if (display) display.textContent = _formatDisplayTime(newT);
        var sidebarInput = document.getElementById('notifyTime');
        if (sidebarInput) sidebarInput.value = newT;
        _updatePickerUI(newT);
        _syncTimeToServer(newT);
    }

    function updateNotifyUI() {
        var active = localStorage.getItem('notifyActive') === '1';
        var t = localStorage.getItem('notifyTime') || '21:00';
        _setToggleUI('notifyTrack', 'notifyDot', 'notifyTimeRow', active);
        var sidebarInput = document.getElementById('notifyTime');
        if (sidebarInput) sidebarInput.value = t;
        _setToggleUI('notifySheetTrack', 'notifySheetDot', 'notifySheetTimeRow', active);
        var display = document.getElementById('notifySheetTimeDisplay');
        if (display) display.textContent = _formatDisplayTime(t);
        _updatePickerUI(t);
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
        var inp = document.getElementById('notifyTime');
        var timeVal = inp ? inp.value : '21:00';
        if (!timeVal) return;
        _applyTime(timeVal);
    };

    async function _syncTimeToServer(timeVal) {
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
    }

    window.toggleTimePicker = function () {
        var picker = document.getElementById('notifySheetTimePicker');
        var chev = document.getElementById('tpChevron');
        if (!picker) return;
        var isOpen = picker.style.display !== 'none';
        picker.style.display = isOpen ? 'none' : 'block';
        if (chev) chev.style.transform = isOpen ? '' : 'rotate(180deg)';
        if (!isOpen) _updatePickerUI(localStorage.getItem('notifyTime') || '21:00');
    };

    window.setAmPm = function (ampm) {
        var t = localStorage.getItem('notifyTime') || '21:00';
        var parts = t.split(':');
        var h24 = parseInt(parts[0]);
        var m = parseInt(parts[1]);
        var currentPm = h24 >= 12;
        if ((ampm === 'pm') === currentPm) return;
        h24 = ampm === 'pm' ? h24 + 12 : h24 - 12;
        _applyTime((h24 < 10 ? '0' : '') + h24 + ':' + (m < 10 ? '0' : '') + m);
    };

    window.adjustHour = function (delta) {
        var t = localStorage.getItem('notifyTime') || '21:00';
        var parts = t.split(':');
        var h24 = parseInt(parts[0]);
        var m = parseInt(parts[1]);
        var ispm = h24 >= 12;
        var h12 = h24 % 12 || 12;
        h12 += delta;
        if (h12 > 12) h12 = 1;
        if (h12 < 1) h12 = 12;
        h24 = ispm ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
        _applyTime((h24 < 10 ? '0' : '') + h24 + ':' + (m < 10 ? '0' : '') + m);
    };

    window.adjustMinute = function (delta) {
        var t = localStorage.getItem('notifyTime') || '21:00';
        var parts = t.split(':');
        var h24 = parseInt(parts[0]);
        var m = parseInt(parts[1]);
        m = ((Math.round(m / 5) * 5 + delta) % 60 + 60) % 60;
        _applyTime((h24 < 10 ? '0' : '') + h24 + ':' + (m < 10 ? '0' : '') + m);
    };

    var _ARROW_UP = '<svg width="20" height="12" viewBox="0 0 20 12" fill="none"><path d="M2 10L10 2L18 10" stroke="#b088f9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var _ARROW_DN = '<svg width="20" height="12" viewBox="0 0 20 12" fill="none"><path d="M2 2L10 10L18 2" stroke="#b088f9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var _BTN = 'background:none;border:none;cursor:pointer;padding:12px 28px;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;';

    function _createNotifySheet() {
        if (document.getElementById('notifySheet')) return;
        var sheet = document.createElement('div');
        sheet.id = 'notifySheet';
        sheet.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.42);z-index:2000;align-items:flex-end;justify-content:center;opacity:0;transition:opacity 0.25s ease;';
        sheet.innerHTML =
            '<div id="notifySheetPanel" style="background:white;border-radius:24px 24px 0 0;width:100%;max-width:520px;transform:translateY(100%);transition:transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94);">'
          // Header
          + '<div style="padding:20px 20px 0;">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">'
          + '<span style="font-weight:700;font-size:1.05rem;color:#1c1c1e;">알림 설정</span>'
          + '<button onclick="closeNotifySheet()" style="background:#f2f2f7;border:none;width:30px;height:30px;border-radius:15px;font-size:1.1rem;color:#6e6e73;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&times;</button>'
          + '</div>'
          // Card
          + '<div style="background:#f7f7f7;border-radius:14px;overflow:hidden;">'
          // Toggle row
          + '<div style="display:flex;align-items:center;padding:14px 16px;">'
          + '<div style="width:32px;height:32px;background:linear-gradient(135deg,#b088f9,#7baff0);border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="bi bi-bell-fill" style="font-size:0.85rem;color:white;"></i></div>'
          + '<span style="flex:1;margin-left:12px;font-size:0.95rem;color:#1c1c1e;font-weight:500;">알림</span>'
          + '<div id="notifySheetToggle" onclick="handleToggleClick()" style="position:relative;width:51px;height:31px;cursor:pointer;flex-shrink:0;">'
          + '<div id="notifySheetTrack" style="width:51px;height:31px;background:#e5e5ea;border-radius:16px;transition:background 0.3s;"></div>'
          + '<div id="notifySheetDot" style="position:absolute;top:2px;left:2px;width:27px;height:27px;background:white;border-radius:50%;box-shadow:0 2px 5px rgba(0,0,0,0.25);transition:left 0.25s cubic-bezier(0.34,1.56,0.64,1);"></div>'
          + '</div>'
          + '</div>'
          // Time row
          + '<div id="notifySheetTimeRow" onclick="window.toggleTimePicker()" style="display:none;border-top:1px solid #ebebeb;padding:14px 16px;align-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent;">'
          + '<div style="width:32px;height:32px;background:#f0eeff;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="bi bi-clock" style="font-size:0.85rem;color:#b088f9;"></i></div>'
          + '<span style="flex:1;margin-left:12px;font-size:0.95rem;color:#1c1c1e;">알림 시간</span>'
          + '<div style="display:flex;align-items:center;gap:5px;">'
          + '<span id="notifySheetTimeDisplay" style="color:#b088f9;font-size:0.95rem;font-weight:600;"></span>'
          + '<i id="tpChevron" class="bi bi-chevron-down" style="color:#b088f9;font-size:0.78rem;display:inline-block;transition:transform 0.25s;"></i>'
          + '</div>'
          + '</div>'
          // Custom time picker
          + '<div id="notifySheetTimePicker" style="display:none;border-top:1px solid #ebebeb;padding:20px 24px 24px;">'
          // AM/PM pills
          + '<div style="display:flex;gap:8px;margin-bottom:24px;">'
          + '<button id="tpAmBtn" onclick="setAmPm(\'am\')" style="flex:1;height:40px;border:none;border-radius:20px;font-size:0.9rem;font-weight:600;cursor:pointer;transition:all 0.2s;">오전</button>'
          + '<button id="tpPmBtn" onclick="setAmPm(\'pm\')" style="flex:1;height:40px;border:none;border-radius:20px;font-size:0.9rem;font-weight:600;cursor:pointer;transition:all 0.2s;">오후</button>'
          + '</div>'
          // Hour & Minute selectors
          + '<div style="display:flex;align-items:center;justify-content:center;">'
          // Hour column
          + '<div style="display:flex;flex-direction:column;align-items:center;flex:1;">'
          + '<button onclick="adjustHour(1)" style="' + _BTN + '">' + _ARROW_UP + '</button>'
          + '<div id="tpHour" style="font-size:3rem;font-weight:700;color:#1c1c1e;min-width:72px;text-align:center;line-height:1;"></div>'
          + '<button onclick="adjustHour(-1)" style="' + _BTN + '">' + _ARROW_DN + '</button>'
          + '</div>'
          // Colon
          + '<div style="font-size:2.6rem;font-weight:700;color:#d0d0d0;padding:0 4px;flex-shrink:0;margin-top:2px;">:</div>'
          // Minute column
          + '<div style="display:flex;flex-direction:column;align-items:center;flex:1;">'
          + '<button onclick="adjustMinute(5)" style="' + _BTN + '">' + _ARROW_UP + '</button>'
          + '<div id="tpMinute" style="font-size:3rem;font-weight:700;color:#1c1c1e;min-width:72px;text-align:center;line-height:1;"></div>'
          + '<button onclick="adjustMinute(-5)" style="' + _BTN + '">' + _ARROW_DN + '</button>'
          + '</div>'
          + '</div>'
          + '</div>'
          // End card
          + '</div>'
          + '</div>'
          + '<div style="height:max(20px,env(safe-area-inset-bottom,20px));"></div>'
          + '</div>';

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
        setTimeout(function () {
            sheet.style.display = 'none';
            var picker = document.getElementById('notifySheetTimePicker');
            var chev = document.getElementById('tpChevron');
            if (picker) picker.style.display = 'none';
            if (chev) chev.style.transform = '';
        }, 320);
    };

    document.addEventListener('DOMContentLoaded', function () {
        _createNotifySheet();
        updateNotifyUI();
    });
})();
