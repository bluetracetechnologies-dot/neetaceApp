// api/test.js — temporary debug endpoint, DELETE after fixing
module.exports = async function handler(req, res) {
  const results = {};
  
  // Check env vars exist
  results.hasProjectId = !!process.env.FIREBASE_PROJECT_ID;
  results.hasClientEmail = !!process.env.FIREBASE_CLIENT_EMAIL;
  results.hasPrivateKey = !!process.env.FIREBASE_PRIVATE_KEY;
  results.hasRazorpayKey = !!process.env.RAZORPAY_KEY_ID;
  
  // Check private key format
  if (process.env.FIREBASE_PRIVATE_KEY) {
    let key = process.env.FIREBASE_PRIVATE_KEY;
    if (key.startsWith('"')) key = key.slice(1, -1);
    key = key.replace(/\\n/g, '\n');
    results.keyStartsWith = key.substring(0, 27);
    results.keyEndsWith = key.substring(key.length - 25);
    results.keyLength = key.length;
    results.hasRealNewlines = key.includes('\n');
  }
  
  results.projectId = process.env.FIREBASE_PROJECT_ID;
  results.clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  
  // Try Firebase Admin init
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      let key = process.env.FIREBASE_PRIVATE_KEY || '';
      if (key.startsWith('"')) key = key.slice(1, -1);
      key = key.replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: key,
        }),
      });
    }
    results.firebaseInit = 'SUCCESS';
    // Try a simple Firestore call
    const db = admin.firestore();
    await db.collection('_test').limit(1).get();
    results.firestoreConnection = 'SUCCESS';
  } catch(err) {
    results.firebaseError = err.message;
    results.firebaseCode = err.code;
  }
  
  return res.status(200).json(results);
};
