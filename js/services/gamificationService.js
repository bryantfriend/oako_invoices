import { workflowLocalStore } from './workflowLocalStore.js';
import { auth, db } from "../core/firebase.js";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COLLECTION = 'users';

export const BADGES = [
    { id: 'first_order', icon: '🧾', name: 'First Order', description: 'Create your first order.', condition: p => (p.actions.ordersCreated || 0) >= 1 },
    { id: 'order_sprinter', icon: '🏃', name: 'Order Sprinter', description: 'Create 10 orders.', condition: p => (p.actions.ordersCreated || 0) >= 10 },
    { id: 'order_captain', icon: '🧭', name: 'Order Captain', description: 'Create 50 orders.', condition: p => (p.actions.ordersCreated || 0) >= 50 },
    { id: 'order_legend', icon: '🏆', name: 'Order Legend', description: 'Create 250 orders.', condition: p => (p.actions.ordersCreated || 0) >= 250 },
    { id: 'first_invoice', icon: '📄', name: 'Invoice Rookie', description: 'Generate your first invoice.', condition: p => (p.actions.invoicesCreated || 0) >= 1 },
    { id: 'invoice_builder', icon: '🏗️', name: 'Invoice Builder', description: 'Generate 25 invoices.', condition: p => (p.actions.invoicesCreated || 0) >= 25 },
    { id: 'invoice_machine', icon: '⚙️', name: 'Invoice Machine', description: 'Generate 100 invoices.', condition: p => (p.actions.invoicesCreated || 0) >= 100 },
    { id: 'print_starter', icon: '🖨️', name: 'Print Starter', description: 'Mark your first invoice as printed.', condition: p => (p.actions.invoicesPrinted || 0) >= 1 },
    { id: 'print_master', icon: '🎯', name: 'Print Master', description: 'Mark 50 invoices as printed.', condition: p => (p.actions.invoicesPrinted || 0) >= 50 },
    { id: 'fulfillment_first', icon: '📦', name: 'First Fulfillment', description: 'Mark your first order fulfilled.', condition: p => (p.actions.ordersFulfilled || 0) >= 1 },
    { id: 'fulfillment_flow', icon: '🚚', name: 'Fulfillment Flow', description: 'Mark 40 orders fulfilled.', condition: p => (p.actions.ordersFulfilled || 0) >= 40 },
    { id: 'payment_first', icon: '💵', name: 'Payment Posted', description: 'Mark your first order paid.', condition: p => (p.actions.ordersPaid || 0) >= 1 },
    { id: 'cash_collector', icon: '💰', name: 'Cash Collector', description: 'Mark 40 orders paid.', condition: p => (p.actions.ordersPaid || 0) >= 40 },
    { id: 'customer_first', icon: '🤝', name: 'New Friend', description: 'Create your first customer.', condition: p => (p.actions.customersCreated || 0) >= 1 },
    { id: 'customer_network', icon: '🌐', name: 'Customer Network', description: 'Create 25 customers.', condition: p => (p.actions.customersCreated || 0) >= 25 },
    { id: 'archive_helper', icon: '🗃️', name: 'Archive Helper', description: 'Archive your first order.', condition: p => (p.actions.ordersArchived || 0) >= 1 },
    { id: 'cleanup_crew', icon: '🧹', name: 'Cleanup Crew', description: 'Archive 50 orders.', condition: p => (p.actions.ordersArchived || 0) >= 50 },
    { id: 'xp_100', icon: '⭐', name: 'Rising Star', description: 'Earn 100 XP.', condition: p => (p.xp || 0) >= 100 },
    { id: 'xp_500', icon: '🌟', name: 'Bright Star', description: 'Earn 500 XP.', condition: p => (p.xp || 0) >= 500 },
    { id: 'xp_1000', icon: '💫', name: 'Bakery Champion', description: 'Earn 1,000 XP.', condition: p => (p.xp || 0) >= 1000 }
];

const XP_BY_ACTION = {
    ordersCreated: 10,
    invoicesCreated: 20,
    invoicesPrinted: 15,
    ordersFulfilled: 12,
    ordersPaid: 15,
    customersCreated: 10,
    ordersArchived: 4,
    profileUpdated: 5
};

