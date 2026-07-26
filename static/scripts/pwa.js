/* Registers the service worker so Dungeon Escape is installable as a PWA.
   Safe no-op on browsers without service-worker support. */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    });
}
