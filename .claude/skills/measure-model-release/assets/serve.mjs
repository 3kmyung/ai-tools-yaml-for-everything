import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wav": "audio/wav",
};

export function serve(root, port) {
  const server = createServer(async (request, response) => {
    const requested = new URL(request.url, "http://localhost").pathname;
    const relative = normalize(requested === "/" ? "/index.html" : requested).replace(/^[\\/]+/, "");
    const absolute = join(root, relative);

    try {
      const body = await readFile(absolute);

      response.writeHead(200, { "content-type": TYPES[extname(absolute)] || "application/octet-stream" });
      response.end(body);
    } catch (missing) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    }
  });

  return new Promise((resolve, reject) => {
    function onListenError(error) {
      reject(new Error("could not listen on port " + port + ": " + error.message));
    }

    server.on("error", onListenError);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", onListenError);
      resolve(server);
    });
  });
}
