import { afterEach, describe, expect, it } from "vitest";
import { clearAuthToken, setAuthToken } from "./auth-token";
import { authFetchInit, setBrowserCsrf } from "./browser-session";

describe("authFetchInit", () => {
  afterEach(() => {
    clearAuthToken();
    setBrowserCsrf(null);
  });

  it("omits Authorization in cookie-session mode and sends cookies + CSRF", () => {
    setBrowserCsrf("csrf-1");
    const init = authFetchInit();
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({ "X-CSRF-Token": "csrf-1" });
  });

  it("sends Bearer when a token exists", () => {
    setAuthToken("t");
    expect(authFetchInit().headers).toEqual({ Authorization: "Bearer t" });
  });
});
