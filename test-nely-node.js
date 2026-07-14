import https from "node:https";

const NELY_API_KEY = "dlitro-nely-2026-key";
const APIKEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3eW14am15YXNubG1raXR6dmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTcwNTksImV4cCI6MjA5MzU5MzA1OX0._bVrkREq5NDRiw09_ygILCocmJHHUZhdX_zdKMMN_ow";
const SUCURSAL_ID = "d5b2f695-5273-4b63-8244-6f1491ad053e";
const URL =
  "https://uwymxjmyasnlmkitzvej.supabase.co/functions/v1/recibir-pedido-nely";

function postPedido(body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      URL,
      {
        method: "POST",
        headers: {
          "x-nely-api-key": NELY_API_KEY,
          "Content-Type": "application/json",
          apikey: APIKEY,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            json = { raw: data };
          }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

const base = {
  sucursal_id: SUCURSAL_ID,
  cliente_nombre: "Test Node NELY",
  cliente_telefono: "+56912345678",
  direccion_entrega: "Av. Las Torres 1234",
};

const tests = [
  {
    name: "1) Retiro sin distancia → costo_despacho $0",
    body: {
      ...base,
      cliente_nombre: "Test Node — Retiro",
      tipo: "retiro",
      items: [{ producto_nombre: "Mojito Cubano", cantidad: 1, notas: "" }],
    },
    expect: { costo_despacho: 0 },
  },
  {
    name: "2) Despacho 2.3 km con extras → tarifa + extras",
    body: {
      ...base,
      cliente_nombre: "Test Node — Despacho 2.3km extras",
      tipo: "despacho",
      distancia_km: 2.3,
      items: [
        {
          producto_nombre: "Mojito Cubano",
          cantidad: 1,
          extras: ["Pulpa de mango", "Pulpa de frutilla"],
          notas: "",
        },
      ],
    },
    expect: { costo_despacho: 2000 },
  },
  {
    name: "3) Despacho 8.5 km sin extras → tarifa tramo 7–10.5 km",
    body: {
      ...base,
      cliente_nombre: "Test Node — Despacho 8.5km",
      tipo: "despacho",
      distancia_km: 8.5,
      items: [{ producto_nombre: "Mojito Cubano", cantidad: 1, notas: "" }],
    },
    expect: { costo_despacho: 4000 },
  },
  {
    name: "4) Despacho sin distancia_km → HTTP 400 (distancia obligatoria)",
    body: {
      ...base,
      cliente_nombre: "Test Node — Despacho sin km",
      tipo: "despacho",
      items: [{ producto_nombre: "Mojito Cubano", cantidad: 1, notas: "" }],
    },
    expect: {
      status: 400,
      success: false,
      errorIncludes: "distancia_km",
    },
  },
];

async function run() {
  console.log("=== test-nely-node.js ===\n");

  for (const t of tests) {
    console.log(`--- ${t.name} ---`);
    try {
      const { status, body } = await postPedido(t.body);
      console.log(`HTTP ${status}`);
      console.log(JSON.stringify(body, null, 2));

      if (t.expect.status !== undefined) {
        const statusOk = status === t.expect.status;
        console.log(
          statusOk
            ? `✓ HTTP ${status} (esperado ${t.expect.status})`
            : `✗ HTTP ${status} (esperado ${t.expect.status})`
        );
      }

      if (t.expect.success === false) {
        const successOk = body.success === false;
        console.log(successOk ? "✓ success: false" : `✗ success: ${body.success}`);
      }

      if (t.expect.errorIncludes) {
        const errOk =
          typeof body.error === "string" &&
          body.error.includes(t.expect.errorIncludes);
        console.log(
          errOk
            ? `✓ error contiene "${t.expect.errorIncludes}"`
            : `✗ error: ${JSON.stringify(body.error)}`
        );
      }

      if (body.success && body.costo_despacho !== undefined && t.expect.costo_despacho !== undefined) {
        const ok = body.costo_despacho === t.expect.costo_despacho;
        console.log(
          ok
            ? `✓ costo_despacho = ${body.costo_despacho} (esperado ${t.expect.costo_despacho})`
            : `✗ costo_despacho = ${body.costo_despacho} (esperado ${t.expect.costo_despacho})`
        );
      }
    } catch (err) {
      console.log("ERROR:", err.message);
    }
    console.log("");
  }
}

run();
