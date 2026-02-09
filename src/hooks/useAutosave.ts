import { useEffect, useRef, useCallback } from "react";

/**
 * Hook that auto-saves a value after a debounce period.
 * @param value The current value to watch
 * @param onSave Callback to persist the value
 * @param delay Debounce delay in ms (default 2000)
 * @param enabled Whether autosave is active
 */
export function useAutosave<T>(
  value: T,
  onSave: (value: T) => Promise<void>,
  delay = 2000,
  enabled = true
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef(true);
  const savingRef = useRef(false);
  const latestValue = useRef(value);

  latestValue.current = value;

  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await onSave(latestValue.current);
    } catch (e) {
      console.error("Autosave failed:", e);
    } finally {
      savingRef.current = false;
    }
  }, [onSave]);

  useEffect(() => {
    // Skip the very first render (initial load)
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }

    if (!enabled) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delay, enabled, save]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        // fire final save
        save();
      }
    };
  }, [save]);
}
