import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useCreateTag,
  useDeleteTag,
  useTags,
  useUpdateTag,
} from "../api/tags";
import { tagSchema, type TagFormData } from "../schemas/tag";

export function TagManager() {
  const { data: tags = [] } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TagFormData>({
    resolver: zodResolver(tagSchema),
    defaultValues: { name: "", color: "#3b82f6" },
  });

  const onSubmit = (data: TagFormData) => {
    const payload = {
      name: data.name.trim(),
      color: data.color ? data.color : null,
    };

    if (editingId) {
      updateTag.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setEditingId(null);
            reset({ name: "", color: "#3b82f6" });
          },
        }
      );
      return;
    }

    createTag.mutate(payload, {
      onSuccess: () => reset({ name: "", color: "#3b82f6" }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Tags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1 flex-1 min-w-40">
            <Label htmlFor="tag-name">Name</Label>
            <Input id="tag-name" placeholder="e.g. work" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="tag-color">Color</Label>
            <Input id="tag-color" type="color" className="w-14 p-1" {...register("color")} />
          </div>
          <Button type="submit" size="sm" disabled={createTag.isPending || updateTag.isPending}>
            {editingId ? "Save" : "Add tag"}
          </Button>
          {editingId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingId(null);
                reset({ name: "", color: "#3b82f6" });
              }}
            >
              Cancel
            </Button>
          )}
        </form>

        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags yet.</p>
        ) : (
          <ul className="space-y-2">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="size-3 rounded-full shrink-0 border"
                    style={{ backgroundColor: tag.color || "#94a3b8" }}
                  />
                  <span className="text-sm truncate">{tag.name}</span>
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditingId(tag.id);
                      reset({ name: tag.name, color: tag.color || "#3b82f6" });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteTag.mutate(tag.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
