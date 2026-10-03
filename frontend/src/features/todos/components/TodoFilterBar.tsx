import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tag } from "@/features/tags/api/tags";
import {
  todoFilterSchema,
  type TodoFilterFormData,
} from "../schemas/todo";
import type { TodoFilters } from "../api/todos";

interface TodoFilterBarProps {
  filters: TodoFilters;
  tags: Tag[];
  onChange: (next: TodoFilters) => void;
}

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function TodoFilterBar({ filters, tags, onChange }: TodoFilterBarProps) {
  const { register, handleSubmit, reset } = useForm<TodoFilterFormData>({
    resolver: zodResolver(todoFilterSchema),
    values: {
      keyword: filters.keyword,
      status: filters.status,
      tag_id: filters.tag_id,
      date_from: filters.date_from,
      date_to: filters.date_to,
    },
  });

  const apply = (data: TodoFilterFormData) => {
    onChange({
      ...filters,
      page: 1,
      keyword: data.keyword ?? "",
      status: data.status,
      tag_id: data.tag_id ?? "",
      date_from: data.date_from ?? "",
      date_to: data.date_to ?? "",
    });
  };

  const clear = () => {
    reset({
      keyword: "",
      status: "",
      tag_id: "",
      date_from: "",
      date_to: "",
    });
    onChange({
      ...filters,
      page: 1,
      keyword: "",
      status: "",
      tag_id: "",
      date_from: "",
      date_to: "",
    });
  };

  return (
    <form
      onSubmit={handleSubmit(apply)}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end"
    >
      <div className="space-y-1 lg:col-span-2">
        <Label htmlFor="keyword">Keyword</Label>
        <Input id="keyword" placeholder="Search title..." {...register("keyword")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="status">Status</Label>
        <select id="status" className={selectClassName} {...register("status")}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="tag_id">Tag</Label>
        <select id="tag_id" className={selectClassName} {...register("tag_id")}>
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="date_from">From</Label>
        <Input id="date_from" type="date" {...register("date_from")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="date_to">To</Label>
        <Input id="date_to" type="date" {...register("date_to")} />
      </div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={clear}>
          Clear filters
        </Button>
      </div>
    </form>
  );
}
