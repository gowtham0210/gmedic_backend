'use client';

import { useState } from 'react';

// Page number for a filtered list. It snaps back to page 1 in the same render whenever the filters
// change (filterKey), so a filter change never fetches the old page number first.
export function usePager(filterKey) {
  const [state, setState] = useState({ key: filterKey, page: 1 });
  const page = state.key === filterKey ? state.page : 1;
  const setPage = (next) => setState((s) => {
    const current = s.key === filterKey ? s.page : 1;
    return { key: filterKey, page: Math.max(1, typeof next === 'function' ? next(current) : next) };
  });
  return [page, setPage];
}

// "25 refunds · page 2 of 4   [Previous] [Next]" — the same pager as the Appointments list.
export default function Pager({ total, page, pages, noun, plural, onPage }) {
  const label = total === 1 ? noun : (plural || `${noun}s`);
  return (
    <div className="pager">
      <span>{total} {label}{pages > 1 ? ` · page ${page} of ${pages}` : ''}</span>
      {pages > 1 && (
        <div className="action-group">
          <button type="button" className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
