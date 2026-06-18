import { Location } from "@fama-ai/core/location"
import { Project } from "@fama-ai/core/project"
import { AbsolutePath } from "@fama-ai/core/schema"

export function location(ref: Location.Ref, input: { projectDirectory?: AbsolutePath; vcs?: Project.Vcs } = {}) {
  return {
    directory: ref.directory,
    workspaceID: ref.workspaceID,
    project: { id: Project.ID.global, directory: input.projectDirectory ?? ref.directory },
    vcs: input.vcs,
  } satisfies Location.Interface
}
