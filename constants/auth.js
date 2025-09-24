// constants/auth.js
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import app from "./firebaseConfig";

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch (e) {
  // if already initialized, fall back to getAuth
  auth = getAuth(app);
}

export default auth;