function getPeriodKeys(date = new Date()) {
    const localDate = new Date(date);
    const yearValue = localDate.getFullYear();
    const monthValue = String(localDate.getMonth() + 1).padStart(2, '0');
    const dayValue = String(localDate.getDate()).padStart(2, '0');
    const day = `${yearValue}-${monthValue}-${dayValue}`;
    const month = day.slice(0, 7);
    const year = String(yearValue);
    const firstThursday = new Date(localDate);
    firstThursday.setHours(0, 0, 0, 0);
    firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
    const weekYear = firstThursday.getFullYear();
    const firstWeekThursday = new Date(weekYear, 0, 4);
    firstWeekThursday.setDate(firstWeekThursday.getDate() + 3 - ((firstWeekThursday.getDay() + 6) % 7));
    const week = 1 + Math.round((firstThursday - firstWeekThursday) / 604800000);

    return {
        day,
        week: `${weekYear}-W${String(week).padStart(2, '0')}`,
        month,
        year
    };
}

function incrementPeriodActions(current = {}, action, quantity) {
    const keys = getPeriodKeys();
    const next = {
        day: { ...(current.day || {}) },
        week: { ...(current.week || {}) },
        month: { ...(current.month || {}) },
        year: { ...(current.year || {}) }
    };

    Object.entries(keys).forEach(([period, key]) => {
        const bucket = { ...(next[period][key] || {}) };
        bucket[action] = (bucket[action] || 0) + quantity;
        next[period][key] = bucket;
    });

    return next;
}

const emptyProfile = user => ({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email || 'Team Member',
    photoDataUrl: '',
    xp: 0,
    actions: {},
    periodActions: {},
    badges: [],
    createdAt: new Date(),
    updatedAt: new Date()
});

function buildRewardProfile(current, action, quantity) {
    var actions = Object.assign({}, current.actions || {});
    actions[action] = (Number(actions[action]) || 0) + quantity;
    var xp = (Number(current.xp) || 0) + XP_BY_ACTION[action] * quantity;
    var candidate = Object.assign({}, current, { actions: actions, xp: xp });
    var currentBadges = current.badges || [];
    var unlocked = BADGES.filter(function(badge) { return currentBadges.indexOf(badge.id) === -1 && badge.condition(candidate); });
    return { unlocked: unlocked, profile: Object.assign({}, current, {
        actions: actions, xp: xp, periodActions: incrementPeriodActions(current.periodActions, action, quantity),
        badges: currentBadges.concat(unlocked.map(function(badge) { return badge.id; })), updatedAt: serverTimestamp()
    }) };
}

