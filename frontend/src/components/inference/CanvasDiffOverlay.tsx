import { useEffect } from "react";
import { useCanvasStore } from "../../store/canvasStore";
import { useInferenceStore } from "../../store/inferenceStore";

export default function CanvasDiffOverlay() {
  const diffResult = useInferenceStore((s) => s.diffResult);
  const phase = useInferenceStore((s) => s.phase);
  const applyDiff = useCanvasStore((s) => s.applyDiff);
  const clearDiff = useCanvasStore((s) => s.clearDiff);

  useEffect(() => {
    if (diffResult && phase === "deciding") {
      applyDiff(diffResult);
    } else {
      clearDiff();
    }
  }, [diffResult, phase, applyDiff, clearDiff]);

  return null;
}
