import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { TagBrief } from "@/features/tags/api/tags";

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
  tags: TagBrief[];
}

export interface TodoListResponse {
  items: Todo[];
  total: number;
  page: number;
  size: number;
}

export interface TodoFilters {
  page: number;
  size: number;
  status: "" | "active" | "completed";
  tag_id: string;
  keyword: string;
  date_from: string;
  date_to: string;
}

export const defaultTodoFilters: TodoFilters = {
  page: 1,
  size: 20,
  status: "",
  tag_id: "",
  keyword: "",
  date_from: "",
  date_to: "",
};

interface CreateTodoRequest {
  title: string;
  description?: string;
}

interface UpdateTodoRequest {
  title?: string;
  description?: string;
  completed?: boolean;
}

export const todoKeys = {
  all: ["todos"] as const,
  list: (filters: TodoFilters) => [...todoKeys.all, "list", filters] as const,
};

function toListParams(filters: TodoFilters) {
  const params: Record<string, string | number> = {
    page: filters.page,
    size: filters.size,
  };
  if (filters.status) params.status = filters.status;
  if (filters.tag_id) params.tag_id = filters.tag_id;
  if (filters.keyword.trim()) params.keyword = filters.keyword.trim();
  if (filters.date_from) params.date_from = `${filters.date_from}T00:00:00`;
  if (filters.date_to) params.date_to = `${filters.date_to}T23:59:59`;
  return params;
}

function mergeTodoIntoList(
  prev: TodoListResponse | undefined,
  updatedTodo: Todo
): TodoListResponse | undefined {
  if (!prev) return prev;
  return {
    ...prev,
    items: prev.items.map((t) => (t.id === updatedTodo.id ? updatedTodo : t)),
  };
}

export function useTodos(filters: TodoFilters = defaultTodoFilters) {
  return useQuery({
    queryKey: todoKeys.list(filters),
    queryFn: async (): Promise<TodoListResponse> => {
      const response = await api.get("/todos", {
        params: toListParams(filters),
      });
      return response.data;
    },
  });
}

export function useCreateTodo() {
  return useMutation({
    mutationFn: async (data: CreateTodoRequest): Promise<Todo> => {
      const response = await api.post("/todos", data);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all });
      toast.success("Todo created successfully!");
    },
    onError: () => {
      toast.error("Failed to create todo");
    },
  });
}

export function useUpdateTodo() {
  return useMutation({
    mutationFn: async ({
      id,
      data,
      silent = false,
    }: {
      id: string;
      data: UpdateTodoRequest;
      silent?: boolean;
    }): Promise<Todo> => {
      const response = await api.put(`/todos/${id}`, data);
      return response.data;
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.all });

      const previousEntries = queryClient.getQueriesData<TodoListResponse>({
        queryKey: todoKeys.all,
      });

      queryClient.setQueriesData<TodoListResponse>(
        { queryKey: todoKeys.all },
        (prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((todo) =>
                  todo.id === id ? { ...todo, ...data } : todo
                ),
              }
            : prev
      );

      return { previousEntries };
    },
    onSuccess: (updatedTodo, variables) => {
      queryClient.setQueriesData<TodoListResponse>(
        { queryKey: todoKeys.all },
        (prev) => mergeTodoIntoList(prev, updatedTodo)
      );

      if (!variables.silent) {
        toast.success("Todo updated successfully!");
      }
    },
    onError: (_err, _vars, context) => {
      context?.previousEntries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      toast.error("Failed to update todo");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all });
    },
  });
}

export function useDeleteTodo() {
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/todos/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all });
      toast.success("Todo deleted successfully!");
    },
    onError: () => {
      toast.error("Failed to delete todo");
    },
  });
}

export function useToggleTodo() {
  const updateTodo = useUpdateTodo();

  return {
    ...updateTodo,
    mutate: (todo: Todo) => {
      updateTodo.mutate({
        id: todo.id,
        data: { completed: !todo.completed },
        silent: true,
      });
    },
  };
}

export function useAttachTag() {
  return useMutation({
    mutationFn: async ({
      todoId,
      tagId,
    }: {
      todoId: string;
      tagId: string;
    }): Promise<Todo> => {
      const response = await api.post(`/todos/${todoId}/tags`, {
        tag_id: tagId,
      });
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all });
      toast.success("Tag attached");
    },
    onError: () => {
      toast.error("Failed to attach tag");
    },
  });
}

export function useDetachTag() {
  return useMutation({
    mutationFn: async ({
      todoId,
      tagId,
    }: {
      todoId: string;
      tagId: string;
    }): Promise<Todo> => {
      const response = await api.delete(`/todos/${todoId}/tags/${tagId}`);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all });
      toast.success("Tag removed");
    },
    onError: () => {
      toast.error("Failed to remove tag");
    },
  });
}

export function useBulkUpdateStatus() {
  return useMutation({
    mutationFn: async (data: {
      todo_ids: string[];
      completed: boolean;
    }): Promise<{ updated_count: number }> => {
      const response = await api.patch("/todos/bulk-status", data);
      return response.data;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all });
      toast.success(`Updated ${result.updated_count} todos`);
    },
    onError: () => {
      toast.error("Failed to update todos");
    },
  });
}
