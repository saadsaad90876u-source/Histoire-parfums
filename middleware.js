// Server-side gate for the admin entry point.
// This file runs on Vercel's Edge — it is NEVER downloaded by visitors'
// browsers, unlike script.js. That means the secret path below never
// appears in any file a visitor can view or inspect.
//
// Requires two Environment Variables set in the Vercel Project Settings
// (Settings -> Environment Variables), NOT written anywhere in the code:
//   ADMIN_GATE_USER
//   ADMIN_GATE_PASS

export const config = {
  matcher: '/rjti40-qx9ptr',
};

export default function middleware(request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Basic ')) {
    const decoded = atob(authHeader.slice(6));
    const sepIndex = decoded.indexOf(':');
    const user = decoded.slice(0, sepIndex);
    const pass = decoded.slice(sepIndex + 1);

    if (user === process.env.ADMIN_GATE_USER && pass === process.env.ADMIN_GATE_PASS) {
      const homeUrl = new URL('/', request.url);
      return new Response(null, {
        status: 307,
        headers: {
          Location: homeUrl.toString(),
          // Short-lived, readable-by-page cookie so script.js knows to
          // open the admin login modal. It self-destructs after 30s.
          'Set-Cookie': 'adminGateOK=1; Path=/; Max-Age=30; Secure; SameSite=Lax',
        },
      });
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Restricted"' },
  });
}
