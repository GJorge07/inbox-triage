import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { resolve } from "path";

// Carrega .env.local manualmente para garantir disponibilidade em runtime
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* arquivo não encontrado — ignora */ }

const nextConfig: NextConfig = {};

export default nextConfig;
