import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";

// Mock googleapis before importing the app
vi.mock("googleapis", () => {
  type Store = {
    shortCodes: string[];
    urlByShortCode: Map<string, string>;
    countByShortCode: Map<string, number>;
  };

  const store: Store = {
    shortCodes: [],
    urlByShortCode: new Map<string, string>(),
    countByShortCode: new Map<string, number>(),
  };

  const valuesApi = {
    get: vi.fn(async ({ range }: any) => {
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
    append: vi.fn(async ({ requestBody }: any) => {
      const [id, url, shortCode, createdAt, updatedAt, count] = requestBody.values[0];
      store.shortCodes.push(shortCode);
      store.urlByShortCode.set(shortCode, url);
      store.countByShortCode.set(shortCode, count ?? 0);
      return {};
    }),
    update: vi.fn(async ({ range, requestBody }: any) => {
      const urlMatch = /^Sheet1!B(\d+)$/.exec(range);
      if (urlMatch) {
        const idx = Number(urlMatch[1]) - 1;
        const sc = store.shortCodes[idx];
        const newUrl = requestBody.values[0][0];
        if (sc) {
          store.urlByShortCode.set(sc, newUrl);
        }
        return {};
      }
      const countMatch = /^Sheet1!F(\d+)$/.exec(range);
      if (countMatch) {
        const idx = Number(countMatch[1]) - 1;
        const sc = store.shortCodes[idx];
        const newCount = requestBody.values[0][0];
        if (sc) {
          store.countByShortCode.set(sc, newCount);
        }
        return {};
      }
      return {};
    }),
    clear: vi.fn(async ({ range }: any) => {
      const m = /^Sheet1!A(\d+):[A-Z]+(\d+)$/.exec(range);
      const idx = m ? Number(m[1]) - 1 : undefined;
      if (idx !== undefined) {
        const sc = store.shortCodes[idx];
        if (sc) {
          store.shortCodes.splice(idx, 1);
          store.urlByShortCode.delete(sc);
          store.countByShortCode.delete(sc);
        }
      }
      return {};
    }),
  };

  const sheet = { spreadsheets: { values: valuesApi } };

  return {
    google: {
      auth: { GoogleAuth: vi.fn() },
      sheets: vi.fn(() => sheet),
    },
    __mockStore: store,
    __mockValuesApi: valuesApi,
  };
});

let app: any;
let mockStore: any;

beforeAll(async () => {
  const mod = await import("googleapis");
  mockStore = (mod as any).__mockStore;
  const appModule = await import("../api/app");
  app = appModule.default;
});

beforeEach(() => {
  mockStore.shortCodes.length = 0;
  mockStore.urlByShortCode.clear();
  mockStore.countByShortCode.clear();
});

describe("Shortin API", () => {
  it("GET / returns welcome message", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("Welcome to the URL Shortener API!");
  });

  it("POST /shorten without url returns 400", async () => {
    const res = await request(app).post("/shorten").send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "URL is required" });
  });

  it("POST /shorten with duplicate shortCodeInput returns 400", async () => {
    mockStore.shortCodes.push("taken1");

    const res = await request(app)
      .post("/shorten")
      .send({ url: "https://example.com", shortCodeInput: "taken1" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Short code already in use" });
  });

  it("POST /shorten creates new short url", async () => {
    const res = await request(app)
      .post("/shorten")
      .send({ url: "https://example.com/created" });

    expect(res.status).toBe(201);
    expect(res.body.url).toBe("https://example.com/created");
    expect(typeof res.body.shortCode).toBe("string");
    expect(res.body.shortCode.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /:shortCode returns 404 when not found", async () => {
    const res = await request(app).get("/unknown123");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Short code not found" });
  });

  it("GET /:shortCode returns url and increments count", async () => {
    mockStore.shortCodes.push("abc123");
    mockStore.urlByShortCode.set("abc123", "https://example.com/a");
    mockStore.countByShortCode.set("abc123", 0);

    const res = await request(app).get("/abc123");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "https://example.com/a" });

    const stats = await request(app).get("/shorten/abc123/stats");
    expect(stats.status).toBe(200);
    expect(stats.body).toEqual({ count: 1 });
  });

  it("PUT /shorten/:shortCodeInput updates url", async () => {
    mockStore.shortCodes.push("abc123");
    mockStore.urlByShortCode.set("abc123", "https://example.com/old");
    mockStore.countByShortCode.set("abc123", 0);

    const res = await request(app)
      .put("/shorten/abc123")
      .send({ url: "https://example.com/new" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Short code updated successfully" });

    const getRes = await request(app).get("/abc123");
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual({ url: "https://example.com/new" });
  });

  it("DELETE /shorten/:shortCodeInput deletes entry", async () => {
    mockStore.shortCodes.push("toDel1");
    mockStore.urlByShortCode.set("toDel1", "https://example.com/del");
    mockStore.countByShortCode.set("toDel1", 0);

    const del = await request(app).delete("/shorten/toDel1");
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ message: "Short code deleted successfully" });

    const after = await request(app).get("/toDel1");
    expect(after.status).toBe(404);
  });
});
