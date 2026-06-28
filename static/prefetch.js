(function () {
    var _sent = {};

    function _ok(a) {
        var href = a.getAttribute('href');
        if (!href || href === '#') return false;
        if (href.startsWith('http') || href.startsWith('mailto')) return false;
        if (href.startsWith('/edit/') || href.startsWith('/api/') || href.startsWith('/delete/')) return false;
        if (a.getAttribute('data-bs-toggle') || a.getAttribute('data-bs-target') || a.getAttribute('data-bs-dismiss')) return false;
        if (a.target === '_blank') return false;
        return true;
    }

    function _prefetch(href) {
        if (_sent[href]) return;
        _sent[href] = true;
        var sw = navigator.serviceWorker && navigator.serviceWorker.controller;
        if (sw) sw.postMessage({ type: 'PREFETCH', url: new URL(href, location.href).href });
    }

    // 손가락이 닿는 순간 SW에 캐싱 요청
    document.addEventListener('touchstart', function (e) {
        var a = e.target.closest('a');
        if (a && _ok(a)) _prefetch(a.getAttribute('href'));
    }, { passive: true });

    // 데스크탑: 마우스 올릴 때 캐싱 요청
    document.addEventListener('mouseover', function (e) {
        var a = e.target.closest('a');
        if (a && _ok(a)) _prefetch(a.getAttribute('href'));
    });
})();
