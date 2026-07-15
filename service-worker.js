const CACHE_NAME = 'calcu-voice-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// इंस्टॉल इवेंट - फाइलों को कैश (save) करना ताकि ऐप फ़ास्ट चले
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// फेच इवेंट - इंटरनेट न होने या धीमा होने पर कैश से डेटा लोड करना
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});

