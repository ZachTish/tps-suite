import { MODULES } from './migration.mjs';

const ids = new Set(MODULES.map(module => module.id));

/**
 * Finite reviewed installation transaction. Ports own storage and Obsidian IO.
 * Journal contains identifiers/fingerprints only, never note bodies or secrets.
 * A failed transaction retains original data and never automatically enables
 * legacy owners. A user can explicitly resume or roll back after review.
 */
export class ReviewedHandoff {
  #ports; #inFlight = false; #stopped = false;
  constructor(ports) { this.#ports = ports; }
  stop() { this.#stopped = true; }
  async apply(review) {
    if (this.#inFlight) throw new Error('A TPS handoff is already running.');
    if (this.#stopped) throw new Error('TPS handoff owner stopped.');
    if (!review || typeof review.token !== 'string' || !review.token || !Array.isArray(review.modules)
      || review.modules.some(id => !ids.has(id)) || !review.modules.includes('notes')) throw new Error('Invalid migration review.');
    this.#inFlight = true;
    const p = this.#ports;
    let activationAttempted = false;
    const assertActive = () => { if (this.#stopped) throw new Error('TPS handoff owner stopped.'); };
    try {
      const existing = await p.readJournal(); assertActive();
      if (existing && (existing.version !== 1 || existing.token !== review.token)) {
        throw new Error('Migration state changed. Review the current handoff before continuing.');
      }
      if (existing && (!['reviewed', 'staged', 'installed', 'committed'].includes(existing.phase)
        || JSON.stringify(existing.modules) !== JSON.stringify([...new Set(review.modules)]))) {
        throw new Error('Invalid migration journal; review is required.');
      }
      if (existing?.phase === 'committed') return { alreadyCommitted: true };
      // Revalidate reviewed source/configuration and implementation readiness.
      await p.validateReview(review, existing); assertActive();
      const journal = existing ?? { version: 1, token: review.token, modules: [...new Set(review.modules)], phase: 'reviewed' };
      if (!existing) await p.writeJournal(journal);
      assertActive();
      // Guard remains installed on failure until explicit rollback/unload.
      await p.claimOwnership(journal.modules); assertActive();
      await p.stopLegacyAndDrain(journal.modules); assertActive();
      await p.verifyLegacyStopped(journal.modules); assertActive();
      if (journal.phase === 'reviewed') {
        // Stopping may flush pending saves, invalidating the original review.
        await p.validateReview(review, journal); assertActive();
        await p.stageAndVerify(review); assertActive();
        journal.phase = 'staged'; await p.writeJournal(journal); assertActive();
      }
      if (journal.phase === 'staged') {
        // Must be idempotent and source-checked at the destination write boundary.
        await p.installAndVerify(review); assertActive();
        journal.phase = 'installed'; await p.writeJournal(journal); assertActive();
      }
      if (journal.phase !== 'installed') throw new Error('Unsupported migration phase.');
      await p.saveDeviceSelection(journal.modules); assertActive();
      activationAttempted = true;
      await p.activate(journal.modules); assertActive();
      journal.phase = 'committed'; await p.writeJournal(journal);
      return { alreadyCommitted: false };
    } catch (error) {
      if (activationAttempted) {
        try { await p.stopSuiteAndDrain(); }
        catch (shutdownError) { throw new AggregateError([error, shutdownError], 'Handoff and suite shutdown failed.'); }
      }
      throw error;
    } finally { this.#inFlight = false; }
  }
}
