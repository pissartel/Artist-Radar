// Minimal in-memory stand-in for the Supabase client, covering only the
// query shapes analysisJobStore.ts actually issues against `analysis_jobs`:
// insert().select().single(), select().eq().maybeSingle(), and
// update().eq()[.eq()] awaited directly (no .select()).
export type FakeRow = Record<string, unknown>;

export function createFakeSupabaseClient(rows: FakeRow[] = []) {
  let nextId = rows.length + 1;

  function makeBuilder() {
    let mode: "select" | "insert" | "update" = "select";
    let payload: FakeRow | null = null;
    const filters: { column: string; value: unknown }[] = [];

    function matches(row: FakeRow): boolean {
      return filters.every((filter) => row[filter.column] === filter.value);
    }

    function execute(wantsSingle: boolean) {
      if (mode === "insert") {
        const now = new Date().toISOString();
        const row: FakeRow = {
          id: `job-${nextId++}`,
          created_at: now,
          updated_at: now,
          completed_at: null,
          result_payload: null,
          error: null,
          ...payload,
        };
        rows.push(row);
        return { data: wantsSingle ? row : [row], error: null };
      }

      if (mode === "update") {
        const matched = rows.filter(matches);
        matched.forEach((row) => Object.assign(row, payload));
        return { data: wantsSingle ? (matched[0] ?? null) : matched, error: null };
      }

      const matched = rows.filter(matches);
      return { data: wantsSingle ? (matched[0] ?? null) : matched, error: null };
    }

    const builder = {
      insert(data: FakeRow) {
        mode = "insert";
        payload = data;
        return builder;
      },
      update(data: FakeRow) {
        mode = "update";
        payload = data;
        return builder;
      },
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, value });
        return builder;
      },
      async maybeSingle() {
        return execute(true);
      },
      async single() {
        return execute(true);
      },
      then(onFulfilled: (value: { data: unknown; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(execute(false)).then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  return {
    from() {
      return makeBuilder();
    },
    rows,
  };
}
