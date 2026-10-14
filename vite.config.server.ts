import { defineConfig } from "vite";
import path from "path";

// Server build configuration
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "server/node-build.ts"),
      name: "server",
      fileName: "production",
      formats: ["es"],
    },
    outDir: "dist/server",
    target: "node22",
    ssr: true,
    rollupOptions: {
      // Externalize ALL node_modules — bundling heavy packages like googleapis,
      // natural, fluent-ffmpeg, etc. causes the build to hang indefinitely.
      // The server runs in Node.js where node_modules are available at runtime.
      external: (id) => {
        // Externalize anything that looks like a node_module (not a relative or absolute local path)
        if (id.startsWith(".") || id.startsWith("/") || path.isAbsolute(id)) {
          return false; // local file — bundle it
        }
        // Externalize node built-ins and all npm packages
        return true;
      },
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
      },
    },
    minify: false, // Keep readable for debugging
    sourcemap: false, // Disable sourcemap for faster build
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});
