'use client';

import { useMemo, useSyncExternalStore } from 'react';

// The signed-in admin's permissions, as the admin layout publishes them on window.GMEDIC.
// Pages use this to hide actions the role can't take (the API still enforces every one).
// The server render has no window, so it starts with none; React swaps in the real list on hydrate.
const NONE = [];
const subscribe = () => () => {};
const read = () => (window.GMEDIC && window.GMEDIC.permissions) || NONE;

export default function usePermissions() {
  const perms = useSyncExternalStore(subscribe, read, () => NONE);
  return useMemo(() => {
    const set = new Set(perms);
    return (...any) => any.some((p) => set.has(p));
  }, [perms]);
}
