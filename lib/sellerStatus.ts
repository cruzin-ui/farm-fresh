// Whether the signed-in person is a seller, as the account menu last found
// out (from /api/account/summary). Shared so other parts of the header can
// use it without asking the server again. False when signed out.
let isSeller = false;
const listeners = new Set<() => void>();

export function setSellerStatus(value: boolean) {
  if (value === isSeller) return;
  isSeller = value;
  listeners.forEach((l) => l());
}

export function subscribeSellerStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getSellerStatus = () => isSeller;
export const getServerSellerStatus = () => false;
