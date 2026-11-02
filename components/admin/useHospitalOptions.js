'use client';

import { useEffect, useState } from 'react';

// Hospitals for a dropdown ({ id, name, status, city }) from the light /api/admin/hospital-options
// list, which has no 100-row cap. Pages that create records filter on `status` themselves (QR codes
// need an Active or Onboarding hospital, staff accounts any hospital that is not offboarded).
export default function useHospitalOptions() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let live = true;
    fetch('/api/admin/hospital-options', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => { if (live) setItems(data.items || []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return items;
}
