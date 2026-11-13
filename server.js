
// MUSIC WORLD · servidor sin dependencias (funciona con Node 14 o superior).
// Sirve index.html, reenvía /api/* a Deezer y permite diagnosticar la conexión.

const http = require("http"), https = require("https"), fs = require("fs"), path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const BASE = process.env.DEEZER_BASE || "https://api.deezer.com";
const cache = new Map(), TTL = 5 * 60 * 1000;

function deezer(p) {
  return new Promise((ok, fail) => {
    const hit = cache.get(p);
    if (hit && Date.now() - hit.t < TTL) return ok(hit);

    const u = new URL(BASE + p);
    const lib = u.protocol === "http:" ? http : https;

    const rq = lib.get(u, {
      headers: {
        "User-Agent": "MusicWorld/1.0",
        Accept: "application/json"
      },
      timeout: 10000
    }, (r) => {
      const chunks = [];

      r.on("data", (c) => chunks.push(c));

      r.on("end", () => {
        const o = {
          t: Date.now(),
          status: r.statusCode,
          body: Buffer.concat(chunks)
        };

        if (
          o.status === 200 &&
          !/^\s*\{\s*"error"/.test(o.body.toString("utf8", 0, 60))
        ) {
          cache.set(p, o);
        }

        ok(o);
      });
    });

    rq.on("timeout", () =>
      rq.destroy(new Error("Tiempo de espera agotado al contactar con Deezer"))
    );

    rq.on("error", (e) =>
      fail(new Error(e.code ? e.code + ": " + e.message : e.message))
    );
  });
}

const json = (res, code, obj) => {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  const { pathname, search } = new URL(req.url, "http://localhost");

  try {
    if (pathname === "/health") {
      try {
        const r = await deezer("/chart/0/tracks?limit=1");
        const txt = r.body.toString("utf8", 0, 160);
        const ok = r.status === 200 && !/^\s*\{\s*"error"/.test(txt);

        return json(res, 200, {
          ok,
          detail: ok ? "" : "Deezer respondió " + r.status + " " + txt
        });
      } catch (e) {
        return json(res, 200, { ok: false, detail: e.message });
      }
    }

    if (pathname.startsWith("/api/")) {
      const r = await deezer(pathname.slice(4) + search);

      res.writeHead(r.status, {
        "Content-Type": "application/json; charset=utf-8"
      });

      return res.end(r.body);
    }

    if (pathname === "/" || pathname === "/index.html") {
      return fs.readFile(
        path.join(__dirname, "index.html"),
        (err, data) => {
          if (err) {
            return json(res, 500, {
              error: {
                message: "No se encontró index.html junto a server.js"
              }
            });
          }

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache"
          });

          res.end(data);
        }
      );
    }

    if (pathname === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }

    res.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("No encontrado");

  } catch (e) {
    json(res, 502, { error: { message: e.message } });
  }
});

server.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? `El puerto ${PORT} ya está en uso.`
      : e.message
  );
  process.exit(1);
});

// IMPORTANTE: esta dirección permite que Render reciba conexiones.
server.listen(PORT, "0.0.0.0", () => {
  console.log("MUSIC WORLD funcionando.");
  console.log("Puerto: " + PORT);
});
