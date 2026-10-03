import { useState } from "react";
import { Plus, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  defaultTodoFilters,
  useBulkUpdateStatus,
  useTodos,
  type TodoFilters,
} from "../api/todos";
import { TodoList } from "./TodoList";
import { TodoForm } from "./TodoForm";
import { TodoFilterBar } from "./TodoFilterBar";
import { TagManager } from "@/features/tags/components/TagManager";
import { useTags } from "@/features/tags/api/tags";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { bulkStatusSchema } from "../schemas/todo";

export function TodoPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filters, setFilters] = useState<TodoFilters>(defaultTodoFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data, isLoading, error } = useTodos(filters);
  const { data: tags = [] } = useTags();
  const bulkUpdate = useBulkUpdateStatus();
  const { user, logout } = useAuth();

  const items = data?.items ?? [];
  const allSelected =
    items.length > 0 && items.every((todo) => selectedIds.has(todo.id));

  const toggleSelected = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (selected: boolean) => {
    setSelectedIds(selected ? new Set(items.map((todo) => todo.id)) : new Set());
  };

  const runBulk = (completed: boolean) => {
    const parsed = bulkStatusSchema.safeParse({
      todo_ids: [...selectedIds],
      completed,
    });
    if (!parsed.success) return;
    bulkUpdate.mutate(parsed.data, {
      onSuccess: () => setSelectedIds(new Set()),
    });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / filters.size)) : 1;

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-card border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Todo App</h1>
            {user && (
              <p className="text-sm text-muted-foreground">{user.email}</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <TagManager />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">My Todos</CardTitle>
            <Button size="sm" onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Todo
            </Button>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4 space-y-4">
            <TodoFilterBar
              filters={filters}
              tags={tags}
              onChange={(next) => {
                setFilters(next);
                setSelectedIds(new Set());
              }}
            />

            {items.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(value) => toggleSelectAll(value === true)}
                  aria-label="Select all on this page"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.size === 0 || bulkUpdate.isPending}
                  onClick={() => runBulk(true)}
                >
                  Mark completed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.size === 0 || bulkUpdate.isPending}
                  onClick={() => runBulk(false)}
                >
                  Mark active
                </Button>
              </div>
            )}

            {isLoading && (
              <div className="text-center py-12 text-muted-foreground">
                Loading todos...
              </div>
            )}

            {error && (
              <div className="text-center py-12 text-destructive">
                Failed to load todos. Please try again.
              </div>
            )}

            {data && (
              <TodoList
                todos={data.items}
                tags={tags}
                selectedIds={selectedIds}
                onSelectedChange={toggleSelected}
              />
            )}

            {data && data.total > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Showing {data.items.length} of {data.total} todos
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={filters.page <= 1}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, page: prev.page - 1 }))
                    }
                  >
                    Previous
                  </Button>
                  <span className="self-center">
                    {filters.page} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={filters.page >= totalPages}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, page: prev.page + 1 }))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <TodoForm
        mode="create"
        open={showCreateForm}
        onClose={() => setShowCreateForm(false)}
      />
    </div>
  );
}