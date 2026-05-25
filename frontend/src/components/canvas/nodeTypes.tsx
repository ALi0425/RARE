import { ModuleNode, PageNode, FieldNode, ActionNode } from "./nodes";

export const nodeTypes = {
  module: ModuleNode,
  page: PageNode,
  field: FieldNode,
  action: ActionNode,
};

import { setOnLabelSave as _setOnLabelSave } from "./nodes/shared/NodeBox";
export const setOnLabelSave = _setOnLabelSave;
