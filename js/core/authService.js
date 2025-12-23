import { auth } from "./firebase.js";
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { store } from "./store.js";

class AuthService {
    init() {
        return new Promise((resolve) => {
            onAuthStateChanged(auth, (user) => {
                store.setState({
                    currentUser: user || null,
                    // Basic admin check if email matches specific domain or hardcoded list could go here
                    // For now, adhering to the boolean we used before or just user existence
                    isAdmin: !!user
                });
                resolve(user);
            });
        });
    }

    async login(email, password) {
        try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            return { success: true, user: cred.user };
        } catch (err) {
            console.error("Login failed:", err);
            return { success: false, error: err.message };
        }
    }

    async logout() {
        try {
            await signOut(auth);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    getCurrentUser() {
        return auth.currentUser;
    }
}

export const authService = new AuthService();
