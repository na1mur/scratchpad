import { z } from "zod";
import { ROLES } from "@/models/User";

export const roleSchema = z.object({ role: z.enum(ROLES, { error: "Pick a role" }) });
export type RoleInput = z.infer<typeof roleSchema>;