export const gamificationService = {
    getBadgeDefinitions() {
        return BADGES;
    },

    async getProfile() {
        const user = auth.currentUser;
        if (!user) return null;

        const ref = doc(db, COLLECTION, user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            return { ...emptyProfile(user), ...snap.data(), uid: user.uid };
        }

        const profile = emptyProfile(user);
        await setDoc(ref, { ...profile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
        return profile;
    },

    async updateProfile(updates) {
        const user = auth.currentUser;
        if (!user) return null;

        const current = await this.getProfile();
        const next = {
            ...current,
            ...updates,
            updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, COLLECTION, user.uid), next, { merge: true });
        return next;
    },

    async awardWorkflowAction(action, entityId) {
        var user = auth.currentUser;
        if (!user) throw new Error('Sign in before recording a reward.');
        if (['ordersCreated', 'invoicesCreated', 'invoicesPrinted'].indexOf(action) === -1) throw new Error('Unknown invoice workflow reward.');
        var entityType = action === 'ordersCreated' ? 'orders' : 'invoices';
        var entityRef = doc(db, entityType, entityId);
        var receiptRef = doc(db, 'workflow_rewards', action + '-' + entityId);
        var profileRef = doc(db, COLLECTION, user.uid);
        var result = await runTransaction(db, async function(transaction) {
            var receipt = await transaction.get(receiptRef);
            if (receipt.exists()) return { unlocked: [], alreadyProcessed: true };
            var entity = await transaction.get(entityRef);
            var profile = await transaction.get(profileRef);
            if (!entity.exists()) throw new Error('Waiting for the saved record before awarding progress.');
            var record = entity.data();
            if (action === 'invoicesPrinted' && record.isPrinted !== true) throw new Error('Waiting for confirmed printing.');
            if (action === 'ordersCreated' && record.createdBy !== user.uid) throw new Error('This order was created by another staff member.');
            var current = Object.assign({}, emptyProfile(user), profile.exists() ? profile.data() : {});
            var next = buildRewardProfile(current, action, 1);
            transaction.set(profileRef, next.profile, { merge: true });
            transaction.set(receiptRef, { actorId: user.uid, action: action, entityId: entityId, createdAt: serverTimestamp() });
            return next;
        });
        result.unlocked.forEach(function(badge) { gamificationService.celebrateBadge(badge); });
        return result;
    },

    async awardAction(action, quantity = 1) {
        var user = auth.currentUser;
        if (!user || !XP_BY_ACTION[action]) return null;
        try {
            var profileRef = doc(db, COLLECTION, user.uid);
            var result = await runTransaction(db, async function(transaction) {
                var snapshot = await transaction.get(profileRef);
                var current = Object.assign({}, emptyProfile(user), snapshot.exists() ? snapshot.data() : {});
                var next = buildRewardProfile(current, action, quantity);
                transaction.set(profileRef, next.profile, { merge: true });
                return next;
            });
            result.unlocked.forEach(function(badge) { gamificationService.celebrateBadge(badge); });
            return result;
        } catch (error) { console.warn('Could not award XP:', error); return null; }
    },

    celebrateBadge(badge) {
        var preferences = workflowLocalStore.preference();
        if (!preferences.fun) return;
        if (preferences.sound) this.playBadgeSound();
        if (preferences.motion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.launchConfetti();
        this.showBadgeToast(badge);
    },

    playBadgeSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            const notes = [523.25, 659.25, 783.99, 1046.5];

            notes.forEach((freq, index) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = index === notes.length - 1 ? 'triangle' : 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.08);
                gain.gain.setValueAtTime(0.001, ctx.currentTime + index * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + index * 0.08 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.08 + 0.35);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + index * 0.08);
                osc.stop(ctx.currentTime + index * 0.08 + 0.4);
            });
        } catch (error) {
            console.warn("Badge sound unavailable:", error);
        }
    },

    launchConfetti() {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 999998;';
        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();

        const colors = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#f97316', '#84cc16'];
        const pieces = Array.from({ length: 140 }, () => ({
            x: Math.random() * canvas.width,
            y: -20 - Math.random() * canvas.height * 0.4,
            size: 6 + Math.random() * 8,
            color: colors[Math.floor(Math.random() * colors.length)],
            speed: 2 + Math.random() * 5,
            rotation: Math.random() * Math.PI,
            spin: -0.2 + Math.random() * 0.4
        }));

        let frame = 0;
        const animate = () => {
            frame += 1;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            pieces.forEach(piece => {
                piece.y += piece.speed;
                piece.x += Math.sin(frame / 12 + piece.y / 40) * 1.8;
                piece.rotation += piece.spin;
                ctx.save();
                ctx.translate(piece.x, piece.y);
                ctx.rotate(piece.rotation);
                ctx.fillStyle = piece.color;
                ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.55);
                ctx.restore();
            });

            if (frame < 180) {
                requestAnimationFrame(animate);
            } else {
                canvas.remove();
            }
        };

        animate();
    },

    showBadgeToast(badge) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            left: 50%;
            top: 24px;
            transform: translateX(-50%);
            z-index: 999999;
            width: min(420px, calc(100vw - 32px));
            background: linear-gradient(135deg, #1e3318, #0f766e);
            color: white;
            border-radius: 20px;
            padding: 18px;
            box-shadow: 0 24px 80px rgba(15, 23, 42, 0.35);
            display: flex;
            align-items: center;
            gap: 14px;
            animation: badge-pop 0.5s ease both;
        `;

        toast.innerHTML = `
            <style>
                @keyframes badge-pop {
                    from { opacity: 0; transform: translate(-50%, -18px) scale(0.94); }
                    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
                }
            </style>
            <div style="width: 62px; height: 62px; border-radius: 18px; background: rgba(255,255,255,0.16); display: flex; align-items: center; justify-content: center; font-size: 34px; flex-shrink: 0;">
                ${badge.icon}
            </div>
            <div>
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; opacity: 0.75; font-weight: 800;">Badge Unlocked</div>
                <div style="font-size: 20px; font-weight: 900; margin-top: 2px;">${badge.name}</div>
                <div style="font-size: 13px; opacity: 0.86; margin-top: 4px;">${badge.description}</div>
            </div>
        `;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5200);
    }
};
