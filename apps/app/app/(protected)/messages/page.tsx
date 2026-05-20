import { redirect } from "next/navigation";
import { protectedRouteRedirects } from "../routeRedirects";

export default function Page() {
  redirect(protectedRouteRedirects.agent);
}
