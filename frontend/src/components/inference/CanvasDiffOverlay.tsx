import { useEffect, useRef } from "react";
import { useCanvasStore } from "../../store/canvasStore";
import { useInferenceStore } from "../../store/inferenceStore";

export default function CanvasDiffOverlay() {
  const diffResult = useInferenceStore((s) => s.diffResult);
  const phase = useInferenceStore((s) => s.phase);
  const applyDiff = useCanvasStore((s) => s.applyDiff);
  const clearDiff = useCanvasStore((s) => s.clearDiff);
  const hadDiffRef = useRef(false);

  useEffect(() => {
    if (diffResult && phase === "deciding") {
      applyDiff(diffResult);
      hadDiffRef.current = true;
    } else if (hadDiffRef.current) {
      clearDiff();
      hadDiffRef.current = false;
    }
  }, [diffResult, phase, applyDiff, clearDiff]);

  return null;
}
