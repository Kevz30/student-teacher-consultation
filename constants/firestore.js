// constants/firestore.js
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // 👈 add this
import app from "./firebaseConfig";

const db = getFirestore(app);
const storage = getStorage(app);                 // 👈 add this

export default db;
export { storage }; // 👈 export storage too

