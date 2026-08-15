// api/_firebase.js — shared Firebase Admin initialiser
const admin = require('firebase-admin');

if (!admin.apps.length) {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  
  // Vercel sometimes wraps the value in quotes — strip them
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  
  // Convert literal \n strings to real newlines
  privateKey = privateKey.replace(/\\n/g, '\n');
  
  // Debug: log first/last 30 chars to confirm format (never logs the full key)
  console.log('Firebase key starts:', privateKey.substring(0, 30));
  console.log('Firebase key ends:', privateKey.substring(privateKey.length - 30));
  console.log('Project ID:', process.env.FIREBASE_PROJECT_ID);
  console.log('Client email:', process.env.FIREBASE_CLIENT_EMAIL);

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const db   = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
