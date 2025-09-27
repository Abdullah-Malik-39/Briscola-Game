/* eslint-disable no-restricted-globals */

// Minimal service worker for Web Push notifications

self.addEventListener('install', (event) => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	let payload = {};
	try {
		payload = event.data ? event.data.json() : {};
	} catch (_) {
		payload = { title: 'Game Update', body: 'A move was made.' };
	}

	const title = payload.title || 'Briscola';
	const options = {
		body: payload.body || 'A move was made in your game.',
		icon: '/favicon.ico',
		badge: '/favicon.ico',
		data: payload.data || {},
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/';
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			for (const client of clientList) {
				if ('focus' in client) {
					client.focus();
					if (targetUrl) client.postMessage({ type: 'NAVIGATE', url: targetUrl });
					return;
				}
			}
			if (self.clients.openWindow) {
				return self.clients.openWindow(targetUrl);
			}
		})
	);
});


