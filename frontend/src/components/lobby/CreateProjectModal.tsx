import { useState } from "react";
import { theme } from "../../theme/tokens";
import Modal from "../ui/Modal";
import Input from "../ui/Input";
import Button from "../ui/Button";

interface Props {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export default function CreateProjectModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(name.trim());
      onClose();
    } catch {
      setCreating(false);
    }
  };

  return (
    <Modal onClose={onClose} width={360}>
      <span
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: theme.colors.text.primary,
        }}
      >
        新建项目
      </span>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="项目名称"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleCreate();
        }}
        autoFocus
      />

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          marginTop: 4,
        }}
      >
        <Button variant="ghost" size="sm" onClick={onClose}>
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleCreate}
          disabled={!name.trim() || creating}
        >
          {creating ? "创建中..." : "创建"}
        </Button>
      </div>
    </Modal>
  );
}
