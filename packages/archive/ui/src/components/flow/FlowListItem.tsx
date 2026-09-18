type FlowListItemRes = {
  name: string;
  hash: string;
  version: string;
  description?: string;
};

export function FlowListItem(props: { flowListItem: FlowListItemRes }) {
  return <div>flow list item</div>;
}
