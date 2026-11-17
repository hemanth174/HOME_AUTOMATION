import { listProjects, resolveProject } from '@/lib/monitoring/projects';
import { authorize, jsonOk } from '@/lib/monitoring/routeHelpers';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  const projects = listProjects();
  const selected = resolveProject('vikatech');
  return jsonOk({ projects, selected: selected?.id || null });
}
