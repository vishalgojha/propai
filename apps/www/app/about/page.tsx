import type { Metadata } from "next";
import About from "@/pages/About";

export const metadata: Metadata = {
  title: "About PropAI — Broker Property Intelligence for Mumbai",
  description:
    "Broker property intelligence for Mumbai: searchable inventory, requirements, and market context in one workspace.",
    openGraph: {
      title: "About PropAI — Broker Property Intelligence for Mumbai",
      description:
        "Searchable broker inventory, requirements, and market context for Mumbai real estate.",
      type: "website",
      locale: "en_IN",
    },
  alternates: {
    canonical: "https://www.propai.live/about",
  },
};

export default function Page() {
  return <About />;
}
