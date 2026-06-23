import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchProjectBySlug } from "@/lib/projects";
import ProjectPage from "@/pages/ProjectPage";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await fetchProjectBySlug(slug);
  if (!project) return { title: "Project Not Found" };
  return {
    title: `${project.name} - Premium Resale Units in ${project.locality} | PropAI Pulse`,
    description: project.description.slice(0, 160),
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const project = await fetchProjectBySlug(slug);
  if (!project) notFound();
  return <ProjectPage project={project} />;
}
