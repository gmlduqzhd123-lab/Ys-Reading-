// 책숲 서비스 워커 — 앱 설치용. 학생 글·계정 화면(HTML·API)은 저장하지 않고, 바뀌지 않는 정적 파일만 저장한다.
// 캐시 이름은 bookforest- 로 시작하고, 지울 때도 내 것만 지운다.
const CACHE = "bookforest-v1";
const CACHE_PREFIX = "bookforest-v";
const STATIC = /^\/(_next\/static\/|icons\/|images\/|ys-install\.js$|ys-qr\.js$|qr\.svg$|og-image\.jpg$)/;
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(caches.keys()
  .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || !STATIC.test(url.pathname)) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req)));
});
