import { db } from "../core/firebase.js";
import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();
const COLLECTION = 'settings';
const DOCUMENT_ID = 'invoice_config';

export const settingsService = {
    async getInvoiceSettings() {
        const docRef = doc(db, COLLECTION, DOCUMENT_ID);
        const snap = await getDoc(docRef);

        const defaults = {
            companyName: 'Kyrgyz Organics',
            address: 'Republic of Kyrgyzstan',
            phone: '+996 700 123 456',
            website: 'kyrgyz-organics.com',
            bankInfo: 'Bank of Kyrgyzstan,\nKyrgyzz Organics Ltd, KG12346712345789901\nAccount To: KG12346712345789901\nSWIFT: KGZBBBBB',
            qrText: 'https://kyrgyz-organics.com/pay',
            defaultTaxRate: 10,
            logoUrl: '',
            footerText: 'Thanks for supporting sustainable agriculture!'
        };

        return snap.exists() ? { ...defaults, ...snap.data() } : defaults;
    },

    async updateInvoiceSettings(data) {
        const docRef = doc(db, COLLECTION, DOCUMENT_ID);
        await setDoc(docRef, { ...data, updatedAt: new Date() }, { merge: true });
        return true;
    },

    async uploadLogo(file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `logo_${Date.now()}.${fileExt}`;
        const storageRef = ref(storage, `brand/${fileName}`);

        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        return url;
    }
};
