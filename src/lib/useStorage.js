import { useEffect, useState } from "react";
import { subscribe } from "./storage";

// Hook that re-renders the component whenever the storage cache changes.
export function useStorageVersion() {
  const [v, setV] = useState(0);
  useEffect(() => subscribe(() => setV(x => x + 1)), []);
  return v;
}
