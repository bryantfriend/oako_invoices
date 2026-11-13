// Transport-independent coordinator. No SDK imports or production connections.
export function createTripleStreams({subscribe, reconcileMissing, publish = () => true,
  status = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout,
  graceMs = 20000, timeoutMs = 15000}) {
  let context = {owner:null, active:false, visible:true};
  let generation = 0, sequence = 0, epoch = 0, publication = 0;
  let streams = null, grace = null, queued = false, latest = null, inFlight = null, rerun = false;
  let previousRows = new Map();
  const waiters = new Set(), listeners = new Set();
  const eligible = () => Boolean(context.owner && context.active && context.visible);
  const ready = () => streams && Object.values(streams).every(slot => slot.ready);
  const failure = (code, message = code) => Object.assign(new Error(message), {code});
  function settle(error, snapshot) {
    for (const waiter of waiters) {
      cancel(waiter.timer);
      if (error) waiter.reject(error); else waiter.resolve(snapshot);
    }
    waiters.clear();
  }
  function stop(reason, error = failure(reason)) {
    generation++; sequence++; epoch++; publication++;
    if (grace !== null) cancel(grace);
    grace = null;
    const old = streams; streams = null; latest = null; previousRows = new Map();
    inFlight = null; rerun = false;
    settle(error);
    if (old) for (const slot of Object.values(old)) slot.unsubscribe?.();
    status({state:'stale', reason});
  }
  function stopWithError(error) {
    stop('listener-error', error);
    status({state:'error', error, retry:'explicit-only'});
  }
  function deliver(snapshot) {
    if (!snapshot.current()) return;
    settle(null, snapshot); // Never wait for the application context/enrichment.
    for (const listener of listeners) {
      try { listener(snapshot); } catch (error) { status({state:'subscriber-error', error}); }
    }
    const ticket = ++publication;
    const guarded = {...snapshot, current:() => snapshot.current() && ticket === publication};
    Promise.resolve().then(() => {
      if (guarded.current()) return publish(guarded.orders, guarded);
      return false;
    }).then(applied => {
      if (applied !== false && guarded.current()) status({state:'live', owner:snapshot.owner,
        orderServerAt:snapshot.orderServerAt, invoiceServerAt:snapshot.invoiceServerAt});
    }).catch(error => { if (guarded.current()) stopWithError(error); });
  }
  function queueSnapshot() {
    if (inFlight) { rerun = true; return; }
    if (queued) return;
    queued = true;
    queueMicrotask(async () => {
      queued = false;
      if (!eligible() || !ready()) return;
      if (inFlight) { rerun = true; return; }
      const job = {}; inFlight = job;
      const g = generation, seq = sequence, e = epoch, owner = context.owner;
      const current = () => g === generation && seq === sequence && e === epoch && eligible() && ready() && owner === context.owner;
      const rows = new Map([...streams.archive.rows, ...streams.orders.rows]);
      const invoiceRows = [...streams.invoices.rows.values()];
      const orderServerAt = Math.min(streams.orders.serverAt, streams.archive.serverAt);
      const invoiceServerAt = streams.invoices.serverAt;
      const missing = [...previousRows.keys()].filter(id => !rows.has(id));
      let cursor = 0;
      try {
        await Promise.all(Array.from({length:Math.min(4, missing.length)}, async () => {
          while (cursor < missing.length && current()) {
            const id = missing[cursor++];
            const row = await reconcileMissing(id, {owner, current});
            if (row !== null && (!row || row.id !== id)) throw failure('invalid-reconciliation');
            if (row) rows.set(id, row);
          }
        }));
        if (!current()) return;
        previousRows = rows;
        latest = {orders:[...rows.values()], invoiceRows, owner, generation:g, sequence:seq,
          orderServerAt, invoiceServerAt, current};
        deliver(latest);
      } catch (error) { if (current()) stopWithError(error); }
      finally {
        if (inFlight === job) {
          inFlight = null;
          if (rerun) { rerun = false; queueSnapshot(); }
        }
      }
    });
  }
  function start() {
    const g = ++generation;
    streams = Object.fromEntries(['orders','archive','invoices'].map(name => [name,{rows:new Map(),ready:false}]));
    status({state:'connecting'});
    for (const name of ['orders','archive','invoices']) {
      if (g !== generation || !streams) break;
      const slot = streams[name];
      try {
        const unsubscribe = subscribe(name, {includeMetadataChanges:true}, snapshot => {
          if (g !== generation || !streams) return;
          sequence++; publication++;
          const metadata = snapshot.metadata ?? snapshot;
          if (metadata.fromCache || metadata.hasPendingWrites) {
            slot.ready = false;
            status({state:'stale', reason:metadata.fromCache?'cache-only':'pending-writes'});
            return;
          }
          // Adapter supplies plain records in QuerySnapshot.docs order. Replacement
          // removes stale initial cache ghosts and preserves ordered invoice context.
          slot.rows = new Map(snapshot.docs.map(row => [row.id,row]));
          slot.ready = true; slot.serverAt = now();
          queueSnapshot();
        }, error => { if (g === generation) stopWithError(error); });
        if (g !== generation) unsubscribe?.(); else slot.unsubscribe = unsubscribe;
      } catch (error) { if (g === generation) stopWithError(error); }
    }
  }
  return {
    setContext(next) {
      const old = context; context = {...context,...next};
      if (old.owner !== context.owner || !context.owner || !context.visible) {
        stop('auth-or-hidden'); return;
      }
      if (old.active !== context.active) { epoch++; publication++; }
      if (!context.active) {
        settle(failure('inactive'));
        if (streams && grace === null) grace = schedule(() => stop('navigation-grace-expired'), graceMs);
      } else {
        if (grace !== null) { cancel(grace); grace = null; }
        if (!old.active) queueSnapshot();
      }
    },
    requestSnapshot(options = {}) {
      if (!eligible()) return Promise.reject(failure('inactive'));
      const deadline = options.timeoutMs ?? timeoutMs;
      if (!Number.isFinite(deadline) || deadline <= 0) return Promise.reject(failure('invalid-timeout'));
      if (latest?.current()) return Promise.resolve(latest);
      const result = new Promise((resolve,reject) => {
        const waiter = {resolve,reject,timer:null};
        waiter.timer = schedule(() => {
          waiters.delete(waiter); reject(failure('snapshot-timeout'));
          // No valid seed and nobody waiting: stop background expensive retry work.
          if (!waiters.size && !latest?.current()) stop('snapshot-timeout');
        }, deadline);
        waiters.add(waiter);
      });
      if (!streams) start(); else queueSnapshot();
      return result;
    },
    getSnapshot() { return latest?.current() ? latest : null; },
    requestPublish() {
      if (!eligible() || !ready()) return false;
      if (latest?.current()) deliver(latest); else queueSnapshot();
      return true;
    },
    subscribeSnapshots(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    reset(reason = 'reset') { stop(reason); },
    dispose() { stop('disposed'); listeners.clear(); },
  };
}
