import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyBW3ygHX1sTK5LsgUDdzbD2nAIk1bpqThg",
  authDomain: "student-teacher-consultation.firebaseapp.com",
  projectId: "student-teacher-consultation",
  storageBucket: "student-teacher-consultation.appspot.com",
  messagingSenderId: "320018549622",
  appId: "1:320018549622:web:dcdef4838de700cd810857"
};

const app = initializeApp(firebaseConfig);

export default app;
