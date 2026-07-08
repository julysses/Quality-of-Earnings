import { redirect } from "next/navigation";

export default function Home() {
  // Middleware routes authenticated users to /dashboard.
  redirect("/login");
}
