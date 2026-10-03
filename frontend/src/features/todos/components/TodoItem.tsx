import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, X } from "lucide-react";
import type { Tag } from "@/features/tags/api/tags";
import type { Todo } from "../api/todos";
import { useAttachTag, useDetachTag } from "../api/todos";

interface TodoItemProps {
  todo: Todo;
  tags: Tag[];
  selected: boolean;
  onSelectedChange: (id: string, selected: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (id: string) => void;
}

const selectClassName =
  "h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none";

export function TodoItem({
  todo,
  tags,
  selected,
  onSelectedChange,
  onEdit,
  onDelete,
}: TodoItemProps) {
  const attachTag = useAttachTag();
  const detachTag = useDetachTag();
  const attachedIds = new Set((todo.tags ?? []).map((t) => t.id));
  const availableTags = tags.filter((t) => !attachedIds.has(t.id));

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      {/* Vẫn giữ lại checkbox ở đầu mỗi dòng */}
      <Checkbox
        checked={selected}
        onCheckedChange={(value) => onSelectedChange(todo.id, value === true)}
        aria-label={`Select ${todo.title}`}
        className="mt-0.5"
      />

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <p
            className={`text-sm font-medium truncate ${
              todo.completed ? "line-through text-muted-foreground" : ""
            }`}
          >
            {todo.title}
          </p>
          {/* Nhãn Active đổi sang màu xanh, Completed hiển thị bình thường */}
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${
              !todo.completed
                ? "border-green-500 text-green-600 bg-green-50 font-medium"
                : "text-muted-foreground"
            }`}
          >
            {todo.completed ? "Completed" : "Active"}
          </span>
        </div>
        {todo.description && (
          <p className="text-xs text-muted-foreground truncate">
            {todo.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {(todo.tags ?? []).map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
              style={{
                borderColor: tag.color || undefined,
                backgroundColor: tag.color ? `${tag.color}22` : undefined,
              }}
              onClick={() =>
                detachTag.mutate({ todoId: todo.id, tagId: tag.id })
              }
              title="Remove tag"
            >
              {tag.name}
              <X className="h-3 w-3" />
            </button>
          ))}
          {availableTags.length > 0 && (
            <select
              className={selectClassName}
              value=""
              onChange={(event) => {
                const tagId = event.target.value;
                if (tagId) {
                  attachTag.mutate({ todoId: todo.id, tagId });
                }
              }}
            >
              <option value="">Add tag</option>
              {availableTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(todo)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(todo.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}