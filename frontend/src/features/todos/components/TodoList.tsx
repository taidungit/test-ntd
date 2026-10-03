import { useState } from "react";
import { TodoItem } from "./TodoItem";
import { TodoForm } from "./TodoForm";
import type { Tag } from "@/features/tags/api/tags";
import type { Todo } from "../api/todos";
import { useDeleteTodo } from "../api/todos";

interface TodoListProps {
  todos: Todo[];
  tags: Tag[];
  selectedIds: Set<string>;
  onSelectedChange: (id: string, selected: boolean) => void;
}

export function TodoList({
  todos,
  tags,
  selectedIds,
  onSelectedChange,
}: TodoListProps) {
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const deleteTodo = useDeleteTodo();

  if (todos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No todos yet</p>
        <p className="text-sm mt-1">Create a todo or clear your filters</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {todos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            tags={tags}
            selected={selectedIds.has(todo.id)}
            onSelectedChange={onSelectedChange}
            onEdit={setEditingTodo}
            onDelete={(id) => deleteTodo.mutate(id)}
          />
        ))}
      </div>

      {editingTodo && (
        <TodoForm
          mode="edit"
          todo={editingTodo}
          open={!!editingTodo}
          onClose={() => setEditingTodo(null)}
        />
      )}
    </>
  );
}