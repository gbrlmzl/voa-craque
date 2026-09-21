import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = ["/login", "/registrar", "/manutencao"];
const PUBLIC_PREFIXES = ["/api/auth"];

/**
 * Primeira barreira: quem nao tem sessao nao chega nas paginas nem na API.
 * A autorizacao por papel e refeita dentro de cada route handler e pagina,
 * porque o proxy sozinho nao protege chamadas diretas.
 */
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const signedIn = Boolean(req.auth?.user);

  const isPublic =
    PUBLIC_ROUTES.includes(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!signedIn && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
    }
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("proximo", pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn && (pathname === "/login" || pathname === "/registrar")) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
