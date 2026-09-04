import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  heliusApiKey: requireEnv("HELIUS_API_KEY"),
  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseKey: requireEnv("SUPABASE_KEY"),
};
