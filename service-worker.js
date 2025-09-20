self.addEventListener('push', (event) => {
    const data = event.data.json();
    const title = data.title || '나의 탄소 오름';
    const options = {
        body: data.body || '친환경 활동으로 오름을 키워보세요!',
        icon: 'https://i.postimg.cc/byMjbXs1/Gemini-Generated-Image-s04wxfs04wxfs04w-1.png',
        badge: 'https://i.postimg.cc/byMjbXs1/Gemini-Generated-Image-s04wxfs04wxfs04w-1.png',
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
