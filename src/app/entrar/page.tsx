import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import LoginClient from "./LoginClient";

interface Props {
  searchParams: Promise<{ next?: string }>;
}

export default async function EntrarGlobalPage({ searchParams }: Props) {
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  const { next } = await searchParams;
  const nextPath = next ?? "/";

  return <LoginClient next={nextPath} />;
}
