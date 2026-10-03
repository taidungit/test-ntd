import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface TodoListResponse {
  items: Todo[];
  total: number;
  page: number;
  size: number;
}

interface CreateTodoRequest {
  title: string;
  description?: string;
}

interface UpdateTodoRequest {
  title?: string;
  description?: string;
  completed?: boolean;
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

export function useTodos(page: number = 1, size: number = 10000) {
  return useQuery({
    queryKey: ["todos", page, size],
    queryFn: async (): Promise<TodoListResponse> => {
      const response = await api.get("/todos", {
        params: { page, size },
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
    onSuccess: (newTodo) => {
      queryClient.setQueriesData<TodoListResponse>(
        { queryKey: ["todos"] },
        (prev) =>
          prev
            ? {
                ...prev,
                items: [newTodo, ...prev.items],
                total: prev.total + 1,
              }
            : { items: [newTodo], total: 1, page: 1, size: 10000 }
      );
      void queryClient.invalidateQueries({ queryKey: ["todos"] });
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
    }: {
      id: string;
      data: UpdateTodoRequest;
    }): Promise<Todo> => {
      const response = await api.put(`/todos/${id}`, data);
      return response.data;
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["todos"] });

      const previousEntries = queryClient.getQueriesData<TodoListResponse>({
        queryKey: ["todos"],
      });

      queryClient.setQueriesData<TodoListResponse>(
        { queryKey: ["todos"] },
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
    onSuccess: (updatedTodo) => {
      queryClient.setQueriesData<TodoListResponse>(
        { queryKey: ["todos"] },
        (prev) => mergeTodoIntoList(prev, updatedTodo)
      );
      toast.success("Todo updated successfully!");
    },
    onError: (_err, _vars, context) => {
      context?.previousEntries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      toast.error("Failed to update todo");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}

export function useDeleteTodo() {
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/todos/${id}`);
    },
    onSuccess: (_data, id) => {
      queryClient.setQueriesData<TodoListResponse>(
        { queryKey: ["todos"] },
        (prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.filter((t) => t.id !== id),
                total: Math.max(0, prev.total - 1),
              }
            : prev
      );
      void queryClient.invalidateQueries({ queryKey: ["todos"] });
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
      });
    },
  };
}
