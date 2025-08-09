import React from 'react';
import type { PropsWithChildren } from 'react';

export default function Button(props: PropsWithChildren<{ onClick?: () => void }>) {
  return (
    <button
      onClick={props.onClick}
      className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

