/**
 * Directory picker component for selecting working directories
 */

import React, { useState } from "react";
import { List, ActionPanel, Action, Icon, showToast, Toast, Color, LocalStorage } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { readdir, stat } from "fs/promises";
import { join, dirname, basename, parse } from "path";
import { homedir } from "os";
import type { IFileSystemItem } from "../types/system";
import { isDefinedString, isDefinedObject } from "../utils/type-guards";

interface IDirectoryPickerProps {
  initialDirectory?: string;
  onSelect: (directory: string) => void | Promise<void>;
  allowFiles?: boolean;
}

interface IBookmark {
  path: string;
  name: string;
  icon: Icon;
}

export function DirectoryPicker({
  initialDirectory = homedir(),
  onSelect,
  allowFiles = false,
}: IDirectoryPickerProps): React.JSX.Element {
  const [currentPath, setCurrentPath] = useState(initialDirectory);
  const [searchText, setSearchText] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  // Load directory contents
  const {
    data: items = [],
    isLoading,
    revalidate,
  } = useCachedPromise<IFileSystemItem[]>(
    async (path: string) => loadDirectoryContents(path, showHidden, allowFiles),
    [currentPath, showHidden, allowFiles],
    {
      keepPreviousData: true,
    },
  );

  // Get parent directory
  const parentDir = currentPath !== "/" ? dirname(currentPath) : null;

  // Get bookmarked directories
  const { data: bookmarks = [] } = useCachedPromise<IBookmark[]>(
    async (): Promise<IBookmark[]> => {
      const stored = await LocalStorage.getItem<string>("directory-bookmarks");
      return isDefinedString(stored) ? (JSON.parse(stored) as IBookmark[]) : getDefaultBookmarks();
    },
    [],
    {
      initialData: getDefaultBookmarks(),
    },
  );

  // Filter items based on search
  const filteredItems =
    searchText.length > 0
      ? items.filter((item: IFileSystemItem) => item.name.toLowerCase().includes(searchText.toLowerCase()))
      : items;

  // Handle directory selection
  const handleSelect = async (path: string): Promise<void> => {
    try {
      await onSelect(path);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Selection failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Handle bookmark toggle
  const toggleBookmark = async (path: string): Promise<void> => {
    const isBookmarked = bookmarks.some((b: IBookmark) => b.path === path);

    let newBookmarks: IBookmark[];
    if (isBookmarked) {
      newBookmarks = bookmarks.filter((b: IBookmark) => b.path !== path);
    } else {
      newBookmarks = [
        ...bookmarks,
        {
          path,
          name: basename(path),
          icon: getDirectoryIcon(basename(path)),
        },
      ];
    }

    await LocalStorage.setItem("directory-bookmarks", JSON.stringify(newBookmarks));
    revalidate();
  };

  return (
    <List
      isLoading={isLoading}
      navigationTitle={currentPath}
      searchBarAccessory={
        <List.Dropdown tooltip="View options" storeValue onChange={(value: string) => setShowHidden(value === "all")}>
          <List.Dropdown.Item title="Visible Only" value="visible" />
          <List.Dropdown.Item title="All Items" value="all" />
        </List.Dropdown>
      }
      searchBarPlaceholder="Filter directories..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
    >
      {/* Current directory selection */}
      <List.Section title="Current Directory">
        <List.Item
          actions={
            <ActionPanel>
              <Action
                icon={Icon.CheckCircle}
                title="Select Directory"
                onAction={() => {
                  handleSelect(currentPath).catch(() => {
                    // Error handling is done in handleSelect
                  });
                }}
              />
              <Action
                icon={Icon.Star}
                shortcut={{ modifiers: ["cmd"], key: "b" }}
                title="Toggle Bookmark"
                onAction={() => {
                  toggleBookmark(currentPath).catch(() => {
                    // Error handling is done in toggleBookmark
                  });
                }}
              />
            </ActionPanel>
          }
          icon={{ source: Icon.CheckCircle, tintColor: Color.Green }}
          subtitle={currentPath}
          title="Select This Directory"
        />
      </List.Section>

      {/* Parent directory */}
      {isDefinedString(parentDir) && (
        <List.Section title="Navigate">
          <List.Item
            actions={
              <ActionPanel>
                <Action icon={Icon.ArrowUp} title="Go to Parent" onAction={() => setCurrentPath(parentDir)} />
              </ActionPanel>
            }
            icon={Icon.ArrowUp}
            subtitle="Parent Directory"
            title=".."
          />
        </List.Section>
      )}

      {/* Bookmarks */}
      {bookmarks.length > 0 && (
        <List.Section title="Bookmarks">
          {bookmarks.map((bookmark: IBookmark) => (
            <List.Item
              actions={
                <ActionPanel>
                  <Action
                    icon={Icon.ArrowRight}
                    title="Go to Bookmark"
                    onAction={() => setCurrentPath(bookmark.path)}
                  />
                  <Action
                    icon={Icon.CheckCircle}
                    title="Select Bookmark"
                    onAction={() => {
                      handleSelect(bookmark.path).catch(() => {
                        // Error handling is done in handleSelect
                      });
                    }}
                  />
                  <Action
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    title="Remove Bookmark"
                    onAction={() => {
                      toggleBookmark(bookmark.path).catch(() => {
                        // Error handling is done in toggleBookmark
                      });
                    }}
                  />
                </ActionPanel>
              }
              icon={{ source: isDefinedObject(bookmark.icon) ? bookmark.icon : Icon.Star, tintColor: Color.Yellow }}
              key={bookmark.path}
              subtitle={bookmark.path}
              title={bookmark.name}
            />
          ))}
        </List.Section>
      )}

      {/* Directory contents */}
      <List.Section subtitle={`${filteredItems.length} items`} title="Contents">
        {filteredItems.map((item: IFileSystemItem) => (
          <List.Item
            accessories={getItemAccessories(item)}
            actions={
              <ActionPanel>
                {item.type === "directory" ? (
                  <>
                    <Action icon={Icon.ArrowRight} title="Open Directory" onAction={() => setCurrentPath(item.path)} />
                    <Action
                      icon={Icon.CheckCircle}
                      shortcut={{ modifiers: ["cmd"], key: "return" }}
                      title="Select Directory"
                      onAction={() => {
                        handleSelect(item.path).catch(() => {
                          // Error handling is done in handleSelect
                        });
                      }}
                    />
                  </>
                ) : allowFiles ? (
                  <Action
                    icon={Icon.Document}
                    title="Select File"
                    onAction={() => {
                      handleSelect(item.path).catch(() => {
                        // Error handling is done in handleSelect
                      });
                    }}
                  />
                ) : null}
                <ActionPanel.Section>
                  <Action.ShowInFinder path={item.path} />
                  <Action.CopyToClipboard
                    content={item.path}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                    title="Copy Path"
                  />
                  {item.type === "directory" && (
                    <Action
                      icon={Icon.Star}
                      shortcut={{ modifiers: ["cmd"], key: "b" }}
                      title="Toggle Bookmark"
                      onAction={() => {
                        toggleBookmark(item.path).catch(() => {
                          // Error handling is done in toggleBookmark
                        });
                      }}
                    />
                  )}
                </ActionPanel.Section>
              </ActionPanel>
            }
            icon={getItemIcon(item)}
            key={item.path}
            subtitle={getItemSubtitle(item)}
            title={item.name}
          />
        ))}
      </List.Section>
    </List>
  );
}

// Helper functions
function getDefaultBookmarks(): IBookmark[] {
  return [
    {
      path: homedir(),
      name: "Home",
      icon: Icon.House,
    },
    {
      path: join(homedir(), "Desktop"),
      name: "Desktop",
      icon: Icon.Desktop,
    },
    {
      path: join(homedir(), "Documents"),
      name: "Documents",
      icon: Icon.Document,
    },
    {
      path: join(homedir(), "Downloads"),
      name: "Downloads",
      icon: Icon.Download,
    },
    {
      path: "/Applications",
      name: "Applications",
      icon: Icon.AppWindow,
    },
  ];
}

function getItemIcon(item: IFileSystemItem): Icon | { source: Icon; tintColor: Color } {
  if (item.type === "directory") {
    return getDirectoryItemIcon(item);
  }

  if (item.type === "symlink") {
    return { source: Icon.Link, tintColor: Color.Blue };
  }

  return getFileItemIcon(item);
}

function getDirectoryItemIcon(item: IFileSystemItem): Icon | { source: Icon; tintColor: Color } {
  const specialIcon = getSpecialDirectoryIcon(item.name.toLowerCase());
  if (specialIcon !== null) {
    return specialIcon;
  }

  return item.isHidden ? { source: Icon.Folder, tintColor: Color.SecondaryText } : Icon.Folder;
}

function getSpecialDirectoryIcon(name: string): { source: Icon; tintColor: Color } | null {
  // Handle special directory names
  if (name === ".git") {
    return { source: Icon.CodeBlock, tintColor: Color.Orange };
  }
  if (name === "node_modules") {
    return { source: Icon.Box, tintColor: Color.Green };
  }
  if (name === "src") {
    return { source: Icon.Code, tintColor: Color.Blue };
  }
  if (name === "docs" || name === "documentation") {
    return { source: Icon.Book, tintColor: Color.Blue };
  }
  if (name === "assets" || name === "images") {
    return { source: Icon.Image, tintColor: Color.Magenta };
  }
  if (name === "test" || name === "tests") {
    return { source: Icon.Binoculars, tintColor: Color.Purple };
  }

  return null;
}

function getFileItemIcon(item: IFileSystemItem): Icon | { source: Icon; tintColor: Color } {
  const ext = parse(item.name).ext.toLowerCase();

  const codeExtensions = [".js", ".jsx", ".ts", ".tsx"];
  if (codeExtensions.includes(ext)) {
    return { source: Icon.Code, tintColor: Color.Yellow };
  }

  const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".svg"];
  if (imageExtensions.includes(ext)) {
    return { source: Icon.Image, tintColor: Color.Magenta };
  }

  switch (ext) {
    case ".json":
      return { source: Icon.Code, tintColor: Color.Orange };
    case ".md":
      return { source: Icon.Document, tintColor: Color.Blue };
    default:
      return Icon.Document;
  }
}

function getDirectoryIcon(name: string): Icon {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("project")) {
    return Icon.Hammer;
  }
  if (lowerName.includes("work")) {
    return Icon.Folder;
  }
  if (lowerName.includes("personal")) {
    return Icon.Person;
  }
  if (lowerName.includes("code") || lowerName.includes("dev")) {
    return Icon.Code;
  }
  return Icon.Folder;
}

