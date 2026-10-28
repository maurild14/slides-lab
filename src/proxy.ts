import { NextResponse, type NextRequest } from "next/server";

/**
 * The API has no auth: it is only safe because nothing but this machine can
 * reach it. Two ways a web page in the user's own browser still could:
 *
 * - DNS rebinding: evil.example resolves to 127.0.0.1, so its page calls the
 *   API "same-origin". The Host header still says evil.example — reject it.
 * - CSRF: a cross-site POST with `text/plain` needs no preflight, so the
 *   request lands before CORS can say no. The browser always attaches Origin
 *   to it — reject one that is not us.
 *
 * Requests without Origin pass: that is the agent's curl, and the browser
 * never omits it on a cross-site POST.
 */
export function proxy(request: NextRequest) {
  // Next stores the port it actually bound here, including `-p` and `PORT=`.
  const port = process.env.PORT || "3000";
  const host = request.headers.get("host");
  if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (
    origin &&
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    origin !== `http://${host}`
  ) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  return NextResponse.next();
}

// Every route, not just /api: /uploads/* is rewritten to /api/uploads only after
// the proxy runs, so an /api-only matcher let a rebinding page read the user's
// images. Next's own build assets carry nothing private and skip the check.
export const config = {
  matcher: "/((?!_next/static|_next/image).*)",
};
