import { getSession } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import HomeClient from "./HomeClient";
import type { MyPool } from "@/app/api/pools/mine/route";

export default async function Home() {
  const session = await getSession();

  let pools: MyPool[] = [];
  if (session) {
    const supabase = await createServerClient();
    const { data } = await supabase.rpc("my_pools", {
      p_user: session.userId,
      p_secret: session.secret,
    });
    pools = (data ?? []) as MyPool[];
  }

  return <HomeClient name={session?.name} pools={pools} />;
}
