import { getDocFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function readStaffProfileFromServer(reference) {
    // A cold SDK can briefly report offline during its first authenticated stream.
    // Retry transport failures only; never retry or conceal a permission rejection.
    for (var attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await getDocFromServer(reference);
        } catch (error) {
            if (error.code !== 'unavailable' || attempt === 2) throw error;
            await new Promise(function retryDelay(resolve) { setTimeout(resolve, (attempt + 1) * 1000); });
        }
    }
}
