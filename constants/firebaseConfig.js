// constants/firebaseConfig.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBW3ygHX1sTK5LsgUDdzbD2nAIk1bpqThg",
  authDomain: "student-teacher-consultation.firebaseapp.com",
  projectId: "student-teacher-consultation",
  storageBucket: "student-teacher-consultation.appspot.com",
  messagingSenderId: "320018549622",
  appId: "1:320018549622:web:dcdef4838de700cd810857",
};

// Single app instance
export const app = initializeApp(firebaseConfig);

// Auth with AsyncStorage persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Firestore instance
export const db = getFirestore(app);
