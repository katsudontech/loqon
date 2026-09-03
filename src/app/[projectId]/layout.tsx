import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getPublicProject } from '@/lib/projects'

type Props = {
  children: ReactNode
  params: Promise<{ projectId: string }>
}

export default async function ProjectLayout({ children, params }: Props) {
  const { projectId } = await params
  const project = await getPublicProject(projectId)

  // Resolve missing projects before this segment's loading UI starts streaming,
  // so Next.js can return an actual HTTP 404 response.
  if (!project) notFound()

  return children
}
