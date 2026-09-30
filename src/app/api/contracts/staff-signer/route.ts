import { getStaffSignerEmail } from "@/server/modules/contracts";
import { errorMessage, json, lockedResponse } from "@/server/http";

export function GET() {
  const locked = lockedResponse("contracts");
  if (locked) return locked;

  try {
    return json({ email: getStaffSignerEmail() });
  } catch (err) {
    return json({ error: errorMessage(err, "尚未設定負責人") }, 500);
  }
}
