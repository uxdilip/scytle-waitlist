import { Button } from "@/components/ui/button";
import {
  AuiIf,
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useThreadListItemRuntime,
} from "@assistant-ui/react";
import {
  ArchiveIcon,
  Loader2,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { type FC, useCallback, useRef, useState } from "react";

export const ThreadList: FC = () => {
  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex items-center gap-1.5 overflow-x-auto overflow-y-hidden scrollbar-none">
      <ThreadListNew />
      <AuiIf condition={(s) => s.threads.isLoading}>
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      </AuiIf>
      <AuiIf condition={(s) => !s.threads.isLoading}>
        <ThreadListPrimitive.Items>
          {() => <ThreadListItem />}
        </ThreadListPrimitive.Items>
      </AuiIf>
    </ThreadListPrimitive.Root>
  );
};

const ThreadListNew: FC = () => {
  return (
    <ThreadListPrimitive.New asChild>
      <button
        className="aui-thread-list-new flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <PlusIcon className="size-3" />
        New
      </button>
    </ThreadListPrimitive.New>
  );
};

const ThreadListItem: FC = () => {
  const [isRenaming, setIsRenaming] = useState(false);
  const runtime = useThreadListItemRuntime();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleRename = useCallback(() => {
    setIsRenaming(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleRenameSubmit = useCallback(
    async (title: string) => {
      const trimmed = title.trim();
      if (trimmed) {
        await runtime.rename(trimmed);
      }
      setIsRenaming(false);
    },
    [runtime],
  );

  if (isRenaming) {
    return (
      <div className="flex shrink-0 items-center rounded-full border border-ring px-2.5 py-1">
        <input
          ref={inputRef}
          className="w-24 min-w-0 bg-transparent text-xs outline-none"
          defaultValue={runtime.getState().title ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleRenameSubmit(e.currentTarget.value);
            } else if (e.key === "Escape") {
              setIsRenaming(false);
            }
          }}
          onBlur={(e) => handleRenameSubmit(e.currentTarget.value)}
        />
      </div>
    );
  }

  return (
    <ThreadListItemPrimitive.Root className="aui-thread-list-item group relative flex shrink-0 items-center rounded-full border border-border/60 transition-colors hover:bg-muted data-active:border-foreground/20 data-active:bg-muted">
      <ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger flex items-center px-2.5 py-1 text-xs">
        <span className="aui-thread-list-item-title max-w-28 truncate">
          <ThreadListItemPrimitive.Title fallback="New Chat" />
        </span>
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemMore onRename={handleRename} />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemMore: FC<{ onRename: () => void }> = ({ onRename }) => {
  return (
    <ThreadListItemMorePrimitive.Root>
      <ThreadListItemMorePrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="aui-thread-list-item-more -ml-0.5 mr-0.5 size-5 shrink-0 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100 group-data-active:opacity-100"
        >
          <MoreHorizontalIcon className="size-3" />
          <span className="sr-only">More options</span>
        </Button>
      </ThreadListItemMorePrimitive.Trigger>
      <ThreadListItemMorePrimitive.Content
        side="top"
        align="start"
        className="aui-thread-list-item-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <ThreadListItemMorePrimitive.Item
          className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onClick={onRename}
        >
          <PencilIcon className="size-4" />
          Rename
        </ThreadListItemMorePrimitive.Item>
        <ThreadListItemPrimitive.Archive asChild>
          <ThreadListItemMorePrimitive.Item className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
            <ArchiveIcon className="size-4" />
            Archive
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Archive>
        <ThreadListItemPrimitive.Delete asChild>
          <ThreadListItemMorePrimitive.Item className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-destructive text-sm outline-none hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive">
            <TrashIcon className="size-4" />
            Delete
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Delete>
      </ThreadListItemMorePrimitive.Content>
    </ThreadListItemMorePrimitive.Root>
  );
};
