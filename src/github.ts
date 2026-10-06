import { App } from "octokit";
import type { Github } from "./handle-event.js";

export function githubFor(app: App, installationId: number): Github {
  const octokit = () => app.getInstallationOctokit(installationId);

  const split = (repo: string) => {
    const [owner, name] = repo.split("/");
    return { owner: owner!, repo: name! };
  };

  return {
    async addLabel(repo, number, label) {
      await (await octokit()).rest.issues.addLabels({
        ...split(repo),
        issue_number: number,
        labels: [label],
      });
    },
    async comment(repo, number, body) {
      await (await octokit()).rest.issues.createComment({
        ...split(repo),
        issue_number: number,
        body,
      });
    },
  };
}
