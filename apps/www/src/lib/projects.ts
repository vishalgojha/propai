import { PROJECTS, getProjectBySlug, getProjectInventory, getSimilarProjects } from "../data/projects";
import type { Project, ProjectInventory } from "../data/projects";

export { getProjectBySlug, getProjectInventory, getSimilarProjects };
export type { Project, ProjectInventory };

export async function fetchProjectBySlug(slug: string): Promise<Project | null> {
  return getProjectBySlug(slug) || null;
}

export async function fetchProjectInventory(slug: string): Promise<ProjectInventory[]> {
  return getProjectInventory(slug);
}

export async function fetchSimilarProjects(slug: string): Promise<Project[]> {
  return getSimilarProjects(slug);
}

export async function fetchAllProjectSlugs(): Promise<string[]> {
  return PROJECTS.map((p) => p.slug);
}
