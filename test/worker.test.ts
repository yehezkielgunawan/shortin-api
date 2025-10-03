import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Mock googleapis for worker handlers
vi.mock("googleapis", () => {
  type Store = {
    shortCodes: string[];
    urlByShortCode: Map<string, string>;
    countByShortCode: Map<string, number>;
    throwOnGet?: boolean;
  };

  const store: Store = {
    shortCodes: [],
    urlByShortCode: new Map<string, string>(),
    countByShortCode: new Map<string, number>(),
    throwOnGet: false,
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
        const count =
          sc && store.countByShortCode.has(sc)
            ? store.countByShortCode.get(sc)
            : 0;
        return { data: { values: [[count ?? 0]] } };
      }
      return { data: { values: [] } };
    }),
    append: vi.fn(async ({ requestBody }: any) => {
      const [id, url, shortCode, createdAt, updatedAt, count] =
        requestBody.values[0];
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
  };
});

let worker: any;
let mockStore: any;

beforeAll(async () => {
  const mod = await import("googleapis");
  mockStore = (mod as any).__mockStore;
  // Vitest/Vite resolves TS by path during tests; for build we avoid .ts suffix
  worker = (await import("../worker")).default;
});

beforeEach(() => {
  mockStore.shortCodes.length = 0;
  mockStore.urlByShortCode.clear();
  mockStore.countByShortCode.clear();
  mockStore.throwOnGet = false;
});

describe("Worker fetch", () => {
  const env = {
    SPREADSHEET_ID: "TEST",
    GOOGLE_PROJECT_ID: "test-project-id",
    GOOGLE_PRIVATE_KEY_ID: "test-private-key-id",
    GOOGLE_PRIVATE_KEY:
      "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    GOOGLE_CLIENT_EMAIL: "test@test-project.iam.gserviceaccount.com",
    GOOGLE_CLIENT_ID: "123456789",
    GOOGLE_AUTH_URI: "https://accounts.google.com/o/oauth2/auth",
    GOOGLE_TOKEN_URI: "https://oauth2.googleapis.com/token",
    GOOGLE_AUTH_PROVIDER_X509_CERT_URL:
      "https://www.googleapis.com/oauth2/v1/certs",
    GOOGLE_CLIENT_X509_CERT_URL:
      "https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com",
    GOOGLE_UNIVERSE_DOMAIN: "googleapis.com",
  } as any;

  it("GET / returns welcome text", async () => {
    const res = await worker.fetch(new Request("http://test/"), env);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Welcome to the URL Shortener API!");
  });

  it("full flow: create, get, stats, update, delete", async () => {
    // create
    const create = await worker.fetch(
      new Request("http://test/shorten", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://ex.com/a" }),
      }),
      env,
    );
    expect(create.status).toBe(201);
    const record = await create.json();
    expect(record.url).toBe("https://ex.com/a");
    expect(typeof record.shortCode).toBe("string");

    // get
    const get = await worker.fetch(
      new Request(`http://test/${record.shortCode}`),
      env,
    );
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ url: "https://ex.com/a" });

    // stats (after one get above)
    const stats = await worker.fetch(
      new Request(`http://test/shorten/${record.shortCode}/stats`),
      env,
    );
    expect(stats.status).toBe(200);
    const s = await stats.json();
    expect(s).toEqual({ count: 1 });

    // update
    const upd = await worker.fetch(
      new Request(`http://test/shorten/${record.shortCode}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://ex.com/b" }),
      }),
      env,
    );
    expect(upd.status).toBe(200);

    // get again
    const get2 = await worker.fetch(
      new Request(`http://test/${record.shortCode}`),
      env,
    );
    expect(get2.status).toBe(200);
    expect(await get2.json()).toEqual({ url: "https://ex.com/b" });

    // delete
    const del = await worker.fetch(
      new Request(`http://test/shorten/${record.shortCode}`, {
        method: "DELETE",
      }),
      env,
    );
    expect(del.status).toBe(200);

    // not found after delete
    const nf = await worker.fetch(
      new Request(`http://test/${record.shortCode}`),
      env,
    );
    expect(nf.status).toBe(404);
  });

  it("returns 404 for unknown path", async () => {
    const res = await worker.fetch(
      new Request("http://test/unknown/path"),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 500 when googleapis get fails", async () => {
    mockStore.throwOnGet = true;
    const res = await worker.fetch(new Request("http://test/abc"), env);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
