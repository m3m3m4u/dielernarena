// This route previously served static assets from an `isostadt` folder.
// The Isostadt UI is now rendered by a React component at `/arena/arenaCity`.
// To avoid serving duplicate static files and to make Vercel deployment
// simpler, we redirect requests for `/arena/arenaCity/static/*` to the
// main React page.

export const runtime = "edge"; // lightweight redirect

// Return a redirect for GET requests
export async function GET(_req: Request) {
  // Return a minimal permanent redirect without using URL parsing helpers
  return new Response(null, {
    status: 301,
    headers: {
  Location: '/arena/arenaCity'
    }
  });
}

export async function HEAD(_req: Request) {
  return new Response(null, {
    status: 301,
    headers: {
  Location: '/arena/arenaCity'
    }
  });
}
