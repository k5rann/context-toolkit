import { redirect } from "next/navigation";

// Old route from the multi-UI iteration phase. The /humanizer route is now
// the canonical Stealth pipeline UI. Redirect anyone with a stale bookmark.
export default function Page() {
  redirect("/humanizer");
}
