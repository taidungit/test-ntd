import { z } from "zod";

export const todoSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title is too long"),
  description: z.string().optional(),
});

export type TodoFormData = z.infer<typeof todoSchema>;

export const todoFilterSchema = z.object({
  keyword: z.string().max(200).optional().or(z.literal("")),
  status: z.enum(["", "active", "completed"]),
  tag_id: z.string().uuid().optional().or(z.literal("")),
  date_from: z.string().optional().or(z.literal("")),
  date_to: z.string().optional().or(z.literal("")),
});

export type TodoFilterFormData = z.infer<typeof todoFilterSchema>;

export const bulkStatusSchema = z.object({
  todo_ids: z.array(z.string().uuid()).min(1, "Select at least one todo"),
  completed: z.boolean(),
});
