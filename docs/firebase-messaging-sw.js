// Service worker voor meldingen (Firebase Cloud Messaging). Doet verder niets: geen caching, de pagina laadt gewoon van het web.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
importScripts('firebase-config.js');
firebase.initializeApp(self.FIREBASE_CONFIG);
// Meldingen met een 'notification'-deel toont de browser zelf via de FCM-code; tikken opent de link uit de melding.
firebase.messaging();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
