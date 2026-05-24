import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import NodeBox from "./shared/NodeBox";

export const ModuleNode = memo(({ id, data }: NodeProps) => (
  <NodeBox id={id} data={data} type="module" />
));
ModuleNode.displayName = "ModuleNode";

export const PageNode = memo(({ id, data }: NodeProps) => (
  <NodeBox id={id} data={data} type="page" />
));
PageNode.displayName = "PageNode";

export const FieldNode = memo(({ id, data }: NodeProps) => (
  <NodeBox id={id} data={data} type="field">
    {data?.fieldType && (
      <span
        style={{
          fontSize: 9,
          color: "#8a8a8e",
          marginTop: 1,
        }}
      >
        {data.fieldType}
      </span>
    )}
  </NodeBox>
));
FieldNode.displayName = "FieldNode";

export const ActionNode = memo(({ id, data }: NodeProps) => (
  <NodeBox id={id} data={data} type="action">
    {data?.actionType && (
      <span
        style={{
          fontSize: 9,
          color: "#8a8a8e",
          marginTop: 1,
        }}
      >
        ▶ {data.actionType}
      </span>
    )}
  </NodeBox>
));
ActionNode.displayName = "ActionNode";
