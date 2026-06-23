import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchProjectBySlug, getProjectInventory } from "@/lib/projects";
import ProjectUnits from "@/pages/ProjectUnits";

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
    title: `${project.name} - Resale Units & Inventory in ${project.locality} | PropAI Pulse`,
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const project = await fetchProjectBySlug(slug);
  if (!project) notFound();
  const inventory = getProjectInventory(slug);
  return <ProjectUnits project={project} inventory={inventory} />;
}
