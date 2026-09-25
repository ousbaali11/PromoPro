import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";

const SESSION_COOKIE = "promopro_session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Icônes d'onglet générées (/dashboard/icon, /client/icon) : la route lit elle-même la session
  // et ne sert le logo qu'au promoteur de cette session ; sans session elle répond l'icône par
  // défaut. Rediriger vers /login servirait une page HTML en guise d'icône.
  if (pathname === "/dashboard/icon" || pathname === "/client/icon") return NextResponse.next();
  const isProtected =
    pathname.startsWith("/admin") || pathname.startsWith("/dashboard") || pathname.startsWith("/client");
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && (session.kind !== "staff" || session.role !== "SUPER_ADMIN")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/dashboard") && session.kind !== "staff") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/client") && session.kind !== "client") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/client/:path*"],
};
