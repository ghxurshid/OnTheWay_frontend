const CACHE_NAME = 'map-cache-v1';
const urlsToCache = [
  // Добавьте сюда URL-адреса для кэширования при установке
  // Пример: '/path/to/resource'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Кэшируемые ресурсы найдены, возвращаем их из кэша
      if (response) {
        return response;
      }
      // Кэшируемые ресурсы не найдены, делаем сетевой запрос и кэшируем его
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
});
