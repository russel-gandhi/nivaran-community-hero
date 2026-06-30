importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  "projectId": "thinking-replica-kdckx",
  "appId": "1:513568260262:web:a123a241046cba746af467",
  // Note: Firebase API keys are public by design to identify your project to Firebase servers. 
  // Security is handled by Firestore Security Rules, not by keeping this key secret.
  "apiKey": "AIzaSyDFoAoXXpPwhIxTyrMIi9gCAog2HSO0O10",
  "authDomain": "thinking-replica-kdckx.firebaseapp.com",
  "storageBucket": "thinking-replica-kdckx.firebasestorage.app",
  "messagingSenderId": "513568260262"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/vite.svg',
    vibrate: [200, 100, 200, 100, 200, 100, 200], // distinct pattern for 'is it still a problem'
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((windowClients) => {
        // Check if there is already a window/tab open with the target URL
        for (var i = 0; i < windowClients.length; i++) {
          var client = windowClients[i];
          if (client.url.includes(event.notification.data.url) && 'focus' in client) {
            return client.focus();
          }
        }
        // If not, open a new window
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
    );
  } else if (event.notification.data && event.notification.data.reportId) {
     event.waitUntil(
      clients.matchAll({ type: 'window' }).then((windowClients) => {
        const targetUrl = '/?verify=' + event.notification.data.reportId;
        for (var i = 0; i < windowClients.length; i++) {
          var client = windowClients[i];
          if (client.url && 'focus' in client) {
             client.navigate(targetUrl);
             return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
    );
  }
});

// Minimal fetch listener to satisfy PWA installability requirements
self.addEventListener('fetch', (event) => {
  // Let the browser do its default thing
});
