import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// 資料庫連不到時（例如 Supabase 免費方案閒置被暫停）不要一直等到 Vercel 504，5 秒就放棄
const AUTH_TIMEOUT_MS = 5000;

const UNAVAILABLE_HTML = `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>暫時無法連線</title></head>
<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:20vh auto;padding:0 1rem;text-align:center;color:#111">
<div style="font-size:3rem">⚾</div><h1 style="font-size:1.25rem">資料庫暫時無法連線</h1>
<p style="color:#555;line-height:1.6">可能是資料庫閒置太久被暫停了，請管理員到 Supabase 後台按「Restore」，幾分鐘後再重新整理。</p>
<button onclick="location.reload()" style="margin-top:1rem;padding:.6rem 1.2rem;border-radius:.5rem;border:0;background:#111;color:#fff;font-size:1rem">重新整理</button>
</body></html>`;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) }),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // 連線失敗（逾時、DNS 找不到）才擋；單純沒登入照常導向登入頁
  if (error?.name === 'AuthRetryableFetchError' && !request.nextUrl.pathname.startsWith('/api')) {
    return new NextResponse(UNAVAILABLE_HTML, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/_next') &&
    !request.nextUrl.pathname.startsWith('/api')
  ) {
    // no user, potentially respond by redirecting the user to the login page
    // But don't redirect API routes - let them handle authentication themselves
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely.

  return supabaseResponse;
}
