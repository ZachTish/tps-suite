/** Dependency order is validated before any module factory executes. */
export function orderModules(definitions, enabledIds) {
  const definitionsById = new Map();
  for (const definition of definitions) {
    if (definitionsById.has(definition.id)) throw new Error(`Duplicate module: ${definition.id}`);
    definitionsById.set(definition.id, definition);
  }
  const enabled = new Set(['notes', ...enabledIds]);
  const visiting = new Set(), done = new Set(), result = [];
  function visit(id) {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`Circular module dependency: ${id}`);
    const definition = definitionsById.get(id);
    if (!definition) throw new Error(`Missing module: ${id}`);
    visiting.add(id);
    for (const dependency of definition.requires ?? []) {
      if (!enabled.has(dependency)) throw new Error(`${id} requires enabled module ${dependency}.`);
      visit(dependency);
    }
    visiting.delete(id); done.add(id); result.push(definition);
  }
  for (const id of enabled) visit(id);
  return result;
}

export class ModuleRuntime {
  #instances = []; #stopped = false; #started = false; #controller = new AbortController(); #states = new Map(); #apis = new Map();
  #flight = Promise.resolve(); #drain = null;
  state(id) { return this.#states.get(id) ?? 'disabled'; }
  api(id) { return this.#apis.get(id); }
  start(definitions, enabledIds, context) {
    if (this.#started || this.#stopped) throw new Error('Module runtime cannot be restarted.');
    const ordered = orderModules(definitions, enabledIds);
    this.#started = true;
    this.#flight = this.#start(ordered, context);
    return this.#flight;
  }
  async #start(ordered, context) {
    for (const definition of ordered) {
      if (this.#stopped) break;
      if ((definition.requires ?? []).some(id => this.state(id) !== 'ready')) {
        this.#states.set(definition.id, 'dependency-failed'); continue;
      }
      this.#states.set(definition.id, 'starting');
      let owner;
      try {
        owner = definition.create({ ...context, signal: this.#controller.signal,
          getApi: id => this.#apis.get(id) });
        if (!owner || typeof owner.start !== 'function' || typeof owner.stop !== 'function' || typeof owner.dispose !== 'function') {
          throw new Error(`Invalid lifecycle for ${definition.id}`);
        }
        this.#instances.push({ id: definition.id, owner });
        await owner.start();
        if (this.#stopped) break;
        this.#apis.set(definition.id, owner.api);
        this.#states.set(definition.id, 'ready');
      } catch (error) {
        this.#states.set(definition.id, 'failed');
        if (owner) {
          try { owner.stop(); } catch { /* disposal must still run */ }
          try { await owner.dispose(); } catch { /* report original startup failure */ }
          this.#instances = this.#instances.filter(entry => entry.owner !== owner);
        }
        context.onError?.(definition.id, error);
        if (definition.id === 'notes') { this.#stopped = true; this.#controller.abort(); break; }
      }
    }
  }
  /** @returns {Promise<void>} */
  stop() {
    if (this.#drain) return this.#drain;
    this.#stopped = true; this.#controller.abort(); this.#apis.clear();
    const failures = [];
    // Invalidate every owner synchronously before awaiting even the first disposer.
    for (const { id, owner } of [...this.#instances].reverse()) {
      this.#states.set(id, 'stopping');
      try { owner.stop(); } catch (error) { failures.push(error); }
    }
    this.#drain = this.#flight.catch(error => failures.push(error)).then(async () => {
      for (const { id, owner } of [...this.#instances].reverse()) {
        try { await owner.dispose(); } catch (error) { failures.push(error); }
        this.#states.set(id, 'stopped');
      }
      this.#instances = [];
      if (failures.length) throw new AggregateError(failures, 'Module shutdown failed.');
    });
    return this.#drain;
  }
}
