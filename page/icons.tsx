import { ResourceIcon } from "@jaetask/toolkit/icons";
import type { ResourceIconValue } from "@jaetask/toolkit/icons";

export const tabler = (name: string): ResourceIconValue => ({
  version: 1,
  kind: "library",
  library: "tabler",
  name,
});

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <ResourceIcon value={tabler(name)} size={size} />;
}
