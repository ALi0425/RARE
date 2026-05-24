import { ModuleNode, PageNode, FieldNode, ActionNode } from "./nodes";

export const nodeTypes = {
  module: ModuleNode,
  page: PageNode,
  field: FieldNode,
  action: ActionNode,
};

export { setOnLabelSave } from "./nodes/shared/NodeBox";
