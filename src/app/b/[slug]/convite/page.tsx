import { createServerClient } from "@/lib/supabase/server";
import ConviteClient from "./ConviteClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ConvitePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerClient();

  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!pool) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4"
        style={{ background: "var(--color-bg-primary)" }}>
        <p style={{ color: "var(--color-text-secondary)" }}>Bolão não encontrado.</p>
      </main>
    );
  }

  return <ConviteClient pool={pool} />;
}
