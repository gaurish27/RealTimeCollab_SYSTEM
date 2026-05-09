"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Column, Id, Task } from "./types";
import ColumnContainer from "./ColumnContainer";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import { createPortal } from "react-dom";
import TaskCard from "./TaskCard";
import axios from "axios";
import { useKindeBrowserClient } from "@kinde-oss/kinde-auth-nextjs";
import { Spinner } from "@nextui-org/spinner";
import { toast } from "sonner";

const DEFAULT_COLS: Column[] = [
  { id: "todo", title: "Todo" },
  { id: "doing", title: "Work in progress" },
  { id: "done", title: "Done" },
];

interface KanbanBoardProps {
  projectId: string;
}

function KanbanBoard({ projectId }: KanbanBoardProps) {
  const { getToken } = useKindeBrowserClient();

  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } })
  );

  // ── Debounce timer ref for auto-save ─────────────────────────────────────
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  // ── Always-fresh refs so persistBoard never reads stale closure values ────
  const columnsRef = useRef<Column[]>(DEFAULT_COLS);
  const tasksRef = useRef<Task[]>([]);

  // Keep refs in sync with state on every render
  columnsRef.current = columns;
  tasksRef.current = tasks;

  // ── Load from backend on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;

    axios
      .get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects/${projectId}`, {
        params: { audience: "rtct_backend_api" },
        headers: { Authorization: "Bearer " + getToken() },
      })
      .then((res) => {
        if (res.data?.workspace) {
          try {
            const saved = JSON.parse(res.data.workspace);
            if (saved.columns?.length) setColumns(saved.columns);
            if (saved.tasks) setTasks(saved.tasks);
          } catch {
            // workspace field holds something else (not kanban JSON) — start fresh
          }
        }
      })
      .catch((err) => console.error("[Kanban] load error:", err))
      .finally(() => setLoading(false));
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced auto-save ───────────────────────────────────────────────────
  const persistBoard = (nextCols?: Column[], nextTasks?: Task[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      // Use passed-in values if available, otherwise fall back to the latest refs
      const colsToSave = nextCols ?? columnsRef.current;
      const tasksToSave = nextTasks ?? tasksRef.current;

      setSaving(true);
      try {
        await axios.patch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/projects/kanban/${projectId}`,
          { workspace: JSON.stringify({ columns: colsToSave, tasks: tasksToSave }) },
          {
            params: { audience: "rtct_backend_api" },
            headers: { Authorization: "Bearer " + getToken() },
          }
        );
      } catch (err) {
        console.error("[Kanban] save error:", err);
        toast.error("Failed to save board — check your connection.");
      } finally {
        setSaving(false);
      }
    }, 800);
  };

  // ── Wrapped state setters that also persist ───────────────────────────────
  const setColumnsAndSave = (updater: Column[] | ((prev: Column[]) => Column[])) => {
    setColumns((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      columnsRef.current = next; // update ref immediately so persistBoard sees fresh value
      persistBoard(next, tasksRef.current);
      return next;
    });
  };

  const setTasksAndSave = (updater: Task[] | ((prev: Task[]) => Task[])) => {
    setTasks((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      tasksRef.current = next; // update ref immediately
      persistBoard(columnsRef.current, next);
      return next;
    });
  };

  // ── Board operations ──────────────────────────────────────────────────────
  function createTask(columnId: Id) {
    const newTask: Task = {
      id: generateId(),
      columnId,
      content: `Task ${tasks.length + 1}`,
    };
    setTasksAndSave([...tasks, newTask]);
  }

  function deleteTask(id: Id) {
    setTasksAndSave(tasks.filter((t) => t.id !== id));
  }

  function updateTask(id: Id, content: string) {
    setTasksAndSave(tasks.map((t) => (t.id !== id ? t : { ...t, content })));
  }

  function deleteColumn(id: Id) {
    setColumnsAndSave(columns.filter((col) => col.id !== id));
    setTasksAndSave(tasks.filter((t) => t.columnId !== id));
  }

  function updateColumn(id: Id, title: string) {
    setColumnsAndSave(
      columns.map((col) => (col.id !== id ? col : { ...col, title }))
    );
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function onDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === "Column") {
      setActiveColumn(event.active.data.current.column);
    } else if (event.active.data.current?.type === "Task") {
      setActiveTask(event.active.data.current.task);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveColumn(null);
    setActiveTask(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (active.data.current?.type === "Column") {
      setColumnsAndSave((cols) => {
        const ai = cols.findIndex((c) => c.id === active.id);
        const oi = cols.findIndex((c) => c.id === over.id);
        return arrayMove(cols, ai, oi);
      });
    }
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const isActiveTask = active.data.current?.type === "Task";
    const isOverTask = over.data.current?.type === "Task";
    const isOverColumn = over.data.current?.type === "Column";

    if (!isActiveTask) return;

    if (isActiveTask && isOverTask) {
      setTasksAndSave((t) => {
        const ai = t.findIndex((x) => x.id === active.id);
        const oi = t.findIndex((x) => x.id === over.id);
        if (t[ai].columnId !== t[oi].columnId) {
          t[ai].columnId = t[oi].columnId;
          return arrayMove(t, ai, oi - 1);
        }
        return arrayMove(t, ai, oi);
      });
    }

    if (isActiveTask && isOverColumn) {
      setTasksAndSave((t) => {
        const ai = t.findIndex((x) => x.id === active.id);
        t[ai].columnId = over.id;
        return arrayMove(t, ai, ai);
      });
    }
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner size="lg" color="primary" />
      </div>
    );
  }

  return (
    <div className="relative m-auto flex h-[93vh] lg:h-[90vh] w-full items-center overflow-x-auto px-[40px]">
      {/* Saving indicator */}
      {saving && (
        <div className="absolute top-3 right-4 flex items-center gap-2 text-xs text-white/40">
          <Spinner size="sm" color="default" />
          <span>Saving…</span>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
      >
        <div className="m-auto flex gap-4">
          <div className="flex gap-6 flex-wrap sm:justify-center md:justify-start h-full py-10 overflow-y-auto">
            <SortableContext items={columnsId}>
              {columns.map((col) => (
                <ColumnContainer
                  key={col.id}
                  column={col}
                  deleteColumn={deleteColumn}
                  updateColumn={updateColumn}
                  createTask={createTask}
                  deleteTask={deleteTask}
                  updateTask={updateTask}
                  tasks={tasks.filter((t) => t.columnId === col.id)}
                />
              ))}
            </SortableContext>
          </div>
        </div>

        {createPortal(
          <DragOverlay>
            {activeColumn && (
              <ColumnContainer
                column={activeColumn}
                deleteColumn={deleteColumn}
                updateColumn={updateColumn}
                createTask={createTask}
                deleteTask={deleteTask}
                updateTask={updateTask}
                tasks={tasks.filter((t) => t.columnId === activeColumn.id)}
              />
            )}
            {activeTask && (
              <TaskCard
                task={activeTask}
                deleteTask={deleteTask}
                updateTask={updateTask}
              />
            )}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </div>
  );
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default KanbanBoard;