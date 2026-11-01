import { redirect } from "next/navigation";

/** WhatsApp links use /track/GF-…; the existing client page resolves the code and renders the public view. */
export default async function TrackCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/track?code=${encodeURIComponent(code)}`);
}
