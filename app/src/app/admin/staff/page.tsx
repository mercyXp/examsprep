import { redirect } from "next/navigation";

export default function StaffRedirect() {
  redirect("/admin/people?tab=staff");
}
