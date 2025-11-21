import { RequireAuth } from "@/components/auth/RequireAuth";
import { MaterialStyleLab } from "@/components/lab/MaterialStyleLab";

export default function MaterialStyleLabPage() {
  return (
    <RequireAuth>
      <MaterialStyleLab />
    </RequireAuth>
  );
}

