import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// One-shot SDK reads do not expose cancellation. A temporary listener lets us
// stop its network work when our deadline expires instead of leaving it queued.
export function readServerSnapshot(reference, timeoutMs, createTimeoutError) {
    return new Promise(function(resolve, reject) {
        var unsubscribe = null;
        var settled = false;
        var timer = setTimeout(function() {
            finish(createTimeoutError());
        }, timeoutMs);

        function finish(error, snapshot) {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            if (unsubscribe) {
                unsubscribe();
            }
            if (error) {
                reject(error);
            } else {
                resolve(snapshot);
            }
        }

        try {
            unsubscribe = onSnapshot(reference, { includeMetadataChanges: true }, function(snapshot) {
                // Empty memory-cache results are not proof that cloud data is empty.
                if (snapshot.metadata && snapshot.metadata.fromCache === false) {
                    finish(null, snapshot);
                }
            }, function(error) {
                finish(error);
            });
            if (settled && unsubscribe) {
                unsubscribe();
            }
        } catch (error) {
            finish(error);
        }
    });
}
