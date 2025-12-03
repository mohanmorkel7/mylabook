import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App";
import "./global.css";
import { initializeResizeObserverErrorHandler } from "./utils/resizeObserverHandler";

// Initialize global ResizeObserver error handling
initializeResizeObserverErrorHandler();

// Wrap WebSocket to avoid noisy connection refused errors in environments
// where dev HMR or debug websockets attempt to connect to localhost (e.g., remote preview).
(function preserveSafeWebSocket() {
  try {
    if (typeof window === "undefined") return;
    const NativeWS = (window as any).WebSocket;
    if (!NativeWS) return;

    class SafeWebSocket {
      private _ws: any = null;
      public onopen: ((ev: Event) => any) | null = null;
      public onmessage: ((ev: MessageEvent) => any) | null = null;
      public onclose: ((ev: CloseEvent) => any) | null = null;
      public onerror: ((ev: Event) => any) | null = null;
      public readyState: number = 3; // CLOSED by default
      public url: string;

      constructor(url: string, protocols?: string | string[]) {
        this.url = url;
        try {
          this._ws = protocols
            ? new NativeWS(url, protocols as any)
            : new NativeWS(url);
          this.readyState = this._ws.readyState;

          // Proxy events
          this._ws.onopen = (e: any) => {
            this.readyState = this._ws.readyState;
            this.onopen && this.onopen(e);
          };
          this._ws.onmessage = (e: any) => {
            this.onmessage && this.onmessage(e);
          };
          this._ws.onclose = (e: any) => {
            this.readyState = this._ws.readyState;
            this.onclose && this.onclose(e);
          };
          this._ws.onerror = (e: any) => {
            // Suppress noisy connection-refused errors but forward to handler if present
            try {
              if (
                e &&
                e.message &&
                String(e.message).includes("connection refused")
              ) {
                // swallow
                if ((window as any).__APP_DEBUG)
                  console.warn("SafeWebSocket: connection refused for", url);
                // call onerror if set
                this.onerror && this.onerror(e);
                return;
              }
            } catch (inner) {
              // ignore
            }
            this.onerror && this.onerror(e);
          };
        } catch (err) {
          // Failed to construct native WebSocket (e.g., connection refused immediately)
          this._ws = null;
          this.readyState = 3; // CLOSED
          if ((window as any).__APP_DEBUG)
            console.warn("SafeWebSocket init failed:", err);
          // Optionally schedule synthetic onerror/onclose callbacks
          setTimeout(() => {
            const ev = new Event("error");
            this.onerror && this.onerror(ev);
            const cev = new CloseEvent("close");
            this.onclose && this.onclose(cev);
          }, 0);
        }
      }

      send(data: any) {
        try {
          this._ws && this._ws.send(data);
        } catch (e) {
          if ((window as any).__APP_DEBUG)
            console.warn("SafeWebSocket send failed", e);
        }
      }
      close(code?: number, reason?: string) {
        try {
          this._ws && this._ws.close(code, reason);
        } catch (e) {
          if ((window as any).__APP_DEBUG)
            console.warn("SafeWebSocket close failed", e);
        }
        this.readyState = 3;
      }
      addEventListener(name: string, cb: any) {
        try {
          if (this._ws && this._ws.addEventListener)
            return this._ws.addEventListener(name, cb);
        } catch (e) {}
        // allow attaching to local handlers
        (this as any)["on" + name] = cb;
      }
      removeEventListener(name: string, cb: any) {
        try {
          if (this._ws && this._ws.removeEventListener)
            return this._ws.removeEventListener(name, cb);
        } catch (e) {}
        if ((this as any)["on" + name] === cb)
          (this as any)["on" + name] = null;
      }
    }

    // Preserve original under __nativeWebSocket for debugging
    (window as any).__nativeWebSocket = NativeWS;
    (window as any).WebSocket = SafeWebSocket as any;
    if ((window as any).__APP_DEBUG)
      console.log(
        "SafeWebSocket installed to suppress noisy connection errors",
      );
  } catch (e) {
    // ignore
  }
})();

// Ensure Error objects never display as [object Object]
// Check if we've already applied our custom toString
if (!Error.prototype.toString.toString().includes("this.message")) {
  Error.prototype.toString = function () {
    return this.message || this.name || "Unknown error";
  };
}

// Comprehensive warning suppression for defaultProps from third-party libraries
const originalWarn = console.warn;
const originalError = console.error;

console.warn = (...args) => {
  // Convert all arguments to strings and check for patterns
  const fullMessage = args.map((arg) => String(arg)).join(" ");

  // Check for various defaultProps warning patterns
  if (
    fullMessage.includes("Support for defaultProps will be removed") ||
    fullMessage.includes("defaultProps will be removed") ||
    fullMessage.includes("Use JavaScript default parameters instead") ||
    (fullMessage.includes("XAxis") && fullMessage.includes("defaultProps")) ||
    (fullMessage.includes("YAxis") && fullMessage.includes("defaultProps")) ||
    fullMessage.includes("XAxis2") ||
    fullMessage.includes("YAxis2") ||
    // Pattern for React's formatted warnings with %s
    (fullMessage.includes("Warning:") && fullMessage.includes("XAxis")) ||
    (fullMessage.includes("Warning:") && fullMessage.includes("YAxis"))
  ) {
    return; // Suppress these warnings
  }
  originalWarn.apply(console, args);
};

console.error = (...args) => {
  // Create a string representation for filtering, but preserve original args for logging
  const fullMessage = args
    .map((arg) =>
      typeof arg === "string"
        ? arg
        : typeof arg === "object" && arg !== null
          ? JSON.stringify(arg)
          : String(arg),
    )
    .join(" ");

  // Also suppress from console.error in case React uses that
  if (
    fullMessage.includes("Support for defaultProps will be removed") ||
    fullMessage.includes("Use JavaScript default parameters instead") ||
    fullMessage.includes("XAxis2") ||
    fullMessage.includes("YAxis2")
  ) {
    return;
  }

  // Pass original args to preserve object details in console
  originalError.apply(console, args);
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Failed to find the root element");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