function getItemSubtitle(item: IFileSystemItem): string {
  if (item.type === "directory") {
    return "Directory";
  }

  if (isDefinedObject(item.size)) {
    return formatFileSize(item.size);
  }

  return item.type === "symlink" ? "Symbolic Link" : "File";
}

function getItemAccessories(
  item: IFileSystemItem,
): { date?: Date; tooltip?: string; tag?: { value: string; color: Color } }[] {
  const accessories: { date?: Date; tooltip?: string; tag?: { value: string; color: Color } }[] = [];

  if (isDefinedObject(item.modified)) {
    accessories.push({
      date: item.modified,
      tooltip: `Modified: ${item.modified.toLocaleString()}`,
    });
  }

  if (item.isHidden) {
    accessories.push({
      tag: { value: "Hidden", color: Color.SecondaryText },
    });
  }

  if (item.type === "symlink") {
    accessories.push({
      tag: { value: "Link", color: Color.Blue },
    });
  }

  return accessories;
}

const BYTES_PER_UNIT = 1024;
const PERMISSIONS_EXTRACT_OFFSET = 8;
const PERMISSIONS_EXTRACT_LENGTH = -3;

async function loadDirectoryContents(
  path: string,
  showHidden: boolean,
  allowFiles: boolean,
): Promise<IFileSystemItem[]> {
  try {
    const entries = await readdir(path);
    const items: IFileSystemItem[] = [];

    for (const entry of entries) {
      const item = await processDirectoryEntry(entry, path, showHidden, allowFiles);
      if (isDefinedObject(item)) {
        items.push(item);
      }
    }

    return sortDirectoryItems(items);
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to read directory",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

async function processDirectoryEntry(
  entry: string,
  path: string,
  showHidden: boolean,
  allowFiles: boolean,
): Promise<IFileSystemItem | null> {
  // Skip hidden files unless enabled
  if (!showHidden && entry.startsWith(".")) {
    return null;
  }

  try {
    const fullPath = join(path, entry);
    const stats = await stat(fullPath);

    // Skip if files not allowed and it's a file
    if (!allowFiles && !stats.isDirectory()) {
      return null;
    }

    return {
      path: fullPath,
      name: entry,
      type: stats.isDirectory() ? "directory" : stats.isSymbolicLink() ? "symlink" : "file",
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime,
      permissions: stats.mode.toString(PERMISSIONS_EXTRACT_OFFSET).slice(PERMISSIONS_EXTRACT_LENGTH),
      isHidden: entry.startsWith("."),
    };
  } catch {
    // Skip items we can't stat
    return null;
  }
}

function sortDirectoryItems(items: IFileSystemItem[]): IFileSystemItem[] {
  return items.sort((a: IFileSystemItem, b: IFileSystemItem) => {
    if (a.type === "directory" && b.type !== "directory") {
      return -1;
    }
    if (a.type !== "directory" && b.type === "directory") {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= BYTES_PER_UNIT && unitIndex < units.length - 1) {
    size /= BYTES_PER_UNIT;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
