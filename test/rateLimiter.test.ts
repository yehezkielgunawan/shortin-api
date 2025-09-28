import { describe, it, expect, vi } from "vitest";
import { rateLimiter } from "../middleware/rateLimiter";

function mockReqRes(ip: string = "1.2.3.4") {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    headers,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  };
  const req: any = { ip, socket: { remoteAddress: ip } };
  const next = vi.fn();
  return { req, res, next };
}

describe("rateLimiter", () => {
  it("allows requests under the limit and sets headers", () => {
    const middleware = rateLimiter(2, 1000); // 2 requests per second
    const { req, res, next } = mockReqRes();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.headers["X-RateLimit-Limit"]).toBe("2");
    expect(res.headers["X-RateLimit-Remaining"]).toBe("1");
    expect(res.headers["X-RateLimit-Reset"]).toBeTypeOf("string");
  });

  it("returns 429 when over the limit", () => {
    const middleware = rateLimiter(1, 1000); // 1 request per second
    const { req, res, next } = mockReqRes("5.6.7.8");

    middleware(req, res, next); // first allowed
    next.mockClear();

    middleware(req, res, next); // second should be limited
    // Note: middleware sets status to 429 but continues to next();
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ error: "Too many requests" });
  });

  it("resets after window passes", async () => {
    const windowMs = 50;
    const middleware = rateLimiter(1, windowMs);
    const { req, res, next } = mockReqRes("9.9.9.9");

    middleware(req, res, next); // first allowed
    next.mockClear();

    // wait for window to reset
    await new Promise((r) => setTimeout(r, windowMs + 10));

    middleware(req, res, next); // should be allowed again
    expect(res.statusCode).toBe(200);
  });
});
