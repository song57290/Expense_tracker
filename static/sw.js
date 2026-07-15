var NAV_CACHE = 'nav-prefetch-v2';

self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }).then(function () { return clients.claim(); })
    );
});

// prefetch.js → SW로 PREFETCH 메시지 수신 → 캐싱
self.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'PREFETCH') return;
    var url = e.data.url;
    e.waitUntil(
        caches.open(NAV_CACHE).then(function (cache) {
            return cache.match(url).then(function (hit) {
                if (hit) return;
                return fetch(url, { credentials: 'same-origin' }).then(function (r) {
                    if (r.ok) return cache.put(url, r);
                }).catch(function () {});
            });
        })
    );
});

// 내비게이션 요청: 캐시 우선 → 사용 후 삭제 (1회용 캐시)
self.addEventListener('fetch', function (e) {
    if (e.request.mode === 'navigate') {
        e.respondWith(
            caches.open(NAV_CACHE).then(function (cache) {
                return cache.match(e.request.url).then(function (cached) {
                    if (cached) {
                        cache.delete(e.request.url);
                        return cached;
                    }
                    return fetch(e.request);
                });
            })
        );
        return;
    }
    e.respondWith(fetch(e.request));
});

self.addEventListener('push', function (e) {
    var data = {};
    try { data = e.data ? e.data.json() : {}; } catch (err) {}
    e.waitUntil(
        self.registration.showNotification(data.title || '나의 가계부', {
            body: data.body || '오늘 지출을 기록했나요? 📝',
            icon: '/static/icon-192.png',
            vibrate: [200, 100, 200],
            tag: 'gaegyebu-push',
            data: { url: data.url || '/' }
        }).catch(function () {
            return self.registration.showNotification(data.title || '나의 가계부', {
                body: data.body || '오늘 지출을 기록했나요? 📝',
                vibrate: [200, 100, 200],
                tag: 'gaegyebu-push',
                data: { url: data.url || '/' }
            });
        })
    );
});

self.addEventListener('notificationclick', function (e) {
    e.notification.close();
    var url = self.location.origin + ((e.notification.data && e.notification.data.url) || '/');
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].url.startsWith(self.location.origin) && 'focus' in list[i]) {
                    return list[i].focus();
                }
            }
            return clients.openWindow(url);
        })
    );
});
