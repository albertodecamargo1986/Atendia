import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/licenses/:path*",
    "/customers/:path*",
    "/alerts/:path*",
    "/settings/:path*",
    "/api/licenses/:path*",
    "/api/customers/:path*",
    "/api/dashboard/:path*",
    "/api/alerts/:path*",
    "/api/settings/:path*",
    "/api/releases/:path*",
  ],
};
