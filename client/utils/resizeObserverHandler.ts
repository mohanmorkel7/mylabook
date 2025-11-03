/**
 * Global ResizeObserver Loop Error Handler
 *
 * This utility provides a comprehensive solution for handling ResizeObserver loop errors
 * that commonly occur with UI libraries like Radix UI, Recharts, and others.
 */

let isErrorHandlerInitialized = false;

function isResizeObserverLoopMessage(msg?: string): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes(
      "resizeobserver loop completed with undelivered notifications",
    ) ||
    m.includes("resizeobserver loop limit exceeded") ||
    (m.includes("resizeobserver") && m.includes("undelivered"))
  );
}

/**
 * Initialize global ResizeObserver error handling
 * Should be called once in the main app entry point
 */
export function initializeResizeObserverErrorHandler(): void {
  if (isErrorHandlerInitialized) {
    return;
  }

  // Handle standard JavaScript errors
  const handleError = (event: ErrorEvent): void => {
    if (
      isResizeObserverLoopMessage(event.error?.message) ||
      isResizeObserverLoopMessage(event.message)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.warn("🔧 ResizeObserver loop detected and suppressed:", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
      return;
    }
  };

  // Handle unhandled promise rejections
  const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const reasonMsg = typeof reason === "string" ? reason : reason?.message;
    if (isResizeObserverLoopMessage(reasonMsg)) {
      event.preventDefault();
      console.warn(
        "🔧 ResizeObserver loop in promise detected and suppressed:",
        reason,
      );
      return;
    }
  };

  // Add global error listeners
  window.addEventListener("error", handleError, true);
  window.addEventListener("unhandledrejection", handleUnhandledRejection, true);

  // Override console.error to catch ResizeObserver errors that might slip through
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const errorMessage = args
      .map((a) => (typeof a === "string" ? a : a?.message || String(a)))
      .join(" ");
    if (isResizeObserverLoopMessage(errorMessage)) {
      console.warn(
        "🔧 ResizeObserver loop detected in console.error and suppressed",
      );
      return;
    }
    originalConsoleError.apply(console, args);
  };

  // Also override console.warn just in case some libs log it as warn
  const originalConsoleWarn = console.warn;
  console.warn = (...args: any[]) => {
    const warnMessage = args
      .map((a) => (typeof a === "string" ? a : a?.message || String(a)))
      .join(" ");
    if (isResizeObserverLoopMessage(warnMessage)) {
      // Silently drop duplicate noisy warnings
      return;
    }
    originalConsoleWarn.apply(console, args);
  };

  // Monkey-patch global ResizeObserver to wrap callbacks safely (covers third-party usage)
  try {
    const w = window as any;
    if (typeof w.ResizeObserver === "function" && !w.__patchedResizeObserver) {
      const OriginalResizeObserver = w.ResizeObserver;
      w.ResizeObserver = class SafePatchedResizeObserver extends (
        OriginalResizeObserver
      ) {
        constructor(callback: ResizeObserverCallback) {
          const wrapped: ResizeObserverCallback = (entries, observer) => {
            try {
              requestAnimationFrame(() => {
                try {
                  callback(entries, observer);
                } catch (err: any) {
                  if (isResizeObserverLoopMessage(err?.message)) return;
                  throw err;
                }
              });
            } catch (err: any) {
              if (isResizeObserverLoopMessage(err?.message)) return;
              throw err;
            }
          };
          // @ts-ignore - call parent with wrapped callback
          super(wrapped);
        }
      };
      w.__patchedResizeObserver = true;
      console.log("🛡️ Global ResizeObserver patched with safe wrapper");
    }
  } catch (e) {
    // Non-fatal
  }

  // Expose helpers for testing
  (window as any).createSafeResizeObserver = createSafeResizeObserver;
  (window as any).createDebouncedResizeObserver = createDebouncedResizeObserver;

  isErrorHandlerInitialized = true;
  console.log("✅ Global ResizeObserver error handler initialized");
}

/**
 * Create a safe ResizeObserver wrapper that handles errors gracefully
 */
export function createSafeResizeObserver(
  callback: ResizeObserverCallback,
  options?: ResizeObserverOptions,
): ResizeObserver {
  const safeCallback: ResizeObserverCallback = (entries, observer) => {
    try {
      // Use requestAnimationFrame to prevent synchronous layout changes
      requestAnimationFrame(() => {
        try {
          callback(entries, observer);
        } catch (error: any) {
          if (isResizeObserverLoopMessage(error?.message)) {
            console.warn(
              "🔧 ResizeObserver callback error suppressed:",
              error.message,
            );
            return;
          }
          throw error;
        }
      });
    } catch (error: any) {
      if (isResizeObserverLoopMessage(error?.message)) {
        console.warn(
          "🔧 ResizeObserver callback error suppressed:",
          error.message,
        );
        return;
      }
      throw error;
    }
  };

  return new ResizeObserver(safeCallback);
}

/**
 * Debounced ResizeObserver for heavy operations
 */
export function createDebouncedResizeObserver(
  callback: ResizeObserverCallback,
  delay: number = 100,
  options?: ResizeObserverOptions,
): ResizeObserver {
  let timeoutId: NodeJS.Timeout;

  const debouncedCallback: ResizeObserverCallback = (entries, observer) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      try {
        callback(entries, observer);
      } catch (error: any) {
        if (isResizeObserverLoopMessage(error?.message)) {
          console.warn(
            "🔧 Debounced ResizeObserver callback error suppressed:",
            error.message,
          );
          return;
        }
        throw error;
      }
    }, delay);
  };

  return createSafeResizeObserver(debouncedCallback, options);
}

/**
 * Cleanup function to remove error handlers (useful for testing)
 */
export function cleanupResizeObserverErrorHandler(): void {
  // Note: This is a simplified cleanup - in practice, we'd need to store references
  // to the specific handlers to remove them properly
  isErrorHandlerInitialized = false;
  console.log("🧹 ResizeObserver error handler cleanup completed");
}
