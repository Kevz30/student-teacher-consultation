import { getFirestore } from "firebase/firestore";
import app from "./firebaseConfig";

const db = getFirestore(app);
export default db;
// This file initializes Firestore with the Firebase app configuration.
// It exports the Firestore instance for use in other parts of the application.