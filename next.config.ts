import type { NextConfig } from "next";

// Photos farmers upload live in our Supabase storage. Allowing that one
// address (and only its public files) lets pages show them resized for the
// screen instead of at full size; see components/Photo.tsx.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseUrl ? [new URL(`${supabaseUrl}/storage/v1/object/public/**`)] : [],
  },
};

export default nextConfig;
