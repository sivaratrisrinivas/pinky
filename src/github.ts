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
    async removeLabel(repo, number, label) {
      try {
        await (await octokit()).rest.issues.removeLabel({
          ...split(repo),
          issue_number: number,
          name: label,
        });
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
      }
    },
    async comment(repo, number, body) {
      await (await octokit()).rest.issues.createComment({
        ...split(repo),
        issue_number: number,
        body,
      });
    },
    async isOpen(repo, number) {
      const { data } = await (await octokit()).rest.issues.get({ ...split(repo), issue_number: number });
      return data.state === "open";
    },
    async hasWriteAccess(repo, login) {
      try {
        const { data } = await (await octokit()).rest.repos.getCollaboratorPermissionLevel({
          ...split(repo),
          username: login,
        });
        return data.permission === "admin" || data.permission === "write";
      } catch (error) {
        if ((error as { status?: number }).status === 404) return false;
        throw error;
      }
    },
  };
}
