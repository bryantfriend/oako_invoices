import { auth, db } from "./firebase.js";
import {
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { store } from "./store.js";
import sessionDataStore from "../services/sessionDataStore.js";

const ADMIN_ROLES = ['admin', 'superadmin'];
const ADMIN_PROFILE_TIMEOUT_MS = 12000;
const ADMIN_PROFILE_CACHE_KEY = 'kyrgyz-organics-admin-profile';

function withTimeout(promise, timeoutMs, label) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const error = new Error(`${label} timeout after ${timeoutMs}ms`);
            error.code = 'timeout';
            reject(error);
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

class AuthService {
    constructor() {
        this.initPromise = null;
        this.authResolved = false;
    }

    init() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise((resolve) => {
            onAuthStateChanged(auth, async (user) => {
                const adminProfile = user ? await this.verifyAdminProfile(user, 'auth-state') : null;
                const isAdmin = this.isValidAdminProfile(adminProfile);

                if (!user || !isAdmin) {
                    sessionDataStore.clearUserScopedMemory('auth-state-cleared');
                }

                store.setState({
                    currentUser: user || null,
                    adminProfile,
                    isAdmin,
                    authReady: true
                });

                if (!this.authResolved) {
                    this.authResolved = true;
                    resolve(user);
                }
            });
        });

        return this.initPromise;
    }

    async login(email, password) {
        try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            const adminProfile = await this.verifyAdminProfile(cred.user, 'login');
            const isAdmin = this.isValidAdminProfile(adminProfile);

            store.setState({
                currentUser: cred.user,
                adminProfile,
                isAdmin,
                authReady: true
            });

            if (!isAdmin) {
                await signOut(auth);
                sessionDataStore.clearUserScopedMemory('login-profile-rejected');
                store.setState({
                    currentUser: null,
                    adminProfile: null,
                    isAdmin: false,
                    authReady: true
                });
                return {
                    success: false,
                    error: 'This account is signed in, but it does not have a /users/{uid} profile with role admin or superadmin.'
                };
            }

            return { success: true, user: cred.user, adminProfile };
        } catch (err) {
            console.error("Login failed:", err);
            return { success: false, error: err.message };
        }
    }

    async sendPasswordReset(email) {
        try {
            await sendPasswordResetEmail(auth, email);
            return { success: true };
        } catch (err) {
            console.error("Password reset failed:", err);

            if (err.code === 'auth/user-not-found') {
                return { success: true };
            }

            return { success: false, error: err.message };
        }
    }

    async logout() {
        try {
            await signOut(auth);
            sessionDataStore.clearUserScopedMemory('logout');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    getCurrentUser() {
        return auth.currentUser;
    }

    isAdmin() {
        return store.getState().isAdmin === true;
    }

    getAuthDebugState() {
        const state = store.getState();
        const user = auth.currentUser;
        return {
            authReady: state.authReady === true,
            signedIn: !!user,
            uid: user ? user.uid : null,
            isAdmin: state.isAdmin === true,
            role: state.adminProfile ? state.adminProfile.role || null : null
        };
    }

    isValidAdminProfile(profile) {
        return !!profile && ADMIN_ROLES.includes(profile.role);
    }

    getCachedAdminProfile(uid) {
        try {
            const raw = window.localStorage.getItem(ADMIN_PROFILE_CACHE_KEY);
            if (!raw) {
                return null;
            }
            const cached = JSON.parse(raw);
            if (!cached || cached.id !== uid || !this.isValidAdminProfile(cached)) {
                return null;
            }
            return cached;
        } catch (error) {
            return null;
        }
    }

    setCachedAdminProfile(profile) {
        if (!this.isValidAdminProfile(profile)) {
            return;
        }
        try {
            window.localStorage.setItem(ADMIN_PROFILE_CACHE_KEY, JSON.stringify({
                id: profile.id,
                role: profile.role,
                name: profile.name || '',
                email: profile.email || '',
                cachedAt: new Date().toISOString()
            }));
        } catch (error) {
            console.warn('[auth] Could not cache admin profile.', error);
        }
    }

    async verifyAdminProfile(user, source = 'auth') {
        if (!user) {
            return null;
        }

        try {
            const profileRef = doc(db, 'users', user.uid);
            const snapshot = await withTimeout(getDoc(profileRef), ADMIN_PROFILE_TIMEOUT_MS, 'Admin profile fetch');
            const profile = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
            const role = profile ? profile.role || null : null;

            console.info('[auth] Admin profile check', {
                source,
                uid: user.uid,
                profileExists: snapshot.exists(),
                role,
                isAdmin: ADMIN_ROLES.includes(role)
            });

            if (!profile) {
                console.warn('[auth] Missing admin profile. Create users/' + user.uid + ' with role "admin" or "superadmin".');
            } else if (!ADMIN_ROLES.includes(role)) {
                console.warn('[auth] User profile role is not authorized for the invoice app.', {
                    uid: user.uid,
                    role
                });
            }

            this.setCachedAdminProfile(profile);
            return profile;
        } catch (error) {
            const cachedProfile = this.getCachedAdminProfile(user.uid);
            console.warn('[auth] Could not read admin profile for signed-in user.', {
                source,
                uid: user.uid,
                code: error.code || '',
                message: error.message || '',
                usingCachedAdminProfile: !!cachedProfile
            });
            return cachedProfile;
        }
    }
}

export const authService = new AuthService();
