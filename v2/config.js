// גרסת Firebase. (הפרטים האלה לא סודיים – האבטחה היא בכללי Firestore)
window.APP_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyB2LdUuYDc6MC9q7wggiMPF26eoFEN7pKY',
    authDomain: 'inventory-beyarok.firebaseapp.com',
    projectId: 'inventory-beyarok',
    storageBucket: 'inventory-beyarok.firebasestorage.app',
    messagingSenderId: '810970717623',
    appId: '1:810970717623:web:6e3c71ef22dbb00a11dc32',
  },
  // המערכת הקיימת (Google Sheets) – להעברת הנתונים בהקמה
  oldApiUrl: 'https://script.google.com/macros/s/AKfycbwrImSX3eJNDJFJJ1_c8NXrqc6RKEc6akIJYvN6iy1s69cgRUIhnpj6wMWGygXNSKU8/exec',
  fieldUrl: '',
};
// נתונים שמורים בדפדפן – בנפרד מהגרסה הקיימת (אותו אתר)
window.STORE_PREFIX = 'inv2:';
