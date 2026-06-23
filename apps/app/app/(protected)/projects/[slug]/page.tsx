"use client";

import { useParams } from "react-router-dom";
import ProjectCreate from "@/pages/ProjectCreate";
import ProjectDetail from "@/pages/ProjectDetail";

export default function Page() {
  const params = useParams<{ slug: string }>();
  if (params.slug === "new") {
    return <ProjectCreate />;
  }
  return <ProjectDetail />;
}
