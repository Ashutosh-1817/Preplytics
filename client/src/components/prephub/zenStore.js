import { useSyncExternalStore } from 'react';

let zen = false;
const subs = new Set();

export const setZen = (v) => {
  if (v === zen) return;
  zen = v;
  subs.forEach((f) => f());
};

export const useZen = () =>
  [useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => zen), setZen];