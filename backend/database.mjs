// Both adapters expose all() and atomic batch(); SQL and business rules are shared.
export function d1Adapter(binding) {
  return {
    all: async (sql, params = []) => (await binding.prepare(sql).bind(...params).all()).results,
    batch: async commands => binding.batch(commands.map(([sql, params = []]) => binding.prepare(sql).bind(...params)))
  };
}
