import { Suspense } from "react";
import Contact from "@/pages/Contact";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Contact />
    </Suspense>
  );
}
