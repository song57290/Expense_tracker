self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));

self.addEventListener('push', function (e) {
    var data = e.data ? e.data.json() : {};
    e.waitUntil(self.registration.showNotification(data.title || '나의 가계부', {
        body: data.body || '오늘 지출을 기록해보세요!',
        icon: '/static/icon-192.png',
        badge: '/static/icon-192.png',
        data: { url: data.url || '/' }
    }));
});

self.addEventListener('notificationclick', function (e) {
    e.notification.close();
    var url = (e.notification.data && e.notification.data.url) || '/';
    e.waitUntil(clients.openWindow(url));
});
