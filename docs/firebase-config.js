// Firebase-configuratie van het project speciale45-orders (publieke gegevens; toegang wordt door de beveiligingsregels bepaald)
// 'self' werkt zowel in de pagina als in de service worker (meldingen).
self.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDS4pHflJmEqeybPSQ61MkNOZ6l8MrQszo",
  authDomain: "speciale45-orders.firebaseapp.com",
  projectId: "speciale45-orders",
  storageBucket: "speciale45-orders.firebasestorage.app",
  messagingSenderId: "646038599212",
  appId: "1:646038599212:web:244d8273ff125a301f4389"
};
// Publieke sleutel voor webmeldingen (Firebase → Projectinstellingen → Cloud Messaging → Web Push-certificaten). Leeg = meldingen uit.
self.VAPID_KEY = "";
