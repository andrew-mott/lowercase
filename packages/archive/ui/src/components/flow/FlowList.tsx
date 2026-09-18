import { FlowListItem } from "./FlowListItem.js";

export function FlowList(props: {}) {
  return (
    <div>
      <FlowListItem
        flowListItem={{ name: "name", hash: "hash", version: "version" }}
      />
    </div>
  );
}
