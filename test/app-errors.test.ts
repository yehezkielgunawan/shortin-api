import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";

// We mock googleapis and allow toggling for failure cases
vi.mock("googleapis", () => {
  const store = {
    throwOnGet: false,
    throwOnAppend: false,
    throwOnUpdate: false,
    shortCodes: ["exists"],
    urlByShortCode: new Map<string, string>([["exists", "https://a.com"]]),
    countByShortCode: new Map<string, number>([["exists", 0]]),
  };

  const valuesApi = {
    get: vi.fn(async ({ range }: any) => {
      if (store.throwOnGet) throw new Error("get-failed");
      if (range === "Sheet1!C:C") {
        return { data: { values: store.shortCodes.map((sc) => [sc]) } };
      }
      const urlMatch = /^Sheet1!B(\d+)$/.exec(range);
      if (urlMatch) {
        const idx = Number(urlMatch[1]) - 1;
        const sc = store.shortCodes[idx];
        const url = sc ? store.urlByShortCode.get(sc) : undefined;
        return { data: { values: url !== undefined ? [[url]] : [] } };
      }
      const countMatch = /^Sheet1!F(\d+)$/.exec(range);
      if (countMatch) {
        const idx = Number(countMatch[1]) - 1;
        const sc = store.shortCodes[idx];
        const count = sc && store.countByShortCode.has(sc) ? store.countByShortCode.get(sc) : 0;
        return { data: { values: [[count ?? 0]] } };
      }
      return { data: { values: [] } };
    }),
    append: vi.fn(async () => {
      if (store.throwOnAppend) throw new Error("append-failed");
      return {};
    }),
    update: vi.fn(async () => {
      if (store.throwOnUpdate) throw new Error("update-failed");
      return {};
    }),
    clear: vi.fn(async () => ({})),
  };

  const sheet = { spreadsheets: { values: valuesApi } };

  return {
    google: {
      auth: { GoogleAuth: vi.fn() },
      sheets: vi.fn(() => sheet),
    },
    __m: store,
  };
});

let app: any;
let m: any;

beforeAll(async () => {
  const appModule = await import("../api/app");
  app = appModule.default;
  m = (await import("googleapis")) as any;
});

beforeEach(() => {
  const store = m.__m;
  store.throwOnAppend = false;
  store.throwOnGet = false;
  store.throwOnUpdate = false;
});

describe("app error branches", () => {
  it("POST /shorten -> 500 when append fails", async () => {
    m.__m.throwOnAppend = true;
    const res = await request(app)
      .post("/shorten")
      .send({ url: "https://x.com" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to create short URL" });
  });

  it("GET /:code -> 500 when get fails", async () => {
    m.__m.throwOnGet = true;
    const res = await request(app).get("/exists");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to retrieve short URL" });
  });

  it("PUT /shorten/:code -> 500 when update fails", async () => {
    m.__m.throwOnUpdate = true;
    const res = await request(app)
      .put("/shorten/exists")
      .send({ url: "https://new.com" });
    expect(res.status).toBe(500);
    // note: app.ts returns error object directly in catch for PUT
    expect(res.body).toHaveProperty("error");
  });
});
