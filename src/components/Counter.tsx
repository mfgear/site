import { useState, type JSX } from 'react';

export function Counter(props: { initial?: number }): JSX.Element {
  const [count, setCount] = useState(props.initial ?? 0);
  return (
    <div className="inline-flex items-center gap-3 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2">
      <button
        className="h-8 w-8 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
        onClick={() => setCount((c) => c - 1)}
        aria-label="decrement"
      >
        −
      </button>
      <span className="tabular-nums min-w-8 text-center">{count}</span>
      <button
        className="h-8 w-8 rounded-md bg-brand text-white hover:bg-brand-600"
        onClick={() => setCount((c) => c + 1)}
        aria-label="increment"
      >
        +
      </button>
    </div>
  );
}

