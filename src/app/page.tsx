import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.kind === "client") redirect("/client");
  if (session.role === "SUPER_ADMIN") redirect("/admin");
  redirect("/dashboard");
}
