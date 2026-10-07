import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/adapter-pg", "pg", "bcryptjs", "nodemailer", "sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
    // O proxy do Next copia o corpo de toda requisicao e corta em 10 MB sem avisar:
    // a foto de ate 20 MB chegaria truncada ao route handler. 25 MB da folga
    // para o envelope do multipart/form-data.
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
