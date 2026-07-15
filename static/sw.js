self.addEventListener('push', (event) => {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = {};
    }

    const options = {
        body: data.body || '오늘 지출을 기록했나요? 📝',

        // 알림 아이콘
        icon: '/static/icon-192.png',

        // Android용 단색 Badge
        badge: '/static/icon-monochrome.png',

        // 클릭 시 중복 방지
        tag: 'gaegyebu-push',

        // 이전 알림 교체
        renotify: false,

        // 시간 표시
        timestamp: Date.now(),

        // 진동
        vibrate: [200, 100, 200],

        // 앱 실행 시 전달할 데이터
        data: {
            url: data.url || '/'
        },

        // Android 우선순위
        requireInteraction: false,

        // Android 전용 옵션
        silent: false
    };

    event.waitUntil(
        self.registration.showNotification(
            data.title || '나의 가계부',
            options
        )
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = new URL(
        (event.notification.data?.url || '/'),
        self.location.origin
    ).href;

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {

            for (const client of clientList) {
                if (client.url.startsWith(self.location.origin)) {
                    return client.focus();
                }
            }

            return clients.openWindow(url);
        })
    );
});