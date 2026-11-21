import { agentContext, type Contract } from "@jaetask/open-agent-kit";
import { table } from "@jaetask/snap";

const json = (value: unknown) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

export function renderContract(c: Contract): string {
  return [
    "### Domain",
    table(["domain", "version", "about"], [[c.domain, c.version, c.about]]),
    "### Actions",
    table(
      ["action", "effect", "description"],
      c.actions.map((a) => [a.name, a.effect, a.description]),
    ),
    "### Agent context",
    `\`\`\`text\n${agentContext(c)}\n\`\`\``,
    "### Inputs",
    ...c.actions.flatMap((a) => [`#### ${a.name}`, json(a.input)]),
  ].join("\n\n");
}
